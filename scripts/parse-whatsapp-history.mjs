#!/usr/bin/env node
// One-off: parse the WhatsApp chat export (_chat.txt) into a date,user,minutes CSV,
// so it can be fed into scripts/import-history.mjs. This is messier than a clean CSV:
// the export file is accidentally duplicated (pasted twice), the "Día N ✅ (Xm)" format
// drifts over time (some later messages drop "Día", use bare numbers, split minutes into
// a follow-up message, or send a "+Xm" correction to the previous entry), and there's a
// SEPARATE counter for missed days (❌) mixed into the same numbering scheme.
//
// Dates: the written "Día N" counter is NOT trusted as a source of truth -- it has known
// human errors (duplicated numbers like 103/126/164, skipped numbers like 32/105/165) from
// forgetting to check in and catching up later. Every ✅ message counts as one completed
// practice day, full stop, regardless of what number is written on it. When someone forgets
// to check in, they send multiple consecutive check-ins the next day (confirmed by the
// user), so a message's own send-date is not always its practice date: when a sender posts
// multiple ✅ messages on the same calendar day, that batch is spread across that many
// consecutive days ending on the send date (the last message = the send day itself, each
// earlier message = one day further back) -- based purely on how many messages were sent
// that day, not on their written numbers.
//
// Usage: node scripts/parse-whatsapp-history.mjs path/to/_chat.txt path/to/output.csv

import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const chatPath = process.argv[2];
const outPath = process.argv[3];
if (!chatPath || !outPath) {
  console.error("Usage: node scripts/parse-whatsapp-history.mjs path/to/_chat.txt path/to/output.csv");
  process.exit(1);
}

function toKey(dateMs) {
  return new Date(dateMs).toISOString().slice(0, 10);
}

function normalizeSender(raw) {
  const s = raw.trim();
  if (s === "David" || s === "Yo David") return "david";
  if (s === "Dario") return "dario";
  return null;
}

function cleanText(text) {
  return text.replace(/‎/g, "").replace(/<This message was edited>/gi, "").trim();
}

function isSystemMessage(text) {
  return /created this group|changed the group description|changed this group's icon|end-to-end encrypted|you deleted this message|security code changed/i.test(text);
}

// Parses a duration out of free text: "1h15m", "1h 5m", "1h", "16 min", "10m", "8mim" (typo).
function parseMinutes(text) {
  let m = text.match(/(\d+)\s*h\s*(\d+)?\s*m?/i);
  if (m) return Number(m[1]) * 60 + Number(m[2] || 0);
  m = text.match(/(\d+)\s*m/i);
  if (m) return Number(m[1]);
  return null;
}

const MSG_RE = /^\[(\d{2})\/(\d{2})\/(\d{4}), (\d{2}):(\d{2}):(\d{2})\] ([^:]+): (.*)$/;

const rawLines = readFileSync(resolve(process.cwd(), chatPath), "utf8").split(/\r?\n/);
const seenLines = new Set();
const messages = [];
for (const raw of rawLines) {
  if (seenLines.has(raw)) continue; // the file is pasted twice; drop exact repeats
  const m = raw.match(MSG_RE);
  if (!m) continue; // continuation line of a multi-line message; nothing we need is ever on these
  seenLines.add(raw);
  const [, dd, mm, yyyy, hh, min, ss, senderRaw, text] = m;
  messages.push({
    dateMs: Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)),
    timeLabel: `${hh}:${min}:${ss}`,
    sender: senderRaw.trim(),
    text,
  });
}

const entries = []; // { sender, sendDateMs, minutes }
const lastEntryIndexBySender = {};

for (let i = 0; i < messages.length; i++) {
  const msg = messages[i];
  const sender = normalizeSender(msg.sender);
  if (!sender) continue;
  const text = cleanText(msg.text);
  if (!text || isSystemMessage(text)) continue;

  // Correction/addition message: "+30m" or "+ 52m = 1h24m", applies to the sender's last entry.
  const addMatch = text.match(/^\+\s*(\d+)\s*m(?:in)?\s*(?:=\s*(.+))?$/i);
  if (addMatch && !text.includes("✅") && !text.includes("❌")) {
    const idx = lastEntryIndexBySender[sender];
    if (idx !== undefined) {
      if (addMatch[2]) {
        const total = parseMinutes(addMatch[2]);
        if (total !== null) entries[idx].minutes = total;
        else entries[idx].minutes += Number(addMatch[1]);
      } else {
        entries[idx].minutes += Number(addMatch[1]);
      }
    }
    continue;
  }

  if (text.includes("❌")) continue; // missed-day marker; uses a different counter, not counted as practice
  if (!text.includes("✅")) continue; // not a practice-log message at all

  let minutes = parseMinutes(text);

  if (minutes === null) {
    const next = messages[i + 1];
    if (next) {
      const nextSender = normalizeSender(next.sender);
      const nextText = cleanText(next.text);
      if (nextSender === sender && nextText.length < 20 && !/✅|❌|d[ií]a/i.test(nextText)) {
        const followMinutes = parseMinutes(nextText);
        if (followMinutes !== null) minutes = followMinutes;
      }
    }
  }
  if (minutes === null) minutes = 5; // no duration given anywhere; the 5-min minimum-day convention

  entries.push({ sender, sendDateMs: msg.dateMs, minutes });
  lastEntryIndexBySender[sender] = entries.length - 1;
}

// Resolve each entry's practice date. Process each sender's messages in chronological
// order; every message claims the latest still-unclaimed day at or before its own send
// date, searching backward past any date an earlier message from the same sender already
// claimed. A solo message just claims its own send date. A same-day batch of N messages
// (forgot to check in, caught up later) claims N distinct consecutive days ending on the
// send date -- regardless of what "Día N" number is written on each one, since that
// numbering is known to be unreliable (duplicated/skipped entries).
const usedDatesBySender = {}; // sender -> Set<dateKey>
const resolved = []; // { sender, date, minutes }
for (const e of entries) {
  if (!usedDatesBySender[e.sender]) usedDatesBySender[e.sender] = new Set();
  const used = usedDatesBySender[e.sender];
  let candidateMs = e.sendDateMs;
  while (used.has(toKey(candidateMs))) candidateMs -= 86400000;
  used.add(toKey(candidateMs));
  resolved.push({ sender: e.sender, date: toKey(candidateMs), minutes: e.minutes });
}

// Aggregate same-day duplicates (sum minutes), per sender.
const totals = new Map(); // `${sender}|${date}` -> minutes
for (const e of resolved) {
  const key = `${e.sender}|${e.date}`;
  totals.set(key, (totals.get(key) ?? 0) + e.minutes);
}

const rows = [...totals.entries()].map(([key, minutes]) => {
  const [sender, date] = key.split("|");
  return { sender, date, minutes };
}).sort((a, b) => a.date.localeCompare(b.date) || a.sender.localeCompare(b.sender));

const csvLines = ["date,user,minutes", ...rows.map((r) => `${r.date},${r.sender === "david" ? "David" : "Dario"},${r.minutes}`)];
writeFileSync(resolve(process.cwd(), outPath), csvLines.join("\n") + "\n", "utf8");

const daysBySender = {};
for (const r of rows) { if (r.minutes > 0) daysBySender[r.sender] = (daysBySender[r.sender] ?? 0) + 1; }

console.log(`Parsed ${messages.length} unique chat messages -> ${entries.length} practice entries -> ${rows.length} distinct (user, date) rows.`);
console.log(`Days with practice minutes > 0: ${JSON.stringify(daysBySender)}`);
console.log(`Wrote ${outPath}`);
