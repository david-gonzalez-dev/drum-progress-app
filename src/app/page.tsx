"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type Tab = "today" | "calendar" | "group" | "settings";
type Log = { minutes: number; items: string[]; notes: string };
type Lang = "en" | "es";

const PRACTICE_ITEMS = [
  { en: "Rudiments", es: "Rudimentos" },
  { en: "Single Strokes", es: "Golpes simples" },
  { en: "Double Strokes", es: "Golpes dobles" },
  { en: "Paradiddles", es: "Paradiddles" },
  { en: "Stick Control", es: "Control de baquetas" },
  { en: "Coordination", es: "Coordinación" },
  { en: "Bass Drum", es: "Bombo" },
  { en: "Rhythms", es: "Ritmos" },
  { en: "Permutations", es: "Permutaciones" },
];
function practiceItemLabel(en: string, lang: Lang) {
  return PRACTICE_ITEMS.find((item) => item.en === en)?.[lang] ?? en;
}

const NAV_TABS: Tab[] = ["today", "calendar", "group", "settings"];

const translations = {
  en: {
    nav: { today: "Today", calendar: "Calendar", group: "Group", settings: "Settings" },
    today: {
      welcomeBack: "WELCOME BACK", heroLine1: "KEEP THE", heroLine2: "RHYTHM.", currentStreak: "Current streak", days: "days",
      todaysPractice: "Today's practice", metronome: "Metronome", howLong: "HOW LONG DID YOU PRACTISE?", whatPractised: "WHAT DID YOU PRACTISE?",
      notes: "NOTES", optional: "OPTIONAL", notesPlaceholder: "What did you practise today?", savePractice: "Save practice", practiceSaved: "✓ Practice saved",
    },
    calendar: {
      yourConsistency: "YOUR CONSISTENCY", title: "CALENDAR", longestStreak: "Longest streak", daysThisYear: "Days this year",
      weekdays: ["S", "M", "T", "W", "T", "F", "S"], futureDay: "You can't log practice for a future day.",
      noPractice: "No practice logged for this day. Log today's practice from the Today tab.", minPractised: "min practised",
      notesPlaceholder: "What did you practise that day?", saving: "Saving...",
    },
    group: {
      yourCrew: "YOUR CREW", youreIn: "You're in.", inviteMsg: "Invite drummers with this code:", copyInvite: "Copy invite code",
      challenges: "CHALLENGES", comingNext: "Coming next", comingNextDesc: "Create your first shared goal as soon as your crew is ready.",
      practiseTogether: "PRACTISE TOGETHER", yourGroup: "YOUR GROUP", findCrew: "Find your crew.", startGroup: "Start a group", joinCrew: "Join your crew",
      intro: "Stay accountable, climb the leaderboard, and make practice more fun.", createGroupBtn: "Create a group", joinWithCode: "Join with invite code",
      groupNamePlaceholder: "Group name", inviteCodePlaceholder: "Invite code", pleaseWait: "Please wait...", createGroup: "Create group",
      joinGroup: "Join group", back: "Back", inviteNotFound: "That invite code was not found.", couldNotCreate: "Could not create group.",
    },
    settings: {
      makeItYours: "MAKE IT YOURS", title: "SETTINGS", displayName: "DISPLAY NAME", dailyGoal: "DAILY PRACTICE GOAL", minutes: "minutes",
      language: "LANGUAGE", reminders: "Daily practice reminders", on: "ON", off: "OFF", save: "Save settings", saved: "✓ Settings saved", logout: "Log out",
    },
    metronome: {
      practiceTool: "PRACTICE TOOL", title: "METRONOME", practiceTimer: "PRACTICE TIMER", sessionTime: "SESSION TIME", tapTempo: "TAP TEMPO",
      start: "▶ Start", stop: "■ Stop", sessionComplete: "SESSION COMPLETE",
      addTimeQuestion: (minutes: number) => `Add ${minutes} min to today's practice?`, sessionLasted: (time: string) => `Your metronome session lasted ${time}.`,
      notNow: "Not now", addTime: "Add time",
    },
  },
  es: {
    nav: { today: "Hoy", calendar: "Calendario", group: "Grupo", settings: "Ajustes" },
    today: {
      welcomeBack: "BIENVENIDO DE NUEVO", heroLine1: "MANTÉN EL", heroLine2: "RITMO.", currentStreak: "Racha actual", days: "días",
      todaysPractice: "Práctica de hoy", metronome: "Metrónomo", howLong: "¿CUÁNTO TIEMPO PRACTICASTE?", whatPractised: "¿QUÉ PRACTICASTE?",
      notes: "NOTAS", optional: "OPCIONAL", notesPlaceholder: "¿Qué practicaste hoy?", savePractice: "Guardar práctica", practiceSaved: "✓ Práctica guardada",
    },
    calendar: {
      yourConsistency: "TU CONSTANCIA", title: "CALENDARIO", longestStreak: "Racha más larga", daysThisYear: "Días este año",
      weekdays: ["D", "L", "M", "M", "J", "V", "S"], futureDay: "No puedes registrar práctica en un día futuro.",
      noPractice: "No hay práctica registrada para este día. Regístrala desde la pestaña Hoy.", minPractised: "min practicados",
      notesPlaceholder: "¿Qué practicaste ese día?", saving: "Guardando...",
    },
    group: {
      yourCrew: "TU GRUPO", youreIn: "Ya estás dentro.", inviteMsg: "Invita a otros bateristas con este código:", copyInvite: "Copiar código de invitación",
      challenges: "DESAFÍOS", comingNext: "Próximamente", comingNextDesc: "Crea tu primera meta compartida en cuanto tu grupo esté listo.",
      practiseTogether: "PRACTICA EN GRUPO", yourGroup: "TU GRUPO", findCrew: "Encuentra tu grupo.", startGroup: "Crear un grupo", joinCrew: "Únete a un grupo",
      intro: "Mantente responsable, sube en la clasificación y haz que practicar sea más divertido.", createGroupBtn: "Crear un grupo", joinWithCode: "Unirse con código de invitación",
      groupNamePlaceholder: "Nombre del grupo", inviteCodePlaceholder: "Código de invitación", pleaseWait: "Un momento...", createGroup: "Crear grupo",
      joinGroup: "Unirse al grupo", back: "Atrás", inviteNotFound: "No se encontró ese código de invitación.", couldNotCreate: "No se pudo crear el grupo.",
    },
    settings: {
      makeItYours: "PERSONALÍZALO", title: "AJUSTES", displayName: "NOMBRE", dailyGoal: "META DIARIA DE PRÁCTICA", minutes: "minutos",
      language: "IDIOMA", reminders: "Recordatorios diarios de práctica", on: "SÍ", off: "NO", save: "Guardar ajustes", saved: "✓ Ajustes guardados", logout: "Cerrar sesión",
    },
    metronome: {
      practiceTool: "HERRAMIENTA DE PRÁCTICA", title: "METRÓNOMO", practiceTimer: "TEMPORIZADOR", sessionTime: "TIEMPO DE SESIÓN", tapTempo: "MARCAR TEMPO",
      start: "▶ Iniciar", stop: "■ Detener", sessionComplete: "SESIÓN COMPLETA",
      addTimeQuestion: (minutes: number) => `¿Añadir ${minutes} min a la práctica de hoy?`, sessionLasted: (time: string) => `Tu sesión de metrónomo duró ${time}.`,
      notNow: "Ahora no", addTime: "Añadir tiempo",
    },
  },
} as const;

function formatDate(lang: Lang) {
  return new Intl.DateTimeFormat(lang === "es" ? "es-ES" : "en-US", { weekday: "long", month: "long", day: "numeric" }).format(new Date());
}

const NAV_ICONS: Record<Tab, React.ReactNode> = {
  today: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="10" cy="10" r="7.3" /><circle cx="10" cy="10" r="2.4" fill="currentColor" stroke="none" /></svg>,
  calendar: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4.5" width="14" height="12.5" rx="2" /><path d="M3 8.5h14" /><path d="M7 2.5v3M13 2.5v3" /></svg>,
  group: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="7.2" cy="7" r="2.6" /><path d="M2.5 17c0-2.9 2.1-5 4.7-5s4.7 2.1 4.7 5" /><circle cx="14.5" cy="7.8" r="2.1" /><path d="M12.7 12.3c1.9.4 3.3 2.1 3.3 4.7" /></svg>,
  settings: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="2.6" /><path d="M10 2.8v2M10 15.2v2M17.2 10h-2M4.8 10h-2M15.1 4.9l-1.4 1.4M6.3 13.7l-1.4 1.4M15.1 15.1l-1.4-1.4M6.3 6.3L4.9 4.9" /></svg>,
};
const dateKey = new Date().toISOString().slice(0, 10);

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
  const [language, setLanguage] = useState<Lang>("en");
  const T = translations[language];

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
    supabase.from("settings").select("language").eq("user_id", user.id).maybeSingle().then(({ data }) => {
      if (data?.language === "es" || data?.language === "en") setLanguage(data.language);
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
    {tab === "today" && <Today minutes={minutes} setMinutes={setMinutes} selected={selected} toggle={toggle} notes={notes} setNotes={setNotes} save={save} saved={saved} streak={streak} openMetronome={() => setMetronome(true)} displayName={displayName} language={language} T={T} />}
    {tab === "calendar" && <Calendar logs={logs} streak={streak} longestStreak={longestStreak} daysThisYear={daysThisYear} saveLogFor={saveLogFor} language={language} T={T} />}
    {tab === "group" && <Group user={user} setError={setAuthError} T={T} />}
    {tab === "settings" && <Settings signOut={signOut} user={user} setError={setAuthError} profileName={displayName} onProfileNameSaved={setProfileName} language={language} onLanguageSaved={setLanguage} T={T} />}
    {authError && <button className="error-toast" onClick={() => setAuthError("")}>{authError} ×</button>}
    <nav className="bottom-nav">{NAV_TABS.map((id) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}><span>{NAV_ICONS[id]}</span>{T.nav[id]}</button>)}</nav>
    {metronome && <Metronome close={() => setMetronome(false)} onAddMinutes={addMetronomeMinutes} T={T} />}
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

function Today({ minutes, setMinutes, selected, toggle, notes, setNotes, save, saved, streak, openMetronome, displayName, language, T }: any) {
  return <section className="page today">
    <header className="hero"><div><p className="eyebrow">{T.today.welcomeBack}, {displayName.toUpperCase()}</p><h1>{T.today.heroLine1}<br/><i>{T.today.heroLine2}</i></h1><p className="date">{formatDate(language)}</p></div><button className="avatar">{displayName.charAt(0).toUpperCase()}</button></header>
    <div className="streak-card"><div className="flame">🔥</div><div><span>{T.today.currentStreak}</span><strong>{streak} {T.today.days}</strong></div></div>
    <div className="section-title"><h2>{T.today.todaysPractice}</h2><button onClick={openMetronome}>⌁ {T.today.metronome}</button></div>
    <div className="form-card"><label className="input-label">{T.today.howLong}</label><div className="minutes"><input inputMode="numeric" size={3} value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ""))}/><span>min</span></div>
      <div className="quick-add"><button onClick={() => setMinutes(String(Math.max(0, (Number(minutes) || 0) - 5)))}>-5 min</button><button onClick={() => setMinutes(String(Math.max(0, (Number(minutes) || 0) - 1)))}>-1 min</button><button onClick={() => setMinutes(String((Number(minutes) || 0) + 1))}>+1 min</button><button onClick={() => setMinutes(String((Number(minutes) || 0) + 5))}>+5 min</button></div>
      <label className="input-label checklist-label">{T.today.whatPractised}</label><div className="chips">{PRACTICE_ITEMS.map((item) => <button key={item.en} onClick={() => toggle(item.en)} className={selected.includes(item.en) ? "chip selected" : "chip"}>{selected.includes(item.en) && <b>✓</b>}{item[language as Lang]}</button>)}</div>
      <label className="input-label notes-label">{T.today.notes} <em>{T.today.optional}</em></label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={T.today.notesPlaceholder} />
      <button className={saved ? "save saved" : "save"} onClick={save}>{saved ? T.today.practiceSaved : T.today.savePractice}<span>→</span></button>
    </div>
  </section>;
}

type SaveLogFor = (targetDate: string, targetMinutes: number, targetItems: string[], targetNotes: string) => Promise<boolean>;

function Calendar({ logs, streak, longestStreak, daysThisYear, saveLogFor, language, T }: { logs: Record<string, Log>; streak: number; longestStreak: number; daysThisYear: number; saveLogFor: SaveLogFor; language: Lang; T: any }) {
  const today = new Date(); const [selectedDate, setSelectedDate] = useState(dateKey); const [viewDate, setViewDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1)); const year = viewDate.getFullYear(); const month = viewDate.getMonth(); const days = new Date(year, month + 1, 0).getDate(); const starts = new Date(year, month, 1).getDay(); const selectedLog = logs[selectedDate];
  const locale = language === "es" ? "es-ES" : "en-US";
  function changeMonth(delta: number) { setViewDate(new Date(year, month + delta, 1)); }
  const isFuture = selectedDate > dateKey;
  const isPast = selectedDate < dateKey;
  return <section className="page"><header className="simple-head"><p className="eyebrow">{T.calendar.yourConsistency}</p><h1>{T.calendar.title}</h1></header><div className="stats"><Stat label={T.today.currentStreak} value={String(streak) + " " + T.today.days} /><Stat label={T.calendar.longestStreak} value={String(longestStreak) + " " + T.today.days} /><Stat label={T.calendar.daysThisYear} value={String(daysThisYear) + " / 365"} /></div><div className="calendar-card"><div className="cal-head"><button onClick={() => changeMonth(-1)}>‹</button><h2>{viewDate.toLocaleString(locale, { month: "long", year: "numeric" })}</h2><button onClick={() => changeMonth(1)}>›</button></div><div className="week">{T.calendar.weekdays.map((x: string, i: number)=><span key={i}>{x}</span>)}</div><div className="days">{Array.from({ length: starts }).map((_,i)=><i key={"b" + i}/>)}{Array.from({ length: days }).map((_,i) => { const d=i+1; const key = new Date(year, month, d).toISOString().slice(0,10); const isToday=d===today.getDate() && month===today.getMonth() && year===today.getFullYear(); const done=!!logs[key]; const className=(isToday ? "is-today " : "") + (selectedDate === key ? "is-selected " : "") + (done ? "done" : ""); return <button key={d} onClick={() => setSelectedDate(key)} className={className}><span>{d}</span>{done && <b>✓</b>}</button> })}</div></div>
    <div className="day-detail"><span>{new Date(selectedDate + "T12:00:00").toLocaleDateString(locale, { weekday: "long", month: "long", day: "numeric" })}</span>
      {isFuture && <p>{T.calendar.futureDay}</p>}
      {isPast && <DayEditor key={selectedDate} date={selectedDate} log={selectedLog} onSave={saveLogFor} language={language} T={T} />}
      {!isFuture && !isPast && (selectedLog ? <><strong>{selectedLog.minutes} {T.calendar.minPractised}</strong><div className="detail-chips">{selectedLog.items.map((item) => <em key={item}>{practiceItemLabel(item, language)}</em>)}</div>{selectedLog.notes && <p>{selectedLog.notes}</p>}</> : <p>{T.calendar.noPractice}</p>)}
    </div>
  </section>;
}

function DayEditor({ date, log, onSave, language, T }: { date: string; log?: Log; onSave: SaveLogFor; language: Lang; T: any }) {
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
    <label className="input-label">{T.today.howLong}</label>
    <div className="minutes"><input inputMode="numeric" size={3} value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ""))} /><span>min</span></div>
    <div className="quick-add"><button onClick={() => setMinutes(String(Math.max(0, (Number(minutes) || 0) - 5)))}>-5 min</button><button onClick={() => setMinutes(String(Math.max(0, (Number(minutes) || 0) - 1)))}>-1 min</button><button onClick={() => setMinutes(String((Number(minutes) || 0) + 1))}>+1 min</button><button onClick={() => setMinutes(String((Number(minutes) || 0) + 5))}>+5 min</button></div>
    <label className="input-label checklist-label">{T.today.whatPractised}</label>
    <div className="chips">{PRACTICE_ITEMS.map((item) => <button key={item.en} onClick={() => toggle(item.en)} className={selected.includes(item.en) ? "chip selected" : "chip"}>{selected.includes(item.en) && <b>✓</b>}{item[language]}</button>)}</div>
    <label className="input-label notes-label">{T.today.notes} <em>{T.today.optional}</em></label>
    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={T.calendar.notesPlaceholder} />
    <button className={saved ? "save saved" : "save"} onClick={handleSave} disabled={busy}>{saved ? T.today.practiceSaved : busy ? T.calendar.saving : T.today.savePractice}<span>→</span></button>
  </div>;
}
function Stat({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><strong>{value}</strong></div>; }

function Group({ user, setError, T }: { user: any; setError: (message: string) => void; T: any }) {
  const [mode, setMode] = useState<"start" | "create" | "join">("start"); const [name, setName] = useState(""); const [code, setCode] = useState(""); const [group, setGroup] = useState<any>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { supabase.from("group_members").select("groups(id,name,invite_code)").eq("user_id", user.id).limit(1).maybeSingle().then(({ data }) => { if (data) setGroup((data as any).groups); }); }, [user]);
  async function createGroup() { setBusy(true); const invite = Math.random().toString(36).slice(2,8).toUpperCase(); const { data, error } = await supabase.from("groups").insert({ name, invite_code: invite, created_by: user.id }).select().single(); if (!error && data) { const member = await supabase.from("group_members").insert({ group_id: data.id, user_id: user.id, role: "owner" }); if (!member.error) setGroup(data); else setError(member.error.message); } else setError(error?.message ?? T.group.couldNotCreate); setBusy(false); }
  async function joinGroup() { setBusy(true); const { data, error } = await supabase.from("groups").select("id,name,invite_code").eq("invite_code", code.trim().toUpperCase()).maybeSingle(); if (error || !data) setError(T.group.inviteNotFound); else { const member = await supabase.from("group_members").insert({ group_id: data.id, user_id: user.id }); if (member.error) setError(member.error.message); else setGroup(data); } setBusy(false); }
  if (group) return <section className="page"><header className="simple-head"><p className="eyebrow">{T.group.yourCrew}</p><h1>{group.name}</h1></header><div className="group-card"><div className="group-icon">✦</div><h2>{T.group.youreIn}</h2><p>{T.group.inviteMsg}</p><strong className="invite-code">{group.invite_code}</strong><button className="secondary" onClick={() => navigator.clipboard.writeText(group.invite_code)}>{T.group.copyInvite}</button></div><div className="challenge"><span>{T.group.challenges}</span><h3>{T.group.comingNext}</h3><p>{T.group.comingNextDesc}</p></div></section>;
  return <section className="page"><header className="simple-head"><p className="eyebrow">{T.group.practiseTogether}</p><h1>{T.group.yourGroup}</h1></header><div className="group-card"><div className="group-icon">✦</div><h2>{mode === "start" ? T.group.findCrew : mode === "create" ? T.group.startGroup : T.group.joinCrew}</h2>{mode === "start" ? <><p>{T.group.intro}</p><button className="primary" onClick={() => setMode("create")}>{T.group.createGroupBtn} <span>→</span></button><button className="secondary" onClick={() => setMode("join")}>{T.group.joinWithCode}</button></> : <><input className="group-input" value={mode === "create" ? name : code} onChange={e => mode === "create" ? setName(e.target.value) : setCode(e.target.value)} placeholder={mode === "create" ? T.group.groupNamePlaceholder : T.group.inviteCodePlaceholder}/><button className="primary" disabled={busy || !(mode === "create" ? name : code)} onClick={mode === "create" ? createGroup : joinGroup}>{busy ? T.group.pleaseWait : mode === "create" ? T.group.createGroup : T.group.joinGroup}</button><button className="secondary" onClick={() => setMode("start")}>{T.group.back}</button></>}</div></section>;
}
function Settings({ signOut, user, setError, profileName, onProfileNameSaved, language: currentLanguage, onLanguageSaved, T }: { signOut: () => void; user: any; setError: (message: string) => void; profileName: string; onProfileNameSaved: (name: string) => void; language: Lang; onLanguageSaved: (language: Lang) => void; T: any }) {
  const [name, setName] = useState(profileName); const [goal, setGoal] = useState("30"); const [language, setLanguage] = useState<Lang>(currentLanguage); const [reminders, setReminders] = useState(false); const [saved, setSaved] = useState(false);
  useEffect(() => { supabase.from("settings").select("daily_goal_minutes,language,reminder_enabled").eq("user_id", user.id).maybeSingle().then(({ data }) => { if (data) { const row: any = data; setGoal(String(row.daily_goal_minutes)); setLanguage(row.language); setReminders(row.reminder_enabled); } }); }, [user]);
  async function saveSettings() { const profile = await supabase.from("profiles").upsert({ id: user.id, name }, { onConflict: "id" }); const settings = await supabase.from("settings").upsert({ user_id: user.id, daily_goal_minutes: Number(goal) || 30, language, reminder_enabled: reminders }, { onConflict: "user_id" }); if (profile.error || settings.error) setError(profile.error?.message ?? settings.error?.message ?? "Could not save settings."); else { onProfileNameSaved(name); onLanguageSaved(language); setSaved(true); setTimeout(() => setSaved(false), 1800); } }
  return <section className="page"><header className="simple-head"><p className="eyebrow">{T.settings.makeItYours}</p><h1>{T.settings.title}</h1></header><div className="settings-form"><label>{T.settings.displayName}<input value={name} onChange={e => setName(e.target.value)} /></label><label>{T.settings.dailyGoal}<input inputMode="numeric" value={goal} onChange={e => setGoal(e.target.value.replace(/\D/g, ""))} /><small>{T.settings.minutes}</small></label><label>{T.settings.language}<select value={language} onChange={e => setLanguage(e.target.value as Lang)}><option value="en">English</option><option value="es">Español</option></select></label><button className="toggle-row" onClick={() => setReminders(!reminders)}><span>{T.settings.reminders}</span><b className={reminders ? "on" : ""}>{reminders ? T.settings.on : T.settings.off}</b></button><button className={saved ? "save saved" : "save"} onClick={saveSettings}>{saved ? T.settings.saved : T.settings.save}</button></div><button className="logout" onClick={signOut}>{T.settings.logout}</button></section>;
}
function Setting({icon,label,value}:{icon:string;label:string;value:string}) { return <button className="setting"><span className="setting-icon">{icon}</span><span>{label}</span><em>{value} ›</em></button>; }

const SIGNATURE_BEATS: Record<string, number> = { "4/4": 4, "3/4": 3, "6/8": 6 };

function Metronome({ close, onAddMinutes, T }: { close: () => void; onAddMinutes: (minutes: number) => void; T: any }) {
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
  return <div className="modal"><div className="metro"><button className="close" onClick={close}>×</button><p className="eyebrow">{T.metronome.practiceTool}</p><h2>{T.metronome.title}</h2><div className={playing ? "pulse playing" : "pulse"} style={{ animationDuration: `${60 / bpm}s` }}><span>{bpm}</span><small>BPM</small></div><div className="metronome-timer">{playing ? T.metronome.practiceTimer : T.metronome.sessionTime}<strong>{elapsedLabel}</strong></div><input className="range" type="range" min="40" max="240" value={bpm} onChange={e => setBpm(+e.target.value)}/><div className="tempo-actions"><button onClick={() => setBpm(Math.max(40, bpm - 1))}>−</button><button className="tap" onClick={tapTempo}>{T.metronome.tapTempo}</button><button onClick={() => setBpm(Math.min(240, bpm + 1))}>+</button></div><div className="signatures">{["4/4", "3/4", "6/8"].map(s => <button key={s} onClick={() => setSignature(s)} className={s === signature ? "selected" : ""}>{s}</button>)}</div><button className={playing ? "stop" : "start"} onClick={togglePlaying}>{playing ? T.metronome.stop : T.metronome.start}</button>{showAddPrompt && <div className="add-time"><span>{T.metronome.sessionComplete}</span><h3>{T.metronome.addTimeQuestion(loggedMinutes)}</h3><p>{T.metronome.sessionLasted(elapsedLabel)}</p><div><button className="discard" onClick={discardTime}>{T.metronome.notNow}</button><button className="add" onClick={addTime}>{T.metronome.addTime}</button></div></div>}</div></div>; }