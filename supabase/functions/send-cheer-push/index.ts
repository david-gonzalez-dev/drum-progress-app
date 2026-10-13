// Supabase Edge Function: when a cheer is saved (database webhook on group_cheers, INSERT), send a push notification to the phones of
// whoever should receive it. Rules: never to the sender; only first names; nothing between 21:00 and 07:00 in the person's own time zone;
// at most one notification per sender and receiver every 5 minutes (the cheer is still there inside the app).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const QUIET_FROM = 24; // quiet hours off: hour is never >= 24 // local hour, inclusive
const QUIET_TO = 0; // and never < 0 // local hour, exclusive
const MIN_GAP_MS = 5 * 60 * 1000;

const CHEERS: Record<string, { en: string; es: string; nl: string }> = {
  letsgo: { en: "Let's go, you can do it!", es: "¡Vamos, tú puedes!", nl: "Kom op, je kunt het!" },
  keepitup: { en: "Keep it up, team!", es: "¡Sigan así, equipo!", nl: "Hou vol, team!" },
  greatpractice: { en: "Great practice today!", es: "¡Gran práctica hoy!", nl: "Goed geoefend vandaag!" },
  streak: { en: "Don't break the streak!", es: "¡No rompas la racha!", nl: "Verbreek je reeks niet!" },
  proud: { en: "Proud of you all!", es: "¡Orgulloso de todos!", nl: "Trots op jullie allemaal!" },
  gopractice: { en: "Go practice!", es: "¡A practicar!", nl: "Ga oefenen!" },
  goodjob: { en: "Good job!", es: "¡Buen trabajo!", nl: "Goed gedaan!" },
  yes: { en: "Yes!", es: "¡Sí!", nl: "Ja!" },
};
const TITLES: Record<string, (n: string) => string> = {
  en: (n) => `${n} sent you a cheer`,
  es: (n) => `${n} te envió un ánimo`,
  nl: (n) => `${n} stuurde je een aanmoediging`,
};

const enc = new TextEncoder();
const b64url = (data: ArrayBuffer | Uint8Array | string) => {
  const bytes = typeof data === "string" ? enc.encode(data) : new Uint8Array(data);
  let s = ""; bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const pemToDer = (pem: string) => {
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  return Uint8Array.from(atob(body), (c) => c.charCodeAt(0)).buffer;
};

// ---- Apple (iPhone) ----
async function apnsJwt(): Promise<string> {
  const key = await crypto.subtle.importKey("pkcs8", pemToDer(Deno.env.get("APNS_KEY_P8")!), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const head = b64url(JSON.stringify({ alg: "ES256", kid: Deno.env.get("APNS_KEY_ID")! }));
  const body = b64url(JSON.stringify({ iss: Deno.env.get("APNS_TEAM_ID")!, iat: Math.floor(Date.now() / 1000) }));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(sig)}`;
}
async function sendApns(jwt: string, token: string, title: string, body: string): Promise<"ok" | "dead" | "error"> {
  const host = Deno.env.get("APNS_HOST") ?? "https://api.push.apple.com";
  const res = await fetch(`${host}/3/device/${token}`, {
    method: "POST",
    headers: { authorization: `bearer ${jwt}`, "apns-topic": Deno.env.get("APNS_TOPIC") ?? "app.drumskills.ios", "apns-push-type": "alert", "apns-priority": "10" },
    body: JSON.stringify({ aps: { alert: { title, body }, sound: "default" }, kind: "cheer" }),
  });
  if (res.ok) return "ok";
  const reason = (await res.json().catch(() => ({})))?.reason ?? "";
  return res.status === 410 || reason === "BadDeviceToken" || reason === "Unregistered" ? "dead" : "error";
}

// ---- Google (Android) ----
let fcmCache: { token: string; exp: number } | null = null;
async function fcmAccessToken(sa: { client_email: string; private_key: string; token_uri?: string }): Promise<string> {
  if (fcmCache && fcmCache.exp > Date.now() + 60_000) return fcmCache.token;
  const key = await crypto.subtle.importKey("pkcs8", pemToDer(sa.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = b64url(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: sa.token_uri ?? "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(`${head}.${body}`));
  const res = await fetch(sa.token_uri ?? "https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${head}.${body}.${b64url(sig)}` });
  const json = await res.json();
  fcmCache = { token: json.access_token, exp: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return json.access_token;
}
async function sendFcm(sa: any, token: string, title: string, body: string): Promise<"ok" | "dead" | "error"> {
  const access = await fcmAccessToken(sa);
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: "POST",
    headers: { authorization: `Bearer ${access}`, "content-type": "application/json" },
    body: JSON.stringify({ message: { token, notification: { title, body }, data: { kind: "cheer" }, android: { priority: "HIGH" } } }),
  });
  if (res.ok) return "ok";
  const err = await res.json().catch(() => ({}));
  const status = err?.error?.status ?? "";
  return status === "NOT_FOUND" || status === "UNREGISTERED" || status === "INVALID_ARGUMENT" ? "dead" : "error";
}

function inQuietHours(tz: string): boolean {
  let hour = 12;
  try { hour = parseInt(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: tz }).format(new Date()), 10); }
  catch { hour = parseInt(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/Amsterdam" }).format(new Date()), 10); }
  return hour >= QUIET_FROM || hour < QUIET_TO;
}

Deno.serve(async (req) => {
  if (req.headers.get("x-webhook-secret") !== Deno.env.get("WEBHOOK_SECRET")) return new Response("forbidden", { status: 401 });
  try {
    const payload = await req.json();
    const cheer = payload?.record;
    if (payload?.type !== "INSERT" || !cheer?.id) return new Response("ignored");
    // one notification per sender and receiver every 5 minutes
    let recent = sb.from("group_cheers").select("id", { count: "exact", head: true }).eq("group_id", cheer.group_id).eq("from_user", cheer.from_user).gte("created_at", new Date(Date.now() - MIN_GAP_MS).toISOString()).neq("id", cheer.id);
    recent = cheer.to_user ? recent.eq("to_user", cheer.to_user) : recent.is("to_user", null);
    if (((await recent).count ?? 0) > 0) return new Response("rate limited");
    // who receives it: the addressed person, or every other member of the group
    let ids: string[] = [];
    if (cheer.to_user) ids = [cheer.to_user];
    else { const { data } = await sb.from("group_members").select("user_id").eq("group_id", cheer.group_id); ids = (data ?? []).map((m: any) => m.user_id); }
    ids = ids.filter((id) => id !== cheer.from_user);
    if (!ids.length) return new Response("nobody");
    const [{ data: tokens }, { data: langs }, { data: sender }] = await Promise.all([
      sb.from("push_tokens").select("token,platform,tz,user_id").in("user_id", ids),
      sb.from("settings").select("user_id,language").in("user_id", ids),
      sb.from("profiles").select("name").eq("id", cheer.from_user).maybeSingle(),
    ]);
    if (!tokens?.length) return new Response("no phones");
    const firstName = String(sender?.name ?? "").trim().split(/\s+/)[0] || "Someone";
    const langOf = new Map((langs ?? []).map((l: any) => [l.user_id, l.language]));
    const sa = Deno.env.get("FIREBASE_SERVICE_ACCOUNT") ? JSON.parse(Deno.env.get("FIREBASE_SERVICE_ACCOUNT")!) : null;
    const hasApns = !!Deno.env.get("APNS_KEY_P8");
    const jwt = hasApns && tokens.some((t: any) => t.platform === "ios") ? await apnsJwt() : null;
    let sent = 0; const dead: string[] = [];
    for (const t of tokens as any[]) {
      if (inQuietHours(t.tz)) continue;
      const lang = ["en", "es", "nl"].includes(langOf.get(t.user_id)) ? langOf.get(t.user_id) : "en";
      const text = CHEERS[cheer.cheer_key]?.[lang as "en" | "es" | "nl"] ?? CHEERS.yes[lang as "en" | "es" | "nl"];
      const title = TITLES[lang](firstName);
      const result = t.platform === "ios" ? (jwt ? await sendApns(jwt, t.token, title, text) : "error") : (sa ? await sendFcm(sa, t.token, title, text) : "error");
      if (result === "ok") sent++; else if (result === "dead") dead.push(t.token);
    }
    if (dead.length) await sb.from("push_tokens").delete().in("token", dead);
    return new Response(`sent ${sent}, removed ${dead.length}`);
  } catch (e) {
    return new Response(`error: ${(e as Error).message}`, { status: 500 });
  }
});
