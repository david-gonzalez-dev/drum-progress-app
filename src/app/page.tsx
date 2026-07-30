"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type Tab = "today" | "calendar" | "group" | "settings";
type Log = { minutes: number; items: string[]; notes: string };

const items = ["Rudiments", "Single Strokes", "Double Strokes", "Paradiddles", "Stick Control", "Coordination", "Bass Drum", "Rhythms", "Permutations"];
const nav: { id: Tab; label: string }[] = [
  { id: "today", label: "Today" }, { id: "calendar", label: "Calendar" }, { id: "group", label: "Group" }, { id: "settings", label: "Settings" },
];

const NAV_ICONS: Record<Tab, React.ReactNode> = {
  today: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="10" cy="10" r="7.3" /><circle cx="10" cy="10" r="2.4" fill="currentColor" stroke="none" /></svg>,
  calendar: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4.5" width="14" height="12.5" rx="2" /><path d="M3 8.5h14" /><path d="M7 2.5v3M13 2.5v3" /></svg>,
  group: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="7.2" cy="7" r="2.6" /><path d="M2.5 17c0-2.9 2.1-5 4.7-5s4.7 2.1 4.7 5" /><circle cx="14.5" cy="7.8" r="2.1" /><path d="M12.7 12.3c1.9.4 3.3 2.1 3.3 4.7" /></svg>,
  settings: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="2.6" /><path d="M10 2.8v2M10 15.2v2M17.2 10h-2M4.8 10h-2M15.1 4.9l-1.4 1.4M6.3 13.7l-1.4 1.4M15.1 15.1l-1.4-1.4M6.3 6.3L4.9 4.9" /></svg>,
};
const dateKey = new Date().toISOString().slice(0, 10);
const fmtDate = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" });

function shiftDateKey(key: string, days: number) {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function calculateStreaks(logs: Record<string, unknown>, today: string) {
  const loggedDates = new Set(Object.keys(logs));
  let current = 0;
  if (loggedDates.size > 0) {
    let cursor = loggedDates.has(today) ? today : shiftDateKey(today, -1);
    while (loggedDates.has(cursor)) {
      current += 1;
      cursor = shiftDateKey(cursor, -1);
    }
  }
  let longest = 0;
  let run = 0;
  let previous: string | null = null;
  for (const key of Array.from(loggedDates).sort()) {
    run = previous && shiftDateKey(previous, 1) === key ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = key;
  }
  return { current, longest };
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

export default function Home() {
  const [tab, setTab] = useState<Tab>("today");
  const [minutes, setMinutes] = useState("35");
  const [selected, setSelected] = useState<string[]>(["Rudiments", "Single Strokes", "Coordination"]);
  const [notes, setNotes] = useState("");
  const [logs, setLogs] = useState<Record<string, Log>>({});
  const [saved, setSaved] = useState(false);
  const [metronome, setMetronome] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const { current: streak, longest: longestStreak } = useMemo(() => calculateStreaks(logs, dateKey), [logs]);
  const daysThisYear = useMemo(() => Object.keys(logs).filter((key) => key.startsWith(dateKey.slice(0, 4))).length, [logs]);
  const [profileName, setProfileName] = useState("");
  const displayName = profileName || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Drummer";

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setUser(data.session?.user ?? null); setLoading(false); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => listener.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!user) return;
    const fallbackName = user.user_metadata?.full_name ?? user.email?.split("@")[0] ?? "Drummer";
    supabase.from("profiles").select("name").eq("id", user.id).maybeSingle().then(({ data }) => {
      if (data?.name) { setProfileName(data.name); return; }
      setProfileName(fallbackName);
      supabase.from("profiles").upsert({ id: user.id, name: fallbackName }, { onConflict: "id" }).then();
    });
    supabase.from("practice_logs").select("practiced_on,minutes,notes,practice_log_items(practice_items(name_en))").eq("user_id", user.id).then(({ data }) => {
      const nextLogs: Record<string, Log> = {};
      (data ?? []).forEach((row: any) => { nextLogs[row.practiced_on] = { minutes: row.minutes, notes: row.notes ?? "", items: (row.practice_log_items ?? []).map((entry: any) => entry.practice_items?.name_en).filter(Boolean) }; });
      setLogs(nextLogs);
      const todayLog = nextLogs[dateKey];
      if (todayLog) { setMinutes(String(todayLog.minutes)); setNotes(todayLog.notes); if (todayLog.items.length) setSelected(todayLog.items); }
    });
  }, [user]);
  async function saveLogFor(targetDate: string, targetMinutes: number, targetItems: string[], targetNotes: string) {
    if (!user) return false;
    const { data: log, error } = await supabase.from("practice_logs").upsert({ user_id: user.id, practiced_on: targetDate, minutes: targetMinutes, notes: targetNotes }, { onConflict: "user_id,practiced_on" }).select().single();
    if (error || !log) { setAuthError(error?.message ?? "Could not save your practice."); return false; }
    const { data: itemRows } = await supabase.from("practice_items").select("id,name_en").in("name_en", targetItems);
    await supabase.from("practice_log_items").delete().eq("log_id", log.id);
    if (itemRows?.length) await supabase.from("practice_log_items").insert(itemRows.map((item) => ({ log_id: log.id, item_id: item.id })));
    setLogs((current) => ({ ...current, [targetDate]: { minutes: targetMinutes, items: targetItems, notes: targetNotes } }));
    return true;
  }
  async function save() {
    const ok = await saveLogFor(dateKey, Number(minutes) || 0, selected, notes);
    if (ok) { setSaved(true); setTimeout(() => setSaved(false), 2200); }
  }
  function toggle(item: string) { setSelected((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item]); }
  function addMetronomeMinutes(added: number) { setMinutes((current) => String((Number(current) || 0) + added)); }
  async function signOut() { await supabase.auth.signOut(); }
  if (loading) return <main className="shell"><div className="auth-shell"><p className="eyebrow">DRUM PROGRESS</p><h1>LOADING<span>.</span></h1></div></main>;
  if (!user) return <Login error={authError} setError={setAuthError} />;
  return <main className="shell">
    {tab === "today" && <Today minutes={minutes} setMinutes={setMinutes} selected={selected} toggle={toggle} notes={notes} setNotes={setNotes} save={save} saved={saved} streak={streak} openMetronome={() => setMetronome(true)} displayName={displayName} />}
    {tab === "calendar" && <Calendar logs={logs} streak={streak} longestStreak={longestStreak} daysThisYear={daysThisYear} saveLogFor={saveLogFor} />}
    {tab === "group" && <Group user={user} setError={setAuthError} />}
    {tab === "settings" && <Settings signOut={signOut} user={user} setError={setAuthError} profileName={displayName} onProfileNameSaved={setProfileName} />}
    {authError && <button className="error-toast" onClick={() => setAuthError("")}>{authError} ×</button>}
    <nav className="bottom-nav">{nav.map((item) => <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}><span>{NAV_ICONS[item.id]}</span>{item.label}</button>)}</nav>
    {metronome && <Metronome close={() => setMetronome(false)} onAddMinutes={addMetronomeMinutes} />}
  </main>;
}

function Login({ error, setError }: { error: string; setError: (message: string) => void }) {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [mode, setMode] = useState<"login" | "signup">("login"); const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true); setError("");
    const result = mode === "login" ? await supabase.auth.signInWithPassword({ email, password }) : await supabase.auth.signUp({ email, password });
    setBusy(false); if (result.error) setError(result.error.message); else if (mode === "signup") setError("Check your email to confirm your account, then sign in.");
  }
  async function google() { setBusy(true); const { error: oauthError } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } }); if (oauthError) { setError(oauthError.message); setBusy(false); } }
  return <main className="shell"><section className="auth-shell"><p className="eyebrow">DRUM PROGRESS</p><h1>KEEP THE<br/><i>RHYTHM.</i></h1><p>Build your daily drumming habit, one session at a time.</p><div className="auth-card"><h2>{mode === "login" ? "Welcome back" : "Start your streak"}</h2><input type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} /><input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} /><button className="auth-primary" disabled={busy || !email || !password} onClick={submit}>{busy ? "Please wait..." : mode === "login" ? "Log in" : "Create account"}</button><div className="or">OR</div><button className="google" disabled={busy} onClick={google}>G <span>Continue with Google</span></button><button className="auth-switch" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}>{mode === "login" ? "New here? Create an account" : "Already have an account? Log in"}</button></div>{error && <p className="auth-error">{error}</p>}</section></main>;
}

function Today({ minutes, setMinutes, selected, toggle, notes, setNotes, save, saved, streak, openMetronome, displayName }: any) {
  return <section className="page today">
    <header className="hero"><div><p className="eyebrow">WELCOME BACK, {displayName.toUpperCase()}</p><h1>KEEP THE<br/><i>RHYTHM.</i></h1><p className="date">{fmtDate.format(new Date())}</p></div><button className="avatar">{displayName.charAt(0).toUpperCase()}</button></header>
    <div className="streak-card"><div className="flame">🔥</div><div><span>Current streak</span><strong>{streak} days</strong></div></div>
    <div className="section-title"><h2>Today&apos;s practice</h2><button onClick={openMetronome}>⌁ Metronome</button></div>
    <div className="form-card"><label className="input-label">HOW LONG DID YOU PRACTISE?</label><div className="minutes"><input inputMode="numeric" size={3} value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ""))}/><span>min</span></div>
      <div className="quick-add"><button onClick={() => setMinutes(String(Math.max(0, (Number(minutes) || 0) - 5)))}>-5 min</button><button onClick={() => setMinutes(String(Math.max(0, (Number(minutes) || 0) - 1)))}>-1 min</button><button onClick={() => setMinutes(String((Number(minutes) || 0) + 1))}>+1 min</button><button onClick={() => setMinutes(String((Number(minutes) || 0) + 5))}>+5 min</button></div>
      <label className="input-label checklist-label">WHAT DID YOU PRACTISE?</label><div className="chips">{items.map((item) => <button key={item} onClick={() => toggle(item)} className={selected.includes(item) ? "chip selected" : "chip"}>{selected.includes(item) && <b>✓</b>}{item}</button>)}</div>
      <label className="input-label notes-label">NOTES <em>OPTIONAL</em></label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What did you practise today?" />
      <button className={saved ? "save saved" : "save"} onClick={save}>{saved ? "✓ Practice saved" : "Save practice"}<span>→</span></button>
    </div>
  </section>;
}

type SaveLogFor = (targetDate: string, targetMinutes: number, targetItems: string[], targetNotes: string) => Promise<boolean>;

function Calendar({ logs, streak, longestStreak, daysThisYear, saveLogFor }: { logs: Record<string, Log>; streak: number; longestStreak: number; daysThisYear: number; saveLogFor: SaveLogFor }) {
  const today = new Date(); const [selectedDate, setSelectedDate] = useState(dateKey); const [viewDate, setViewDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1)); const year = viewDate.getFullYear(); const month = viewDate.getMonth(); const days = new Date(year, month + 1, 0).getDate(); const starts = new Date(year, month, 1).getDay(); const selectedLog = logs[selectedDate];
  function changeMonth(delta: number) { setViewDate(new Date(year, month + delta, 1)); }
  const isFuture = selectedDate > dateKey;
  const isPast = selectedDate < dateKey;
  return <section className="page"><header className="simple-head"><p className="eyebrow">YOUR CONSISTENCY</p><h1>CALENDAR</h1></header><div className="stats"><Stat label="Current streak" value={String(streak) + " days"} /><Stat label="Longest streak" value={String(longestStreak) + " days"} /><Stat label="Days this year" value={String(daysThisYear) + " / 365"} /></div><div className="calendar-card"><div className="cal-head"><button onClick={() => changeMonth(-1)}>‹</button><h2>{viewDate.toLocaleString("en", { month: "long", year: "numeric" })}</h2><button onClick={() => changeMonth(1)}>›</button></div><div className="week">{["S","M","T","W","T","F","S"].map((x,i)=><span key={i}>{x}</span>)}</div><div className="days">{Array.from({ length: starts }).map((_,i)=><i key={"b" + i}/>)}{Array.from({ length: days }).map((_,i) => { const d=i+1; const key = new Date(year, month, d).toISOString().slice(0,10); const isToday=d===today.getDate() && month===today.getMonth() && year===today.getFullYear(); const done=!!logs[key]; const className=(isToday ? "is-today " : "") + (selectedDate === key ? "is-selected " : "") + (done ? "done" : ""); return <button key={d} onClick={() => setSelectedDate(key)} className={className}><span>{d}</span>{done && <b>✓</b>}</button> })}</div></div>
    <div className="day-detail"><span>{new Date(selectedDate + "T12:00:00").toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric" })}</span>
      {isFuture && <p>You can&apos;t log practice for a future day.</p>}
      {isPast && <DayEditor key={selectedDate} date={selectedDate} log={selectedLog} onSave={saveLogFor} />}
      {!isFuture && !isPast && (selectedLog ? <><strong>{selectedLog.minutes} min practised</strong><div className="detail-chips">{selectedLog.items.map((item) => <em key={item}>{item}</em>)}</div>{selectedLog.notes && <p>{selectedLog.notes}</p>}</> : <p>No practice logged for this day. Log today&apos;s practice from the Today tab.</p>)}
    </div>
  </section>;
}

function DayEditor({ date, log, onSave }: { date: string; log?: Log; onSave: SaveLogFor }) {
  const [minutes, setMinutes] = useState(String(log?.minutes ?? ""));
  const [selected, setSelected] = useState<string[]>(log?.items ?? []);
  const [notes, setNotes] = useState(log?.notes ?? "");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  function toggle(item: string) { setSelected((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item]); }
  async function handleSave() {
    setBusy(true);
    const ok = await onSave(date, Number(minutes) || 0, selected, notes);
    setBusy(false);
    if (ok) { setSaved(true); setTimeout(() => setSaved(false), 1800); }
  }
  return <div className="form-card">
    <label className="input-label">HOW LONG DID YOU PRACTISE?</label>
    <div className="minutes"><input inputMode="numeric" size={3} value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ""))} /><span>min</span></div>
    <div className="quick-add"><button onClick={() => setMinutes(String(Math.max(0, (Number(minutes) || 0) - 5)))}>-5 min</button><button onClick={() => setMinutes(String(Math.max(0, (Number(minutes) || 0) - 1)))}>-1 min</button><button onClick={() => setMinutes(String((Number(minutes) || 0) + 1))}>+1 min</button><button onClick={() => setMinutes(String((Number(minutes) || 0) + 5))}>+5 min</button></div>
    <label className="input-label checklist-label">WHAT DID YOU PRACTISE?</label>
    <div className="chips">{items.map((item) => <button key={item} onClick={() => toggle(item)} className={selected.includes(item) ? "chip selected" : "chip"}>{selected.includes(item) && <b>✓</b>}{item}</button>)}</div>
    <label className="input-label notes-label">NOTES <em>OPTIONAL</em></label>
    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What did you practise that day?" />
    <button className={saved ? "save saved" : "save"} onClick={handleSave} disabled={busy}>{saved ? "✓ Practice saved" : busy ? "Saving..." : "Save practice"}<span>→</span></button>
  </div>;
}
function Stat({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><strong>{value}</strong></div>; }

function Group({ user, setError }: { user: any; setError: (message: string) => void }) {
  const [mode, setMode] = useState<"start" | "create" | "join">("start"); const [name, setName] = useState(""); const [code, setCode] = useState(""); const [group, setGroup] = useState<any>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { supabase.from("group_members").select("groups(id,name,invite_code)").eq("user_id", user.id).limit(1).maybeSingle().then(({ data }) => { if (data) setGroup((data as any).groups); }); }, [user]);
  async function createGroup() { setBusy(true); const invite = Math.random().toString(36).slice(2,8).toUpperCase(); const { data, error } = await supabase.from("groups").insert({ name, invite_code: invite, created_by: user.id }).select().single(); if (!error && data) { const member = await supabase.from("group_members").insert({ group_id: data.id, user_id: user.id, role: "owner" }); if (!member.error) setGroup(data); else setError(member.error.message); } else setError(error?.message ?? "Could not create group."); setBusy(false); }
  async function joinGroup() { setBusy(true); const { data, error } = await supabase.from("groups").select("id,name,invite_code").eq("invite_code", code.trim().toUpperCase()).maybeSingle(); if (error || !data) setError("That invite code was not found."); else { const member = await supabase.from("group_members").insert({ group_id: data.id, user_id: user.id }); if (member.error) setError(member.error.message); else setGroup(data); } setBusy(false); }
  if (group) return <section className="page"><header className="simple-head"><p className="eyebrow">YOUR CREW</p><h1>{group.name}</h1></header><div className="group-card"><div className="group-icon">✦</div><h2>You&apos;re in.</h2><p>Invite drummers with this code:</p><strong className="invite-code">{group.invite_code}</strong><button className="secondary" onClick={() => navigator.clipboard.writeText(group.invite_code)}>Copy invite code</button></div><div className="challenge"><span>CHALLENGES</span><h3>Coming next</h3><p>Create your first shared goal as soon as your crew is ready.</p></div></section>;
  return <section className="page"><header className="simple-head"><p className="eyebrow">PRACTISE TOGETHER</p><h1>YOUR GROUP</h1></header><div className="group-card"><div className="group-icon">✦</div><h2>{mode === "start" ? "Find your crew." : mode === "create" ? "Start a group" : "Join your crew"}</h2>{mode === "start" ? <><p>Stay accountable, climb the leaderboard, and make practice more fun.</p><button className="primary" onClick={() => setMode("create")}>Create a group <span>→</span></button><button className="secondary" onClick={() => setMode("join")}>Join with invite code</button></> : <><input className="group-input" value={mode === "create" ? name : code} onChange={e => mode === "create" ? setName(e.target.value) : setCode(e.target.value)} placeholder={mode === "create" ? "Group name" : "Invite code"}/><button className="primary" disabled={busy || !(mode === "create" ? name : code)} onClick={mode === "create" ? createGroup : joinGroup}>{busy ? "Please wait..." : mode === "create" ? "Create group" : "Join group"}</button><button className="secondary" onClick={() => setMode("start")}>Back</button></>}</div></section>;
}
function Settings({ signOut, user, setError, profileName, onProfileNameSaved }: { signOut: () => void; user: any; setError: (message: string) => void; profileName: string; onProfileNameSaved: (name: string) => void }) {
  const [name, setName] = useState(profileName); const [goal, setGoal] = useState("30"); const [language, setLanguage] = useState("en"); const [reminders, setReminders] = useState(false); const [saved, setSaved] = useState(false);
  useEffect(() => { supabase.from("settings").select("daily_goal_minutes,language,reminder_enabled").eq("user_id", user.id).maybeSingle().then(({ data }) => { if (data) { const row: any = data; setGoal(String(row.daily_goal_minutes)); setLanguage(row.language); setReminders(row.reminder_enabled); } }); }, [user]);
  async function saveSettings() { const profile = await supabase.from("profiles").upsert({ id: user.id, name }, { onConflict: "id" }); const settings = await supabase.from("settings").upsert({ user_id: user.id, daily_goal_minutes: Number(goal) || 30, language, reminder_enabled: reminders }, { onConflict: "user_id" }); if (profile.error || settings.error) setError(profile.error?.message ?? settings.error?.message ?? "Could not save settings."); else { onProfileNameSaved(name); setSaved(true); setTimeout(() => setSaved(false), 1800); } }
  return <section className="page"><header className="simple-head"><p className="eyebrow">MAKE IT YOURS</p><h1>SETTINGS</h1></header><div className="settings-form"><label>DISPLAY NAME<input value={name} onChange={e => setName(e.target.value)} /></label><label>DAILY PRACTICE GOAL<input inputMode="numeric" value={goal} onChange={e => setGoal(e.target.value.replace(/\D/g, ""))} /><small>minutes</small></label><label>LANGUAGE<select value={language} onChange={e => setLanguage(e.target.value)}><option value="en">English</option><option value="es">Español</option></select></label><button className="toggle-row" onClick={() => setReminders(!reminders)}><span>Daily practice reminders</span><b className={reminders ? "on" : ""}>{reminders ? "ON" : "OFF"}</b></button><button className={saved ? "save saved" : "save"} onClick={saveSettings}>{saved ? "✓ Settings saved" : "Save settings"}</button></div><button className="logout" onClick={signOut}>Log out</button></section>;
}
function Setting({icon,label,value}:{icon:string;label:string;value:string}) { return <button className="setting"><span className="setting-icon">{icon}</span><span>{label}</span><em>{value} ›</em></button>; }

const SIGNATURE_BEATS: Record<string, number> = { "4/4": 4, "3/4": 3, "6/8": 6 };

function Metronome({ close, onAddMinutes }: { close: () => void; onAddMinutes: (minutes: number) => void }) {
  const [bpm, setBpm] = useState(100);
  const [playing, setPlaying] = useState(false);
  const [signature, setSignature] = useState("4/4");
  const [elapsed, setElapsed] = useState(0);
  const [showAddPrompt, setShowAddPrompt] = useState(false);
  const bpmRef = useRef(bpm);
  const beatsPerMeasureRef = useRef(SIGNATURE_BEATS[signature]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const schedulerRef = useRef<number | null>(null);
  const nextNoteTimeRef = useRef(0);
  const beatRef = useRef(0);
  const tapTimesRef = useRef<number[]>([]);
  const lastTapRef = useRef<number | null>(null);

  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => { beatsPerMeasureRef.current = SIGNATURE_BEATS[signature]; }, [signature]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [playing]);

  useEffect(() => {
    return () => {
      if (schedulerRef.current !== null) window.clearInterval(schedulerRef.current);
      audioCtxRef.current?.close();
    };
  }, []);

  function playClick(time: number, accent: boolean) {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = accent ? 1000 : 720;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(accent ? 0.5 : 0.3, time + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.05);
  }

  function scheduler() {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    while (nextNoteTimeRef.current < ctx.currentTime + 0.1) {
      playClick(nextNoteTimeRef.current, beatRef.current % beatsPerMeasureRef.current === 0);
      beatRef.current += 1;
      nextNoteTimeRef.current += 60 / bpmRef.current;
    }
  }

  const elapsedLabel = String(Math.floor(elapsed / 60)).padStart(2, "0") + ":" + String(elapsed % 60).padStart(2, "0");
  const loggedMinutes = Math.max(1, Math.ceil(elapsed / 60));
  async function togglePlaying() {
    if (!playing) {
      setElapsed(0);
      setPlaying(true);
      const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = audioCtxRef.current ?? new AudioContextClass();
      audioCtxRef.current = ctx;
      if (ctx.state === "suspended") await ctx.resume();
      // iOS Safari needs a buffer actually played (not just resume()) within the gesture to fully unlock audio output.
      const unlockBuffer = ctx.createBuffer(1, 1, 22050);
      const unlockSource = ctx.createBufferSource();
      unlockSource.buffer = unlockBuffer;
      unlockSource.connect(ctx.destination);
      unlockSource.start(0);
      beatRef.current = 0;
      nextNoteTimeRef.current = ctx.currentTime + 0.05;
      schedulerRef.current = window.setInterval(scheduler, 25);
      return;
    }
    setPlaying(false);
    if (schedulerRef.current !== null) { window.clearInterval(schedulerRef.current); schedulerRef.current = null; }
    if (elapsed > 0) setShowAddPrompt(true);
  }
  function tapTempo() {
    const now = performance.now();
    if (lastTapRef.current !== null && now - lastTapRef.current < 2000) {
      const intervals = [...tapTimesRef.current, now - lastTapRef.current].slice(-4);
      tapTimesRef.current = intervals;
      const average = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
      setBpm(Math.min(240, Math.max(40, Math.round(60000 / average))));
    } else {
      tapTimesRef.current = [];
    }
    lastTapRef.current = now;
  }
  function addTime() { onAddMinutes(loggedMinutes); setShowAddPrompt(false); setElapsed(0); }
  function discardTime() { setShowAddPrompt(false); setElapsed(0); }
  return <div className="modal"><div className="metro"><button className="close" onClick={close}>×</button><p className="eyebrow">PRACTICE TOOL</p><h2>METRONOME</h2><div className={playing ? "pulse playing" : "pulse"} style={{ animationDuration: `${60 / bpm}s` }}><span>{bpm}</span><small>BPM</small></div><div className="metronome-timer">{playing ? "PRACTICE TIMER" : "SESSION TIME"}<strong>{elapsedLabel}</strong></div><input className="range" type="range" min="40" max="240" value={bpm} onChange={e => setBpm(+e.target.value)}/><div className="tempo-actions"><button onClick={() => setBpm(Math.max(40, bpm - 1))}>−</button><button className="tap" onClick={tapTempo}>TAP TEMPO</button><button onClick={() => setBpm(Math.min(240, bpm + 1))}>+</button></div><div className="signatures">{["4/4", "3/4", "6/8"].map(s => <button key={s} onClick={() => setSignature(s)} className={s === signature ? "selected" : ""}>{s}</button>)}</div><button className={playing ? "stop" : "start"} onClick={togglePlaying}>{playing ? "■ Stop" : "▶ Start"}</button>{showAddPrompt && <div className="add-time"><span>SESSION COMPLETE</span><h3>Add {loggedMinutes} min to today&apos;s practice?</h3><p>Your metronome session lasted {elapsedLabel}.</p><div><button className="discard" onClick={discardTime}>Not now</button><button className="add" onClick={addTime}>Add time</button></div></div>}</div></div>; }