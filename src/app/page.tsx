"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type Tab = "today" | "practice" | "group" | "progress" | "settings";
type Log = { minutes: number; seconds: number; items: string[]; customItems: string[]; notes: string; equipment: string | null; drumsetMinutes: number | null; padMinutes: number | null };
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
function formatMinutes(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}min`;
}
function toggleEquipmentValue(current: string | null, value: "drumset" | "pad") {
  if (current === value) return null;
  if (current === "both") return value === "drumset" ? "pad" : "drumset";
  if (current === null) return value;
  return "both";
}
function equipmentLabel(equipment: string | null, T: any) {
  if (equipment === "drumset") return T.today.drumset;
  if (equipment === "pad") return T.today.pad;
  if (equipment === "both") return T.today.equipmentBoth;
  return null;
}
function equipmentSplitLabel(drumsetMinutes: number | null | undefined, padMinutes: number | null | undefined, T: any) {
  const parts: string[] = [];
  if (drumsetMinutes) parts.push(T.today.minOn(drumsetMinutes, T.today.drumset));
  if (padMinutes) parts.push(T.today.minOn(padMinutes, T.today.pad));
  return parts.length ? parts.join(" - ") : null;
}

const NAV_TABS: Tab[] = ["today", "practice", "group", "progress"];
const MEMBER_COLORS = ["#ff6b1a", "#4fd1c5", "#9f7aea", "#f6ad55", "#68d391", "#f687b3", "#63b3ed", "#fc8181"];
function autoColorForUserId(userId: string) {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) % MEMBER_COLORS.length;
  return MEMBER_COLORS[hash];
}
const CHALLENGE_PRESETS: { key: string; type: "daily" | "minutes" | "sessions"; goal: number; days: number }[] = [
  { key: "daily3", type: "daily", goal: 3, days: 7 },
  { key: "daily30x5", type: "daily", goal: 30, days: 5 },
  { key: "sessions3weekly", type: "sessions", goal: 3, days: 7 },
  { key: "daily5x20", type: "daily", goal: 5, days: 20 },
];

const PRACTICE_CATEGORIES = ["rudiments", "exercises", "rhythms"] as const;
const CATEGORY_ICON_SRC: Record<string, string> = { rudiments: "/icons/rudiments.png", exercises: "/icons/exercises.png", rhythms: "/icons/rhythms.png" };
const PRACTICE_EXERCISES: { category: typeof PRACTICE_CATEGORIES[number]; subcategory: { en: string; es: string } | null; en: string; es: string }[] = [
  { category: "rudiments", subcategory: null, en: "Single Strokes", es: "Golpes simples" },
  { category: "rudiments", subcategory: null, en: "Double Strokes", es: "Golpes dobles" },
  { category: "rudiments", subcategory: null, en: "Single Paradiddle", es: "Paradiddle simple" },
  { category: "rudiments", subcategory: null, en: "Double Paradiddle", es: "Paradiddle doble" },
  { category: "rudiments", subcategory: null, en: "Triple Paradiddle", es: "Paradiddle triple" },
  { category: "rudiments", subcategory: null, en: "Paradiddle-Diddle", es: "Paradiddle-diddle" },
  { category: "rudiments", subcategory: null, en: "Flam", es: "Flam" },
  { category: "rudiments", subcategory: null, en: "Flam Accent", es: "Flam acentuado" },
  { category: "rudiments", subcategory: null, en: "Flam Tap", es: "Flam tap" },
  { category: "rudiments", subcategory: null, en: "Drag", es: "Drag" },
  { category: "rudiments", subcategory: null, en: "Double Drag", es: "Drag doble" },
  { category: "rudiments", subcategory: null, en: "Ratamacue", es: "Ratamacue" },
  { category: "rudiments", subcategory: null, en: "Single Strokes Four", es: "Golpes Simples Cuatro" },
  { category: "rudiments", subcategory: null, en: "Single Strokes Seven", es: "Golpes Simples Siete" },
  { category: "rudiments", subcategory: null, en: "5 Stroke Roll", es: "Redoble de 5 Golpes" },
  { category: "rudiments", subcategory: null, en: "6 Stroke Roll", es: "Redoble de 6 Golpes" },
  { category: "rudiments", subcategory: null, en: "7 Stroke Roll", es: "Redoble de 7 Golpes" },
  { category: "rudiments", subcategory: null, en: "9 Stroke Roll", es: "Redoble de 9 Golpes" },
  { category: "rudiments", subcategory: null, en: "10 Stroke Roll", es: "Redoble de 10 Golpes" },
  { category: "rudiments", subcategory: null, en: "11 Stroke Roll", es: "Redoble de 11 Golpes" },
  { category: "rudiments", subcategory: null, en: "13 Stroke Roll", es: "Redoble de 13 Golpes" },
  { category: "rudiments", subcategory: null, en: "15 Stroke Roll", es: "Redoble de 15 Golpes" },
  { category: "rudiments", subcategory: null, en: "17 Stroke Roll", es: "Redoble de 17 Golpes" },
  { category: "rudiments", subcategory: null, en: "Lesson 25", es: "Lección 25" },
  { category: "rudiments", subcategory: null, en: "Single Drag Tap", es: "Drag Tap Simple" },
  { category: "rudiments", subcategory: null, en: "Single Dragadiddle", es: "Dragadiddle Simple" },
  { category: "rudiments", subcategory: null, en: "Drag Paradiddle #1", es: "Drag Paradiddle #1" },
  { category: "rudiments", subcategory: null, en: "Drag Paradiddle #2", es: "Drag Paradiddle #2" },
  { category: "rudiments", subcategory: null, en: "Flammed Mill", es: "Flammed Mill" },
  { category: "rudiments", subcategory: null, en: "Swiss Army Triplet", es: "Swiss Army Triplet" },
  { category: "rudiments", subcategory: null, en: "Flamacue", es: "Flamacue" },
  { category: "rudiments", subcategory: null, en: "Triple Stroke Roll", es: "Redoble Triple" },
  { category: "rudiments", subcategory: null, en: "Flam Paradiddle", es: "Flam Paradiddle" },
  { category: "rudiments", subcategory: null, en: "Patafla-fla", es: "Patafla-fla" },
  { category: "rudiments", subcategory: null, en: "Double Drag Tap", es: "Drag Tap Doble" },
  { category: "rudiments", subcategory: null, en: "Flam Paradiddle-diddle", es: "Flam Paradiddle-diddle" },
  { category: "rudiments", subcategory: null, en: "Single Ratamacue", es: "Ratamacue Simple" },
  { category: "rudiments", subcategory: null, en: "Double Ratamacue", es: "Ratamacue Doble" },
  { category: "rudiments", subcategory: null, en: "Triple Ratamacue", es: "Ratamacue Triple" },
  { category: "rudiments", subcategory: null, en: "Inverted Flam Tap", es: "Flam Tap Invertido" },
  { category: "rudiments", subcategory: null, en: "Flam Drag", es: "Flam Drag" },
  { category: "exercises", subcategory: null, en: "Push Pull - Right Hand", es: "Push Pull - Mano Derecha" },
  { category: "exercises", subcategory: null, en: "Push Pull - Left Hand", es: "Push Pull - Mano Izquierda" },
  { category: "exercises", subcategory: null, en: "Heel Down, 8th Notes", es: "Talón abajo, corcheas" },
  { category: "exercises", subcategory: null, en: "Heel Up, 8th Notes", es: "Talón arriba, corcheas" },
  { category: "exercises", subcategory: null, en: "Slide Technique, 8th Notes", es: "Técnica de deslizamiento, corcheas" },
  { category: "exercises", subcategory: null, en: "Double Bass Drum", es: "Doble bombo" },
  { category: "exercises", subcategory: null, en: "Flow, 16th Notes", es: "Flow, semicorcheas" },
  { category: "exercises", subcategory: null, en: "RLKK", es: "RLKK" },
  { category: "exercises", subcategory: null, en: "RKKL", es: "RKKL" },
  { category: "exercises", subcategory: null, en: "KKRL", es: "KKRL" },
  { category: "exercises", subcategory: null, en: "KRLK", es: "KRLK" },
  { category: "exercises", subcategory: null, en: "RLLK", es: "RLLK" },
  { category: "exercises", subcategory: null, en: "Finger Technique (Single-Handed)", es: "Técnica de dedos (una mano)" },
  { category: "exercises", subcategory: null, en: "16th Note Single Strokes Around the Set", es: "Golpes simples en semicorcheas alrededor de la batería" },
  { category: "exercises", subcategory: null, en: "Hi-Hat Pedal 8th Notes", es: "Pedal de hi-hat en corcheas" },
];
const CHALLENGE_EXERCISE_OPTIONS: { en: string; es: string }[] = (() => {
  const seen = new Set<string>();
  const combined: { en: string; es: string }[] = [];
  [...PRACTICE_EXERCISES, ...PRACTICE_ITEMS].forEach((item) => {
    if (!seen.has(item.en)) { seen.add(item.en); combined.push({ en: item.en, es: item.es }); }
  });
  return combined;
})();
const BPM_LEVELS = [50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200];
const PRACTICE_TIERS = [
  { key: "beginner", min: 50, max: 90 },
  { key: "intermediate", min: 100, max: 130 },
  { key: "advanced", min: 140, max: 170 },
  { key: "legend", min: 180, max: 200 },
];
const RATING_RANK: Record<string, number> = { not_ready: 1, tense: 2, comfortable: 3, mastered: 4 };
const RATING_ORDER = ["not_ready", "tense", "comfortable", "mastered"];
const RATING_COLOR: Record<string, string> = { not_ready: "#e2877d", tense: "#f6ad55", comfortable: "#68d391", mastered: "#68d391" };
const UNLOCK_MINUTES = 2;
const MAX_PINNED_EXERCISES = 3;
const RATING_ICON: Record<string, string> = { not_ready: "🔴", tense: "🟠", comfortable: "🟢", mastered: "⭐" };
function qualifyingMinutesFor(sessions: { item_en: string; bpm: number; rating: string; duration_minutes: number }[], itemEn: string, targetBpm: number) {
  return sessions.filter((s) => s.item_en === itemEn && s.bpm === targetBpm && (s.rating === "comfortable" || s.rating === "mastered")).reduce((sum, s) => sum + s.duration_minutes, 0);
}
function tierProgressFor(sessions: { item_en: string; bpm: number; rating: string; duration_minutes: number }[], itemEn: string, tier: { min: number; max: number }) {
  const levels = BPM_LEVELS.filter((l) => l >= tier.min && l <= tier.max);
  const done = levels.filter((l) => qualifyingMinutesFor(sessions, itemEn, l) >= UNLOCK_MINUTES);
  return levels.length ? (done.length / levels.length) * 100 : 0;
}
// A tier reads as "skipped" (dotted, not solid) when the user hasn't touched it at all but has
// already unlocked something in a higher tier — i.e. they jumped ahead instead of working up.
function tierIsSkipped(sessions: { item_en: string; bpm: number; rating: string; duration_minutes: number }[], itemEn: string, tier: { min: number; max: number }) {
  if (tierProgressFor(sessions, itemEn, tier) > 0) return false;
  return PRACTICE_TIERS.some((t) => t.min > tier.max && tierProgressFor(sessions, itemEn, t) > 0);
}

const translations = {
  en: {
    nav: { today: "Home", practice: "Practice", group: "Group", progress: "Progress", settings: "Settings" },
    confirm: { cancel: "Cancel", confirm: "Confirm" },
    today: {
      heroLine1: "DISCIPLINE", heroLine1b: "BUILDS", heroLine2: "SKILL.", currentStreak: "Current streak", days: "days",
      todaysPractice: "Today's practice", metronome: "Metronome", howLong: "HOW LONG DID YOU PRACTISE?", whatPractised: "ADD WHAT YOU PRACTISED",
      notes: "NOTES", notesPrefix: "Notes:", optional: "OPTIONAL", notesPlaceholder: "What did you practise today?", savePractice: "Save practice", practiceSaved: "✓ Practice saved",
      todayGoal: "TODAY'S GOAL", equipment: "PRACTISED WITH", drumset: "Drum Set", pad: "Practice Pad", equipmentBoth: "Drum Set & Practice Pad", addNotes: "+ Add notes", minShort: "min", minOn: (minutes: number, equipmentName: string) => `${minutes} min on ${equipmentName}`,
      todaySummary: "TODAY'S SUMMARY", goalLabel: "GOAL", noPracticeYet: "No practice logged yet today.", secondsCarried: "extra (not counted in minutes yet)", other: "Other", otherPlaceholder: "What else did you practice?",
      resetPractice: "Reset", confirmResetPractice: "Clear today's practice and start over? This can't be undone.",
    },
    calendar: {
      title: "CALENDAR", longestStreak: "Longest streak", daysThisYear: "Days this year",
      weekdays: ["M", "T", "W", "T", "F", "S", "S"], futureDay: "You can't log practice for a future day.",
      noPractice: "No practice logged for this day. Log today's practice from the Today tab.", minPractised: "min practised",
      notesPlaceholder: "What did you practise that day?", saving: "Saving...",
      deleteEntry: "Delete entry", confirmDeleteEntry: "Delete this day's practice? This can't be undone.", couldNotDeleteEntry: "Could not delete this entry.",
      goalMet: "🎯 Daily goal reached", goalMissed: (done: number, total: number) => `${done}/${total} min toward your goal`,
      onEquipment: (label: string) => `On ${label}`,
      streakOnDay: (n: number) => `🔥 ${n}-day streak`, noPracticeShort: "No practice logged for this day.",
      editDay: "Edit this day", nothingToEdit: "+ Log practice for this day",
    },
    group: {
      yourCrew: "YOUR CREW", youreIn: "You're in.", inviteMsg: "Invite drummers with this code:", copyInvite: "Copy invite code",
      challenges: "CHALLENGES",
      practiseTogether: "PRACTISE TOGETHER", yourGroup: "YOUR GROUP", findCrew: "Find your crew.", startGroup: "Start a group", joinCrew: "Join your crew",
      intro: "Stay accountable, climb the leaderboard, and make practice more fun.", createGroupBtn: "Create a group", joinWithCode: "Join with invite code",
      groupNamePlaceholder: "Group name", inviteCodePlaceholder: "Invite code", pleaseWait: "Please wait...", createGroup: "Create group",
      joinGroup: "Join group", back: "Back", inviteNotFound: "That invite code was not found.", couldNotCreate: "Could not create group.",
      leaderboard: "LEADERBOARD", timePractised: "TIME PRACTISED", you: "You", minutesShort: "min",
      noChallenges: "No challenges yet. Start one with your crew!", newChallenge: "+ New challenge", cancel: "Cancel", challengeNamePlaceholder: "Challenge name",
      typeDaily: "Every day", typeMinutes: "Total minutes", typeSessions: "Days practised", goalLabel: "GOAL", startLabel: "START", endLabel: "END",
      rewardPlaceholder: "Reward (optional)", punishmentPlaceholder: "Punishment (optional)", createChallengeBtn: "Create challenge",
      joinChallengeBtn: "Join challenge", joined: "Joined", participants: (n: number) => `${n} joined`,
      dailyGoalDesc: (min: number) => `${min}+ min every day`, minutesGoalDesc: (total: number) => `Reach ${total} total min`,
      sessionsGoalDesc: (days: number) => `Practise on ${days} days`, daysProgress: (p: number, t: number) => `${p}/${t} days`,
      minutesProgress: (p: number, t: number) => `${p}/${t} min`, reward: "Reward:", punishment: "Punishment:", couldNotCreateChallenge: "Could not create challenge.",
      presetDaily5: "3 min every day", presetDaily30x5: "30+ min, 5 days straight", presetSessions3weekly: "3 sessions this week", presetDaily5x20: "20-day challenge: 5+ min daily",
      noOnePractised: "No one practised on this day.",
      weekdaysMon: ["M", "T", "W", "T", "F", "S", "S"], copied: "Copied!", progress: "PROGRESS", leaveGroup: "Leave group",
      confirmLeave: "Leave this group? You can rejoin later with the invite code.", confirmDeleteChallenge: "Delete this challenge? This can't be undone.",
      deleteChallenge: "Delete", since: (date: string) => `Since ${date}`, couldNotLeave: "Could not leave the group.", couldNotDeleteChallenge: "Could not delete the challenge.",
      deleteGroupBtn: "Delete group", confirmDeleteGroup: "Delete this group? This removes it for everyone and can't be undone.", couldNotDeleteGroup: "Could not delete the group.",
      chat: "CHAT", noMessages: "No messages yet. Say hi to your crew!", chatPlaceholder: "Message your crew...", send: "Send", couldNotSend: "Could not send message.",
    },
    progressPage: {
      eyebrow: "PRACTICE SUMMARY", title: "PROGRESS", yourPractice: "YOUR PRACTICE",
      noData: "Log some practice to see your progress here.", pinned: "YOUR FOCUS - Pinned exercises", generalPractice: "General Practice",
      skillProgress: "SKILL PROGRESS", noSkillData: "Train an exercise's BPM levels to see your skill progress here.",
      achievements: "ACHIEVEMENTS", achievementsIntro: "Complete a Personal Challenge on the Practice tab to win a trophy here. More milestones coming soon.",
    },
    personalChallenges: {
      title: "Personal Challenges", homeTitle: "PERSONAL CHALLENGES", subtitle: "Set a focused practice goal for yourself.",
      newChallenge: "+ New challenge", cancel: "Cancel",
      exerciseLabel: "EXERCISE", minutesLabel: "MINUTES PER DAY", bpmLabel: "TARGET BPM (OPTIONAL)", bpmPlaceholder: "Any tempo",
      lengthLabel: "CHALLENGE LENGTH (DAYS)", startChallenge: "Start challenge", pleaseWait: "Please wait...",
      noChallenges: "No personal challenges yet. Create one to build a focused practice habit.",
      challengeTitle: (exercise: string, days: number) => `${exercise} — ${days} Day Challenge`,
      challengeDescription: (minutes: number, bpm: number | null, days: number) => bpm ? `Practice ${minutes} min at ${bpm}+ BPM every day for ${days} consecutive days.` : `Practice ${minutes} min every day for ${days} consecutive days.`,
      statusActive: (done: number, total: number) => `${done}/${total} days`, statusCompleted: "✓ Completed — achievement unlocked!", statusFailed: "Challenge failed. Want to start over?",
      deleteChallenge: "Delete", confirmDelete: "Delete this challenge? This can't be undone.",
      resetChallenge: "Try again", confirmReset: "Restart this challenge from day 1?",
      couldNotCreate: "Could not create challenge.",
    },
    practiceMode: {
      eyebrow: "TRACK YOUR LEVELS", title: "PRACTICE MODE", pageEyebrow: "TRAIN", pageTitle: "PRACTICE",
      currentLevel: "CURRENT LEVEL", levelsUnlocked: (n: number, total: number) => `${n} of ${total} levels unlocked`,
      notStarted: "Not started", bpmLevels: "BPM LEVELS · TAP TO PRACTISE",
      inProgress: "In progress", unlockedLabel: "Unlocked", confirmResetLevel: (bpm: number) => `Reset your progress at ${bpm} BPM? This can't be undone.`,
      tierBeginner: "BEGINNER", tierIntermediate: "INTERMEDIATE", tierAdvanced: "ADVANCED", tierLegend: "LEGEND",
      ratingNotReady: "Not ready", ratingTense: "Tense", ratingComfortable: "Comfortable", ratingMastered: "Mastered",
      rateTitle: "HOW DID THAT FEEL?", rateSubtitle: (bpm: number) => `Your session at ${bpm} BPM is saved.`,
      backToBook: "Back to Practice Mode", couldNotSaveSession: "Could not save this session.",
      categoryRudiments: "Rudiments", categoryExercises: "Exercises", categoryRhythms: "Rhythms",
      pin: "Pin", pinned: "Pinned",
      quickTitle: "Quick Practice",
      trainTitle: "Train a Skill",
      categoryDescRudiments: "Build technique and control.", categoryDescExercises: "Improve with structured exercises.", categoryDescRhythms: "Grooves, styles and musical vocabulary.",
      listIntroRudiments: (min: number) => `Standard rudiments for clean technique. Tap one, then log at least ${min} comfortable min at each BPM level to unlock it before moving to the next tempo.`,
      listIntroExercises: (min: number) => `Focused drills for coordination and control. Tap one, then log at least ${min} comfortable min at each BPM level to unlock it, same as rudiments.`,
      listIntroRhythms: (min: number) => `Grooves and styles to build your musical vocabulary. Tap one, then log at least ${min} comfortable min at each BPM level to unlock it and move up.`,
    },
    settings: {
      makeItYours: "MAKE IT YOURS", title: "SETTINGS", displayName: "DISPLAY NAME", dailyGoal: "DAILY PRACTICE GOAL", minutes: "minutes",
      language: "LANGUAGE", reminders: "Daily practice reminders", showDaysThisYear: "Show \"days this year\" stat", on: "ON", off: "OFF", save: "Save settings", saved: "✓ Settings saved", logout: "Log out", calendarColor: "GROUP CALENDAR COLOR", autoColor: "Auto",
      metronomeTone: "METRONOME TONE", toneNames: { click: "Click", beep: "Beep", wood: "Wood", clave: "Clave" },
      userSection: "USER", accountSection: "ACCOUNT SETTINGS", pleaseWait: "Please wait...",
      changeEmail: "Change email", newEmailPlaceholder: "New email address", updateEmail: "Update email", emailChangeSent: "Check your new email to confirm the change.",
      changePassword: "Change password", newPasswordPlaceholder: "New password", confirmPasswordPlaceholder: "Confirm new password", updatePassword: "Update password", passwordChanged: "✓ Password updated", passwordMismatch: "Passwords don't match.", passwordTooShort: "Password must be at least 6 characters.",
      deleteAccount: "Delete account", deleteAccountWarning: "This permanently deletes your account and all your practice history. This can't be undone.", deleteAccountConfirmPrompt: (email: string) => `Type your email (${email}) to confirm:`, deleteAccountBtn: "Delete my account", deleteAccountBusy: "Deleting…", couldNotDeleteAccount: "Could not delete your account.",
    },
    metronome: {
      practiceTool: "PRACTICE TOOL", title: "METRONOME", practiceTimer: "PRACTICE TIMER", sessionTime: "SESSION TIME", tapTempo: "TAP TEMPO",
      start: "▶ Start", stop: "■ Stop", sessionComplete: "SESSION COMPLETE",
      addTimeQuestion: (label: string) => `Add ${label} to today's practice?`, addTimeTooShort: "Too short to log — adjust the timer above", sessionLasted: (time: string) => `Your metronome session lasted ${time}.`, minAbbr: "min", secAbbr: "sec",
      notNow: "Not now", addTime: "Add time",
      timeSignature: "BEATS / BAR", subdivisionLabel: "CLICKS / BEAT",
    },
  },
  es: {
    nav: { today: "Inicio", practice: "Práctica", group: "Grupo", progress: "Progreso", settings: "Ajustes" },
    confirm: { cancel: "Cancelar", confirm: "Confirmar" },
    today: {
      heroLine1: "DISCIPLINA", heroLine1b: "CONSTRUYE", heroLine2: "HABILIDAD.", currentStreak: "Racha actual", days: "días",
      todaysPractice: "Práctica de hoy", metronome: "Metrónomo", howLong: "¿CUÁNTO TIEMPO PRACTICASTE?", whatPractised: "AÑADE LO QUE PRACTICASTE",
      notes: "NOTAS", notesPrefix: "Notas:", optional: "OPCIONAL", notesPlaceholder: "¿Qué practicaste hoy?", savePractice: "Guardar práctica", practiceSaved: "✓ Práctica guardada",
      todayGoal: "META DE HOY", equipment: "PRACTICASTE CON", drumset: "Batería", pad: "Pad de práctica", equipmentBoth: "Batería y pad de práctica", addNotes: "+ Añadir notas", minShort: "min", minOn: (minutes: number, equipmentName: string) => `${minutes} min en ${equipmentName}`,
      todaySummary: "RESUMEN DE HOY", goalLabel: "META", noPracticeYet: "Aún no has registrado práctica hoy.", secondsCarried: "extra (aún no contado en minutos)", other: "Otro", otherPlaceholder: "¿Qué más practicaste?",
      resetPractice: "Reiniciar", confirmResetPractice: "¿Borrar la práctica de hoy y empezar de nuevo? Esta acción no se puede deshacer.",
    },
    calendar: {
      title: "CALENDARIO", longestStreak: "Racha más larga", daysThisYear: "Días este año",
      weekdays: ["L", "M", "X", "J", "V", "S", "D"], futureDay: "No puedes registrar práctica en un día futuro.",
      noPractice: "No hay práctica registrada para este día. Regístrala desde la pestaña Hoy.", minPractised: "min practicados",
      notesPlaceholder: "¿Qué practicaste ese día?", saving: "Guardando...",
      deleteEntry: "Eliminar entrada", confirmDeleteEntry: "¿Eliminar la práctica de este día? Esta acción no se puede deshacer.", couldNotDeleteEntry: "No se pudo eliminar esta entrada.",
      goalMet: "🎯 Meta diaria alcanzada", goalMissed: (done: number, total: number) => `${done}/${total} min hacia tu meta`,
      onEquipment: (label: string) => `Con ${label}`,
      streakOnDay: (n: number) => `🔥 Racha de ${n} días`, noPracticeShort: "No hay práctica registrada para este día.",
      editDay: "Editar este día", nothingToEdit: "+ Registrar práctica de este día",
    },
    group: {
      yourCrew: "TU GRUPO", youreIn: "Ya estás dentro.", inviteMsg: "Invita a otros bateristas con este código:", copyInvite: "Copiar código de invitación",
      challenges: "DESAFÍOS",
      practiseTogether: "PRACTICA EN GRUPO", yourGroup: "TU GRUPO", findCrew: "Encuentra tu grupo.", startGroup: "Crear un grupo", joinCrew: "Únete a un grupo",
      intro: "Mantente responsable, sube en la clasificación y haz que practicar sea más divertido.", createGroupBtn: "Crear un grupo", joinWithCode: "Unirse con código de invitación",
      groupNamePlaceholder: "Nombre del grupo", inviteCodePlaceholder: "Código de invitación", pleaseWait: "Un momento...", createGroup: "Crear grupo",
      joinGroup: "Unirse al grupo", back: "Atrás", inviteNotFound: "No se encontró ese código de invitación.", couldNotCreate: "No se pudo crear el grupo.",
      leaderboard: "CLASIFICACIÓN", timePractised: "TIEMPO PRACTICADO", you: "Tú", minutesShort: "min",
      noChallenges: "Aún no hay desafíos. ¡Empieza uno con tu grupo!", newChallenge: "+ Nuevo desafío", cancel: "Cancelar", challengeNamePlaceholder: "Nombre del desafío",
      typeDaily: "Todos los días", typeMinutes: "Minutos totales", typeSessions: "Días practicados", goalLabel: "META", startLabel: "INICIO", endLabel: "FIN",
      rewardPlaceholder: "Recompensa (opcional)", punishmentPlaceholder: "Penalización (opcional)", createChallengeBtn: "Crear desafío",
      joinChallengeBtn: "Unirse al desafío", joined: "Unido", participants: (n: number) => `${n} unidos`,
      dailyGoalDesc: (min: number) => `${min}+ min cada día`, minutesGoalDesc: (total: number) => `Llega a ${total} min en total`,
      sessionsGoalDesc: (days: number) => `Practica ${days} días`, daysProgress: (p: number, t: number) => `${p}/${t} días`,
      minutesProgress: (p: number, t: number) => `${p}/${t} min`, reward: "Recompensa:", punishment: "Penalización:", couldNotCreateChallenge: "No se pudo crear el desafío.",
      presetDaily5: "3 min cada día", presetDaily30x5: "30+ min, 5 días seguidos", presetSessions3weekly: "3 sesiones esta semana", presetDaily5x20: "Reto de 20 días: 5+ min diarios",
      noOnePractised: "Nadie practicó ese día.",
      weekdaysMon: ["L", "M", "X", "J", "V", "S", "D"], copied: "¡Copiado!", progress: "PROGRESO", leaveGroup: "Salir del grupo",
      confirmLeave: "¿Salir de este grupo? Puedes volver a unirte más tarde con el código de invitación.", confirmDeleteChallenge: "¿Eliminar este desafío? Esta acción no se puede deshacer.",
      deleteChallenge: "Eliminar", since: (date: string) => `Desde ${date}`, couldNotLeave: "No se pudo salir del grupo.", couldNotDeleteChallenge: "No se pudo eliminar el desafío.",
      deleteGroupBtn: "Eliminar grupo", confirmDeleteGroup: "¿Eliminar este grupo? Se eliminará para todos y no se puede deshacer.", couldNotDeleteGroup: "No se pudo eliminar el grupo.",
      chat: "CHAT", noMessages: "Aún no hay mensajes. ¡Saluda a tu grupo!", chatPlaceholder: "Escribe a tu grupo...", send: "Enviar", couldNotSend: "No se pudo enviar el mensaje.",
    },
    progressPage: {
      eyebrow: "RESUMEN DE PRÁCTICA", title: "PROGRESO", yourPractice: "TU PRÁCTICA",
      noData: "Registra algo de práctica para ver tu progreso aquí.", pinned: "TU ENFOQUE - Ejercicios fijados", generalPractice: "Práctica general",
      skillProgress: "PROGRESO TÉCNICO", noSkillData: "Entrena los niveles de BPM de un ejercicio para ver tu progreso técnico aquí.",
      achievements: "LOGROS", achievementsIntro: "Completa un Reto personal en la pestaña Práctica para ganar un trofeo aquí. Próximamente, más logros.",
    },
    personalChallenges: {
      title: "Retos personales", homeTitle: "RETOS PERSONALES", subtitle: "Ponte una meta de práctica enfocada.",
      newChallenge: "+ Nuevo reto", cancel: "Cancelar",
      exerciseLabel: "EJERCICIO", minutesLabel: "MINUTOS POR DÍA", bpmLabel: "BPM OBJETIVO (OPCIONAL)", bpmPlaceholder: "Cualquier tempo",
      lengthLabel: "DURACIÓN DEL RETO (DÍAS)", startChallenge: "Empezar reto", pleaseWait: "Un momento...",
      noChallenges: "Aún no tienes retos personales. Crea uno para desarrollar un hábito de práctica enfocado.",
      challengeTitle: (exercise: string, days: number) => `${exercise} — Reto de ${days} Días`,
      challengeDescription: (minutes: number, bpm: number | null, days: number) => bpm ? `Practica ${minutes} min a ${bpm}+ BPM cada día durante ${days} días consecutivos.` : `Practica ${minutes} min cada día durante ${days} días consecutivos.`,
      statusActive: (done: number, total: number) => `${done}/${total} días`, statusCompleted: "✓ Completado — ¡logro desbloqueado!", statusFailed: "Reto fallido. ¿Quieres empezar de nuevo?",
      deleteChallenge: "Eliminar", confirmDelete: "¿Eliminar este reto? Esta acción no se puede deshacer.",
      resetChallenge: "Intentar de nuevo", confirmReset: "¿Reiniciar este reto desde el día 1?",
      couldNotCreate: "No se pudo crear el reto.",
    },
    practiceMode: {
      eyebrow: "SIGUE TUS NIVELES", title: "MODO PRÁCTICA", pageEyebrow: "ENTRENA", pageTitle: "PRÁCTICA",
      currentLevel: "NIVEL ACTUAL", levelsUnlocked: (n: number, total: number) => `${n} de ${total} niveles desbloqueados`,
      notStarted: "Sin empezar", bpmLevels: "NIVELES DE BPM · TOCA PARA PRACTICAR",
      inProgress: "En progreso", unlockedLabel: "Desbloqueado", confirmResetLevel: (bpm: number) => `¿Reiniciar tu progreso a ${bpm} BPM? Esta acción no se puede deshacer.`,
      tierBeginner: "PRINCIPIANTE", tierIntermediate: "INTERMEDIO", tierAdvanced: "AVANZADO", tierLegend: "LEYENDA",
      ratingNotReady: "No listo", ratingTense: "Con tensión", ratingComfortable: "Cómodo", ratingMastered: "Dominado",
      rateTitle: "¿CÓMO TE SENTISTE?", rateSubtitle: (bpm: number) => `Tu sesión a ${bpm} BPM se guardó.`,
      backToBook: "Volver a Modo práctica", couldNotSaveSession: "No se pudo guardar esta sesión.",
      categoryRudiments: "Rudimentos", categoryExercises: "Ejercicios", categoryRhythms: "Ritmos",
      pin: "Fijar", pinned: "Fijado",
      quickTitle: "Práctica rápida",
      trainTitle: "Entrena una habilidad",
      categoryDescRudiments: "Desarrolla técnica y control.", categoryDescExercises: "Mejora con ejercicios estructurados.", categoryDescRhythms: "Grooves, estilos y vocabulario musical.",
      listIntroRudiments: (min: number) => `Rudimentos estándar para una técnica limpia. Toca uno y registra al menos ${min} min cómodos en cada nivel de BPM para desbloquearlo antes de pasar al siguiente tempo.`,
      listIntroExercises: (min: number) => `Ejercicios enfocados en coordinación y control. Toca uno y registra al menos ${min} min cómodos en cada nivel de BPM para desbloquearlo, igual que con los rudimentos.`,
      listIntroRhythms: (min: number) => `Grooves y estilos para ampliar tu vocabulario musical. Toca uno y registra al menos ${min} min cómodos en cada nivel de BPM para desbloquearlo y subir de nivel.`,
    },
    settings: {
      makeItYours: "PERSONALÍZALO", title: "AJUSTES", displayName: "NOMBRE", dailyGoal: "META DIARIA DE PRÁCTICA", minutes: "minutos",
      language: "IDIOMA", reminders: "Recordatorios diarios de práctica", showDaysThisYear: "Mostrar estadística \"días este año\"", on: "SÍ", off: "NO", save: "Guardar ajustes", saved: "✓ Ajustes guardados", logout: "Cerrar sesión", calendarColor: "COLOR DEL CALENDARIO DE GRUPO", autoColor: "Auto",
      metronomeTone: "SONIDO DEL METRÓNOMO", toneNames: { click: "Click", beep: "Bip", wood: "Madera", clave: "Clave" },
      userSection: "USUARIO", accountSection: "AJUSTES DE CUENTA", pleaseWait: "Un momento...",
      changeEmail: "Cambiar correo electrónico", newEmailPlaceholder: "Nuevo correo electrónico", updateEmail: "Actualizar correo", emailChangeSent: "Revisa tu nuevo correo para confirmar el cambio.",
      changePassword: "Cambiar contraseña", newPasswordPlaceholder: "Nueva contraseña", confirmPasswordPlaceholder: "Confirmar nueva contraseña", updatePassword: "Actualizar contraseña", passwordChanged: "✓ Contraseña actualizada", passwordMismatch: "Las contraseñas no coinciden.", passwordTooShort: "La contraseña debe tener al menos 6 caracteres.",
      deleteAccount: "Eliminar cuenta", deleteAccountWarning: "Esto elimina tu cuenta y todo tu historial de práctica de forma permanente. Esta acción no se puede deshacer.", deleteAccountConfirmPrompt: (email: string) => `Escribe tu correo (${email}) para confirmar:`, deleteAccountBtn: "Eliminar mi cuenta", deleteAccountBusy: "Eliminando…", couldNotDeleteAccount: "No se pudo eliminar tu cuenta.",
    },
    metronome: {
      practiceTool: "HERRAMIENTA DE PRÁCTICA", title: "METRÓNOMO", practiceTimer: "TEMPORIZADOR", sessionTime: "TIEMPO DE SESIÓN", tapTempo: "MARCAR TEMPO",
      start: "▶ Iniciar", stop: "■ Detener", sessionComplete: "SESIÓN COMPLETA",
      addTimeQuestion: (label: string) => `¿Añadir ${label} a la práctica de hoy?`, addTimeTooShort: "Muy corto para registrar — ajusta el tiempo arriba", sessionLasted: (time: string) => `Tu sesión de metrónomo duró ${time}.`, minAbbr: "min", secAbbr: "seg",
      notNow: "Ahora no", addTime: "Añadir tiempo",
      timeSignature: "TIEMPOS / COMPÁS", subdivisionLabel: "CLICS / TIEMPO",
    },
  },
} as const;


const NAV_ICONS: Record<Tab, React.ReactNode> = {
  today: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="10" cy="10" r="7.3" /><circle cx="10" cy="10" r="2.4" fill="currentColor" stroke="none" /></svg>,
  practice: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="10" cy="10" r="7" /><circle cx="10" cy="10" r="4" /><circle cx="10" cy="10" r="1.1" fill="currentColor" stroke="none" /></svg>,
  group: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="7.2" cy="7" r="2.6" /><path d="M2.5 17c0-2.9 2.1-5 4.7-5s4.7 2.1 4.7 5" /><circle cx="14.5" cy="7.8" r="2.1" /><path d="M12.7 12.3c1.9.4 3.3 2.1 3.3 4.7" /></svg>,
  progress: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 16.5V9.5M10 16.5V3.5M16 16.5v-6" /></svg>,
  settings: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" /></svg>,
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
function localDateFromTimestamp(iso: string) {
  const d = new Date(iso);
  return formatLocalDate(d.getFullYear(), d.getMonth(), d.getDate());
}
function challengeExerciseLabel(en: string, language: Lang) {
  return CHALLENGE_EXERCISE_OPTIONS.find((e) => e.en === en)?.[language] ?? en;
}
type ChallengeLogEntry = { minutes: number; items: string[]; customItems: string[]; updatedAt: string };
function isChallengeDayValid(challenge: any, date: string, practiceSessions: { item_en: string; bpm: number; duration_minutes: number; practiced_on: string }[], logsCache: Record<string, ChallengeLogEntry>) {
  if (challenge.target_bpm) {
    const minutes = practiceSessions.filter((s) => s.item_en === challenge.exercise_en && s.practiced_on === date && s.bpm >= challenge.target_bpm).reduce((sum, s) => sum + s.duration_minutes, 0);
    return minutes >= challenge.target_minutes;
  }
  const log = logsCache[date];
  if (!log) return false;
  const tags = [...log.items, ...log.customItems];
  if (!tags.includes(challenge.exercise_en)) return false;
  // Anti-backdating: only count this day if the log row was last touched (created or edited) on the
  // same LOCAL calendar day it represents. An edit made on a later day pushes updated_at forward and
  // disqualifies it, so a missed day can't be quietly repaired after the fact.
  if (!log.updatedAt || localDateFromTimestamp(log.updatedAt) !== date) return false;
  const share = log.minutes / tags.length;
  return share >= challenge.target_minutes;
}
function evaluateChallenge(challenge: any, practiceSessions: { item_en: string; bpm: number; duration_minutes: number; practiced_on: string }[], logsCache: Record<string, ChallengeLogEntry>) {
  const days: { date: string; valid: boolean | null }[] = [];
  for (let i = 0; i < challenge.length_days; i++) {
    const date = shiftDateKey(challenge.start_date, i);
    let valid: boolean | null;
    if (date > dateKey) {
      valid = null; // future day, not reached yet
    } else {
      const done = isChallengeDayValid(challenge, date, practiceSessions, logsCache);
      // Today stays "pending" (not a miss) until the day is over and still incomplete; only a
      // completed *past* day is a permanent miss.
      valid = done ? true : (date === dateKey ? null : false);
    }
    days.push({ date, valid });
  }
  const completedCount = days.filter((d) => d.valid === true).length;
  const brokenIndex = days.findIndex((d) => d.valid === false);
  const status = completedCount === challenge.length_days ? "completed" : brokenIndex !== -1 ? "failed" : "active";
  return { days, completedCount, status };
}
async function fetchChallengeLogsCache(userId: string, earliestStart: string) {
  const { data: logRows } = await supabase.from("practice_logs").select("practiced_on,minutes,updated_at,custom_items,practice_log_items(practice_items(name_en))").eq("user_id", userId).gte("practiced_on", earliestStart);
  const cache: Record<string, ChallengeLogEntry> = {};
  (logRows ?? []).forEach((row: any) => {
    cache[row.practiced_on] = { minutes: row.minutes, items: (row.practice_log_items ?? []).map((entry: any) => entry.practice_items?.name_en).filter(Boolean), customItems: row.custom_items ?? [], updatedAt: row.updated_at };
  });
  return cache;
}

function calculateStreaks(logs: Record<string, Log>, today: string) {
  const loggedDates = new Set(Object.keys(logs).filter((key) => logs[key].minutes > 0));
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
  const [minutes, setMinutes] = useState("0");
  const [seconds, setSeconds] = useState("0");
  const [customItems, setCustomItems] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [equipment, setEquipment] = useState<string | null>(null);
  const [drumsetMinutes, setDrumsetMinutes] = useState("");
  const [padMinutes, setPadMinutes] = useState("");
  const [logs, setLogs] = useState<Record<string, Log>>({});
  const [saved, setSaved] = useState(false);
  const [metronome, setMetronome] = useState(false);
  const [confirmState, setConfirmState] = useState<{ message: string; resolve: (value: boolean) => void } | null>(null);
  function askConfirm(message: string): Promise<boolean> {
    return new Promise((resolve) => setConfirmState({ message, resolve }));
  }
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const { current: streak, longest: longestStreak } = useMemo(() => calculateStreaks(logs, dateKey), [logs]);
  const daysThisYear = useMemo(() => Object.keys(logs).filter((key) => key.startsWith(dateKey.slice(0, 4)) && logs[key].minutes > 0).length, [logs]);
  const [profileName, setProfileName] = useState("");
  const displayName = profileName || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Drummer";
  const [language, setLanguage] = useState<Lang>("en");
  const [dailyGoal, setDailyGoal] = useState(30);
  const [metronomeTone, setMetronomeTone] = useState("click");
  const [showDaysThisYear, setShowDaysThisYear] = useState(true);
  const T = translations[language];
  const [practiceStep, setPracticeStep] = useState<"category" | "list" | "detail" | "session" | "rate">("category");
  const [practiceCategory, setPracticeCategory] = useState<string | null>(null);
  const [practiceExercise, setPracticeExercise] = useState<string | null>(null);
  const [practiceBpm, setPracticeBpm] = useState(100);
  const [pendingSessionMinutes, setPendingSessionMinutes] = useState(0);
  const [practiceSessions, setPracticeSessions] = useState<{ item_en: string; bpm: number; rating: string; duration_minutes: number; practiced_on: string }[]>([]);
  const [pinnedExercises, setPinnedExercises] = useState<string[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setUser(data.session?.user ?? null); setLoading(false); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (_event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
    });
    return () => listener.subscription.unsubscribe();
  }, []);
  function loadUserData(currentUser: any, hydrateToday = true) {
    const fallbackName = currentUser.user_metadata?.full_name ?? currentUser.email?.split("@")[0] ?? "Drummer";
    supabase.from("profiles").select("name").eq("id", currentUser.id).maybeSingle().then(({ data }) => {
      if (data?.name) { setProfileName(data.name); return; }
      setProfileName(fallbackName);
      supabase.from("profiles").upsert({ id: currentUser.id, name: fallbackName }, { onConflict: "id" }).then();
    });
    supabase.from("settings").select("language, daily_goal_minutes, metronome_tone, show_days_this_year").eq("user_id", currentUser.id).maybeSingle().then(({ data }) => {
      if (data?.language === "es" || data?.language === "en") setLanguage(data.language);
      if (data?.daily_goal_minutes) setDailyGoal(data.daily_goal_minutes);
      if (data?.metronome_tone) setMetronomeTone(data.metronome_tone);
      if (data?.show_days_this_year != null) setShowDaysThisYear(data.show_days_this_year);
    });
    supabase.from("practice_logs").select("practiced_on,minutes,seconds,notes,equipment,drumset_minutes,pad_minutes,custom_items,practice_log_items(practice_items(name_en))").eq("user_id", currentUser.id).then(({ data }) => {
      const nextLogs: Record<string, Log> = {};
      (data ?? []).forEach((row: any) => { nextLogs[row.practiced_on] = { minutes: row.minutes, seconds: row.seconds ?? 0, notes: row.notes ?? "", equipment: row.equipment ?? null, drumsetMinutes: row.drumset_minutes ?? null, padMinutes: row.pad_minutes ?? null, customItems: row.custom_items ?? [], items: (row.practice_log_items ?? []).map((entry: any) => entry.practice_items?.name_en).filter(Boolean) }; });
      setLogs(nextLogs);
      // Only hydrate the in-progress Quick Practice form from today's saved log on first load —
      // a background refetch (e.g. after the tab regains focus) shouldn't clobber unsaved edits.
      const todayLog = nextLogs[dateKey];
      if (hydrateToday && todayLog) { setMinutes(String(todayLog.minutes)); setSeconds(String(todayLog.seconds)); setNotes(todayLog.notes); setEquipment(todayLog.equipment); setDrumsetMinutes(todayLog.drumsetMinutes != null ? String(todayLog.drumsetMinutes) : ""); setPadMinutes(todayLog.padMinutes != null ? String(todayLog.padMinutes) : ""); setCustomItems(todayLog.customItems); if (todayLog.items.length) setSelected(todayLog.items); }
    });
    supabase.from("practice_sessions").select("bpm,rating,duration_minutes,practiced_on,practice_exercises(name_en)").eq("user_id", currentUser.id).then(({ data }) => {
      setPracticeSessions((data ?? []).map((row: any) => ({ item_en: row.practice_exercises?.name_en, bpm: row.bpm, rating: row.rating, duration_minutes: row.duration_minutes ?? 0, practiced_on: row.practiced_on })).filter((s: any) => s.item_en));
    });
    supabase.from("pinned_exercises").select("exercise_en").eq("user_id", currentUser.id).then(({ data }) => {
      setPinnedExercises((data ?? []).map((row: any) => row.exercise_en));
    });
  }
  useEffect(() => {
    if (!user) return;
    loadUserData(user, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);
  useEffect(() => {
    // Supabase re-emits the user object (a new reference, same account) on every token refresh,
    // which happens whenever the phone/tab wakes up from being backgrounded — that alone shouldn't
    // force a refetch above (keyed on user?.id instead). But a refetch initiated while the device is
    // still reconnecting can silently fail with no retry, leaving stats looking empty until the user
    // manually refreshes. Refetching whenever the tab becomes visible again closes that gap.
    function handleVisibility() {
      if (document.visibilityState === "visible" && user) loadUserData(user, false);
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [user]);
  async function togglePin(itemEn: string) {
    if (!user) return;
    if (pinnedExercises.includes(itemEn)) {
      await supabase.from("pinned_exercises").delete().eq("user_id", user.id).eq("exercise_en", itemEn);
      setPinnedExercises((current) => current.filter((en) => en !== itemEn));
    } else {
      await supabase.from("pinned_exercises").insert({ user_id: user.id, exercise_en: itemEn });
      setPinnedExercises((current) => [...current, itemEn]);
    }
  }
  async function saveLogFor(targetDate: string, targetMinutes: number, targetItems: string[], targetNotes: string, targetEquipment: string | null, targetDrumsetMinutes?: number | null, targetPadMinutes?: number | null, targetSeconds?: number, targetCustomItems?: string[]) {
    if (!user) return false;
    const { data: log, error } = await supabase.from("practice_logs").upsert({ user_id: user.id, practiced_on: targetDate, minutes: targetMinutes, seconds: targetSeconds ?? 0, notes: targetNotes, equipment: targetEquipment, drumset_minutes: targetDrumsetMinutes ?? null, pad_minutes: targetPadMinutes ?? null, custom_items: targetCustomItems ?? [] }, { onConflict: "user_id,practiced_on" }).select().single();
    if (error || !log) { setAuthError(error?.message ?? "Could not save your practice."); return false; }
    const { data: itemRows } = await supabase.from("practice_items").select("id,name_en").in("name_en", targetItems);
    await supabase.from("practice_log_items").delete().eq("log_id", log.id);
    if (itemRows?.length) await supabase.from("practice_log_items").insert(itemRows.map((item) => ({ log_id: log.id, item_id: item.id })));
    setLogs((current) => ({ ...current, [targetDate]: { minutes: targetMinutes, seconds: targetSeconds ?? 0, items: targetItems, customItems: targetCustomItems ?? [], notes: targetNotes, equipment: targetEquipment, drumsetMinutes: targetDrumsetMinutes ?? null, padMinutes: targetPadMinutes ?? null } }));
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
    const { data: exerciseRow } = await supabase.from("practice_exercises").select("id").eq("name_en", itemEn).maybeSingle();
    const { error } = await supabase.from("practice_sessions").insert({ user_id: user.id, practice_exercise_id: exerciseRow?.id ?? null, bpm, rating, duration_minutes: durationMinutes, practiced_on: dateKey });
    if (error) { setAuthError(error.message); return false; }
    const newMinutes = (Number(minutes) || 0) + durationMinutes;
    // practice_log_items only links against the flat quick-log catalog (practice_items), which BPM-ladder
    // exercise names don't always exist in — those go into custom_items instead so they still show up
    // in Today's Summary/Calendar chips rather than silently vanishing from the practice_items join.
    const isFlatItem = PRACTICE_ITEMS.some((item) => item.en === itemEn);
    const newSelected = isFlatItem && !selected.includes(itemEn) ? [...selected, itemEn] : selected;
    const newCustomItems = !isFlatItem && !customItems.includes(itemEn) ? [...customItems, itemEn] : customItems;
    setMinutes(String(newMinutes));
    setSelected(newSelected);
    setCustomItems(newCustomItems);
    const isSplit = equipment === "both";
    await saveLogFor(dateKey, newMinutes, newSelected, notes, equipment, isSplit ? (Number(drumsetMinutes) || 0) : null, isSplit ? (Number(padMinutes) || 0) : null, Number(seconds) || 0, newCustomItems);
    setPracticeSessions((current) => [...current, { item_en: itemEn, bpm, rating, duration_minutes: durationMinutes, practiced_on: dateKey }]);
    return true;
  }
  async function resetPracticeLevel(itemEn: string, bpm: number) {
    if (!user) return false;
    const { data: exerciseRow } = await supabase.from("practice_exercises").select("id").eq("name_en", itemEn).maybeSingle();
    if (!exerciseRow) return false;
    const { error } = await supabase.from("practice_sessions").delete().eq("user_id", user.id).eq("practice_exercise_id", exerciseRow.id).eq("bpm", bpm);
    if (error) { setAuthError(error.message); return false; }
    setPracticeSessions((current) => current.filter((s) => !(s.item_en === itemEn && s.bpm === bpm)));
    return true;
  }
  async function resetPractice() {
    if (logs[dateKey]) await deleteLogFor(dateKey);
    setMinutes("0");
    setSeconds("0");
    setSelected([]);
    setCustomItems([]);
    setNotes("");
    setEquipment(null);
    setDrumsetMinutes("");
    setPadMinutes("");
  }
  async function save() {
    const isSplit = equipment === "both";
    const ok = await saveLogFor(dateKey, Number(minutes) || 0, selected, notes, equipment, isSplit ? (Number(drumsetMinutes) || 0) : null, isSplit ? (Number(padMinutes) || 0) : null, Number(seconds) || 0, customItems);
    if (ok) { setSaved(true); setTimeout(() => setSaved(false), 2200); }
  }
  function toggle(item: string) { setSelected((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item]); }
  async function addMetronomePractice(addedSeconds: number, items: string[], otherNote: string) {
    const totalSeconds = (Number(minutes) || 0) * 60 + (Number(seconds) || 0) + addedSeconds;
    const newMinutes = Math.floor(totalSeconds / 60);
    const newSeconds = totalSeconds % 60;
    const newSelected = items.length ? Array.from(new Set([...selected, ...items])) : selected;
    const newCustomItems = otherNote ? Array.from(new Set([...customItems, otherNote])) : customItems;
    setMinutes(String(newMinutes));
    setSeconds(String(newSeconds));
    setSelected(newSelected);
    setCustomItems(newCustomItems);
    const isSplit = equipment === "both";
    await saveLogFor(dateKey, newMinutes, newSelected, notes, equipment, isSplit ? (Number(drumsetMinutes) || 0) : null, isSplit ? (Number(padMinutes) || 0) : null, newSeconds, newCustomItems);
  }
  async function signOut() { await supabase.auth.signOut(); }
  if (passwordRecovery) return <ResetPassword onDone={() => setPasswordRecovery(false)} />;
  if (loading) return <main className="shell"><div className="auth-shell"><p className="eyebrow">DRUM PROGRESS</p><h1>LOADING<span>.</span></h1></div></main>;
  if (!user) return <Login error={authError} setError={setAuthError} />;
  return <main className="shell">
    {tab === "today" && <Today streak={streak} longestStreak={longestStreak} daysThisYear={daysThisYear} showDaysThisYear={showDaysThisYear} pinnedExercises={pinnedExercises} practiceSessions={practiceSessions} user={user} dailyGoal={dailyGoal} logs={logs} saveLogFor={saveLogFor} deleteLogFor={deleteLogFor} confirm={askConfirm} openSettings={() => setTab("settings")} displayName={displayName} language={language} T={T} />}
    {tab === "practice" && <PracticeMode step={practiceStep} setStep={setPracticeStep} category={practiceCategory} setCategory={setPracticeCategory} exercise={practiceExercise} setExercise={setPracticeExercise} bpm={practiceBpm} setBpm={setPracticeBpm} pendingMinutes={pendingSessionMinutes} setPendingMinutes={setPendingSessionMinutes} sessions={practiceSessions} onLogSession={logPracticeSession} onResetLevel={resetPracticeLevel} pinnedExercises={pinnedExercises} onTogglePin={togglePin} minutes={minutes} setMinutes={setMinutes} seconds={seconds} selected={selected} toggle={toggle} notes={notes} setNotes={setNotes} equipment={equipment} setEquipment={setEquipment} drumsetMinutes={drumsetMinutes} setDrumsetMinutes={setDrumsetMinutes} padMinutes={padMinutes} setPadMinutes={setPadMinutes} save={save} onReset={resetPractice} saved={saved} dailyGoal={dailyGoal} logs={logs} confirm={askConfirm} openMetronome={() => setMetronome(true)} metronomeTone={metronomeTone} user={user} setError={setAuthError} language={language} T={T} />}
    {tab === "group" && <Group user={user} setError={setAuthError} logs={logs} dailyGoal={dailyGoal} saveLogFor={saveLogFor} deleteLogFor={deleteLogFor} confirm={askConfirm} language={language} T={T} />}
    {tab === "progress" && <Progress practiceSessions={practiceSessions} logs={logs} user={user} language={language} T={T} />}
    {tab === "settings" && <Settings signOut={signOut} user={user} setError={setAuthError} profileName={displayName} onProfileNameSaved={setProfileName} language={language} onLanguageSaved={setLanguage} dailyGoal={dailyGoal} onGoalSaved={setDailyGoal} metronomeTone={metronomeTone} onMetronomeToneSaved={setMetronomeTone} showDaysThisYear={showDaysThisYear} onShowDaysThisYearSaved={setShowDaysThisYear} onBack={() => setTab("today")} T={T} />}
    {authError && <button className="error-toast" onClick={() => setAuthError("")}>{authError} ×</button>}
    <nav className="bottom-nav">{NAV_TABS.map((id) => <button key={id} className={tab === id ? "active" : ""} onClick={() => { setTab(id); if (id === "practice") setPracticeStep("category"); }}><span>{NAV_ICONS[id]}</span>{T.nav[id]}</button>)}</nav>
    <Metronome open={metronome} close={() => setMetronome(false)} onAddPractice={addMetronomePractice} tone={metronomeTone} language={language} T={T} />
    {confirmState && <ConfirmModal message={confirmState.message} onConfirm={() => { confirmState.resolve(true); setConfirmState(null); }} onCancel={() => { confirmState.resolve(false); setConfirmState(null); }} T={T} />}
  </main>;
}

function Login({ error, setError }: { error: string; setError: (message: string) => void }) {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [mode, setMode] = useState<"login" | "signup" | "forgot">("login"); const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true); setError("");
    if (mode === "forgot") {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
      setBusy(false);
      if (resetError) setError(resetError.message); else setError("Check your email for a password reset link.");
      return;
    }
    const result = mode === "login" ? await supabase.auth.signInWithPassword({ email, password }) : await supabase.auth.signUp({ email, password });
    setBusy(false); if (result.error) setError(result.error.message); else if (mode === "signup") setError("Check your email to confirm your account, then sign in.");
  }
  async function google() { setBusy(true); const { error: oauthError } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } }); if (oauthError) { setError(oauthError.message); setBusy(false); } }
  return <main className="shell"><section className="auth-shell"><h1>Drum Progress App</h1><p>Build your daily drumming habit, one session at a time.</p><div className="auth-card">
    <h2>{mode === "login" ? "Welcome back" : mode === "signup" ? "Start your streak" : "Reset your password"}</h2>
    <input type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} />
    {mode !== "forgot" && <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />}
    {mode === "login" && <button className="auth-forgot" onClick={() => { setMode("forgot"); setError(""); }}>Forgot password?</button>}
    <button className="auth-primary" disabled={busy || !email || (mode !== "forgot" && !password)} onClick={submit}>{busy ? "Please wait..." : mode === "login" ? "Log in" : mode === "signup" ? "Create account" : "Send reset link"}</button>
    {mode !== "forgot" && <div className="or">OR</div>}
    {mode !== "forgot" && <button className="google" disabled={busy} onClick={google}>G <span>Continue with Google</span></button>}
    <button className="auth-switch" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}>{mode === "login" ? "New here? Create an account" : mode === "signup" ? "Already have an account? Log in" : "Back to log in"}</button>
  </div>{error && <p className="auth-error">{error}</p>}</section></main>;
}
function ResetPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit() {
    setBusy(true); setError("");
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) setError(updateError.message); else onDone();
  }
  return <main className="shell"><section className="auth-shell"><h1>Drum Progress App</h1><p>Choose a new password for your account.</p><div className="auth-card"><h2>Set a new password</h2><input type="password" placeholder="New password" value={password} onChange={e => setPassword(e.target.value)} /><button className="auth-primary" disabled={busy || !password} onClick={submit}>{busy ? "Please wait..." : "Update password"}</button></div>{error && <p className="auth-error">{error}</p>}</section></main>;
}

function HomeChallenges({ user, practiceSessions, language, T }: any) {
  const [challenges, setChallenges] = useState<any[]>([]);
  const [logsCache, setLogsCache] = useState<Record<string, ChallengeLogEntry>>({});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("personal_challenges").select("id,exercise_en,target_minutes,target_bpm,length_days,start_date").eq("user_id", user.id).order("start_date", { ascending: false });
      const list = data ?? [];
      if (cancelled) return;
      setChallenges(list);
      if (!list.length) { setLogsCache({}); return; }
      const earliestStart = list.reduce((min: string, c: any) => (c.start_date < min ? c.start_date : min), list[0].start_date);
      const cache = await fetchChallengeLogsCache(user.id, earliestStart);
      if (!cancelled) setLogsCache(cache);
    })();
    return () => { cancelled = true; };
  }, [user]);
  const active = challenges
    .map((c) => ({ ...c, ...evaluateChallenge(c, practiceSessions, logsCache) }))
    .filter((c) => c.status === "active");
  if (!active.length) return null;
  return <div className="home-pinned">
    <span className="section-sublabel">{T.personalChallenges.homeTitle}</span>
    {active.map((c) => <div key={c.id} className="home-pinned-row">
      <div className="home-pinned-head"><span className="home-pinned-name">{challengeExerciseLabel(c.exercise_en, language)}</span><span className="home-pinned-time">{T.personalChallenges.statusActive(c.completedCount, c.length_days)}</span></div>
      <div className="personal-challenge-dots home-challenge-dots">{c.days.map((d: any) => <i key={d.date} className={`pc-dot ${d.valid === true ? "hit" : d.valid === false ? "miss" : "pending"}`} />)}</div>
    </div>)}
  </div>;
}
function Today({ streak, longestStreak, daysThisYear, showDaysThisYear, pinnedExercises, practiceSessions, user, dailyGoal, logs, saveLogFor, deleteLogFor, confirm, openSettings, displayName, language, T }: any) {
  const todayLog: Log | undefined = logs[dateKey];
  const todayMinutes = todayLog?.minutes ?? 0;
  const goalAchieved = todayMinutes >= dailyGoal;
  const goalPct = Math.min(100, (todayMinutes / Math.max(1, dailyGoal)) * 100);
  const TIER_LABEL: Record<string, string> = { beginner: T.practiceMode.tierBeginner, intermediate: T.practiceMode.tierIntermediate, advanced: T.practiceMode.tierAdvanced, legend: T.practiceMode.tierLegend };
  return <section className="page today">
    <header className="hero"><div><h1 className="today-hero-heading">{T.today.heroLine1}<br/>{T.today.heroLine1b}<br/><i>{T.today.heroLine2}</i></h1></div><button className="avatar settings-avatar" onClick={openSettings} aria-label={T.nav.settings}>{NAV_ICONS.settings}</button></header>
    <div className="form-card stats-tile"><div className={showDaysThisYear ? "stats" : "stats stats-2"}><Stat label={T.today.currentStreak} value={String(streak) + " " + T.today.days} /><Stat label={T.calendar.longestStreak} value={String(longestStreak) + " " + T.today.days} />{showDaysThisYear && <Stat label={T.calendar.daysThisYear} value={String(daysThisYear) + " / 365"} />}</div></div>
    <div className="form-card">
      <label className="input-label">{T.today.todaySummary}</label>
      <div className="goal-progress"><div className="goal-progress-label"><span>{T.today.goalLabel}</span><strong className={goalAchieved ? "achieved" : ""}>{todayMinutes}/{dailyGoal} min</strong></div><div className="goal-progress-track"><div className={goalAchieved ? "goal-progress-bar achieved" : "goal-progress-bar"} style={{ width: `${goalPct}%` }} /></div></div>
      {todayLog && todayLog.equipment && <span className="roster-equipment">{equipmentSplitLabel(todayLog.drumsetMinutes, todayLog.padMinutes, T) ?? T.calendar.onEquipment(equipmentLabel(todayLog.equipment, T))}</span>}
      {todayLog && todayLog.seconds > 0 && <span className="roster-equipment">+{todayLog.seconds}s</span>}
      {todayLog && (todayLog.items.length > 0 || todayLog.customItems.length > 0) ? <div className="detail-chips">{todayLog.items.map((item: string) => <em key={item}>{practiceItemLabel(item, language)}</em>)}{todayLog.customItems.map((item: string) => <em key={item}>{item}</em>)}</div> : <p className="hint">{T.today.noPracticeYet}</p>}
      {todayLog && todayLog.notes && <p className="today-notes"><b>{T.today.notesPrefix}</b> {todayLog.notes}</p>}
    </div>
    <HomeChallenges user={user} practiceSessions={practiceSessions} language={language} T={T} />
    {pinnedExercises.length > 0 && <div className="home-pinned">
      <span className="section-sublabel">{T.progressPage.pinned}</span>
      <div className="tier-strip tier-strip-header">
        {PRACTICE_TIERS.map((tier) => <div key={tier.key} className="tier-seg"><span className="seg-label">{TIER_LABEL[tier.key]}</span></div>)}
      </div>
      {pinnedExercises.slice(0, MAX_PINNED_EXERCISES).map((en: string) => {
        const label = PRACTICE_EXERCISES.find((e) => e.en === en)?.[language as Lang] ?? en;
        const unlockedLevels = BPM_LEVELS.filter((level) => qualifyingMinutesFor(practiceSessions, en, level) >= UNLOCK_MINUTES);
        const bestBpm = unlockedLevels.length ? Math.max(...unlockedLevels) : null;
        const totalMinutes = practiceSessions.filter((s: any) => s.item_en === en).reduce((sum: number, s: any) => sum + s.duration_minutes, 0);
        return <div key={en} className="home-pinned-row">
          <div className="home-pinned-head"><span className="home-pinned-name">{label}</span><span className="home-pinned-time">{formatMinutes(totalMinutes)}</span></div>
          {unlockedLevels.length > 0 ? <div className="home-pinned-meta">
            <span className="home-pinned-bpm">{bestBpm} BPM</span>
            <div className="home-pinned-tiers">
              {PRACTICE_TIERS.map((tier) => <div key={tier.key} className={tierIsSkipped(practiceSessions, en, tier) ? "home-pinned-tier-seg skipped" : "home-pinned-tier-seg"}><i style={{ width: `${tierIsSkipped(practiceSessions, en, tier) ? 100 : tierProgressFor(practiceSessions, en, tier)}%` }} /></div>)}
            </div>
          </div> : <span className="home-pinned-bpm">{T.practiceMode.notStarted}</span>}
        </div>;
      })}
    </div>}
    <div className="section-title"><h2>{T.calendar.title}</h2></div>
    <Calendar logs={logs} dailyGoal={dailyGoal} saveLogFor={saveLogFor} deleteLogFor={deleteLogFor} confirm={confirm} language={language} T={T} />
  </section>;
}

type SaveLogFor = (targetDate: string, targetMinutes: number, targetItems: string[], targetNotes: string, targetEquipment: string | null, targetDrumsetMinutes?: number | null, targetPadMinutes?: number | null, targetSeconds?: number, targetCustomItems?: string[]) => Promise<boolean>;

function Calendar({ logs, dailyGoal, saveLogFor, deleteLogFor, confirm, language, T }: { logs: Record<string, Log>; dailyGoal: number; saveLogFor: SaveLogFor; deleteLogFor: (date: string) => Promise<boolean>; confirm: (message: string) => Promise<boolean>; language: Lang; T: any }) {
  const today = new Date(); const [selectedDate, setSelectedDate] = useState(dateKey); const [viewDate, setViewDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1)); const year = viewDate.getFullYear(); const month = viewDate.getMonth(); const days = new Date(year, month + 1, 0).getDate(); const starts = (new Date(year, month, 1).getDay() + 6) % 7; const selectedLog = logs[selectedDate];
  const locale = language === "es" ? "es-ES" : "en-US";
  const [summaryDate, setSummaryDate] = useState<string | null>(null);
  function changeMonth(delta: number) { setViewDate(new Date(year, month + delta, 1)); }
  function tapDay(key: string) {
    setSelectedDate(key);
    if (key < dateKey) setSummaryDate(key);
  }
  const isFuture = selectedDate > dateKey;
  return <>
    <div className="calendar-card"><div className="cal-head"><button onClick={() => changeMonth(-1)}>‹</button><h2>{viewDate.toLocaleString(locale, { month: "long", year: "numeric" })}</h2><button onClick={() => changeMonth(1)}>›</button></div><div className="week">{T.calendar.weekdays.map((x: string, i: number)=><span key={i}>{x}</span>)}</div><div className="days">{Array.from({ length: starts }).map((_,i)=><i key={"b" + i}/>)}{Array.from({ length: days }).map((_,i) => { const d=i+1; const key = formatLocalDate(year, month, d); const isToday=d===today.getDate() && month===today.getMonth() && year===today.getFullYear(); const done=(logs[key]?.minutes ?? 0) > 0; const className=(isToday ? "is-today " : "") + (selectedDate === key ? "is-selected " : "") + (done ? "done" : ""); return <button key={d} onClick={() => tapDay(key)} className={className}><span>{d}</span>{done && <b>✓</b>}</button> })}</div></div>
    <div className="day-detail"><span>{new Date(selectedDate + "T12:00:00").toLocaleDateString(locale, { weekday: "long", month: "long", day: "numeric" })}</span>
      {isFuture && <p>{T.calendar.futureDay}</p>}
      {!isFuture && (selectedLog && selectedLog.minutes > 0 ? <><strong>{selectedLog.minutes} {T.calendar.minPractised}{selectedLog.seconds > 0 ? ` +${selectedLog.seconds}s` : ""}</strong><div className="detail-chips">{selectedLog.items.map((item) => <em key={item}>{practiceItemLabel(item, language)}</em>)}{selectedLog.customItems.map((item) => <em key={item}>{item}</em>)}</div>{selectedLog.notes && <p>{selectedLog.notes}</p>}</> : <p>{T.calendar.noPractice}</p>)}
    </div>
    {summaryDate && <DaySummaryModal date={summaryDate} log={logs[summaryDate]} dailyGoal={dailyGoal} logs={logs} locale={locale} language={language} T={T}
      onClose={() => setSummaryDate(null)} onSave={saveLogFor} onDelete={deleteLogFor} confirm={confirm} />}
  </>;
}
function ConfirmModal({ message, onConfirm, onCancel, T }: { message: string; onConfirm: () => void; onCancel: () => void; T: any }) {
  return <div className="modal modal-center" onClick={onCancel}>
    <div className="confirm-card" onClick={(e) => e.stopPropagation()}>
      <p className="confirm-message">{message}</p>
      <div className="confirm-actions">
        <button className="confirm-cancel" onClick={onCancel}>{T.confirm.cancel}</button>
        <button className="confirm-danger" onClick={onConfirm}>{T.confirm.confirm}</button>
      </div>
    </div>
  </div>;
}
function DaySummaryModal({ date, log, dailyGoal, logs, locale, language, T, onClose, onSave, onDelete, confirm, roster }: {
  date: string; log?: Log; dailyGoal: number; logs: Record<string, Log>; locale: string; language: Lang; T: any;
  onClose: () => void; onSave: SaveLogFor; onDelete: (date: string) => Promise<boolean>; confirm: (message: string) => Promise<boolean>;
  roster?: { members: { id: string; name: string; color: string }[]; dayLogs: Record<string, { minutes: number; seconds: number; equipment: string | null; drumsetMinutes: number | null; padMinutes: number | null; items: string[]; customItems: string[]; notes: string }>; currentUserId: string };
}) {
  const [editing, setEditing] = useState(false);
  const streakHere = calculateStreaks(logs, date).current;
  const hasPractice = !!log && log.minutes > 0;
  const rosterRows = roster ? roster.members.filter((m) => (roster.dayLogs[m.id]?.minutes ?? 0) > 0).map((m) => ({ ...m, ...roster.dayLogs[m.id] })).sort((a, b) => b.minutes - a.minutes) : null;
  return <div className="modal modal-center" onClick={onClose}><div className="day-summary" onClick={(e) => e.stopPropagation()}>
    <button className="close" onClick={onClose}>×</button>
    <div className="ds-head">
      {editing && <button className="ds-back" onClick={() => setEditing(false)}>‹</button>}
      <span className="eyebrow">{new Date(date + "T12:00:00").toLocaleDateString(locale, { weekday: "long", month: "long", day: "numeric" })}</span>
    </div>
    {editing ? <DayEditor key={date} date={date} log={log} onSave={onSave} onDelete={onDelete} confirm={confirm} language={language} T={T} /> : <>
      {roster ? (
        rosterRows && rosterRows.length ? <div className="challenge-ranking">{rosterRows.map((m) => <div key={m.id} className="roster-detail-row">
          <i style={{ width: 8, height: 8, borderRadius: "50%", background: m.color, flexShrink: 0, marginTop: 4 }} />
          <div className="roster-detail-info">
            <div className="roster-detail-head"><span className="rank-name">{m.id === roster!.currentUserId ? T.group.you : m.name}</span><span className="rank-value">{m.minutes} {T.group.minutesShort}{m.seconds > 0 ? ` +${m.seconds}s` : ""}</span></div>
            {m.equipment && <span className="roster-equipment">{equipmentSplitLabel(m.drumsetMinutes, m.padMinutes, T) ?? T.calendar.onEquipment(equipmentLabel(m.equipment, T))}</span>}
            {((m.items && m.items.length > 0) || (m.customItems && m.customItems.length > 0)) && <div className="detail-chips">{m.items.map((item) => <em key={item}>{practiceItemLabel(item, language)}</em>)}{(m.customItems ?? []).map((item) => <em key={item}>{item}</em>)}</div>}
            {m.notes && <p className="today-notes"><b>{T.today.notesPrefix}</b> {m.notes}</p>}
          </div>
        </div>)}</div> : <p className="hint">{T.group.noOnePractised}</p>
      ) : (
        hasPractice && log ? <>
          <strong className="ds-minutes">{log.minutes} {T.calendar.minPractised}{log.seconds > 0 ? ` +${log.seconds}s` : ""}{log.equipment ? ` - ${equipmentSplitLabel(log.drumsetMinutes, log.padMinutes, T) ?? T.calendar.onEquipment(equipmentLabel(log.equipment, T))}` : ""}</strong>
          {(log.items.length > 0 || log.customItems.length > 0) && <div className="detail-chips">{log.items.map((item) => <em key={item}>{practiceItemLabel(item, language)}</em>)}{log.customItems.map((item) => <em key={item}>{item}</em>)}</div>}
          {log.notes && <p className="today-notes"><b>{T.today.notesPrefix}</b> {log.notes}</p>}
          <p className={log.minutes >= dailyGoal ? "ds-goal met" : "ds-goal"}>{log.minutes >= dailyGoal ? T.calendar.goalMet : T.calendar.goalMissed(log.minutes, dailyGoal)}</p>
          {streakHere > 1 && <p className="ds-streak">{T.calendar.streakOnDay(streakHere)}</p>}
        </> : <p className="hint">{T.calendar.noPracticeShort}</p>
      )}
      <button className="secondary" onClick={() => setEditing(true)}>{hasPractice ? T.calendar.editDay : T.calendar.nothingToEdit}</button>
    </>}
  </div></div>;
}

function DayEditor({ date, log, onSave, onDelete, confirm, language, T }: { date: string; log?: Log; onSave: SaveLogFor; onDelete: (date: string) => Promise<boolean>; confirm: (message: string) => Promise<boolean>; language: Lang; T: any }) {
  const [minutes, setMinutes] = useState(String(log?.minutes ?? ""));
  const [selected, setSelected] = useState<string[]>(log?.items ?? []);
  const [notes, setNotes] = useState(log?.notes ?? "");
  const [equipment, setEquipment] = useState<string | null>(log?.equipment ?? null);
  const [drumsetMinutes, setDrumsetMinutes] = useState(log?.drumsetMinutes != null ? String(log.drumsetMinutes) : "");
  const [padMinutes, setPadMinutes] = useState(log?.padMinutes != null ? String(log.padMinutes) : "");
  const [notesOpen, setNotesOpen] = useState(false);
  const showNotes = notesOpen || !!notes;
  const [hasEntry, setHasEntry] = useState(!!log);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  function toggle(item: string) { setSelected((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item]); }
  function handleEquipmentToggle(value: "drumset" | "pad") {
    const next = toggleEquipmentValue(equipment, value);
    setEquipment(next);
    if (next === "both") { setDrumsetMinutes(String(Number(minutes) || 0)); setPadMinutes("0"); }
    else { setDrumsetMinutes(""); setPadMinutes(""); }
  }
  function updateDrumsetMinutes(value: string) { setDrumsetMinutes(value); setMinutes(String((Number(value) || 0) + (Number(padMinutes) || 0))); }
  function updatePadMinutes(value: string) { setPadMinutes(value); setMinutes(String((Number(drumsetMinutes) || 0) + (Number(value) || 0))); }
  async function handleSave() {
    setBusy(true);
    const isSplit = equipment === "both";
    const ok = await onSave(date, Number(minutes) || 0, selected, notes, equipment, isSplit ? (Number(drumsetMinutes) || 0) : null, isSplit ? (Number(padMinutes) || 0) : null, log?.seconds ?? 0, log?.customItems ?? []);
    setBusy(false);
    if (ok) { setSaved(true); setHasEntry(true); setTimeout(() => setSaved(false), 1800); }
  }
  async function handleDelete() {
    if (!(await confirm(T.calendar.confirmDeleteEntry))) return;
    setBusy(true);
    const ok = await onDelete(date);
    setBusy(false);
    if (ok) { setMinutes(""); setSelected([]); setNotes(""); setEquipment(null); setDrumsetMinutes(""); setPadMinutes(""); setHasEntry(false); }
  }
  return <>
  <div className="form-card">
    <label className="input-label">{T.today.howLong}</label>
    {equipment === "both" ? (
      <div className="split-minutes">
        <div className="split-minutes-field">
          <span className="split-minutes-label">{T.today.drumset}</span>
          <div className="minutes-island compact">
            <button className="minutes-step" onClick={() => updateDrumsetMinutes(String(Math.max(0, (Number(drumsetMinutes) || 0) - 5)))}>-5</button>
            <div className="minutes-value"><input inputMode="numeric" size={3} value={drumsetMinutes} onChange={(e) => updateDrumsetMinutes(e.target.value.replace(/\D/g, ""))} /><span>min</span></div>
            <button className="minutes-step" onClick={() => updateDrumsetMinutes(String((Number(drumsetMinutes) || 0) + 5))}>+5</button>
          </div>
        </div>
        <div className="split-minutes-field">
          <span className="split-minutes-label">{T.today.pad}</span>
          <div className="minutes-island compact">
            <button className="minutes-step" onClick={() => updatePadMinutes(String(Math.max(0, (Number(padMinutes) || 0) - 5)))}>-5</button>
            <div className="minutes-value"><input inputMode="numeric" size={3} value={padMinutes} onChange={(e) => updatePadMinutes(e.target.value.replace(/\D/g, ""))} /><span>min</span></div>
            <button className="minutes-step" onClick={() => updatePadMinutes(String((Number(padMinutes) || 0) + 5))}>+5</button>
          </div>
        </div>
      </div>
    ) : (
      <div className="minutes-island">
        <button className="minutes-step" onClick={() => setMinutes(String(Math.max(0, (Number(minutes) || 0) - 5)))}>-5</button>
        <button className="minutes-step" onClick={() => setMinutes(String(Math.max(0, (Number(minutes) || 0) - 1)))}>-1</button>
        <div className="minutes-value"><input inputMode="numeric" size={3} value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ""))} /><span>min</span></div>
        <button className="minutes-step" onClick={() => setMinutes(String((Number(minutes) || 0) + 1))}>+1</button>
        <button className="minutes-step" onClick={() => setMinutes(String((Number(minutes) || 0) + 5))}>+5</button>
      </div>
    )}
    </div>
    <div className="form-card">
    <label className="input-label checklist-label">{T.today.whatPractised}</label>
    <div className="chips">{PRACTICE_ITEMS.map((item) => <button key={item.en} onClick={() => toggle(item.en)} className={selected.includes(item.en) ? "chip selected" : "chip"}>{selected.includes(item.en) && <b>✓</b>}{item[language]}</button>)}</div>
    <label className="input-label equipment-label">{T.today.equipment}</label>
    <div className="equipment-toggle">
      <button className={equipment === "drumset" || equipment === "both" ? "equipment-option selected" : "equipment-option"} onClick={() => handleEquipmentToggle("drumset")}>{T.today.drumset}</button>
      <button className={equipment === "pad" || equipment === "both" ? "equipment-option selected" : "equipment-option"} onClick={() => handleEquipmentToggle("pad")}>{T.today.pad}</button>
    </div>
    {showNotes ? <><label className="input-label notes-label">{T.today.notes} <em>{T.today.optional}</em></label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={T.calendar.notesPlaceholder} autoFocus={notesOpen} /></> : <button className="notes-toggle" onClick={() => setNotesOpen(true)}>{T.today.addNotes}</button>}
    <button className={saved ? "save saved" : "save"} onClick={handleSave} disabled={busy}>{saved ? T.today.practiceSaved : busy ? T.calendar.saving : T.today.savePractice}<span>→</span></button>
    {hasEntry && <button className="delete-entry" onClick={handleDelete} disabled={busy}>{T.calendar.deleteEntry}</button>}
  </div>
  </>;
}
function Stat({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><strong>{value}</strong></div>; }

function Group({ user, setError, logs, dailyGoal, saveLogFor, deleteLogFor, confirm, language, T }: { user: any; setError: (message: string) => void; logs: Record<string, Log>; dailyGoal: number; saveLogFor: SaveLogFor; deleteLogFor: (date: string) => Promise<boolean>; confirm: (message: string) => Promise<boolean>; language: Lang; T: any }) {
  const [mode, setMode] = useState<"start" | "create" | "join">("start"); const [name, setName] = useState(""); const [code, setCode] = useState(""); const [groups, setGroups] = useState<any[]>([]); const [activeGroupId, setActiveGroupId] = useState<string | null>(null); const [addingGroup, setAddingGroup] = useState(false); const [busy, setBusy] = useState(false);
  const group = useMemo(() => groups.find((g) => g.id === activeGroupId) ?? null, [groups, activeGroupId]);
  const [groupLoading, setGroupLoading] = useState(true);
  const [members, setMembers] = useState<{ id: string; name: string; color: string }[]>([]);
  const [totals, setTotals] = useState<{ id: string; name: string; total: number }[]>([]);
  const [daysTotals, setDaysTotals] = useState<{ id: string; name: string; days: number; totalDays: number }[]>([]);
  const [viewDate, setViewDate] = useState(() => new Date());
  const [monthLogs, setMonthLogs] = useState<Record<string, Record<string, number>>>({});
  const [summaryDayKey, setSummaryDayKey] = useState<string | null>(null);
  const [dayDetailLogs, setDayDetailLogs] = useState<Record<string, { minutes: number; seconds: number; equipment: string | null; drumsetMinutes: number | null; padMinutes: number | null; items: string[]; customItems: string[]; notes: string }>>({});
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
  const [messages, setMessages] = useState<{ id: string; user_id: string; message: string; created_at: string }[]>([]);
  const [chatText, setChatText] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const locale = language === "es" ? "es-ES" : "en-US";
  const presetOptions = [
    { ...CHALLENGE_PRESETS[0], label: T.group.presetDaily5 },
    { ...CHALLENGE_PRESETS[1], label: T.group.presetDaily30x5 },
    { ...CHALLENGE_PRESETS[2], label: T.group.presetSessions3weekly },
    { ...CHALLENGE_PRESETS[3], label: T.group.presetDaily5x20 },
  ];
  useEffect(() => {
    supabase.from("group_members").select("groups(id,name,invite_code,created_at,created_by)").eq("user_id", user.id).order("joined_at", { ascending: true }).then(({ data }) => {
      const list = (data ?? []).map((row: any) => row.groups).filter(Boolean);
      setGroups(list);
      setActiveGroupId((current) => (current && list.some((g: any) => g.id === current)) ? current : (list[0]?.id ?? null));
      setGroupLoading(false);
    });
  }, [user]);
  useEffect(() => {
    if (!group) { setMembers([]); setTotals([]); setDaysTotals([]); setChallenges([]); return; }
    supabase.from("group_members").select("user_id, profiles(name, color)").eq("group_id", group.id).order("user_id").then(({ data }) => {
      const memberList = (data ?? []).map((row: any) => ({ id: row.user_id, name: row.profiles?.name ?? "Drummer", color: row.profiles?.color ?? autoColorForUserId(row.user_id) }));
      setMembers(memberList);
      const memberIds = memberList.map((m) => m.id);
      if (!memberIds.length) return;
      const since = String(group.created_at).slice(0, 10);
      supabase.from("practice_logs").select("user_id, minutes").in("user_id", memberIds).gte("practiced_on", since).then(({ data: logRows }) => {
        const sums: Record<string, number> = {};
        (logRows ?? []).forEach((row: any) => { sums[row.user_id] = (sums[row.user_id] ?? 0) + row.minutes; });
        setTotals(memberList.map((m) => ({ ...m, total: sums[m.id] ?? 0 })).sort((a, b) => b.total - a.total));
      });
      const yearStart = `${dateKey.slice(0, 4)}-01-01`;
      const yearEnd = `${dateKey.slice(0, 4)}-12-31`;
      supabase.from("practice_logs").select("user_id, practiced_on, minutes").in("user_id", memberIds).gte("practiced_on", yearStart).lte("practiced_on", yearEnd).then(({ data: yearRows }) => {
        const daySets: Record<string, Set<string>> = {};
        (yearRows ?? []).forEach((row: any) => {
          if (row.minutes <= 0) return;
          if (!daySets[row.user_id]) daySets[row.user_id] = new Set();
          daySets[row.user_id].add(row.practiced_on);
        });
        setDaysTotals(memberList.map((m) => ({ ...m, days: daySets[m.id]?.size ?? 0, totalDays: 365 })).sort((a, b) => b.days - a.days));
      });
    });
  }, [group]);
  useEffect(() => { loadChallenges(); }, [group, members]);
  async function loadMessages() {
    if (!group) { setMessages([]); return; }
    const { data } = await supabase.from("group_messages").select("id,user_id,message,created_at").eq("group_id", group.id).order("created_at", { ascending: true }).limit(50);
    setMessages(data ?? []);
  }
  useEffect(() => { loadMessages(); }, [group]);
  useEffect(() => {
    if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [messages]);
  useEffect(() => {
    if (!group) return;
    const interval = setInterval(loadMessages, 8000);
    return () => clearInterval(interval);
  }, [group]);
  function nameFor(userId: string) {
    if (userId === user.id) return T.group.you;
    return members.find((m) => m.id === userId)?.name ?? "Drummer";
  }
  async function sendMessage() {
    const text = chatText.trim();
    if (!text || !group) return;
    setChatBusy(true);
    const { error } = await supabase.from("group_messages").insert({ group_id: group.id, user_id: user.id, message: text });
    setChatBusy(false);
    if (error) { setError(error.message ?? T.group.couldNotSend); return; }
    setChatText("");
    loadMessages();
  }
  useEffect(() => {
    if (!group || !members.length) { setMonthLogs({}); return; }
    const year = viewDate.getFullYear(); const month = viewDate.getMonth();
    const monthStart = formatLocalDate(year, month, 1);
    const monthEnd = formatLocalDate(year, month, new Date(year, month + 1, 0).getDate());
    const memberIds = members.map((m) => m.id);
    supabase.from("practice_logs").select("practiced_on, user_id, minutes").in("user_id", memberIds).gte("practiced_on", monthStart).lte("practiced_on", monthEnd).then(({ data }) => {
      const byDay: Record<string, Record<string, number>> = {};
      (data ?? []).forEach((row: any) => { if (row.minutes > 0) byDay[row.practiced_on] = { ...(byDay[row.practiced_on] ?? {}), [row.user_id]: row.minutes }; });
      setMonthLogs(byDay);
    });
  }, [group, members, viewDate]);
  useEffect(() => {
    if (!summaryDayKey || !members.length) { setDayDetailLogs({}); return; }
    const memberIds = members.map((m) => m.id);
    supabase.from("practice_logs").select("user_id,minutes,seconds,notes,equipment,drumset_minutes,pad_minutes,custom_items,practice_log_items(practice_items(name_en))").eq("practiced_on", summaryDayKey).in("user_id", memberIds).then(({ data }) => {
      const byUser: Record<string, { minutes: number; seconds: number; equipment: string | null; drumsetMinutes: number | null; padMinutes: number | null; items: string[]; customItems: string[]; notes: string }> = {};
      (data ?? []).forEach((row: any) => {
        byUser[row.user_id] = { minutes: row.minutes, seconds: row.seconds ?? 0, equipment: row.equipment ?? null, drumsetMinutes: row.drumset_minutes ?? null, padMinutes: row.pad_minutes ?? null, customItems: row.custom_items ?? [], notes: row.notes ?? "", items: (row.practice_log_items ?? []).map((entry: any) => entry.practice_items?.name_en).filter(Boolean) };
      });
      setDayDetailLogs(byUser);
    });
  }, [summaryDayKey, members]);
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
    if (!(await confirm(T.group.confirmDeleteChallenge))) return;
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
  async function createGroup() {
    setBusy(true);
    const invite = Math.random().toString(36).slice(2, 8).toUpperCase();
    const { data, error } = await supabase.from("groups").insert({ name, invite_code: invite, created_by: user.id }).select().single();
    if (!error && data) {
      const member = await supabase.from("group_members").insert({ group_id: data.id, user_id: user.id, role: "owner" });
      if (!member.error) { setGroups((current) => [...current, data]); setActiveGroupId(data.id); setAddingGroup(false); setMode("start"); setName(""); }
      else setError(member.error.message);
    } else setError(error?.message ?? T.group.couldNotCreate);
    setBusy(false);
  }
  async function joinGroup() {
    setBusy(true);
    const { data, error } = await supabase.from("groups").select("id,name,invite_code,created_at,created_by").eq("invite_code", code.trim().toUpperCase()).maybeSingle();
    if (error || !data) { setError(T.group.inviteNotFound); setBusy(false); return; }
    const member = await supabase.from("group_members").insert({ group_id: data.id, user_id: user.id });
    if (member.error && member.error.code !== "23505") { setError(member.error.message); setBusy(false); return; }
    setGroups((current) => current.some((g) => g.id === data.id) ? current : [...current, data]);
    setActiveGroupId(data.id);
    setAddingGroup(false); setMode("start"); setCode("");
    setBusy(false);
  }
  function copyInvite() { navigator.clipboard.writeText(group.invite_code); setCopied(true); setTimeout(() => setCopied(false), 1500); }
  async function leaveGroup() {
    if (!group) return;
    if (!(await confirm(T.group.confirmLeave))) return;
    const { error, count } = await supabase.from("group_members").delete({ count: "exact" }).eq("group_id", group.id).eq("user_id", user.id);
    if (error) setError(error.message);
    else if (!count) setError(T.group.couldNotLeave);
    else {
      const next = groups.filter((g) => g.id !== group.id);
      setGroups(next);
      setActiveGroupId(next[0]?.id ?? null);
    }
  }
  async function deleteGroup() {
    if (!group) return;
    if (!(await confirm(T.group.confirmDeleteGroup))) return;
    const { error, count } = await supabase.from("groups").delete({ count: "exact" }).eq("id", group.id);
    if (error) setError(error.message);
    else if (!count) setError(T.group.couldNotDeleteGroup);
    else {
      const next = groups.filter((g) => g.id !== group.id);
      setGroups(next);
      setActiveGroupId(next[0]?.id ?? null);
    }
  }
  if (groupLoading) return <section className="page" />;
  if (!addingGroup && group) {
    const year = viewDate.getFullYear(); const month = viewDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOffset = (new Date(year, month, 1).getDay() + 6) % 7;
    const sinceLabel = T.group.since(new Date(group.created_at).toLocaleDateString(locale, { month: "short", day: "numeric" }));
    return <section className="page">
      <header className="simple-head group-head">
        <div><p className="eyebrow">{T.group.yourCrew}</p><h1>{group.name}</h1></div>
        <button className="group-add-btn" onClick={() => { setAddingGroup(true); setMode("start"); }}>+</button>
      </header>
      {groups.length > 1 && <div className="group-switcher">{groups.map((g) => <button key={g.id} className={g.id === activeGroupId ? "chip selected" : "chip"} onClick={() => setActiveGroupId(g.id)}>{g.name}</button>)}</div>}
      <div className="leaderboard"><span className="section-label">{T.group.leaderboard}</span>
        {daysTotals.map((member, idx) => <div key={member.id} className="leaderboard-row"><span className="leaderboard-name">{(idx === 0 ? "🥇 " : idx === 1 ? "🥈 " : idx === 2 ? "🥉 " : "")}{member.id === user.id ? T.group.you : member.name}</span><div className="leaderboard-bar-track"><div className="leaderboard-bar" style={{ width: `${(member.days / Math.max(1, member.totalDays)) * 100}%` }} /></div><span className="leaderboard-value">{member.days} / {member.totalDays}</span></div>)}
      </div>
      <div className="time-card"><span className="section-label">{T.group.timePractised}</span><span className="section-sublabel">{sinceLabel}</span>
        {totals.length <= 3 ? (
          <div className="stats" style={{ gridTemplateColumns: `repeat(${totals.length}, 1fr)` }}>
            {totals.map((member) => <Stat key={member.id} label={member.id === user.id ? T.group.you : member.name} value={formatMinutes(member.total)} />)}
          </div>
        ) : (
          <div className="time-list">
            {totals.map((member) => <div key={member.id} className="time-row">
              <span className="minutes-name">{member.id === user.id ? T.group.you : member.name}</span>
              <span className="list-minutes-value">{formatMinutes(member.total)}</span>
            </div>)}
          </div>
        )}
      </div>
      <div className="group-progress"><span className="section-label">{T.group.progress}</span><div className="calendar-card">
        <div className="cal-head"><button onClick={() => setViewDate(new Date(year, month - 1, 1))}>‹</button><h2>{viewDate.toLocaleString(locale, { month: "long", year: "numeric" })}</h2><button onClick={() => setViewDate(new Date(year, month + 1, 1))}>›</button></div>
        <div className="week">{T.group.weekdaysMon.map((x: string, i: number) => <span key={i}>{x}</span>)}</div>
        <div className="days">
          {Array.from({ length: firstDayOffset }).map((_, i) => <i key={"b" + i} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const d = i + 1; const key = formatLocalDate(year, month, d); const dayMinutes = monthLogs[key] ?? {};
            const dayMemberIds = Object.keys(dayMinutes);
            const className = (key === dateKey ? "is-today " : "") + (dayMemberIds.length > 0 ? "done" : "");
            return <button key={d} className={className} onClick={() => { if (key <= dateKey) setSummaryDayKey(key); }}><span>{d}</span>{dayMemberIds.length > 0 && <div className="day-dots">{members.map((m) => dayMemberIds.includes(m.id) && <i key={m.id} style={{ background: m.color }} />)}</div>}</button>;
          })}
        </div>
        <div className="calendar-legend">{members.map((m) => <span key={m.id}><i style={{ background: m.color }} />{m.id === user.id ? T.group.you : m.name}</span>)}</div>
      </div></div>
      {summaryDayKey && <DaySummaryModal date={summaryDayKey} log={logs[summaryDayKey]} dailyGoal={dailyGoal} logs={logs} locale={locale} language={language} T={T}
        onClose={() => setSummaryDayKey(null)} onSave={saveLogFor} onDelete={deleteLogFor} confirm={confirm}
        roster={{ members, dayLogs: dayDetailLogs, currentUserId: user.id }} />}
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
      <div className="chat-section">
        <div className="section-head"><span className="section-label">{T.group.chat}</span></div>
        <div className="chat-messages" ref={chatScrollRef}>
          {!messages.length ? <p className="hint">{T.group.noMessages}</p> : messages.map((m) => (
            <div key={m.id} className={m.user_id === user.id ? "chat-message mine" : "chat-message"}>
              <span className="chat-message-name">{nameFor(m.user_id)}</span>
              <p className="chat-message-text">{m.message}</p>
            </div>
          ))}
        </div>
        <div className="chat-input-row">
          <input className="group-input chat-input" value={chatText} onChange={(e) => setChatText(e.target.value)} placeholder={T.group.chatPlaceholder} maxLength={300} onKeyDown={(e) => { if (e.key === "Enter") sendMessage(); }} />
          <button className="chat-send" disabled={chatBusy || !chatText.trim()} onClick={sendMessage}>{T.group.send}</button>
        </div>
      </div>
      <div className="group-invite-footer">
        <span className="section-sublabel">{T.group.inviteMsg}</span>
        <button className="invite-chip" onClick={copyInvite}>{copied ? T.group.copied : group.invite_code}</button>
      </div>
      <button className="leave-group-btn" onClick={leaveGroup}>{T.group.leaveGroup}</button>
      {group.created_by === user.id && <button className="delete-group-btn" onClick={deleteGroup}>{T.group.deleteGroupBtn}</button>}
    </section>;
  }
  return <section className="page"><header className="simple-head"><p className="eyebrow">{T.group.practiseTogether}</p><h1>{T.group.yourGroup}</h1></header>
    {groups.length > 0 && <button className="page-back" onClick={() => setAddingGroup(false)}>‹ {T.group.back}</button>}
    <div className="group-card"><div className="group-icon">✦</div><h2>{mode === "start" ? T.group.findCrew : mode === "create" ? T.group.startGroup : T.group.joinCrew}</h2>{mode === "start" ? <><p>{T.group.intro}</p><button className="primary" onClick={() => setMode("create")}>{T.group.createGroupBtn} <span>→</span></button><button className="secondary" onClick={() => setMode("join")}>{T.group.joinWithCode}</button></> : <><input className="group-input" value={mode === "create" ? name : code} onChange={e => mode === "create" ? setName(e.target.value) : setCode(e.target.value)} placeholder={mode === "create" ? T.group.groupNamePlaceholder : T.group.inviteCodePlaceholder}/><button className="primary" disabled={busy || !(mode === "create" ? name : code)} onClick={mode === "create" ? createGroup : joinGroup}>{busy ? T.group.pleaseWait : mode === "create" ? T.group.createGroup : T.group.joinGroup}</button><button className="secondary" onClick={() => setMode("start")}>{T.group.back}</button></>}</div></section>;
}
function Progress({ practiceSessions, logs, user, language, T }: { practiceSessions: { item_en: string; bpm: number; rating: string; duration_minutes: number; practiced_on: string }[]; logs: Record<string, Log>; user: any; language: Lang; T: any }) {
  const TIER_LABEL: Record<string, string> = { beginner: T.practiceMode.tierBeginner, intermediate: T.practiceMode.tierIntermediate, advanced: T.practiceMode.tierAdvanced, legend: T.practiceMode.tierLegend };
  const [wonChallenges, setWonChallenges] = useState<any[]>([]);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await supabase.from("personal_challenges").select("id,exercise_en,target_minutes,target_bpm,length_days,start_date").eq("user_id", user.id);
      const list = data ?? [];
      if (!list.length) { if (!cancelled) setWonChallenges([]); return; }
      const earliestStart = list.reduce((min: string, c: any) => (c.start_date < min ? c.start_date : min), list[0].start_date);
      const logsCache = await fetchChallengeLogsCache(user.id, earliestStart);
      const completed = list.filter((c: any) => evaluateChallenge(c, practiceSessions, logsCache).status === "completed");
      if (!cancelled) setWonChallenges(completed);
    }
    load();
    return () => { cancelled = true; };
  }, [user, practiceSessions]);
  const skillExercises = useMemo(() => {
    const practicedEnSet = new Set(practiceSessions.map((s) => s.item_en));
    return PRACTICE_EXERCISES
      .filter((e) => practicedEnSet.has(e.en))
      .map((e) => ({ en: e.en, label: e[language as Lang], unlockedCount: BPM_LEVELS.filter((level) => qualifyingMinutesFor(practiceSessions, e.en, level) >= UNLOCK_MINUTES).length }))
      .sort((a, b) => b.unlockedCount - a.unlockedCount || a.label.localeCompare(b.label));
  }, [practiceSessions, language]);
  const totals = useMemo(() => {
    const sums: Record<string, number> = {};
    const labelFor: Record<string, string> = {};
    function addMinutes(tag: string, amount: number, label: string) {
      if (amount <= 0) return;
      sums[tag] = (sums[tag] ?? 0) + amount;
      if (!labelFor[tag]) labelFor[tag] = label;
    }
    // Structured Practice Mode sessions (BPM ladder) are tracked with exact per-exercise minutes.
    const structuredMinutesByDay: Record<string, number> = {};
    practiceSessions.forEach((s) => {
      addMinutes(s.item_en, s.duration_minutes, PRACTICE_EXERCISES.find((e) => e.en === s.item_en)?.[language] ?? s.item_en);
      structuredMinutesByDay[s.practiced_on] = (structuredMinutesByDay[s.practiced_on] ?? 0) + s.duration_minutes;
    });
    // Whatever's left of each day's total (after removing structured-session minutes already
    // counted above) is split evenly across that day's tagged items/custom items, so quick-logged
    // practice shows up under the same elements the user actually picked instead of one bucket.
    Object.entries(logs).forEach(([date, log]) => {
      const leftover = Math.max(0, log.minutes - (structuredMinutesByDay[date] ?? 0));
      if (leftover <= 0) return;
      const tags = [...log.items, ...log.customItems];
      if (tags.length === 0) { addMinutes("__unspecified__", leftover, T.progressPage.generalPractice); return; }
      const share = leftover / tags.length;
      tags.forEach((tag) => addMinutes(tag, share, practiceItemLabel(tag, language) !== tag ? practiceItemLabel(tag, language) : tag));
    });
    return Object.keys(sums)
      .map((en) => ({ en, label: labelFor[en], minutes: Math.round(sums[en]) }))
      .filter((t) => t.minutes > 0)
      .sort((a, b) => b.minutes - a.minutes);
  }, [practiceSessions, logs, language, T]);
  return <section className="page"><header className="simple-head"><p className="eyebrow">{T.progressPage.eyebrow}</p><h1>{T.progressPage.title}</h1></header>
    {!totals.length ? <p className="hint">{T.progressPage.noData}</p> : <div className="progress-section">
      <span className="section-label">{T.progressPage.yourPractice}</span>
      <div className="minutes-chart">
        {totals.map((t, idx) => <div key={t.en} className="minutes-row">
          <span className="minutes-rank">{idx + 1}</span>
          <div className="minutes-info">
            <span className="minutes-name">{t.label}</span>
            <span className="list-minutes-value">{formatMinutes(t.minutes)}</span>
          </div>
        </div>)}
      </div>
    </div>}
    <div className="progress-section">
      <span className="section-label">{T.progressPage.skillProgress}</span>
      {!skillExercises.length ? <p className="hint">{T.progressPage.noSkillData}</p> : <><div className="tier-strip tier-strip-header">
        {PRACTICE_TIERS.map((tier) => <div key={tier.key} className="tier-seg"><span className="seg-label">{TIER_LABEL[tier.key]}</span></div>)}
      </div>
      <div className="pinned-list">
        {skillExercises.map((ex) => <div key={ex.en} className="pinned-card">
          <div className="pinned-head"><span className="pinned-name">{ex.label}</span></div>
          <div className="tier-strip">
            {PRACTICE_TIERS.map((tier) => <div key={tier.key} className="tier-seg"><div className={tierIsSkipped(practiceSessions, ex.en, tier) ? "seg-bar skipped" : "seg-bar"}><i style={{ width: `${tierIsSkipped(practiceSessions, ex.en, tier) ? 100 : tierProgressFor(practiceSessions, ex.en, tier)}%` }} /></div></div>)}
          </div>
        </div>)}
      </div></>}
    </div>
    <div className="progress-section achievements-teaser">
      <span className="section-label">{T.progressPage.achievements}</span>
      <p className="achievements-intro">{T.progressPage.achievementsIntro}</p>
      {wonChallenges.length > 0 && <div className="trophy-list">
        {wonChallenges.map((c) => <span key={c.id} className="trophy-chip">🏆 {T.personalChallenges.challengeTitle(challengeExerciseLabel(c.exercise_en, language), c.length_days)}</span>)}
      </div>}
    </div>
  </section>;
}
function PersonalChallenges({ user, practiceSessions, confirm, setError, language, T }: any) {
  const [challenges, setChallenges] = useState<any[]>([]);
  const [logsCache, setLogsCache] = useState<Record<string, { minutes: number; items: string[]; customItems: string[]; updatedAt: string }>>({});
  const [showNew, setShowNew] = useState(false);
  const [exerciseEn, setExerciseEn] = useState(CHALLENGE_EXERCISE_OPTIONS[0]?.en ?? "");
  const [targetMinutes, setTargetMinutes] = useState("10");
  const [targetBpm, setTargetBpm] = useState("");
  const [lengthDays, setLengthDays] = useState("7");
  const [busy, setBusy] = useState(false);
  const isLadder = PRACTICE_EXERCISES.some((e) => e.en === exerciseEn);

  async function loadChallenges() {
    const { data } = await supabase.from("personal_challenges").select("id,exercise_en,target_minutes,target_bpm,length_days,start_date").eq("user_id", user.id).order("start_date", { ascending: false });
    const list = data ?? [];
    setChallenges(list);
    if (!list.length) { setLogsCache({}); return; }
    const earliestStart = list.reduce((min: string, c: any) => (c.start_date < min ? c.start_date : min), list[0].start_date);
    setLogsCache(await fetchChallengeLogsCache(user.id, earliestStart));
  }
  useEffect(() => { loadChallenges(); }, [user]);

  async function createChallenge() {
    setBusy(true);
    const { error } = await supabase.from("personal_challenges").insert({ user_id: user.id, exercise_en: exerciseEn, target_minutes: Number(targetMinutes) || 1, target_bpm: isLadder && targetBpm ? Number(targetBpm) : null, length_days: Number(lengthDays) || 1, start_date: dateKey });
    setBusy(false);
    if (error) { setError(error.message ?? T.personalChallenges.couldNotCreate); return; }
    setShowNew(false); setTargetMinutes("10"); setTargetBpm(""); setLengthDays("7");
    loadChallenges();
  }

  async function deleteChallenge(id: string) {
    if (!(await confirm(T.personalChallenges.confirmDelete))) return;
    const { error } = await supabase.from("personal_challenges").delete().eq("id", id);
    if (error) { setError(error.message); return; }
    loadChallenges();
  }

  async function resetChallenge(id: string) {
    if (!(await confirm(T.personalChallenges.confirmReset))) return;
    const { error } = await supabase.from("personal_challenges").update({ start_date: dateKey }).eq("id", id);
    if (error) { setError(error.message); return; }
    loadChallenges();
  }


  return <>
    <div className="mode-header train-header">
      <span className="mode-icon challenge">🏆</span>
      <div className="mode-copy"><h2>{T.personalChallenges.title}</h2><p>{T.personalChallenges.subtitle}</p></div>
      <button className="mode-action" onClick={() => setShowNew(!showNew)}>{showNew ? T.personalChallenges.cancel : T.personalChallenges.newChallenge}</button>
    </div>
    {showNew && <div className="challenge-form">
      <label className="input-label">{T.personalChallenges.exerciseLabel}</label>
      <select className="group-input" value={exerciseEn} onChange={(e) => { setExerciseEn(e.target.value); setTargetBpm(""); }}>
        {CHALLENGE_EXERCISE_OPTIONS.map((opt) => <option key={opt.en} value={opt.en}>{opt[language as Lang]}</option>)}
      </select>
      <label className="input-label">{T.personalChallenges.minutesLabel}</label>
      <input className="group-input" inputMode="numeric" value={targetMinutes} onChange={(e) => setTargetMinutes(e.target.value.replace(/\D/g, ""))} />
      {isLadder && <><label className="input-label">{T.personalChallenges.bpmLabel}</label>
      <input className="group-input" inputMode="numeric" value={targetBpm} onChange={(e) => setTargetBpm(e.target.value.replace(/\D/g, ""))} placeholder={T.personalChallenges.bpmPlaceholder} /></>}
      <label className="input-label">{T.personalChallenges.lengthLabel}</label>
      <input className="group-input" inputMode="numeric" value={lengthDays} onChange={(e) => setLengthDays(e.target.value.replace(/\D/g, ""))} />
      <button className="primary" disabled={busy || !exerciseEn || !targetMinutes || !lengthDays} onClick={createChallenge}>{busy ? T.personalChallenges.pleaseWait : T.personalChallenges.startChallenge}</button>
    </div>}
    {!challenges.length && !showNew && <p className="hint">{T.personalChallenges.noChallenges}</p>}
    {challenges.map((c) => {
      const { days, completedCount, status } = evaluateChallenge(c, practiceSessions, logsCache);
      return <div key={c.id} className="challenge-card">
        <div className="challenge-head">
          <h3>{T.personalChallenges.challengeTitle(challengeExerciseLabel(c.exercise_en, language), c.length_days)}</h3>
          <button className="challenge-delete" onClick={() => deleteChallenge(c.id)}>{T.personalChallenges.deleteChallenge}</button>
        </div>
        <p className="challenge-desc">{T.personalChallenges.challengeDescription(c.target_minutes, c.target_bpm, c.length_days)}</p>
        {status === "failed" ? (
          <div className="challenge-failed-block">
            <p className="personal-challenge-status failed">{T.personalChallenges.statusFailed}</p>
            <button className="challenge-try-again" onClick={() => resetChallenge(c.id)}>{T.personalChallenges.resetChallenge}</button>
          </div>
        ) : <>
          <div className="personal-challenge-dots">
            {days.map((d) => <i key={d.date} className={`pc-dot ${d.valid === true ? "hit" : d.valid === false ? "miss" : "pending"}`} />)}
          </div>
          <p className={`personal-challenge-status ${status}`}>
            {status === "completed" ? T.personalChallenges.statusCompleted : T.personalChallenges.statusActive(completedCount, c.length_days)}
          </p>
        </>}
      </div>;
    })}
  </>;
}
function PracticeMode({ step, setStep, category, setCategory, exercise, setExercise, bpm, setBpm, pendingMinutes, setPendingMinutes, sessions, onLogSession, onResetLevel, pinnedExercises, onTogglePin, minutes, setMinutes, seconds, selected, toggle, notes, setNotes, equipment, setEquipment, drumsetMinutes, setDrumsetMinutes, padMinutes, setPadMinutes, save, onReset, saved, dailyGoal, logs, confirm, openMetronome, metronomeTone, user, setError, language, T }: any) {
  function handleEquipmentToggle(value: "drumset" | "pad") {
    const next = toggleEquipmentValue(equipment, value);
    setEquipment(next);
    if (next === "both") { setDrumsetMinutes(String(Number(minutes) || 0)); setPadMinutes("0"); }
    else { setDrumsetMinutes(""); setPadMinutes(""); }
  }
  function updateDrumsetMinutes(value: string) { setDrumsetMinutes(value); setMinutes(String((Number(value) || 0) + (Number(padMinutes) || 0))); }
  function updatePadMinutes(value: string) { setPadMinutes(value); setMinutes(String((Number(drumsetMinutes) || 0) + (Number(value) || 0))); }
  const [notesOpen, setNotesOpen] = useState(false);
  const showNotes = notesOpen || !!notes;
  const [whatOpen, setWhatOpen] = useState(false);
  const sortedItems = useMemo(() => {
    const freq: Record<string, number> = {};
    Object.values(logs as Record<string, Log>).forEach((log) => { log.items.forEach((item) => { freq[item] = (freq[item] ?? 0) + 1; }); });
    return [...PRACTICE_ITEMS].sort((a, b) => (freq[b.en] ?? 0) - (freq[a.en] ?? 0));
  }, [logs]);
  function qualifyingMinutesAt(itemEn: string, targetBpm: number) {
    return sessions.filter((s: any) => s.item_en === itemEn && s.bpm === targetBpm && (s.rating === "comfortable" || s.rating === "mastered")).reduce((sum: number, s: any) => sum + s.duration_minutes, 0);
  }
  function isUnlocked(itemEn: string, targetBpm: number) {
    return qualifyingMinutesAt(itemEn, targetBpm) >= UNLOCK_MINUTES;
  }
  function hasHistoryAt(itemEn: string, targetBpm: number) {
    return sessions.some((s: any) => s.item_en === itemEn && s.bpm === targetBpm);
  }
  function bestQualifyingRating(itemEn: string, targetBpm: number) {
    const relevant = sessions.filter((s: any) => s.item_en === itemEn && s.bpm === targetBpm && (s.rating === "comfortable" || s.rating === "mastered"));
    if (relevant.some((s: any) => s.rating === "mastered")) return "mastered";
    return relevant.length ? "comfortable" : null;
  }
  function bestRatingAny(itemEn: string, targetBpm: number) {
    const relevant = sessions.filter((s: any) => s.item_en === itemEn && s.bpm === targetBpm);
    return relevant.reduce((best: string | null, s: any) => (!best || RATING_RANK[s.rating] > RATING_RANK[best] ? s.rating : best), null as string | null);
  }
  function totalMinutesAny(itemEn: string, targetBpm: number) {
    return sessions.filter((s: any) => s.item_en === itemEn && s.bpm === targetBpm).reduce((sum: number, s: any) => sum + s.duration_minutes, 0);
  }
  function exerciseStats(itemEn: string) {
    const unlockedLevels = BPM_LEVELS.filter((level) => isUnlocked(itemEn, level));
    const bestBpm = unlockedLevels.length ? Math.max(...unlockedLevels) : null;
    const bestRating = bestBpm ? bestQualifyingRating(itemEn, bestBpm) : null;
    return { unlocked: unlockedLevels.length, bestBpm, bestRating };
  }
  function tierProgress(itemEn: string, tier: { min: number; max: number }) {
    const levels = BPM_LEVELS.filter((l) => l >= tier.min && l <= tier.max);
    const done = levels.filter((l) => isUnlocked(itemEn, l));
    return levels.length ? (done.length / levels.length) * 100 : 0;
  }
  async function handleReset(targetBpm: number) {
    if (!exercise) return;
    if (!(await confirm(T.practiceMode.confirmResetLevel(targetBpm)))) return;
    await onResetLevel(exercise, targetBpm);
  }
  async function handleResetPractice() {
    if (!(await confirm(T.today.confirmResetPractice))) return;
    await onReset();
  }
  const RATING_LABEL: Record<string, string> = { not_ready: T.practiceMode.ratingNotReady, tense: T.practiceMode.ratingTense, comfortable: T.practiceMode.ratingComfortable, mastered: T.practiceMode.ratingMastered };
  const TIER_LABEL: Record<string, string> = { beginner: T.practiceMode.tierBeginner, intermediate: T.practiceMode.tierIntermediate, advanced: T.practiceMode.tierAdvanced, legend: T.practiceMode.tierLegend };
  const CATEGORY_LABEL: Record<string, string> = { rudiments: T.practiceMode.categoryRudiments, exercises: T.practiceMode.categoryExercises, rhythms: T.practiceMode.categoryRhythms };
  const CATEGORY_DESC: Record<string, string> = { rudiments: T.practiceMode.categoryDescRudiments, exercises: T.practiceMode.categoryDescExercises, rhythms: T.practiceMode.categoryDescRhythms };
  function openCategory(cat: string) { setCategory(cat); setStep("list"); }
  function openExercise(itemEn: string) { setExercise(itemEn); setStep("detail"); }
  function startSession(targetBpm: number) { setBpm(targetBpm); setStep("session"); }
  async function handleSessionEnd(sessionMinutes: number) {
    if (exercise && bestQualifyingRating(exercise, bpm) === "mastered") {
      await onLogSession(exercise, bpm, "mastered", sessionMinutes);
      setStep("detail");
      return;
    }
    setPendingMinutes(sessionMinutes);
    setStep("rate");
  }
  async function rate(rating: string) {
    if (!exercise) return;
    await onLogSession(exercise, bpm, rating, pendingMinutes);
    setStep("detail");
  }
  function ExerciseRow({ item }: { item: { en: string; es: string } }) {
    const stats = exerciseStats(item.en);
    return <button className="ex-row" onClick={() => openExercise(item.en)}>
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
  }

  if (step === "category") {
    return <section className="page">
      <header className="simple-head"><p className="eyebrow">{T.practiceMode.pageEyebrow}</p><h1>{T.practiceMode.pageTitle}</h1></header>

      <div className="mode-header quick-header">
        <img src="/icons/lightning.png" alt="" className="mode-icon quick" />
        <div className="mode-copy"><h2>{T.practiceMode.quickTitle}</h2></div>
        <button className="mode-action" onClick={openMetronome}>⌁ {T.today.metronome}</button>
      </div>
      <div className="form-card quick-start"><label className="input-label"><span className="step-badge">1</span>{T.today.howLong}</label>
        {equipment === "both" ? (
          <div className="split-minutes">
            <div className="split-minutes-field">
              <span className="split-minutes-label">{T.today.drumset}</span>
              <div className="minutes-island compact">
                <button className="minutes-step" onClick={() => updateDrumsetMinutes(String(Math.max(0, (Number(drumsetMinutes) || 0) - 5)))}>-5</button>
                <div className="minutes-value"><input inputMode="numeric" size={3} value={drumsetMinutes} onChange={(e: any) => updateDrumsetMinutes(e.target.value.replace(/\D/g, ""))}/><span>min</span></div>
                <button className="minutes-step" onClick={() => updateDrumsetMinutes(String((Number(drumsetMinutes) || 0) + 5))}>+5</button>
              </div>
            </div>
            <div className="split-minutes-field">
              <span className="split-minutes-label">{T.today.pad}</span>
              <div className="minutes-island compact">
                <button className="minutes-step" onClick={() => updatePadMinutes(String(Math.max(0, (Number(padMinutes) || 0) - 5)))}>-5</button>
                <div className="minutes-value"><input inputMode="numeric" size={3} value={padMinutes} onChange={(e: any) => updatePadMinutes(e.target.value.replace(/\D/g, ""))}/><span>min</span></div>
                <button className="minutes-step" onClick={() => updatePadMinutes(String((Number(padMinutes) || 0) + 5))}>+5</button>
              </div>
            </div>
          </div>
        ) : (
          <div className="minutes-island">
            <button className="minutes-step" onClick={() => setMinutes(String(Math.max(0, (Number(minutes) || 0) - 5)))}>-5</button>
            <button className="minutes-step" onClick={() => setMinutes(String(Math.max(0, (Number(minutes) || 0) - 1)))}>-1</button>
            <div className="minutes-value"><input inputMode="numeric" size={3} value={minutes} onChange={(e: any) => setMinutes(e.target.value.replace(/\D/g, ""))}/><span>min</span></div>
            <button className="minutes-step" onClick={() => setMinutes(String((Number(minutes) || 0) + 1))}>+1</button>
            <button className="minutes-step" onClick={() => setMinutes(String((Number(minutes) || 0) + 5))}>+5</button>
          </div>
        )}
        {Number(seconds) > 0 && <p className="seconds-note">+{seconds}s {T.today.secondsCarried}</p>}
        <button className="collapsible-header" onClick={() => setWhatOpen(!whatOpen)}><span className="input-label checklist-label"><span className="step-badge">2</span>{T.today.whatPractised}{!whatOpen && (selected.length > 0 || notes) ? ` (${[selected.length > 0 ? String(selected.length) : null, notes ? "+note" : null].filter(Boolean).join(" ")})` : ""}</span><span className={whatOpen ? "collapse-chevron open" : "collapse-chevron"}><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 7.5l5 5 5-5" /></svg></span></button>
        {whatOpen && <>
          <div className="chips">{sortedItems.map((item: any) => <button key={item.en} onClick={() => toggle(item.en)} className={selected.includes(item.en) ? "chip selected" : "chip"}>{selected.includes(item.en) && <b>✓</b>}{item[language as Lang]}</button>)}</div>
          <label className="input-label equipment-label">{T.today.equipment}</label>
          <div className="equipment-toggle">
            <button className={equipment === "drumset" || equipment === "both" ? "equipment-option selected" : "equipment-option"} onClick={() => handleEquipmentToggle("drumset")}>{T.today.drumset}</button>
            <button className={equipment === "pad" || equipment === "both" ? "equipment-option selected" : "equipment-option"} onClick={() => handleEquipmentToggle("pad")}>{T.today.pad}</button>
          </div>
          {showNotes ? <><label className="input-label notes-label">{T.today.notes} <em>{T.today.optional}</em></label><textarea value={notes} onChange={(e: any) => setNotes(e.target.value)} placeholder={T.today.notesPlaceholder} autoFocus={notesOpen} /></> : <button className="notes-toggle" onClick={() => setNotesOpen(true)}>{T.today.addNotes}</button>}
        </>}
        <button className={saved ? "save saved" : "save"} onClick={save}>{saved ? T.today.practiceSaved : T.today.savePractice}<span>→</span></button>
        <button className="reset-practice" onClick={handleResetPractice}>{T.today.resetPractice}</button>
      </div>

      <div className="mode-header train-header skill-header">
        <img src="/icons/target.png" alt="" className="mode-icon train" />
        <div className="mode-copy"><h2>{T.practiceMode.trainTitle}</h2></div>
      </div>
      <div className="category-list">
        {PRACTICE_CATEGORIES.map((cat) => {
          return <button key={cat} className="category-card" onClick={() => openCategory(cat)}>
            <img src={CATEGORY_ICON_SRC[cat]} alt="" className="category-icon" />
            <div className="category-info">
              <p className="category-title">{CATEGORY_LABEL[cat]}</p>
              <p className="category-desc">{CATEGORY_DESC[cat]}</p>
            </div>
            <span className="chev">›</span>
          </button>;
        })}
      </div>
      <PersonalChallenges user={user} practiceSessions={sessions} confirm={confirm} setError={setError} language={language} T={T} />
    </section>;
  }

  if (step === "list" && category) {
    const items = PRACTICE_EXERCISES.filter((e) => e.category === category);
    const LIST_INTRO: Record<string, string> = { rudiments: T.practiceMode.listIntroRudiments(UNLOCK_MINUTES), exercises: T.practiceMode.listIntroExercises(UNLOCK_MINUTES), rhythms: T.practiceMode.listIntroRhythms(UNLOCK_MINUTES) };
    function lastPracticedDate(itemEn: string): string | null {
      let latest: string | null = null;
      sessions.forEach((s: any) => { if (s.item_en === itemEn && (!latest || s.practiced_on > latest)) latest = s.practiced_on; });
      return latest;
    }
    let listBody;
    if (category === "exercises") {
      const sortedItems = [...items].sort((a, b) => {
        const da = lastPracticedDate(a.en); const db = lastPracticedDate(b.en);
        if (da && db) return db.localeCompare(da);
        if (da && !db) return -1;
        if (!da && db) return 1;
        return 0;
      });
      listBody = <div className="book-list">{sortedItems.map((item) => <ExerciseRow key={item.en} item={item} />)}</div>;
    } else {
      const subcats: { en: string; es: string }[] = [];
      items.forEach((e) => { if (e.subcategory && !subcats.some((s) => s.en === e.subcategory!.en)) subcats.push(e.subcategory); });
      const groups = [...subcats.map((s) => ({ key: s.en, label: s[language as Lang] })), ...(items.some((e) => !e.subcategory) ? [{ key: "", label: "" }] : [])];
      listBody = <>{groups.map((g) => <div key={g.key || "__none"}>
        {g.key && <span className="ladder-label">{g.label.toUpperCase()}</span>}
        <div className="book-list">
          {items.filter((e) => (e.subcategory?.en ?? "") === g.key).map((item) => <ExerciseRow key={item.en} item={item} />)}
        </div>
      </div>)}</>;
    }
    return <section className="page">
      <div className="back-row"><button onClick={() => setStep("category")}>‹</button><div className="title-block"><p className="eyebrow">{T.practiceMode.title}</p><h2>{CATEGORY_LABEL[category]}</h2></div></div>
      <p className="category-list-intro">{LIST_INTRO[category]}</p>
      {listBody}
    </section>;
  }

  if (step === "detail" && exercise) {
    const stats = exerciseStats(exercise);
    const label = PRACTICE_EXERCISES.find((i) => i.en === exercise)?.[language as Lang] ?? exercise;
    const isPinned = pinnedExercises.includes(exercise);
    return <section className="page">
      <div className="back-row"><button onClick={() => setStep("list")}>‹</button><div className="title-block"><p className="eyebrow">{T.practiceMode.title}</p><h2>{label}</h2></div><button className={isPinned ? "pin-toggle pinned" : "pin-toggle"} onClick={() => onTogglePin(exercise)} aria-label={isPinned ? T.practiceMode.pinned : T.practiceMode.pin} title={isPinned ? T.practiceMode.pinned : T.practiceMode.pin}>📌</button></div>
      <div className="level-card">
        <div className="badge">{stats.bestRating ? RATING_ICON[stats.bestRating] : "🥁"}</div>
        <div>
          <p className="lc-label">{T.practiceMode.currentLevel}</p>
          <p className="lc-value">{stats.bestBpm ? `${stats.bestBpm} BPM` : "—"}</p>
          <p className="lc-sub">{T.practiceMode.levelsUnlocked(stats.unlocked, BPM_LEVELS.length)}</p>
        </div>
      </div>
      <div className="tier-strip">
        {PRACTICE_TIERS.map((tier) => <div key={tier.key} className="tier-seg"><div className={tierIsSkipped(sessions, exercise, tier) ? "seg-bar skipped" : "seg-bar"}><i style={{ width: `${tierIsSkipped(sessions, exercise, tier) ? 100 : tierProgress(exercise, tier)}%` }} /></div><span className="seg-label">{TIER_LABEL[tier.key]}</span></div>)}
      </div>
      <span className="ladder-label">{T.practiceMode.bpmLevels}</span>
      <div className="ladder">
        {BPM_LEVELS.map((level) => {
          const qualifying = qualifyingMinutesAt(exercise, level);
          const unlocked = qualifying >= UNLOCK_MINUTES;
          const rating = bestQualifyingRating(exercise, level);
          const anyRating = bestRatingAny(exercise, level);
          const hasHistory = hasHistoryAt(exercise, level);
          const totalMinutes = totalMinutesAny(exercise, level);
          const pct = unlocked ? 100 : Math.min(100, (totalMinutes / UNLOCK_MINUTES) * 100);
          const barColor = unlocked ? RATING_COLOR[rating ?? "comfortable"] : anyRating ? RATING_COLOR[anyRating] : "#ff6b1a";
          const stateClass = unlocked ? "unlocked" : totalMinutes > 0 ? "in-progress" : "not-started";
          return <div key={level} className={`rung ${stateClass}`}>
            <button className="rung-tap" onClick={() => startSession(level)}>
              <span className="bpm">{level}</span>
              <div className="rung-progress">
                <div className="rung-progress-track"><div className="rung-progress-bar" style={{ width: `${pct}%`, background: barColor }} /></div>
                <span className="rung-progress-label">{unlocked ? (rating === "mastered" ? "⭐" : "✓") : `${Math.min(totalMinutes, UNLOCK_MINUTES)}/${UNLOCK_MINUTES} min`}</span>
              </div>
            </button>
            {hasHistory && <button className="rung-reset" onClick={() => handleReset(level)}>↺</button>}
          </div>;
        })}
      </div>
      <div className="legend">
        <span><i style={{ background: "#303531" }} />{T.practiceMode.notStarted}</span>
        <span><i style={{ background: "#ff6b1a" }} />{T.practiceMode.inProgress}</span>
        <span><i style={{ background: RATING_COLOR.comfortable }} />{T.practiceMode.unlockedLabel}</span>
        <span><i style={{ background: RATING_COLOR.mastered }} />⭐ {T.practiceMode.ratingMastered}</span>
      </div>
    </section>;
  }

  if (step === "session" && exercise) {
    const label = PRACTICE_EXERCISES.find((i) => i.en === exercise)?.[language as Lang] ?? exercise;
    return <section className="page">
      <div className="back-row"><button onClick={() => setStep("detail")}>‹</button><div className="title-block"><p className="eyebrow">{T.practiceMode.title}</p><h2>{label} · {bpm} BPM</h2></div></div>
      <Metronome open={true} initialBpm={bpm} onSessionEnd={handleSessionEnd} close={() => setStep("detail")} tone={metronomeTone} exerciseLabel={label} T={T} />
    </section>;
  }

  if (step === "rate" && exercise) {
    const label = PRACTICE_EXERCISES.find((i) => i.en === exercise)?.[language as Lang] ?? exercise;
    return <section className="page">
      <header className="simple-head"><p className="eyebrow">{label} · {bpm} BPM</p><h1>{T.practiceMode.rateTitle}</h1><p className="rate-sub">{T.practiceMode.rateSubtitle(bpm)}</p></header>
      <div className="rating-grid">
        {RATING_ORDER.map((r) => <button key={r} className={`rating-btn ${r}`} onClick={() => rate(r)}><span className="rating-icon">{RATING_ICON[r]}</span>{RATING_LABEL[r]}</button>)}
      </div>
    </section>;
  }
  return null;
}
function Settings({ signOut, user, setError, profileName, onProfileNameSaved, language: currentLanguage, onLanguageSaved, dailyGoal, onGoalSaved, metronomeTone: currentMetronomeTone, onMetronomeToneSaved, showDaysThisYear: currentShowDaysThisYear, onShowDaysThisYearSaved, onBack, T }: { signOut: () => void; user: any; setError: (message: string) => void; profileName: string; onProfileNameSaved: (name: string) => void; language: Lang; onLanguageSaved: (language: Lang) => void; dailyGoal: number; onGoalSaved: (goal: number) => void; metronomeTone: string; onMetronomeToneSaved: (tone: string) => void; showDaysThisYear: boolean; onShowDaysThisYearSaved: (value: boolean) => void; onBack: () => void; T: any }) {
  const [name, setName] = useState(profileName); const [goal, setGoal] = useState(String(dailyGoal)); const [language, setLanguage] = useState<Lang>(currentLanguage); const [reminders, setReminders] = useState(false); const [color, setColor] = useState<string | null>(null); const [tone, setTone] = useState(currentMetronomeTone); const [showDaysThisYear, setShowDaysThisYear] = useState(currentShowDaysThisYear); const [saved, setSaved] = useState(false);
  const [newEmail, setNewEmail] = useState(""); const [emailBusy, setEmailBusy] = useState(false); const [emailMsg, setEmailMsg] = useState("");
  const [newPassword, setNewPassword] = useState(""); const [confirmPassword, setConfirmPassword] = useState(""); const [passwordBusy, setPasswordBusy] = useState(false); const [passwordMsg, setPasswordMsg] = useState("");
  const [deleteConfirmText, setDeleteConfirmText] = useState(""); const [deleteBusy, setDeleteBusy] = useState(false);
  useEffect(() => { supabase.from("settings").select("daily_goal_minutes,language,reminder_enabled,metronome_tone,show_days_this_year").eq("user_id", user.id).maybeSingle().then(({ data }) => { if (data) { const row: any = data; setGoal(String(row.daily_goal_minutes)); setLanguage(row.language); setReminders(row.reminder_enabled); if (row.metronome_tone) setTone(row.metronome_tone); if (row.show_days_this_year != null) setShowDaysThisYear(row.show_days_this_year); } }); supabase.from("profiles").select("color").eq("id", user.id).maybeSingle().then(({ data }) => { setColor(data?.color ?? null); }); }, [user]);
  async function saveSettings() { const profile = await supabase.from("profiles").upsert({ id: user.id, name, color }, { onConflict: "id" }); const goalValue = Number(goal) || 30; const settings = await supabase.from("settings").upsert({ user_id: user.id, daily_goal_minutes: goalValue, language, reminder_enabled: reminders, metronome_tone: tone, show_days_this_year: showDaysThisYear }, { onConflict: "user_id" }); if (profile.error || settings.error) setError(profile.error?.message ?? settings.error?.message ?? "Could not save settings."); else { onProfileNameSaved(name); onLanguageSaved(language); onGoalSaved(goalValue); onMetronomeToneSaved(tone); onShowDaysThisYearSaved(showDaysThisYear); setSaved(true); setTimeout(() => setSaved(false), 1800); } }
  async function changeEmail() {
    if (!newEmail.trim()) return;
    setEmailBusy(true); setEmailMsg("");
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
    setEmailBusy(false);
    if (error) { setError(error.message); return; }
    setEmailMsg(T.settings.emailChangeSent);
    setNewEmail("");
  }
  async function changePassword() {
    if (newPassword.length < 6) { setError(T.settings.passwordTooShort); return; }
    if (newPassword !== confirmPassword) { setError(T.settings.passwordMismatch); return; }
    setPasswordBusy(true); setPasswordMsg("");
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPasswordBusy(false);
    if (error) { setError(error.message); return; }
    setPasswordMsg(T.settings.passwordChanged);
    setNewPassword(""); setConfirmPassword("");
  }
  async function deleteAccount() {
    if (deleteConfirmText.trim().toLowerCase() !== (user.email ?? "").toLowerCase()) return;
    setDeleteBusy(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    const res = await fetch("/api/delete-account", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setDeleteBusy(false);
      setError(body.error ?? T.settings.couldNotDeleteAccount);
      return;
    }
    await supabase.auth.signOut();
  }
  return <section className="page"><button className="page-back" onClick={onBack}>‹ {T.nav.today}</button><header className="simple-head"><p className="eyebrow">{T.settings.makeItYours}</p><h1>{T.settings.title}</h1></header>
    <p className="settings-section-label">{T.settings.userSection}</p>
    <div className="settings-form"><label>{T.settings.displayName}<input value={name} onChange={e => setName(e.target.value)} /></label><label>{T.settings.dailyGoal}<input inputMode="numeric" value={goal} onChange={e => setGoal(e.target.value.replace(/\D/g, ""))} /><small>{T.settings.minutes}</small></label><label>{T.settings.language}<select value={language} onChange={e => setLanguage(e.target.value as Lang)}><option value="en">English</option><option value="es">Español</option></select></label><label>{T.settings.metronomeTone}<div className="tone-options">{TONE_KEYS.map((key) => <button type="button" key={key} className={tone === key ? "tone-option selected" : "tone-option"} onClick={() => setTone(key)}>{T.settings.toneNames[key]}</button>)}</div></label><label>{T.settings.calendarColor}<div className="color-swatches"><button type="button" className={color === null ? "swatch auto selected" : "swatch auto"} onClick={() => setColor(null)}>{T.settings.autoColor}</button>{MEMBER_COLORS.map((c) => <button key={c} type="button" className={color === c ? "swatch selected" : "swatch"} style={{ background: c }} onClick={() => setColor(c)} />)}</div></label><button className="toggle-row" onClick={() => setReminders(!reminders)}><span>{T.settings.reminders}</span><b className={reminders ? "on" : ""}>{reminders ? T.settings.on : T.settings.off}</b></button><button className="toggle-row" onClick={() => setShowDaysThisYear(!showDaysThisYear)}><span>{T.settings.showDaysThisYear}</span><b className={showDaysThisYear ? "on" : ""}>{showDaysThisYear ? T.settings.on : T.settings.off}</b></button><button className={saved ? "save saved" : "save"} onClick={saveSettings}>{saved ? T.settings.saved : T.settings.save}</button></div>
    <p className="settings-section-label">{T.settings.accountSection}</p>
    <div className="settings-form account-settings">
      <label>{T.settings.changeEmail}<input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder={T.settings.newEmailPlaceholder} /></label>
      {emailMsg && <p className="settings-hint">{emailMsg}</p>}
      <button className="secondary-btn" disabled={emailBusy || !newEmail.trim()} onClick={changeEmail}>{emailBusy ? T.settings.pleaseWait : T.settings.updateEmail}</button>
      <label className="account-field-spaced">{T.settings.changePassword}<input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder={T.settings.newPasswordPlaceholder} /></label>
      <input type="password" className="account-confirm-input" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder={T.settings.confirmPasswordPlaceholder} />
      {passwordMsg && <p className="settings-hint">{passwordMsg}</p>}
      <button className="secondary-btn" disabled={passwordBusy || !newPassword || !confirmPassword} onClick={changePassword}>{passwordBusy ? T.settings.pleaseWait : T.settings.updatePassword}</button>
      <button className="logout" onClick={signOut}>{T.settings.logout}</button>
      <div className="danger-zone">
        <p className="danger-title">{T.settings.deleteAccount}</p>
        <p className="danger-warning">{T.settings.deleteAccountWarning}</p>
        <label className="account-field-spaced">{T.settings.deleteAccountConfirmPrompt(user.email ?? "")}<input value={deleteConfirmText} onChange={e => setDeleteConfirmText(e.target.value)} placeholder={user.email ?? ""} /></label>
        <button className="danger-btn" disabled={deleteBusy || deleteConfirmText.trim().toLowerCase() !== (user.email ?? "").toLowerCase()} onClick={deleteAccount}>{deleteBusy ? T.settings.deleteAccountBusy : T.settings.deleteAccountBtn}</button>
      </div>
    </div>
  </section>;
}
function Setting({icon,label,value}:{icon:string;label:string;value:string}) { return <button className="setting"><span className="setting-icon">{icon}</span><span>{label}</span><em>{value} ›</em></button>; }

const BEATS_PER_BAR_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
type ToneDef = { wave: OscillatorType; freq: { downbeat: number; beat: number; sub: number }; decay: number };
const TONE_PRESETS: Record<string, ToneDef> = {
  click: { wave: "sine", freq: { downbeat: 1200, beat: 900, sub: 650 }, decay: 0.045 },
  beep: { wave: "square", freq: { downbeat: 1400, beat: 1000, sub: 700 }, decay: 0.05 },
  wood: { wave: "triangle", freq: { downbeat: 500, beat: 380, sub: 260 }, decay: 0.07 },
  clave: { wave: "sawtooth", freq: { downbeat: 1800, beat: 1300, sub: 900 }, decay: 0.035 },
};
const TONE_KEYS = ["click", "beep", "wood", "clave"];
const SUBDIVISION_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8];

function Metronome({ open, close, onAddPractice, onSessionEnd, initialBpm, tone, exerciseLabel, language, T }: { open: boolean; close: () => void; onAddPractice?: (seconds: number, items: string[], otherNote: string) => void; onSessionEnd?: (minutes: number) => void; initialBpm?: number; tone?: string; exerciseLabel?: string; language?: Lang; T: any }) {
  const [bpm, setBpm] = useState(initialBpm ?? 100);
  const [playing, setPlaying] = useState(false);
  const [beatsPerBar, setBeatsPerBar] = useState(4);
  const [subdivision, setSubdivision] = useState(1);
  const [activeBeat, setActiveBeat] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [showAddPrompt, setShowAddPrompt] = useState(false);
  const [addPromptSeconds, setAddPromptSeconds] = useState(0);
  const [addItems, setAddItems] = useState<string[]>([]);
  const [showOtherInput, setShowOtherInput] = useState(false);
  const [otherText, setOtherText] = useState("");
  const bpmRef = useRef(bpm);
  const beatsPerMeasureRef = useRef(beatsPerBar);
  const subdivisionRef = useRef(subdivision);
  const toneRef = useRef(TONE_PRESETS[tone ?? "click"] ?? TONE_PRESETS.click);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const schedulerRef = useRef<number | null>(null);
  const nextNoteTimeRef = useRef(0);
  const beatRef = useRef(0);
  const beatTimeoutsRef = useRef<number[]>([]);
  const tapTimesRef = useRef<number[]>([]);
  const lastTapRef = useRef<number | null>(null);
  const wakeLockRef = useRef<any>(null);

  // Keeps the screen from turning off while the metronome is running — without it, mobile browsers
  // suspend the audio scheduler as soon as the display sleeps, silently stopping playback mid-session.
  async function acquireWakeLock() {
    if (!("wakeLock" in navigator)) return;
    try { wakeLockRef.current = await (navigator as any).wakeLock.request("screen"); } catch { /* not available in this context, e.g. low battery mode */ }
  }
  useEffect(() => {
    if (playing) acquireWakeLock();
    else { wakeLockRef.current?.release(); wakeLockRef.current = null; }
  }, [playing]);
  useEffect(() => {
    function handleVisibility() {
      // The wake lock is auto-released whenever the tab is hidden; if playback is still going once
      // the tab is visible again, re-acquire it so the screen stays awake for the rest of the session.
      if (document.visibilityState === "visible" && playing && !wakeLockRef.current) acquireWakeLock();
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [playing]);

  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => { beatsPerMeasureRef.current = beatsPerBar; }, [beatsPerBar]);
  useEffect(() => { subdivisionRef.current = subdivision; }, [subdivision]);
  useEffect(() => { toneRef.current = TONE_PRESETS[tone ?? "click"] ?? TONE_PRESETS.click; }, [tone]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [playing]);

  function clearBeatTimeouts() {
    beatTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
    beatTimeoutsRef.current = [];
  }

  useEffect(() => {
    return () => {
      if (schedulerRef.current !== null) window.clearInterval(schedulerRef.current);
      clearBeatTimeouts();
      audioCtxRef.current?.close();
      wakeLockRef.current?.release();
    };
  }, []);

  function playClick(time: number, accentLevel: "downbeat" | "beat" | "sub") {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const preset = toneRef.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = preset.wave;
    osc.frequency.value = preset.freq[accentLevel];
    const peak = accentLevel === "downbeat" ? 0.55 : accentLevel === "beat" ? 0.32 : 0.14;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(peak, time + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + preset.decay);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + preset.decay + 0.01);
  }

  function scheduler() {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const steps = subdivisionRef.current;
    const beatsPerMeasure = beatsPerMeasureRef.current;
    while (nextNoteTimeRef.current < ctx.currentTime + 0.1) {
      const tick = beatRef.current;
      const isBeat = tick % steps === 0;
      const beatNumber = Math.floor(tick / steps);
      const isDownbeat = isBeat && beatNumber % beatsPerMeasure === 0;
      const accentLevel = isDownbeat ? "downbeat" : isBeat ? "beat" : "sub";
      playClick(nextNoteTimeRef.current, accentLevel);
      if (isBeat) {
        const beatIndex = beatNumber % beatsPerMeasure;
        const delayMs = Math.max(0, (nextNoteTimeRef.current - ctx.currentTime) * 1000);
        beatTimeoutsRef.current.push(window.setTimeout(() => setActiveBeat(beatIndex), delayMs));
      }
      beatRef.current += 1;
      nextNoteTimeRef.current += (60 / bpmRef.current) / steps;
    }
  }

  function formatMMSS(totalSeconds: number) { return String(Math.floor(totalSeconds / 60)).padStart(2, "0") + ":" + String(totalSeconds % 60).padStart(2, "0"); }
  const elapsedLabel = formatMMSS(elapsed);
  function formatMinSecLabel(totalSeconds: number) {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    const parts: string[] = [];
    if (m > 0) parts.push(`${m} ${T.metronome.minAbbr}`);
    if (s > 0 || m === 0) parts.push(`${s} ${T.metronome.secAbbr}`);
    return parts.join(" ");
  }
  async function togglePlaying() {
    if (!playing) {
      setElapsed(0);
      setActiveBeat(0);
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
    clearBeatTimeouts();
    if (elapsed > 0) {
      if (onSessionEnd) onSessionEnd(Math.max(1, Math.round(elapsed / 60)));
      else { setAddPromptSeconds(elapsed); setAddItems([]); setShowOtherInput(false); setOtherText(""); setShowAddPrompt(true); }
    }
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
  function addTime() { if (addPromptSeconds <= 0) return; onAddPractice?.(addPromptSeconds, addItems, showOtherInput ? otherText.trim() : ""); setShowAddPrompt(false); setElapsed(0); close(); }
  function discardTime() { setShowAddPrompt(false); setElapsed(0); }
  function nudgeAddPromptSeconds(delta: number) { setAddPromptSeconds((current) => Math.max(0, current + delta)); }
  function toggleAddItem(item: string) { setAddItems((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item]); }
  if (!open) return null;
  const beatsPerMeasure = beatsPerBar;
  const lang = language ?? "en";
  return <div className="modal modal-center"><div className="metro"><button className="close" onClick={close}>×</button><p className="eyebrow">{exerciseLabel ?? T.metronome.practiceTool}</p><h2>{T.metronome.title}</h2>
    {showAddPrompt ? <div className="add-time">
      <span>{T.metronome.sessionComplete}</span>
      <h3>{addPromptSeconds > 0 ? T.metronome.addTimeQuestion(formatMinSecLabel(addPromptSeconds)) : T.metronome.addTimeTooShort}</h3>
      <p>{T.metronome.sessionLasted(elapsedLabel)}</p>
      <div className="add-time-adjust"><button onClick={() => nudgeAddPromptSeconds(-10)}>-10s</button><span className="add-time-value">{formatMMSS(addPromptSeconds)}</span><button onClick={() => nudgeAddPromptSeconds(10)}>+10s</button></div>
      <span className="metro-section-label">{T.today.whatPractised} <em>{T.today.optional}</em></span>
      <div className="chips">{PRACTICE_ITEMS.map((item) => <button key={item.en} onClick={() => toggleAddItem(item.en)} className={addItems.includes(item.en) ? "chip selected" : "chip"}>{addItems.includes(item.en) && <b>✓</b>}{item[lang as Lang]}</button>)}<button onClick={() => setShowOtherInput((current) => !current)} className={showOtherInput ? "chip selected" : "chip"}>{showOtherInput && <b>✓</b>}{T.today.other}</button></div>
      {showOtherInput && <input className="other-input" value={otherText} onChange={(e) => setOtherText(e.target.value)} placeholder={T.today.otherPlaceholder} autoFocus />}
      <div className="add-time-buttons"><button className="discard" onClick={discardTime}>{T.metronome.notNow}</button><button className="add" onClick={addTime} disabled={addPromptSeconds <= 0}>{T.metronome.addTime}</button></div>
    </div> : <>
      <div className={playing ? "pulse playing" : "pulse"} style={{ animationDuration: `${60 / bpm}s` }}><span>{bpm}</span><small>BPM</small></div>
      <div className="beat-dots">{Array.from({ length: beatsPerMeasure }).map((_, i) => <i key={i} className={playing && activeBeat === i ? "beat-dot active" : "beat-dot"} />)}</div>
      <div className="metronome-timer">{playing ? T.metronome.practiceTimer : T.metronome.sessionTime}<strong>{elapsedLabel}</strong></div>
      <input className="range" type="range" min="40" max="240" value={bpm} onChange={e => setBpm(+e.target.value)}/>
      <div className="tempo-actions"><button onClick={() => setBpm(Math.max(40, bpm - 1))}>−</button><button className="tap" onClick={tapTempo}>{T.metronome.tapTempo}</button><button onClick={() => setBpm(Math.min(240, bpm + 1))}>+</button></div>
      <div className="metro-selects"><div className="metro-select-field"><span className="metro-section-label">{T.metronome.timeSignature}</span><select className="subdivision-select" value={beatsPerBar} onChange={e => setBeatsPerBar(Number(e.target.value))}>{BEATS_PER_BAR_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}</select></div><div className="metro-select-field"><span className="metro-section-label">{T.metronome.subdivisionLabel}</span><select className="subdivision-select" value={subdivision} onChange={e => setSubdivision(Number(e.target.value))}>{SUBDIVISION_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}</select></div></div>
      <button className={playing ? "stop" : "start"} onClick={togglePlaying}>{playing ? T.metronome.stop : T.metronome.start}</button>
    </>}
  </div></div>; }