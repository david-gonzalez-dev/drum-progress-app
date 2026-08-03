#!/usr/bin/env node
// One-time historical import: reads a date,user,minutes CSV and writes practice_logs rows
// exactly as if each row had been logged through the app's quick-log form.
//
// Usage: npm run import-history -- path/to/file.csv [--force]
//   --force  overwrite rows that already exist with a different value, instead of
//            just reporting them as conflicts. Use when the CSV is known to be more
//            complete/accurate than what's currently stored (e.g. a corrected re-parse).
//
// Requires SUPABASE_SERVICE_ROLE_KEY in .env.local (Supabase dashboard -> Project Settings
// -> API -> service_role key). The service role bypasses RLS, which is required here since
// this script writes practice_logs rows for other users' accounts, not the caller's own.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

// Maps a name found in the CSV's "user" column to a hint used to find the matching account.
// The hint is checked against both the account's email (before the @) and its profile display name.
const USER_MAP = {
  david: "daviddrummerr",
  dario: "rivers",
};

function loadEnvLocal() {
  try {
    const text = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // .env.local not found; rely on real environment variables instead.
  }
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (!lines.length) throw new Error("CSV file is empty.");
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const dateIdx = header.indexOf("date");
  const userIdx = header.indexOf("user");
  const minutesIdx = header.indexOf("minutes");
  if (dateIdx === -1 || userIdx === -1 || minutesIdx === -1) {
    throw new Error(`CSV header must include date,user,minutes columns. Found: "${lines[0]}"`);
  }
  return lines.slice(1).map((line, i) => {
    const cols = line.split(",").map((c) => c.trim());
    return { rowNumber: i + 2, date: cols[dateIdx] ?? "", user: cols[userIdx] ?? "", minutesRaw: cols[minutesIdx] ?? "" };
  });
}

async function resolveUsers(supabase) {
  const { data: profiles, error: profilesError } = await supabase.from("profiles").select("id,name");
  if (profilesError) throw profilesError;
  const { data: authList, error: authError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (authError) throw authError;
  const authUsers = authList.users;

  const resolved = {};
  for (const [key, hint] of Object.entries(USER_MAP)) {
    const lowerHint = hint.toLowerCase();
    const byEmail = authUsers.find((u) => u.email && u.email.toLowerCase().split("@")[0] === lowerHint);
    const byName = profiles.find((p) => p.name && p.name.toLowerCase().includes(lowerHint));
    const matchId = byEmail?.id ?? byName?.id ?? null;
    if (!matchId) {
      console.error(`Could not resolve user "${key}" — looked for "${hint}" in account emails and profile names. No rows for this user will be imported.`);
      continue;
    }
    const profile = profiles.find((p) => p.id === matchId);
    const label = profile?.name || byEmail?.email || key;
    resolved[key] = { id: matchId, label };
  }
  return resolved;
}

async function findSharedGroups(supabase, userIds) {
  if (userIds.length < 2) return [];
  const { data, error } = await supabase.from("group_members").select("group_id,user_id").in("user_id", userIds);
  if (error) throw error;
  const membersByGroup = new Map();
  for (const row of data) {
    if (!membersByGroup.has(row.group_id)) membersByGroup.set(row.group_id, new Set());
    membersByGroup.get(row.group_id).add(row.user_id);
  }
  return [...membersByGroup.entries()].filter(([, members]) => userIds.every((id) => members.has(id))).map(([groupId]) => groupId);
}

async function main() {
  loadEnvLocal();
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    console.error("Add SUPABASE_SERVICE_ROLE_KEY to .env.local (Supabase dashboard -> Project Settings -> API -> service_role key).");
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const csvPath = args.find((a) => !a.startsWith("--"));
  if (!csvPath) {
    console.error("Usage: npm run import-history -- path/to/file.csv [--force]");
    process.exit(1);
  }
  const absolutePath = resolve(process.cwd(), csvPath);
  let text;
  try {
    text = readFileSync(absolutePath, "utf8");
  } catch {
    console.error(`Could not read file: ${absolutePath}`);
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

  const rows = parseCsv(text);
  const users = await resolveUsers(supabase);
  const resolvedKeys = Object.keys(users);
  if (!resolvedKeys.length) {
    console.error("No users could be resolved. Nothing to import.");
    process.exit(1);
  }

  console.log("Resolved users:");
  for (const key of resolvedKeys) console.log(`  ${key} -> ${users[key].label} (${users[key].id})`);

  const groupIds = await findSharedGroups(supabase, resolvedKeys.map((k) => users[k].id));
  if (groupIds.length) console.log(`Shared group(s): ${groupIds.join(", ")} — these users' group calendar/leaderboard will reflect the import automatically.`);
  else console.log("Note: these users don't share a common group — group leaderboard/calendar won't show a combined view, but each user's own history still imports.");

  const userIds = resolvedKeys.map((k) => users[k].id);
  const { data: existingLogs, error: existingError } = await supabase.from("practice_logs").select("user_id,practiced_on,minutes").in("user_id", userIds);
  if (existingError) throw existingError;
  const existingMap = new Map(existingLogs.map((r) => [`${r.user_id}|${r.practiced_on}`, r.minutes]));

  const toImport = [];
  const unchanged = [];
  const conflicts = [];
  const overwritten = [];
  const skipped = [];

  for (const row of rows) {
    const key = row.user.trim().toLowerCase();
    const userEntry = users[key];
    if (!userEntry) { skipped.push({ ...row, reason: `Unknown or unresolved user "${row.user}"` }); continue; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) { skipped.push({ ...row, reason: `Invalid date "${row.date}" (expected YYYY-MM-DD)` }); continue; }
    const minutes = Number(row.minutesRaw);
    if (!Number.isFinite(minutes) || minutes < 0 || !Number.isInteger(minutes)) { skipped.push({ ...row, reason: `Invalid minutes "${row.minutesRaw}"` }); continue; }

    const mapKey = `${userEntry.id}|${row.date}`;
    if (existingMap.has(mapKey)) {
      if (existingMap.get(mapKey) === minutes) { unchanged.push(row); continue; }
      if (force) {
        overwritten.push({ ...row, previousMinutes: existingMap.get(mapKey) });
        toImport.push({ user_id: userEntry.id, practiced_on: row.date, minutes, notes: "", equipment: null });
        continue;
      }
      conflicts.push({ ...row, existingMinutes: existingMap.get(mapKey) });
      continue;
    }
    toImport.push({ user_id: userEntry.id, practiced_on: row.date, minutes, notes: "", equipment: null });
  }

  if (toImport.length) {
    const chunkSize = 500;
    for (let i = 0; i < toImport.length; i += chunkSize) {
      const chunk = toImport.slice(i, i + chunkSize);
      const { error } = await supabase.from("practice_logs").upsert(chunk, { onConflict: "user_id,practiced_on" });
      if (error) {
        console.error(`Insert failed for rows ${i + 1}-${i + chunk.length}:`, error.message);
        process.exit(1);
      }
    }
  }

  console.log(`\nNew rows imported: ${toImport.length - overwritten.length}`);
  console.log(`Already imported, unchanged: ${unchanged.length}`);
  if (overwritten.length) {
    console.log(`\nOverwritten (--force): existing value replaced with the CSV's value:`);
    for (const o of overwritten) console.log(`  Row ${o.rowNumber}: ${o.user} ${o.date} — was ${o.previousMinutes} min, now ${o.minutesRaw} min`);
  }

  if (conflicts.length) {
    console.log(`\nConflicts — a log already exists for this user/date with a different value than the CSV. Not overwritten (pass --force to overwrite):`);
    for (const c of conflicts) console.log(`  Row ${c.rowNumber}: ${c.user} ${c.date} — CSV says ${c.minutesRaw} min, database already has ${c.existingMinutes} min`);
  }
  if (skipped.length) {
    console.log(`\nSkipped rows (could not import):`);
    for (const s of skipped) console.log(`  Row ${s.rowNumber}: "${s.date},${s.user},${s.minutesRaw}" — ${s.reason}`);
  }

  console.log(`\nDone. Streaks, calendar, daily-goal status, and the group leaderboard are all computed live from practice_logs,`);
  console.log(`so reloading the app is enough to see them reflect the import — there's no separate recalculation step.`);
  console.log(`Note: Practice Mode's per-exercise BPM/tier progress bars are tracked in a separate table (practice_sessions) that`);
  console.log(`this CSV has no data for (no per-exercise/BPM breakdown), so those bars won't change from this import.`);
}

main().catch((err) => {
  console.error("Import failed:", err.message ?? err);
  process.exit(1);
});
