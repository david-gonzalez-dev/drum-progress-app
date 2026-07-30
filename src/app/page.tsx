"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type Tab = "today" | "calendar" | "group" | "progress" | "settings";
type Log = { minutes: number; items: string[]; notes: string; equipment: string | null };
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

const NAV_TABS: Tab[] = ["today", "calendar", "group", "progress", "settings"];
const MEMBER_COLORS = ["#ff6b1a", "#4fd1c5", "#9f7aea", "#f6ad55", "#68d391", "#f687b3", "#63b3ed", "#fc8181"];
const CHALLENGE_PRESETS: { key: string; type: "daily" | "minutes" | "sessions"; goal: number; days: number }[] = [
  { key: "daily5", type: "daily", goal: 5, days: 7 },
  { key: "daily30x5", type: "daily", goal: 30, days: 5 },
  { key: "sessions3weekly", type: "sessions", goal: 3, days: 7 },
  { key: "daily5x20", type: "daily", goal: 5, days: 20 },
];

const BPM_LEVELS = [50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200];
const PRACTICE_TIERS = [
  { key: "beginner", min: 50, max: 90 },
  { key: "intermediate", min: 100, max: 130 },
  { key: "advanced", min: 140, max: 170 },
  { key: "legend", min: 180, max: 200 },
];
const RATING_RANK: Record<string, number> = { not_ready: 1, tense: 2, comfortable: 3, mastered: 4 };
const RATING_ORDER = ["not_ready", "tense", "comfortable", "mastered"];
const RATING_COLOR: Record<string, string> = { not_ready: "#e2877d", tense: "#f6ad55", comfortable: "#68d391", mastered: "#ff6b1a" };
const RATING_ICON: Record<string, string> = { not_ready: "🔴", tense: "🟠", comfortable: "🟢", mastered: "⭐" };

const translations = {
  en: {
    nav: { today: "Today", calendar: "Calendar", group: "Group", progress: "Progress", settings: "Settings" },
    today: {
      heroLine1: "DISCIPLINE", heroLine1b: "BUILDS", heroLine2: "SKILL.", currentStreak: "Current streak", days: "days",
      todaysPractice: "Today's practice", metronome: "Metronome", howLong: "HOW LONG DID YOU PRACTISE?", whatPractised: "WHAT DID YOU PRACTISE?",
      notes: "NOTES", optional: "OPTIONAL", notesPlaceholder: "What did you practise today?", savePractice: "Save practice", practiceSaved: "✓ Practice saved",
      startToday: "Start your streak today!", daysToMilestone: (left: number, milestone: number) => `${left} days to a ${milestone}-day streak!`,
      todayGoal: "TODAY'S GOAL", recentDays: "RECENT DAYS", equipment: "PRACTISED WITH", drumset: "Drumset", pad: "Practice Pad", addNotes: "+ Add notes",
    },
    calendar: {
      yourConsistency: "YOUR CONSISTENCY", title: "CALENDAR", longestStreak: "Longest streak", daysThisYear: "Days this year",
      weekdays: ["S", "M", "T", "W", "T", "F", "S"], futureDay: "You can't log practice for a future day.",
      noPractice: "No practice logged for this day. Log today's practice from the Today tab.", minPractised: "min practised",
      notesPlaceholder: "What did you practise that day?", saving: "Saving...",
      deleteEntry: "Delete entry", confirmDeleteEntry: "Delete this day's practice? This can't be undone.", couldNotDeleteEntry: "Could not delete this entry.",
    },
    group: {
      yourCrew: "YOUR CREW", youreIn: "You're in.", inviteMsg: "Invite drummers with this code:", copyInvite: "Copy invite code",
      challenges: "CHALLENGES",
      practiseTogether: "PRACTISE TOGETHER", yourGroup: "YOUR GROUP", findCrew: "Find your crew.", startGroup: "Start a group", joinCrew: "Join your crew",
      intro: "Stay accountable, climb the leaderboard, and make practice more fun.", createGroupBtn: "Create a group", joinWithCode: "Join with invite code",
      groupNamePlaceholder: "Group name", inviteCodePlaceholder: "Invite code", pleaseWait: "Please wait...", createGroup: "Create group",
      joinGroup: "Join group", back: "Back", inviteNotFound: "That invite code was not found.", couldNotCreate: "Could not create group.",
      leaderboard: "LEADERBOARD", you: "You", minutesShort: "min",
      noChallenges: "No challenges yet. Start one with your crew!", newChallenge: "+ New challenge", cancel: "Cancel", challengeNamePlaceholder: "Challenge name",
      typeDaily: "Every day", typeMinutes: "Total minutes", typeSessions: "Days practised", goalLabel: "GOAL", startLabel: "START", endLabel: "END",
      rewardPlaceholder: "Reward (optional)", punishmentPlaceholder: "Punishment (optional)", createChallengeBtn: "Create challenge",
      joinChallengeBtn: "Join challenge", joined: "Joined", participants: (n: number) => `${n} joined`,
      dailyGoalDesc: (min: number) => `${min}+ min every day`, minutesGoalDesc: (total: number) => `Reach ${total} total min`,
      sessionsGoalDesc: (days: number) => `Practise on ${days} days`, daysProgress: (p: number, t: number) => `${p}/${t} days`,
      minutesProgress: (p: number, t: number) => `${p}/${t} min`, reward: "Reward:", punishment: "Punishment:", couldNotCreateChallenge: "Could not create challenge.",
      presetDaily5: "5 min every day", presetDaily30x5: "30+ min, 5 days straight", presetSessions3weekly: "3 sessions this week", presetDaily5x20: "20-day challenge: 5+ min daily",
      weekdaysMon: ["M", "T", "W", "T", "F", "S", "S"], copied: "Copied!", progress: "PROGRESS", leaveGroup: "Leave group",
      confirmLeave: "Leave this group? You can rejoin later with the invite code.", confirmDeleteChallenge: "Delete this challenge? This can't be undone.",
      deleteChallenge: "Delete", since: (date: string) => `Since ${date}`, couldNotLeave: "Could not leave the group.", couldNotDeleteChallenge: "Could not delete the challenge.",
    },
    progressPage: {
      eyebrow: "YOUR PROGRESS", title: "PROGRESS", techniques: "MOST PRACTISED TECHNIQUES", equipment: "DRUMSET VS PRACTICE PAD",
      noData: "Log some practice to see your progress here.",
    },
    practiceMode: {
      trigger: "🎯 Practice Mode", eyebrow: "TRACK YOUR LEVELS", title: "PRACTICE MODE",
      currentLevel: "CURRENT LEVEL", levelsUnlocked: (n: number, total: number) => `${n} of ${total} levels unlocked`,
      notStarted: "Not started", bpmLevels: "BPM LEVELS · TAP TO PRACTISE",
      nextUp: "NEXT UP", locked: "Locked", tapToStart: "Tap to start",
      tierBeginner: "BEGINNER", tierIntermediate: "INTERMEDIATE", tierAdvanced: "ADVANCED", tierLegend: "LEGEND",
      ratingNotReady: "Not ready", ratingTense: "Tense", ratingComfortable: "Comfortable", ratingMastered: "Mastered",
      rateTitle: "HOW DID THAT FEEL?", rateSubtitle: (bpm: number) => `Your session at ${bpm} BPM is saved.`,
      backToBook: "Back to Practice Mode", couldNotSaveSession: "Could not save this session.",
    },
    settings: {
      makeItYours: "MAKE IT YOURS", title: "SETTINGS", displayName: "DISPLAY NAME", dailyGoal: "DAILY PRACTICE GOAL", minutes: "minutes",
      language: "LANGUAGE", reminders: "Daily practice reminders", on: "ON", off: "OFF", save: "Save settings", saved: "✓ Settings saved", logout: "Log out", calendarColor: "GROUP CALENDAR COLOR",
    },
    metronome: {
      practiceTool: "PRACTICE TOOL", title: "METRONOME", practiceTimer: "PRACTICE TIMER", sessionTime: "SESSION TIME", tapTempo: "TAP TEMPO",
      start: "▶ Start", stop: "■ Stop", sessionComplete: "SESSION COMPLETE",
      addTimeQuestion: (minutes: number) => `Add ${minutes} min to today's practice?`, sessionLasted: (time: string) => `Your metronome session lasted ${time}.`,
      notNow: "Not now", addTime: "Add time",
    },
  },
  es: {
    nav: { today: "Hoy", calendar: "Calendario", group: "Grupo", progress: "Progreso", settings: "Ajustes" },
    today: {
      heroLine1: "DISCIPLINA", heroLine1b: "CONSTRUYE", heroLine2: "HABILIDAD.", currentStreak: "Racha actual", days: "días",
      todaysPractice: "Práctica de hoy", metronome: "Metrónomo", howLong: "¿CUÁNTO TIEMPO PRACTICASTE?", whatPractised: "¿QUÉ PRACTICASTE?",
      notes: "NOTAS", optional: "OPCIONAL", notesPlaceholder: "¿Qué practicaste hoy?", savePractice: "Guardar práctica", practiceSaved: "✓ Práctica guardada",
      startToday: "¡Empieza tu racha hoy!", daysToMilestone: (left: number, milestone: number) => `¡${left} días para una racha de ${milestone} días!`,
      todayGoal: "META DE HOY", recentDays: "DÍAS RECIENTES", equipment: "PRACTICASTE CON", drumset: "Batería", pad: "Pad de práctica", addNotes: "+ Añadir notas",
    },
    calendar: {
      yourConsistency: "TU CONSTANCIA", title: "CALENDARIO", longestStreak: "Racha más larga", daysThisYear: "Días este año",
      weekdays: ["D", "L", "M", "M", "J", "V", "S"], futureDay: "No puedes registrar práctica en un día futuro.",
      noPractice: "No hay práctica registrada para este día. Regístrala desde la pestaña Hoy.", minPractised: "min practicados",
      notesPlaceholder: "¿Qué practicaste ese día?", saving: "Guardando...",
      deleteEntry: "Eliminar entrada", confirmDeleteEntry: "¿Eliminar la práctica de este día? Esta acción no se puede deshacer.", couldNotDeleteEntry: "No se pudo eliminar esta entrada.",
    },
    group: {
      yourCrew: "TU GRUPO", youreIn: "Ya estás dentro.", inviteMsg: "Invita a otros bateristas con este código:", copyInvite: "Copiar código de invitación",
      challenges: "DESAFÍOS",
      practiseTogether: "PRACTICA EN GRUPO", yourGroup: "TU GRUPO", findCrew: "Encuentra tu grupo.", startGroup: "Crear un grupo", joinCrew: "Únete a un grupo",
      intro: "Mantente responsable, sube en la clasificación y haz que practicar sea más divertido.", createGroupBtn: "Crear un grupo", joinWithCode: "Unirse con código de invitación",
      groupNamePlaceholder: "Nombre del grupo", inviteCodePlaceholder: "Código de invitación", pleaseWait: "Un momento...", createGroup: "Crear grupo",
      joinGroup: "Unirse al grupo", back: "Atrás", inviteNotFound: "No se encontró ese código de invitación.", couldNotCreate: "No se pudo crear el grupo.",
      leaderboard: "CLASIFICACIÓN", you: "Tú", minutesShort: "min",
      noChallenges: "Aún no hay desafíos. ¡Empieza uno con tu grupo!", newChallenge: "+ Nuevo desafío", cancel: "Cancelar", challengeNamePlaceholder: "Nombre del desafío",
      typeDaily: "Todos los días", typeMinutes: "Minutos totales", typeSessions: "Días practicados", goalLabel: "META", startLabel: "INICIO", endLabel: "FIN",
      rewardPlaceholder: "Recompensa (opcional)", punishmentPlaceholder: "Penalización (opcional)", createChallengeBtn: "Crear desafío",
      joinChallengeBtn: "Unirse al desafío", joined: "Unido", participants: (n: number) => `${n} unidos`,
      dailyGoalDesc: (min: number) => `${min}+ min cada día`, minutesGoalDesc: (total: number) => `Llega a ${total} min en total`,
      sessionsGoalDesc: (days: number) => `Practica ${days} días`, daysProgress: (p: number, t: number) => `${p}/${t} días`,
      minutesProgress: (p: number, t: number) => `${p}/${t} min`, reward: "Recompensa:", punishment: "Penalización:", couldNotCreateChallenge: "No se pudo crear el desafío.",
      presetDaily5: "5 min cada día", presetDaily30x5: "30+ min, 5 días seguidos", presetSessions3weekly: "3 sesiones esta semana", presetDaily5x20: "Reto de 20 días: 5+ min diarios",
      weekdaysMon: ["L", "M", "X", "J", "V", "S", "D"], copied: "¡Copiado!", progress: "PROGRESO", leaveGroup: "Salir del grupo",
      confirmLeave: "¿Salir de este grupo? Puedes volver a unirte más tarde con el código de invitación.", confirmDeleteChallenge: "¿Eliminar este desafío? Esta acción no se puede deshacer.",
      deleteChallenge: "Eliminar", since: (date: string) => `Desde ${date}`, couldNotLeave: "No se pudo salir del grupo.", couldNotDeleteChallenge: "No se pudo eliminar el desafío.",
    },
    progressPage: {
      eyebrow: "TU PROGRESO", title: "PROGRESO", techniques: "TÉCNICAS MÁS PRACTICADAS", equipment: "BATERÍA VS PAD DE PRÁCTICA",
      noData: "Registra algo de práctica para ver tu progreso aquí.",
    },
    practiceMode: {
      trigger: "🎯 Modo práctica", eyebrow: "SIGUE TUS NIVELES", title: "MODO PRÁCTICA",
      currentLevel: "NIVEL ACTUAL", levelsUnlocked: (n: number, total: number) => `${n} de ${total} niveles desbloqueados`,
      notStarted: "Sin empezar", bpmLevels: "NIVELES DE BPM · TOCA PARA PRACTICAR",
      nextUp: "SIGUIENTE", locked: "Bloqueado", tapToStart: "Toca para empezar",
      tierBeginner: "PRINCIPIANTE", tierIntermediate: "INTERMEDIO", tierAdvanced: "AVANZADO", tierLegend: "LEYENDA",
      ratingNotReady: "No listo", ratingTense: "Con tensión", ratingComfortable: "Cómodo", ratingMastered: "Dominado",
      rateTitle: "¿CÓMO TE SENTISTE?", rateSubtitle: (bpm: number) => `Tu sesión a ${bpm} BPM se guardó.`,
      backToBook: "Volver a Modo práctica", couldNotSaveSession: "No se pudo guardar esta sesión.",
    },
    settings: {
      makeItYours: "PERSONALÍZALO", title: "AJUSTES", displayName: "NOMBRE", dailyGoal: "META DIARIA DE PRÁCTICA", minutes: "minutos",
      language: "IDIOMA", reminders: "Recordatorios diarios de práctica", on: "SÍ", off: "NO", save: "Guardar ajustes", saved: "✓ Ajustes guardados", logout: "Cerrar sesión", calendarColor: "COLOR DEL CALENDARIO DE GRUPO",
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
  progress: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 16.5V9.5M10 16.5V3.5M16 16.5v-6" /></svg>,
  settings: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="2.6" /><path d="M10 2.8v2M10 15.2v2M17.2 10h-2M4.8 10h-2M15.1 4.9l-1.4 1.4M6.3 13.7l-1.4 1.4M15.1 15.1l-1.4-1.4M6.3 6.3L4.9 4.9" /></svg>,
};
function formatLocalDate(year: number, monthIndex0based: number, day: number) {
  return `${year}-${String(monthIndex0based + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
const now = new Date();
const dateKey = formatLocalDate(now.getFullYear(), now.getMonth(), now.getDate());

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

const STREAK_MILESTONES = [3, 7, 14, 21, 30, 50, 100, 150, 200, 365, 500, 1000];
function nextStreakMilestone(streak: number) {
  return STREAK_MILESTONES.find((m) => m > streak) ?? null;
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

export default function Home() {
  const [tab, setTab] = useState<Tab>("today");
  const [minutes, setMinutes] = useState("0");
  const [selected, setSelected] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [equipment, setEquipment] = useState<string | null>(null);
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
  const [dailyGoal, setDailyGoal] = useState(30);
  const T = translations[language];
  const [practiceOpen, setPracticeOpen] = useState(false);
  const [practiceStep, setPracticeStep] = useState<"list" | "detail" | "session" | "rate">("list");
  const [practiceExercise, setPracticeExercise] = useState<string | null>(null);
  const [practiceBpm, setPracticeBpm] = useState(100);
  const [pendingSessionMinutes, setPendingSessionMinutes] = useState(0);
  const [practiceSessions, setPracticeSessions] = useState<{ item_en: string; bpm: number; rating: string }[]>([]);

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
    supabase.from("settings").select("language, daily_goal_minutes").eq("user_id", user.id).maybeSingle().then(({ data }) => {
      if (data?.language === "es" || data?.language === "en") setLanguage(data.language);
      if (data?.daily_goal_minutes) setDailyGoal(data.daily_goal_minutes);
    });
    supabase.from("practice_logs").select("practiced_on,minutes,notes,equipment,practice_log_items(practice_items(name_en))").eq("user_id", user.id).then(({ data }) => {
      const nextLogs: Record<string, Log> = {};
      (data ?? []).forEach((row: any) => { nextLogs[row.practiced_on] = { minutes: row.minutes, notes: row.notes ?? "", equipment: row.equipment ?? null, items: (row.practice_log_items ?? []).map((entry: any) => entry.practice_items?.name_en).filter(Boolean) }; });
      setLogs(nextLogs);
      const todayLog = nextLogs[dateKey];
      if (todayLog) { setMinutes(String(todayLog.minutes)); setNotes(todayLog.notes); setEquipment(todayLog.equipment); if (todayLog.items.length) setSelected(todayLog.items); }
    });
    supabase.from("practice_sessions").select("bpm,rating,practice_items(name_en)").eq("user_id", user.id).then(({ data }) => {
      setPracticeSessions((data ?? []).map((row: any) => ({ item_en: row.practice_items?.name_en, bpm: row.bpm, rating: row.rating })).filter((s: any) => s.item_en));
    });
  }, [user]);
  async function saveLogFor(targetDate: string, targetMinutes: number, targetItems: string[], targetNotes: string, targetEquipment: string | null) {
    if (!user) return false;
    const { data: log, error } = await supabase.from("practice_logs").upsert({ user_id: user.id, practiced_on: targetDate, minutes: targetMinutes, notes: targetNotes, equipment: targetEquipment }, { onConflict: "user_id,practiced_on" }).select().single();
    if (error || !log) { setAuthError(error?.message ?? "Could not save your practice."); return false; }
    const { data: itemRows } = await supabase.from("practice_items").select("id,name_en").in("name_en", targetItems);
    await supabase.from("practice_log_items").delete().eq("log_id", log.id);
    if (itemRows?.length) await supabase.from("practice_log_items").insert(itemRows.map((item) => ({ log_id: log.id, item_id: item.id })));
    setLogs((current) => ({ ...current, [targetDate]: { minutes: targetMinutes, items: targetItems, notes: targetNotes, equipment: targetEquipment } }));
    return true;
  }
  async function deleteLogFor(targetDate: string) {
    if (!user) return false;
    const { error, count } = await supabase.from("practice_logs").delete({ count: "exact" }).eq("user_id", user.id).eq("practiced_on", targetDate);
    if (error || !count) { setAuthError(error?.message ?? T.calendar.couldNotDeleteEntry); return false; }
    setLogs((current) => { const next = { ...current }; delete next[targetDate]; return next; });
    return true;
  }
  async function logPracticeSession(itemEn: string, bpm: number, rating: string, durationMinutes: number) {
    if (!user) return false;
    const { data: itemRow } = await supabase.from("practice_items").select("id").eq("name_en", itemEn).maybeSingle();
    const { error } = await supabase.from("practice_sessions").insert({ user_id: user.id, practice_item_id: itemRow?.id ?? null, bpm, rating, duration_minutes: durationMinutes, practiced_on: dateKey });
    if (error) { setAuthError(error.message); return false; }
    const newMinutes = (Number(minutes) || 0) + durationMinutes;
    const newSelected = selected.includes(itemEn) ? selected : [...selected, itemEn];
    setMinutes(String(newMinutes));
    setSelected(newSelected);
    await saveLogFor(dateKey, newMinutes, newSelected, notes, equipment);
    setPracticeSessions((current) => [...current, { item_en: itemEn, bpm, rating }]);
    return true;
  }
  async function save() {
    const ok = await saveLogFor(dateKey, Number(minutes) || 0, selected, notes, equipment);
    if (ok) { setSaved(true); setTimeout(() => setSaved(false), 2200); }
  }
  function toggle(item: string) { setSelected((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item]); }
  function addMetronomeMinutes(added: number) { setMinutes((current) => String((Number(current) || 0) + added)); }
  async function signOut() { await supabase.auth.signOut(); }
  if (loading) return <main className="shell"><div className="auth-shell"><p className="eyebrow">DRUM PROGRESS</p><h1>LOADING<span>.</span></h1></div></main>;
  if (!user) return <Login error={authError} setError={setAuthError} />;
  return <main className="shell">
    {practiceOpen ? <PracticeMode step={practiceStep} setStep={setPracticeStep} exercise={practiceExercise} setExercise={setPracticeExercise} bpm={practiceBpm} setBpm={setPracticeBpm} pendingMinutes={pendingSessionMinutes} setPendingMinutes={setPendingSessionMinutes} sessions={practiceSessions} onLogSession={logPracticeSession} onClose={() => setPracticeOpen(false)} language={language} T={T} /> : <>
      {tab === "today" && <Today minutes={minutes} setMinutes={setMinutes} selected={selected} toggle={toggle} notes={notes} setNotes={setNotes} equipment={equipment} setEquipment={setEquipment} save={save} saved={saved} streak={streak} openMetronome={() => setMetronome(true)} openPracticeMode={() => setPracticeOpen(true)} displayName={displayName} language={language} T={T} logs={logs} dailyGoal={dailyGoal} />}
      {tab === "calendar" && <Calendar logs={logs} streak={streak} longestStreak={longestStreak} daysThisYear={daysThisYear} saveLogFor={saveLogFor} deleteLogFor={deleteLogFor} language={language} T={T} />}
      {tab === "group" && <Group user={user} setError={setAuthError} language={language} T={T} />}
      {tab === "progress" && <Progress logs={logs} language={language} T={T} />}
      {tab === "settings" && <Settings signOut={signOut} user={user} setError={setAuthError} profileName={displayName} onProfileNameSaved={setProfileName} language={language} onLanguageSaved={setLanguage} dailyGoal={dailyGoal} onGoalSaved={setDailyGoal} T={T} />}
    </>}
    {authError && <button className="error-toast" onClick={() => setAuthError("")}>{authError} ×</button>}
    <nav className="bottom-nav">{NAV_TABS.map((id) => <button key={id} className={tab === id && !practiceOpen ? "active" : ""} onClick={() => { setPracticeOpen(false); setTab(id); }}><span>{NAV_ICONS[id]}</span>{T.nav[id]}</button>)}</nav>
    <Metronome open={metronome} close={() => setMetronome(false)} onAddMinutes={addMetronomeMinutes} T={T} />
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
  return <main className="shell"><section className="auth-shell"><h1>Drum Progress App</h1><p>Build your daily drumming habit, one session at a time.</p><div className="auth-card"><h2>{mode === "login" ? "Welcome back" : "Start your streak"}</h2><input type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} /><input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} /><button className="auth-primary" disabled={busy || !email || !password} onClick={submit}>{busy ? "Please wait..." : mode === "login" ? "Log in" : "Create account"}</button><div className="or">OR</div><button className="google" disabled={busy} onClick={google}>G <span>Continue with Google</span></button><button className="auth-switch" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}>{mode === "login" ? "New here? Create an account" : "Already have an account? Log in"}</button></div>{error && <p className="auth-error">{error}</p>}</section></main>;
}

function Today({ minutes, setMinutes, selected, toggle, notes, setNotes, equipment, setEquipment, save, saved, streak, openMetronome, openPracticeMode, displayName, language, T, logs, dailyGoal }: any) {
  const [notesOpen, setNotesOpen] = useState(false);
  const showNotes = notesOpen || !!notes;
  const milestone = nextStreakMilestone(streak);
  const last7Days = useMemo(() => Array.from({ length: 7 }, (_, i) => shiftDateKey(dateKey, i - 6)), []);
  const sortedItems = useMemo(() => {
    const freq: Record<string, number> = {};
    Object.values(logs as Record<string, Log>).forEach((log) => { log.items.forEach((item) => { freq[item] = (freq[item] ?? 0) + 1; }); });
    return [...PRACTICE_ITEMS].sort((a, b) => (freq[b.en] ?? 0) - (freq[a.en] ?? 0));
  }, [logs]);
  const goalPct = Math.min(100, ((Number(minutes) || 0) / Math.max(1, dailyGoal)) * 100);
  const goalAchieved = (Number(minutes) || 0) >= dailyGoal;
  return <section className="page today">
    <header className="hero"><div><h1 className="today-hero-heading">{T.today.heroLine1}<br/>{T.today.heroLine1b}<br/><i>{T.today.heroLine2}</i></h1><p className="date">{formatDate(language)}</p></div><button className="avatar">{displayName.charAt(0).toUpperCase()}</button></header>
    <div className="streak-card"><div className="flame">{streak > 0 ? "🔥" : "🥁"}</div><div><span>{T.today.currentStreak}</span>{streak > 0 ? <strong>{streak} {T.today.days}</strong> : <strong>{T.today.startToday}</strong>}{streak > 0 && milestone && <em className="streak-next">{T.today.daysToMilestone(milestone - streak, milestone)}</em>}</div></div>
    <div className="mini-week"><span className="mini-week-label">{T.today.recentDays}</span><div className="mini-week-dots">{last7Days.map((day: string) => <i key={day} className={logs[day] ? "filled" : ""} />)}</div></div>
    <div className="section-title"><h2>{T.today.todaysPractice}</h2><div className="section-title-actions"><button onClick={openPracticeMode}>{T.practiceMode.trigger}</button><button onClick={openMetronome}>⌁ {T.today.metronome}</button></div></div>
    <div className="form-card"><label className="input-label">{T.today.howLong}</label>
      <div className="minutes-island">
        <button className="minutes-step" onClick={() => setMinutes(String(Math.max(0, (Number(minutes) || 0) - 5)))}>-5</button>
        <button className="minutes-step" onClick={() => setMinutes(String(Math.max(0, (Number(minutes) || 0) - 1)))}>-1</button>
        <div className="minutes-value"><input inputMode="numeric" size={3} value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ""))}/><span>min</span></div>
        <button className="minutes-step" onClick={() => setMinutes(String((Number(minutes) || 0) + 1))}>+1</button>
        <button className="minutes-step" onClick={() => setMinutes(String((Number(minutes) || 0) + 5))}>+5</button>
      </div>
      <div className="goal-progress"><div className="goal-progress-label"><span>{T.today.todayGoal}</span><strong className={goalAchieved ? "achieved" : ""}>{minutes}/{dailyGoal} min</strong></div><div className="goal-progress-track"><div className={goalAchieved ? "goal-progress-bar achieved" : "goal-progress-bar"} style={{ width: `${goalPct}%` }} /></div></div>
    </div>
    <div className="form-card">
      <label className="input-label checklist-label">{T.today.whatPractised}</label><div className="chips">{sortedItems.map((item) => <button key={item.en} onClick={() => toggle(item.en)} className={selected.includes(item.en) ? "chip selected" : "chip"}>{selected.includes(item.en) && <b>✓</b>}{item[language as Lang]}</button>)}</div>
      <label className="input-label equipment-label">{T.today.equipment}</label>
      <div className="equipment-toggle">
        <button className={equipment === "drumset" ? "equipment-option selected" : "equipment-option"} onClick={() => setEquipment(equipment === "drumset" ? null : "drumset")}>{T.today.drumset}</button>
        <button className={equipment === "pad" ? "equipment-option selected" : "equipment-option"} onClick={() => setEquipment(equipment === "pad" ? null : "pad")}>{T.today.pad}</button>
      </div>
      {showNotes ? <><label className="input-label notes-label">{T.today.notes} <em>{T.today.optional}</em></label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={T.today.notesPlaceholder} autoFocus={notesOpen} /></> : <button className="notes-toggle" onClick={() => setNotesOpen(true)}>{T.today.addNotes}</button>}
      <button className={saved ? "save saved" : "save"} onClick={save}>{saved ? T.today.practiceSaved : T.today.savePractice}<span>→</span></button>
    </div>
  </section>;
}

type SaveLogFor = (targetDate: string, targetMinutes: number, targetItems: string[], targetNotes: string, targetEquipment: string | null) => Promise<boolean>;

function Calendar({ logs, streak, longestStreak, daysThisYear, saveLogFor, deleteLogFor, language, T }: { logs: Record<string, Log>; streak: number; longestStreak: number; daysThisYear: number; saveLogFor: SaveLogFor; deleteLogFor: (date: string) => Promise<boolean>; language: Lang; T: any }) {
  const today = new Date(); const [selectedDate, setSelectedDate] = useState(dateKey); const [viewDate, setViewDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1)); const year = viewDate.getFullYear(); const month = viewDate.getMonth(); const days = new Date(year, month + 1, 0).getDate(); const starts = new Date(year, month, 1).getDay(); const selectedLog = logs[selectedDate];
  const locale = language === "es" ? "es-ES" : "en-US";
  function changeMonth(delta: number) { setViewDate(new Date(year, month + delta, 1)); }
  const isFuture = selectedDate > dateKey;
  const isPast = selectedDate < dateKey;
  return <section className="page"><header className="simple-head"><p className="eyebrow">{T.calendar.yourConsistency}</p><h1>{T.calendar.title}</h1></header><div className="stats"><Stat label={T.today.currentStreak} value={String(streak) + " " + T.today.days} /><Stat label={T.calendar.longestStreak} value={String(longestStreak) + " " + T.today.days} /><Stat label={T.calendar.daysThisYear} value={String(daysThisYear) + " / 365"} /></div><div className="calendar-card"><div className="cal-head"><button onClick={() => changeMonth(-1)}>‹</button><h2>{viewDate.toLocaleString(locale, { month: "long", year: "numeric" })}</h2><button onClick={() => changeMonth(1)}>›</button></div><div className="week">{T.calendar.weekdays.map((x: string, i: number)=><span key={i}>{x}</span>)}</div><div className="days">{Array.from({ length: starts }).map((_,i)=><i key={"b" + i}/>)}{Array.from({ length: days }).map((_,i) => { const d=i+1; const key = formatLocalDate(year, month, d); const isToday=d===today.getDate() && month===today.getMonth() && year===today.getFullYear(); const done=!!logs[key]; const className=(isToday ? "is-today " : "") + (selectedDate === key ? "is-selected " : "") + (done ? "done" : ""); return <button key={d} onClick={() => setSelectedDate(key)} className={className}><span>{d}</span>{done && <b>✓</b>}</button> })}</div></div>
    <div className="day-detail"><span>{new Date(selectedDate + "T12:00:00").toLocaleDateString(locale, { weekday: "long", month: "long", day: "numeric" })}</span>
      {isFuture && <p>{T.calendar.futureDay}</p>}
      {isPast && <DayEditor key={selectedDate} date={selectedDate} log={selectedLog} onSave={saveLogFor} onDelete={deleteLogFor} language={language} T={T} />}
      {!isFuture && !isPast && (selectedLog ? <><strong>{selectedLog.minutes} {T.calendar.minPractised}</strong><div className="detail-chips">{selectedLog.items.map((item) => <em key={item}>{practiceItemLabel(item, language)}</em>)}</div>{selectedLog.notes && <p>{selectedLog.notes}</p>}</> : <p>{T.calendar.noPractice}</p>)}
    </div>
  </section>;
}

function DayEditor({ date, log, onSave, onDelete, language, T }: { date: string; log?: Log; onSave: SaveLogFor; onDelete: (date: string) => Promise<boolean>; language: Lang; T: any }) {
  const [minutes, setMinutes] = useState(String(log?.minutes ?? ""));
  const [selected, setSelected] = useState<string[]>(log?.items ?? []);
  const [notes, setNotes] = useState(log?.notes ?? "");
  const [equipment, setEquipment] = useState<string | null>(log?.equipment ?? null);
  const [notesOpen, setNotesOpen] = useState(false);
  const showNotes = notesOpen || !!notes;
  const [hasEntry, setHasEntry] = useState(!!log);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  function toggle(item: string) { setSelected((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item]); }
  async function handleSave() {
    setBusy(true);
    const ok = await onSave(date, Number(minutes) || 0, selected, notes, equipment);
    setBusy(false);
    if (ok) { setSaved(true); setHasEntry(true); setTimeout(() => setSaved(false), 1800); }
  }
  async function handleDelete() {
    if (!window.confirm(T.calendar.confirmDeleteEntry)) return;
    setBusy(true);
    const ok = await onDelete(date);
    setBusy(false);
    if (ok) { setMinutes(""); setSelected([]); setNotes(""); setEquipment(null); setHasEntry(false); }
  }
  return <>
  <div className="form-card">
    <label className="input-label">{T.today.howLong}</label>
    <div className="minutes-island">
      <button className="minutes-step" onClick={() => setMinutes(String(Math.max(0, (Number(minutes) || 0) - 5)))}>-5</button>
      <button className="minutes-step" onClick={() => setMinutes(String(Math.max(0, (Number(minutes) || 0) - 1)))}>-1</button>
      <div className="minutes-value"><input inputMode="numeric" size={3} value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ""))} /><span>min</span></div>
      <button className="minutes-step" onClick={() => setMinutes(String((Number(minutes) || 0) + 1))}>+1</button>
      <button className="minutes-step" onClick={() => setMinutes(String((Number(minutes) || 0) + 5))}>+5</button>
    </div>
    </div>
    <div className="form-card">
    <label className="input-label checklist-label">{T.today.whatPractised}</label>
    <div className="chips">{PRACTICE_ITEMS.map((item) => <button key={item.en} onClick={() => toggle(item.en)} className={selected.includes(item.en) ? "chip selected" : "chip"}>{selected.includes(item.en) && <b>✓</b>}{item[language]}</button>)}</div>
    <label className="input-label equipment-label">{T.today.equipment}</label>
    <div className="equipment-toggle">
      <button className={equipment === "drumset" ? "equipment-option selected" : "equipment-option"} onClick={() => setEquipment(equipment === "drumset" ? null : "drumset")}>{T.today.drumset}</button>
      <button className={equipment === "pad" ? "equipment-option selected" : "equipment-option"} onClick={() => setEquipment(equipment === "pad" ? null : "pad")}>{T.today.pad}</button>
    </div>
    {showNotes ? <><label className="input-label notes-label">{T.today.notes} <em>{T.today.optional}</em></label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={T.calendar.notesPlaceholder} autoFocus={notesOpen} /></> : <button className="notes-toggle" onClick={() => setNotesOpen(true)}>{T.today.addNotes}</button>}
    <button className={saved ? "save saved" : "save"} onClick={handleSave} disabled={busy}>{saved ? T.today.practiceSaved : busy ? T.calendar.saving : T.today.savePractice}<span>→</span></button>
    {hasEntry && <button className="delete-entry" onClick={handleDelete} disabled={busy}>{T.calendar.deleteEntry}</button>}
  </div>
  </>;
}
function Stat({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><strong>{value}</strong></div>; }

function Group({ user, setError, language, T }: { user: any; setError: (message: string) => void; language: Lang; T: any }) {
  const [mode, setMode] = useState<"start" | "create" | "join">("start"); const [name, setName] = useState(""); const [code, setCode] = useState(""); const [group, setGroup] = useState<any>(null); const [busy, setBusy] = useState(false);
  const [groupLoading, setGroupLoading] = useState(true);
  const [members, setMembers] = useState<{ id: string; name: string; color: string }[]>([]);
  const [totals, setTotals] = useState<{ id: string; name: string; total: number }[]>([]);
  const [viewDate, setViewDate] = useState(() => new Date());
  const [monthLogs, setMonthLogs] = useState<Record<string, string[]>>({});
  const [copied, setCopied] = useState(false);
  const [challenges, setChallenges] = useState<any[]>([]);
  const [showNewChallenge, setShowNewChallenge] = useState(false);
  const [challengeName, setChallengeName] = useState("");
  const [challengeType, setChallengeType] = useState<"daily" | "minutes" | "sessions">("sessions");
  const [challengeGoal, setChallengeGoal] = useState("10");
  const [challengeStart, setChallengeStart] = useState(dateKey);
  const [challengeEnd, setChallengeEnd] = useState(dateKey);
  const [challengeReward, setChallengeReward] = useState("");
  const [challengePunishment, setChallengePunishment] = useState("");
  const [challengeBusy, setChallengeBusy] = useState(false);
  const locale = language === "es" ? "es-ES" : "en-US";
  const presetOptions = [
    { ...CHALLENGE_PRESETS[0], label: T.group.presetDaily5 },
    { ...CHALLENGE_PRESETS[1], label: T.group.presetDaily30x5 },
    { ...CHALLENGE_PRESETS[2], label: T.group.presetSessions3weekly },
    { ...CHALLENGE_PRESETS[3], label: T.group.presetDaily5x20 },
  ];
  useEffect(() => { supabase.from("group_members").select("groups(id,name,invite_code,created_at)").eq("user_id", user.id).order("joined_at", { ascending: true }).limit(1).maybeSingle().then(({ data }) => { if (data) setGroup((data as any).groups); setGroupLoading(false); }); }, [user]);
  useEffect(() => {
    if (!group) { setMembers([]); setTotals([]); setChallenges([]); return; }
    supabase.from("group_members").select("user_id, profiles(name, color)").eq("group_id", group.id).order("user_id").then(({ data }) => {
      const memberList = (data ?? []).map((row: any, idx: number) => ({ id: row.user_id, name: row.profiles?.name ?? "Drummer", color: row.profiles?.color ?? MEMBER_COLORS[idx % MEMBER_COLORS.length] }));
      setMembers(memberList);
      const memberIds = memberList.map((m) => m.id);
      if (!memberIds.length) return;
      const since = String(group.created_at).slice(0, 10);
      supabase.from("practice_logs").select("user_id, minutes").in("user_id", memberIds).gte("practiced_on", since).then(({ data: logRows }) => {
        const sums: Record<string, number> = {};
        (logRows ?? []).forEach((row: any) => { sums[row.user_id] = (sums[row.user_id] ?? 0) + row.minutes; });
        setTotals(memberList.map((m) => ({ ...m, total: sums[m.id] ?? 0 })).sort((a, b) => b.total - a.total));
      });
    });
  }, [group]);
  useEffect(() => { loadChallenges(); }, [group, members]);
  useEffect(() => {
    if (!group || !members.length) { setMonthLogs({}); return; }
    const year = viewDate.getFullYear(); const month = viewDate.getMonth();
    const monthStart = formatLocalDate(year, month, 1);
    const monthEnd = formatLocalDate(year, month, new Date(year, month + 1, 0).getDate());
    const memberIds = members.map((m) => m.id);
    supabase.from("practice_logs").select("practiced_on, user_id").in("user_id", memberIds).gte("practiced_on", monthStart).lte("practiced_on", monthEnd).then(({ data }) => {
      const byDay: Record<string, string[]> = {};
      (data ?? []).forEach((row: any) => { byDay[row.practiced_on] = [...(byDay[row.practiced_on] ?? []), row.user_id]; });
      setMonthLogs(byDay);
    });
  }, [group, members, viewDate]);
  function computeChallengeProgress(goalType: string, goalValue: number, startDate: string, endDate: string, userLogs: Record<string, number>) {
    const end = endDate < dateKey ? endDate : dateKey;
    let progress = 0; let target = goalValue;
    if (goalType === "minutes") {
      for (let cursor = startDate; cursor <= end; cursor = shiftDateKey(cursor, 1)) progress += userLogs[cursor] ?? 0;
    } else if (goalType === "sessions") {
      for (let cursor = startDate; cursor <= end; cursor = shiftDateKey(cursor, 1)) if ((userLogs[cursor] ?? 0) > 0) progress += 1;
    } else {
      let broken = false;
      for (let cursor = startDate; cursor <= end; cursor = shiftDateKey(cursor, 1)) { if (!broken && (userLogs[cursor] ?? 0) >= goalValue) progress += 1; else broken = true; }
      target = Math.round((new Date(endDate + "T12:00:00").getTime() - new Date(startDate + "T12:00:00").getTime()) / 86400000) + 1;
    }
    return { progress, target };
  }
  async function loadChallenges() {
    if (!group || !members.length) return;
    const { data: rows } = await supabase.from("challenges").select("id,name,created_by,goal_type,goal_value,start_date,end_date,reward,punishment").eq("group_id", group.id).order("start_date", { ascending: false });
    const list = rows ?? [];
    if (!list.length) { setChallenges([]); return; }
    const ids = list.map((c: any) => c.id);
    const { data: memberRows } = await supabase.from("challenge_members").select("challenge_id,user_id").in("challenge_id", ids);
    const earliestStart = list.reduce((min: string, c: any) => (c.start_date < min ? c.start_date : min), list[0].start_date);
    const memberIds = members.map((m) => m.id);
    const { data: logRows } = await supabase.from("practice_logs").select("practiced_on,minutes,user_id").in("user_id", memberIds).gte("practiced_on", earliestStart);
    const logsByUser: Record<string, Record<string, number>> = {};
    (logRows ?? []).forEach((row: any) => { logsByUser[row.user_id] = { ...(logsByUser[row.user_id] ?? {}), [row.practiced_on]: row.minutes }; });
    const enriched = list.map((c: any) => {
      const participants = (memberRows ?? []).filter((m: any) => m.challenge_id === c.id);
      const joined = participants.some((m: any) => m.user_id === user.id);
      const ranking = participants.map((p: any) => {
        const member = members.find((m) => m.id === p.user_id);
        const { progress, target } = computeChallengeProgress(c.goal_type, c.goal_value, c.start_date, c.end_date, logsByUser[p.user_id] ?? {});
        return { id: p.user_id, name: p.user_id === user.id ? T.group.you : (member?.name ?? "Drummer"), progress, target };
      }).sort((a, b) => b.progress - a.progress);
      const mine = ranking.find((r) => r.id === user.id);
      return { ...c, joined, participantCount: participants.length, progress: mine?.progress ?? 0, target: mine?.target ?? c.goal_value, ranking };
    });
    setChallenges(enriched);
  }
  function applyPreset(preset: { key: string; type: "daily" | "minutes" | "sessions"; goal: number; days: number; label: string }) {
    setChallengeType(preset.type);
    setChallengeGoal(String(preset.goal));
    setChallengeStart(dateKey);
    setChallengeEnd(shiftDateKey(dateKey, preset.days - 1));
    setChallengeName(preset.label);
  }
  async function joinChallenge(challengeId: string) {
    const { error } = await supabase.from("challenge_members").upsert({ challenge_id: challengeId, user_id: user.id }, { onConflict: "challenge_id,user_id", ignoreDuplicates: true });
    if (error) setError(error.message); else loadChallenges();
  }
  async function deleteChallenge(challengeId: string) {
    if (!window.confirm(T.group.confirmDeleteChallenge)) return;
    const { error, count } = await supabase.from("challenges").delete({ count: "exact" }).eq("id", challengeId);
    if (error) setError(error.message);
    else if (!count) setError(T.group.couldNotDeleteChallenge);
    else loadChallenges();
  }
  async function createChallenge() {
    setChallengeBusy(true);
    const { data, error } = await supabase.from("challenges").insert({ group_id: group.id, created_by: user.id, name: challengeName, goal_type: challengeType, goal_value: Number(challengeGoal) || 1, start_date: challengeStart, end_date: challengeEnd, reward: challengeReward || null, punishment: challengePunishment || null }).select().single();
    if (error || !data) { setError(error?.message ?? T.group.couldNotCreateChallenge); setChallengeBusy(false); return; }
    await supabase.from("challenge_members").insert({ challenge_id: data.id, user_id: user.id });
    setChallengeName(""); setChallengeGoal("10"); setChallengeReward(""); setChallengePunishment(""); setShowNewChallenge(false); setChallengeBusy(false);
    loadChallenges();
  }
  async function createGroup() { setBusy(true); const invite = Math.random().toString(36).slice(2,8).toUpperCase(); const { data, error } = await supabase.from("groups").insert({ name, invite_code: invite, created_by: user.id }).select().single(); if (!error && data) { const member = await supabase.from("group_members").insert({ group_id: data.id, user_id: user.id, role: "owner" }); if (!member.error) setGroup(data); else setError(member.error.message); } else setError(error?.message ?? T.group.couldNotCreate); setBusy(false); }
  async function joinGroup() { setBusy(true); const { data, error } = await supabase.from("groups").select("id,name,invite_code,created_at").eq("invite_code", code.trim().toUpperCase()).maybeSingle(); if (error || !data) { setError(T.group.inviteNotFound); setBusy(false); return; } const member = await supabase.from("group_members").insert({ group_id: data.id, user_id: user.id }); if (member.error && member.error.code !== "23505") setError(member.error.message); else setGroup(data); setBusy(false); }
  function copyInvite() { navigator.clipboard.writeText(group.invite_code); setCopied(true); setTimeout(() => setCopied(false), 1500); }
  async function leaveGroup() {
    if (!window.confirm(T.group.confirmLeave)) return;
    const { error, count } = await supabase.from("group_members").delete({ count: "exact" }).eq("group_id", group.id).eq("user_id", user.id);
    if (error) setError(error.message);
    else if (!count) setError(T.group.couldNotLeave);
    else { setGroup(null); setMode("start"); }
  }
  if (groupLoading) return <section className="page" />;
  if (group) {
    const maxTotal = Math.max(1, ...totals.map((m) => m.total));
    const year = viewDate.getFullYear(); const month = viewDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOffset = (new Date(year, month, 1).getDay() + 6) % 7;
    const sinceLabel = T.group.since(new Date(group.created_at).toLocaleDateString(locale, { month: "short", day: "numeric" }));
    return <section className="page">
      <header className="simple-head group-head">
        <div><p className="eyebrow">{T.group.yourCrew}</p><h1>{group.name}</h1></div>
        <button className="invite-chip" onClick={copyInvite}>{copied ? T.group.copied : group.invite_code}</button>
      </header>
      <div className="group-progress"><span className="section-label">{T.group.progress}</span><div className="calendar-card">
        <div className="cal-head"><button onClick={() => setViewDate(new Date(year, month - 1, 1))}>‹</button><h2>{viewDate.toLocaleString(locale, { month: "long", year: "numeric" })}</h2><button onClick={() => setViewDate(new Date(year, month + 1, 1))}>›</button></div>
        <div className="week">{T.group.weekdaysMon.map((x: string, i: number) => <span key={i}>{x}</span>)}</div>
        <div className="days">
          {Array.from({ length: firstDayOffset }).map((_, i) => <i key={"b" + i} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const d = i + 1; const key = formatLocalDate(year, month, d); const dayMembers = monthLogs[key] ?? [];
            const className = (key === dateKey ? "is-today " : "") + (dayMembers.length > 0 ? "done" : "");
            return <button key={d} className={className}><span>{d}</span>{dayMembers.length > 0 && <div className="day-dots">{members.map((m) => dayMembers.includes(m.id) && <i key={m.id} style={{ background: m.color }} />)}</div>}</button>;
          })}
        </div>
        <div className="calendar-legend">{members.map((m) => <span key={m.id}><i style={{ background: m.color }} />{m.id === user.id ? T.group.you : m.name}</span>)}</div>
      </div></div>
      <div className="leaderboard"><span className="section-label">{T.group.leaderboard}</span><span className="section-sublabel">{sinceLabel}</span>
        {totals.map((member, idx) => <div key={member.id} className="leaderboard-row"><span className="leaderboard-name">{(idx === 0 ? "🥇 " : idx === 1 ? "🥈 " : idx === 2 ? "🥉 " : "")}{member.id === user.id ? T.group.you : member.name}</span><div className="leaderboard-bar-track"><div className="leaderboard-bar" style={{ width: `${(member.total / maxTotal) * 100}%` }} /></div><span className="leaderboard-value">{member.total} {T.group.minutesShort}</span></div>)}
      </div>
      <div className="challenges-section">
        <div className="section-head"><span className="section-label">{T.group.challenges}</span><button onClick={() => setShowNewChallenge(!showNewChallenge)}>{showNewChallenge ? T.group.cancel : T.group.newChallenge}</button></div>
        {showNewChallenge && <div className="challenge-form">
          <div className="preset-row">{presetOptions.map((p) => <button key={p.key} className="chip" onClick={() => applyPreset(p)}>{p.label}</button>)}</div>
          <input className="group-input" value={challengeName} onChange={e => setChallengeName(e.target.value)} placeholder={T.group.challengeNamePlaceholder} />
          <div className="challenge-type-row">
            <button className={challengeType === "sessions" ? "chip selected" : "chip"} onClick={() => setChallengeType("sessions")}>{T.group.typeSessions}</button>
            <button className={challengeType === "daily" ? "chip selected" : "chip"} onClick={() => setChallengeType("daily")}>{T.group.typeDaily}</button>
            <button className={challengeType === "minutes" ? "chip selected" : "chip"} onClick={() => setChallengeType("minutes")}>{T.group.typeMinutes}</button>
          </div>
          <label className="input-label">{T.group.goalLabel}</label>
          <input className="group-input" inputMode="numeric" value={challengeGoal} onChange={e => setChallengeGoal(e.target.value.replace(/\D/g, ""))} />
          <div className="challenge-date-row">
            <div><label className="input-label">{T.group.startLabel}</label><input type="date" className="group-input" value={challengeStart} onChange={e => setChallengeStart(e.target.value)} /></div>
            <div><label className="input-label">{T.group.endLabel}</label><input type="date" className="group-input" value={challengeEnd} min={challengeStart} onChange={e => setChallengeEnd(e.target.value)} /></div>
          </div>
          <input className="group-input" value={challengeReward} onChange={e => setChallengeReward(e.target.value)} placeholder={T.group.rewardPlaceholder} />
          <input className="group-input" value={challengePunishment} onChange={e => setChallengePunishment(e.target.value)} placeholder={T.group.punishmentPlaceholder} />
          <button className="primary" disabled={challengeBusy || !challengeName || challengeEnd < challengeStart} onClick={createChallenge}>{challengeBusy ? T.group.pleaseWait : T.group.createChallengeBtn}</button>
        </div>}
        {!challenges.length && !showNewChallenge && <p className="hint">{T.group.noChallenges}</p>}
        {challenges.map((c) => {
          const desc = c.goal_type === "daily" ? T.group.dailyGoalDesc(c.goal_value) : c.goal_type === "minutes" ? T.group.minutesGoalDesc(c.goal_value) : T.group.sessionsGoalDesc(c.goal_value);
          const progressLabel = c.goal_type === "minutes" ? T.group.minutesProgress(c.progress, c.target) : T.group.daysProgress(c.progress, c.target);
          const pct = Math.min(100, (c.progress / Math.max(1, c.target)) * 100);
          return <div key={c.id} className="challenge-card">
            <div className="challenge-head"><h3>{c.name}</h3><span>{T.group.participants(c.participantCount)}</span></div>
            <p className="challenge-desc">{desc}</p>
            <div className="challenge-range">{new Date(c.start_date + "T12:00:00").toLocaleDateString(locale, { month: "short", day: "numeric" })} – {new Date(c.end_date + "T12:00:00").toLocaleDateString(locale, { month: "short", day: "numeric" })}</div>
            <div className="leaderboard-bar-track"><div className="leaderboard-bar" style={{ width: `${pct}%` }} /></div>
            <div className="challenge-progress-label">{progressLabel}</div>
            {c.ranking.length > 1 && <div className="challenge-ranking">{c.ranking.map((r: any, idx: number) => <div key={r.id} className="challenge-rank-row"><span className="rank-medal">{idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}.`}</span><span className="rank-name">{r.name}</span><span className="rank-value">{c.goal_type === "minutes" ? T.group.minutesProgress(r.progress, r.target) : T.group.daysProgress(r.progress, r.target)}</span></div>)}</div>}
            {(c.reward || c.punishment) && <div className="challenge-stakes">{c.reward && <p><b>{T.group.reward}</b> {c.reward}</p>}{c.punishment && <p><b>{T.group.punishment}</b> {c.punishment}</p>}</div>}
            <div className="challenge-actions">
              {!c.joined && <button className="secondary" onClick={() => joinChallenge(c.id)}>{T.group.joinChallengeBtn}</button>}
              {c.joined && <span className="challenge-joined">✓ {T.group.joined}</span>}
              {c.created_by === user.id && <button className="challenge-delete" onClick={() => deleteChallenge(c.id)}>{T.group.deleteChallenge}</button>}
            </div>
          </div>;
        })}
      </div>
      <button className="logout" onClick={leaveGroup}>{T.group.leaveGroup}</button>
    </section>;
  }
  return <section className="page"><header className="simple-head"><p className="eyebrow">{T.group.practiseTogether}</p><h1>{T.group.yourGroup}</h1></header><div className="group-card"><div className="group-icon">✦</div><h2>{mode === "start" ? T.group.findCrew : mode === "create" ? T.group.startGroup : T.group.joinCrew}</h2>{mode === "start" ? <><p>{T.group.intro}</p><button className="primary" onClick={() => setMode("create")}>{T.group.createGroupBtn} <span>→</span></button><button className="secondary" onClick={() => setMode("join")}>{T.group.joinWithCode}</button></> : <><input className="group-input" value={mode === "create" ? name : code} onChange={e => mode === "create" ? setName(e.target.value) : setCode(e.target.value)} placeholder={mode === "create" ? T.group.groupNamePlaceholder : T.group.inviteCodePlaceholder}/><button className="primary" disabled={busy || !(mode === "create" ? name : code)} onClick={mode === "create" ? createGroup : joinGroup}>{busy ? T.group.pleaseWait : mode === "create" ? T.group.createGroup : T.group.joinGroup}</button><button className="secondary" onClick={() => setMode("start")}>{T.group.back}</button></>}</div></section>;
}
function Progress({ logs, language, T }: { logs: Record<string, Log>; language: Lang; T: any }) {
  const techniqueCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    Object.values(logs).forEach((log) => { log.items.forEach((item) => { counts[item] = (counts[item] ?? 0) + 1; }); });
    return PRACTICE_ITEMS.map((item) => ({ ...item, count: counts[item.en] ?? 0 })).sort((a, b) => b.count - a.count);
  }, [logs]);
  const maxCount = Math.max(1, ...techniqueCounts.map((t) => t.count));
  const equipmentTotals = useMemo(() => {
    let drumset = 0; let pad = 0;
    Object.values(logs).forEach((log) => { if (log.equipment === "drumset") drumset += log.minutes; else if (log.equipment === "pad") pad += log.minutes; });
    return { drumset, pad };
  }, [logs]);
  const maxEquip = Math.max(1, equipmentTotals.drumset, equipmentTotals.pad);
  const hasData = Object.keys(logs).length > 0;
  return <section className="page"><header className="simple-head"><p className="eyebrow">{T.progressPage.eyebrow}</p><h1>{T.progressPage.title}</h1></header>
    {!hasData ? <p className="hint">{T.progressPage.noData}</p> : <>
      <div className="progress-section"><span className="section-label">{T.progressPage.techniques}</span>
        <div className="technique-chart">{techniqueCounts.map((t) => <div key={t.en} className="technique-row"><span className="technique-name">{t[language]}</span><div className="leaderboard-bar-track"><div className="leaderboard-bar" style={{ width: `${(t.count / maxCount) * 100}%` }} /></div><span className="technique-count">{t.count}</span></div>)}</div>
      </div>
      <div className="progress-section"><span className="section-label">{T.progressPage.equipment}</span>
        <div className="technique-chart">
          <div className="technique-row"><span className="technique-name">{T.today.drumset}</span><div className="leaderboard-bar-track"><div className="leaderboard-bar" style={{ width: `${(equipmentTotals.drumset / maxEquip) * 100}%` }} /></div><span className="technique-count">{equipmentTotals.drumset} min</span></div>
          <div className="technique-row"><span className="technique-name">{T.today.pad}</span><div className="leaderboard-bar-track"><div className="leaderboard-bar" style={{ width: `${(equipmentTotals.pad / maxEquip) * 100}%` }} /></div><span className="technique-count">{equipmentTotals.pad} min</span></div>
        </div>
      </div>
    </>}
  </section>;
}
function PracticeMode({ step, setStep, exercise, setExercise, bpm, setBpm, pendingMinutes, setPendingMinutes, sessions, onLogSession, language, T }: any) {
  function bestRatingAt(itemEn: string, targetBpm: number) {
    let best: string | null = null;
    sessions.forEach((s: any) => { if (s.item_en === itemEn && s.bpm === targetBpm && (!best || RATING_RANK[s.rating] > RATING_RANK[best!])) best = s.rating; });
    return best;
  }
  function exerciseStats(itemEn: string) {
    const attempted = BPM_LEVELS.filter((level) => bestRatingAt(itemEn, level));
    const bestBpm = attempted.length ? Math.max(...attempted) : null;
    const bestRating = bestBpm ? bestRatingAt(itemEn, bestBpm) : null;
    return { unlocked: attempted.length, bestBpm, bestRating };
  }
  function tierProgress(itemEn: string, tier: { min: number; max: number }) {
    const levels = BPM_LEVELS.filter((l) => l >= tier.min && l <= tier.max);
    const done = levels.filter((l) => { const r = bestRatingAt(itemEn, l); return r === "comfortable" || r === "mastered"; });
    return levels.length ? (done.length / levels.length) * 100 : 0;
  }
  const RATING_LABEL: Record<string, string> = { not_ready: T.practiceMode.ratingNotReady, tense: T.practiceMode.ratingTense, comfortable: T.practiceMode.ratingComfortable, mastered: T.practiceMode.ratingMastered };
  const TIER_LABEL: Record<string, string> = { beginner: T.practiceMode.tierBeginner, intermediate: T.practiceMode.tierIntermediate, advanced: T.practiceMode.tierAdvanced, legend: T.practiceMode.tierLegend };
  function openExercise(itemEn: string) { setExercise(itemEn); setStep("detail"); }
  function startSession(targetBpm: number) { setBpm(targetBpm); setStep("session"); }
  function handleSessionEnd(sessionMinutes: number) { setPendingMinutes(sessionMinutes); setStep("rate"); }
  async function rate(rating: string) {
    if (!exercise) return;
    await onLogSession(exercise, bpm, rating, pendingMinutes);
    setStep("detail");
  }

  if (step === "list") {
    return <section className="page">
      <header className="simple-head"><p className="eyebrow">{T.practiceMode.eyebrow}</p><h1>{T.practiceMode.title}</h1></header>
      <div className="book-list">
        {PRACTICE_ITEMS.map((item) => {
          const stats = exerciseStats(item.en);
          return <button key={item.en} className="ex-row" onClick={() => openExercise(item.en)}>
            <div className="info">
              <p className="name">{item[language as Lang]}</p>
              {stats.unlocked > 0 ? <div className="meta">
                <span className="best-dot" style={{ background: RATING_COLOR[stats.bestRating ?? ""] }} />
                <span>{stats.bestBpm} BPM</span>
                <div className="track"><i style={{ width: `${(stats.unlocked / BPM_LEVELS.length) * 100}%` }} /></div>
                <span className="frac">{stats.unlocked}/{BPM_LEVELS.length}</span>
              </div> : <div className="meta"><span>{T.practiceMode.notStarted}</span></div>}
            </div>
            <span className="chev">›</span>
          </button>;
        })}
      </div>
    </section>;
  }

  if (step === "detail" && exercise) {
    const stats = exerciseStats(exercise);
    const label = PRACTICE_ITEMS.find((i) => i.en === exercise)?.[language as Lang] ?? exercise;
    return <section className="page">
      <div className="back-row"><button onClick={() => setStep("list")}>‹</button><div className="title-block"><p className="eyebrow">{T.practiceMode.title}</p><h2>{label}</h2></div></div>
      <div className="level-card">
        <div className="badge">{stats.bestRating ? RATING_ICON[stats.bestRating] : "🥁"}</div>
        <div>
          <p className="lc-label">{T.practiceMode.currentLevel}</p>
          <p className="lc-value">{stats.bestBpm ? `${stats.bestBpm} BPM` : "—"}</p>
          <p className="lc-sub">{T.practiceMode.levelsUnlocked(stats.unlocked, BPM_LEVELS.length)}</p>
        </div>
      </div>
      <div className="tier-strip">
        {PRACTICE_TIERS.map((tier) => <div key={tier.key} className="tier-seg"><div className="seg-bar"><i style={{ width: `${tierProgress(exercise, tier)}%` }} /></div><span className="seg-label">{TIER_LABEL[tier.key]}</span></div>)}
      </div>
      <span className="ladder-label">{T.practiceMode.bpmLevels}</span>
      <div className="ladder">
        {BPM_LEVELS.map((level, idx) => {
          const rating = bestRatingAt(exercise, level);
          const isNext = !rating && !BPM_LEVELS.slice(0, idx).some((l) => !bestRatingAt(exercise, l));
          const className = rating ?? (isNext ? "current" : "locked");
          return <button key={level} className={`rung ${className}`} onClick={() => startSession(level)}>
            <span className="bpm">{level}</span>
            <span className="rung-label">{rating ? RATING_LABEL[rating] : isNext ? T.practiceMode.tapToStart : T.practiceMode.locked}</span>
            <span className="status">{rating ? RATING_ICON[rating] : isNext ? "▶" : ""}</span>
          </button>;
        })}
      </div>
      <div className="legend">
        {RATING_ORDER.map((r) => <span key={r}><i style={{ background: RATING_COLOR[r] }} />{RATING_LABEL[r]}</span>)}
      </div>
    </section>;
  }

  if (step === "session" && exercise) {
    const label = PRACTICE_ITEMS.find((i) => i.en === exercise)?.[language as Lang] ?? exercise;
    return <section className="page">
      <div className="back-row"><button onClick={() => setStep("detail")}>‹</button><div className="title-block"><p className="eyebrow">{T.practiceMode.title}</p><h2>{label} · {bpm} BPM</h2></div></div>
      <Metronome open={true} initialBpm={bpm} onSessionEnd={handleSessionEnd} close={() => setStep("detail")} T={T} />
    </section>;
  }

  if (step === "rate" && exercise) {
    const label = PRACTICE_ITEMS.find((i) => i.en === exercise)?.[language as Lang] ?? exercise;
    return <section className="page">
      <header className="simple-head"><p className="eyebrow">{label} · {bpm} BPM</p><h1>{T.practiceMode.rateTitle}</h1><p className="rate-sub">{T.practiceMode.rateSubtitle(pendingMinutes)}</p></header>
      <div className="rating-grid">
        {RATING_ORDER.map((r) => <button key={r} className={`rating-btn ${r}`} onClick={() => rate(r)}><span className="rating-icon">{RATING_ICON[r]}</span>{RATING_LABEL[r]}</button>)}
      </div>
    </section>;
  }
  return null;
}
function Settings({ signOut, user, setError, profileName, onProfileNameSaved, language: currentLanguage, onLanguageSaved, dailyGoal, onGoalSaved, T }: { signOut: () => void; user: any; setError: (message: string) => void; profileName: string; onProfileNameSaved: (name: string) => void; language: Lang; onLanguageSaved: (language: Lang) => void; dailyGoal: number; onGoalSaved: (goal: number) => void; T: any }) {
  const [name, setName] = useState(profileName); const [goal, setGoal] = useState(String(dailyGoal)); const [language, setLanguage] = useState<Lang>(currentLanguage); const [reminders, setReminders] = useState(false); const [color, setColor] = useState(MEMBER_COLORS[0]); const [saved, setSaved] = useState(false);
  useEffect(() => { supabase.from("settings").select("daily_goal_minutes,language,reminder_enabled").eq("user_id", user.id).maybeSingle().then(({ data }) => { if (data) { const row: any = data; setGoal(String(row.daily_goal_minutes)); setLanguage(row.language); setReminders(row.reminder_enabled); } }); supabase.from("profiles").select("color").eq("id", user.id).maybeSingle().then(({ data }) => { if (data?.color) setColor(data.color); }); }, [user]);
  async function saveSettings() { const profile = await supabase.from("profiles").upsert({ id: user.id, name, color }, { onConflict: "id" }); const goalValue = Number(goal) || 30; const settings = await supabase.from("settings").upsert({ user_id: user.id, daily_goal_minutes: goalValue, language, reminder_enabled: reminders }, { onConflict: "user_id" }); if (profile.error || settings.error) setError(profile.error?.message ?? settings.error?.message ?? "Could not save settings."); else { onProfileNameSaved(name); onLanguageSaved(language); onGoalSaved(goalValue); setSaved(true); setTimeout(() => setSaved(false), 1800); } }
  return <section className="page"><header className="simple-head"><p className="eyebrow">{T.settings.makeItYours}</p><h1>{T.settings.title}</h1></header><div className="settings-form"><label>{T.settings.displayName}<input value={name} onChange={e => setName(e.target.value)} /></label><label>{T.settings.dailyGoal}<input inputMode="numeric" value={goal} onChange={e => setGoal(e.target.value.replace(/\D/g, ""))} /><small>{T.settings.minutes}</small></label><label>{T.settings.language}<select value={language} onChange={e => setLanguage(e.target.value as Lang)}><option value="en">English</option><option value="es">Español</option></select></label><label>{T.settings.calendarColor}<div className="color-swatches">{MEMBER_COLORS.map((c) => <button key={c} type="button" className={color === c ? "swatch selected" : "swatch"} style={{ background: c }} onClick={() => setColor(c)} />)}</div></label><button className="toggle-row" onClick={() => setReminders(!reminders)}><span>{T.settings.reminders}</span><b className={reminders ? "on" : ""}>{reminders ? T.settings.on : T.settings.off}</b></button><button className={saved ? "save saved" : "save"} onClick={saveSettings}>{saved ? T.settings.saved : T.settings.save}</button></div><button className="logout" onClick={signOut}>{T.settings.logout}</button></section>;
}
function Setting({icon,label,value}:{icon:string;label:string;value:string}) { return <button className="setting"><span className="setting-icon">{icon}</span><span>{label}</span><em>{value} ›</em></button>; }

const SIGNATURE_BEATS: Record<string, number> = { "4/4": 4, "3/4": 3, "6/8": 6 };

function Metronome({ open, close, onAddMinutes, onSessionEnd, initialBpm, T }: { open: boolean; close: () => void; onAddMinutes?: (minutes: number) => void; onSessionEnd?: (minutes: number) => void; initialBpm?: number; T: any }) {
  const [bpm, setBpm] = useState(initialBpm ?? 100);
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
    if (elapsed > 0) { if (onSessionEnd) onSessionEnd(loggedMinutes); else setShowAddPrompt(true); }
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
  function addTime() { onAddMinutes?.(loggedMinutes); setShowAddPrompt(false); setElapsed(0); }
  function discardTime() { setShowAddPrompt(false); setElapsed(0); }
  if (!open) return null;
  return <div className="modal"><div className="metro"><button className="close" onClick={close}>×</button><p className="eyebrow">{T.metronome.practiceTool}</p><h2>{T.metronome.title}</h2><div className={playing ? "pulse playing" : "pulse"} style={{ animationDuration: `${60 / bpm}s` }}><span>{bpm}</span><small>BPM</small></div><div className="metronome-timer">{playing ? T.metronome.practiceTimer : T.metronome.sessionTime}<strong>{elapsedLabel}</strong></div><input className="range" type="range" min="40" max="240" value={bpm} onChange={e => setBpm(+e.target.value)}/><div className="tempo-actions"><button onClick={() => setBpm(Math.max(40, bpm - 1))}>−</button><button className="tap" onClick={tapTempo}>{T.metronome.tapTempo}</button><button onClick={() => setBpm(Math.min(240, bpm + 1))}>+</button></div><div className="signatures">{["4/4", "3/4", "6/8"].map(s => <button key={s} onClick={() => setSignature(s)} className={s === signature ? "selected" : ""}>{s}</button>)}</div><button className={playing ? "stop" : "start"} onClick={togglePlaying}>{playing ? T.metronome.stop : T.metronome.start}</button>{showAddPrompt && <div className="add-time"><span>{T.metronome.sessionComplete}</span><h3>{T.metronome.addTimeQuestion(loggedMinutes)}</h3><p>{T.metronome.sessionLasted(elapsedLabel)}</p><div><button className="discard" onClick={discardTime}>{T.metronome.notNow}</button><button className="add" onClick={addTime}>{T.metronome.addTime}</button></div></div>}</div></div>; }