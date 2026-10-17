// Cheer notifications on the phone apps (iPhone + Android). The phone's push address is stored on the server (push_tokens) so a Supabase
// function can notify it when a cheer arrives. Turned on per person, per phone, from Settings; web visitors never see it.
import { Capacitor } from "@capacitor/core";

const IS_NATIVE = process.env.NEXT_PUBLIC_NATIVE === "1";
const enabledKey = (userId: string) => `push_enabled_${userId}`;
const tokenKey = "push_token";

// Android needs a Firebase setup file (google-services.json) before it can receive notifications; until it is added, the switch is hidden there so the app can never crash on it.
const ANDROID_PUSH_READY = process.env.NEXT_PUBLIC_ANDROID_PUSH === "1";
export const pushSupported = () => IS_NATIVE && typeof window !== "undefined" && Capacitor.isNativePlatform() && (Capacitor.getPlatform() !== "android" || ANDROID_PUSH_READY);
export function pushWanted(userId: string): boolean { try { return localStorage.getItem(enabledKey(userId)) === "1"; } catch { return false; } }

async function register(db: any): Promise<{ ok: boolean; reason?: "denied" | "error" }> {
  const { PushNotifications } = await import("@capacitor/push-notifications");
  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") perm = await PushNotifications.requestPermissions();
  if (perm.receive !== "granted") return { ok: false, reason: "denied" };
  const token = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("no token")), 15000);
    PushNotifications.addListener("registration", (t) => { clearTimeout(timer); resolve(t.value); });
    PushNotifications.addListener("registrationError", (e) => { clearTimeout(timer); reject(new Error(e.error)); });
    PushNotifications.register();
  }).catch(() => null);
  if (!token) return { ok: false, reason: "error" };
  let tz = "Europe/Amsterdam";
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || tz; } catch { /* keep default */ }
  const { error } = await db.rpc("register_push_token", { p_token: token, p_platform: Capacitor.getPlatform() === "ios" ? "ios" : "android", p_tz: tz });
  if (error) return { ok: false, reason: "error" };
  try { localStorage.setItem(tokenKey, token); } catch { /* ignore */ }
  return { ok: true };
}

export async function enablePush(db: any, userId: string) {
  const res = await register(db);
  if (res.ok) { try { localStorage.setItem(enabledKey(userId), "1"); } catch { /* ignore */ } }
  return res;
}
export async function disablePush(db: any, userId: string) {
  try { localStorage.removeItem(enabledKey(userId)); } catch { /* ignore */ }
  await removeToken(db);
}
// Called at log-out: this phone stops receiving this person's notifications (their choice is remembered for the next login).
export async function removeToken(db: any) {
  let token: string | null = null;
  try { token = localStorage.getItem(tokenKey); localStorage.removeItem(tokenKey); } catch { /* ignore */ }
  if (token) await db.rpc("unregister_push_token", { p_token: token });
}
// Called when the app opens: push addresses change now and then, so a person who turned notifications on is re-registered quietly.
export async function refreshPush(db: any, userId: string) {
  if (!pushSupported() || !pushWanted(userId)) return;
  const { PushNotifications } = await import("@capacitor/push-notifications");
  const perm = await PushNotifications.checkPermissions();
  if (perm.receive !== "granted") return; // switched off in the phone's settings: do not ask again unprompted
  await register(db);
}
// Tapping a notification opens the app on the Group tab.
export async function listenForPushTaps(onTap: () => void): Promise<() => void> {
  if (!pushSupported()) return () => {};
  const { PushNotifications } = await import("@capacitor/push-notifications");
  const handle = await PushNotifications.addListener("pushNotificationActionPerformed", () => onTap());
  return () => { handle.remove(); };
}
