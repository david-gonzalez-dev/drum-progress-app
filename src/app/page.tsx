"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { enqueueTick, dueEvent, type StrokeEvent } from "./stroke-guide";
import { gridFor, effectiveRhythm, allowedClicks, layoutRows, fitBox, sideIndex, type Hand, type Difficulty } from "./rudiment-grid";
import { AGE_CONFIG, asAgeBand, type AgeBand } from "./age-config";
import { LeaderboardCard, LeaderboardScreen, StudentLeaderboardCard, type BoardFilter } from "./leaderboard";
import { NotationStaff } from "./notation";
import { pushSupported, pushWanted, enablePush, disablePush, removeToken, refreshPush, listenForPushTaps } from "./push";

type Tab = "today" | "practice" | "group" | "progress" | "settings" | "admin";
type Log = { minutes: number; seconds: number; items: string[]; customItems: string[]; notes: string; equipment: string | null; drumsetMinutes: number | null; padMinutes: number | null };
type Lang = "en" | "es" | "nl";
// Dutch names for the English-keyed lists below. Anything not listed keeps its English name (most rudiment
// and exercise names are used in English by Dutch drummers too).
const NL_NAMES: Record<string, string> = {
  "Rudiments": "Rudiments", "Coordination": "Coördinatie", "Footwork": "Voetwerk", "Rhythms": "Ritmes", "Permutations": "Permutaties", "Songs": "Nummers",
  "Push Pull - Right Hand": "Push Pull - Rechterhand", "Push Pull - Left Hand": "Push Pull - Linkerhand",
  "Bass Drum - Heel Down": "Basdrum - Hiel omlaag", "Bass Drum - Heel Up": "Basdrum - Hiel omhoog", "Bass Drum - Slide Technique": "Basdrum - Slide-techniek",
  "Double Bass Drum": "Dubbele basdrum", "Flow, 16th Notes": "Flow, zestiende noten", "R L L (Triplets)": "R L L (Triolen)",
  "Finger Technique (Single-Handed)": "Vingertechniek (met één hand)", "16th Note Single Strokes Around the Set": "Zestiende noten Single Strokes rond het stel",
  "Hi-hat Pedal - Heel Up": "Hi-hatpedaal - Hiel omhoog", "Hi-hat Pedal - Heel Down": "Hi-hatpedaal - Hiel omlaag",
  "Three-Note Pattern #1": "Patroon van drie noten #1", "Three-Note Pattern #2": "Patroon van drie noten #2", "Three-Note Pattern #3": "Patroon van drie noten #3",
  "Grip and tension": "Grip en spanning", "Wrist tension": "Spanning in de pols", "Thumb tension": "Spanning in de duim", "Index finger issue": "Probleem met de wijsvinger",
  "Stick slides": "De stok glijdt weg", "Lost control of the stick": "Controle over de stok kwijt",
  "Sound and timing": "Geluid en timing", "Uneven timing": "Onregelmatige timing", "Rushing": "Gehaast", "Messy dynamics": "Rommelige dynamiek", "Feels shaky": "Voelt wankel",
  "Weaker hand": "Zwakkere hand", "Left hand": "Linkerhand", "Right hand": "Rechterhand",
  "Mind and body": "Geest en lichaam", "Getting tired": "Moe worden", "Lost focus": "Concentratie kwijt", "Got stuck": "Liep vast",
  "Let's go, you can do it!": "Kom op, je kunt het!", "Keep it up, team!": "Hou vol, team!", "Great practice today!": "Goed geoefend vandaag!", "Don't break the streak!": "Verbreek je reeks niet!",
  "Proud of you all!": "Trots op jullie allemaal!", "Go practice!": "Ga oefenen!", "Good job!": "Goed gedaan!",
};
// Makes iOS play web audio even when the phone is on silent (needs Safari 16.4+; the iPhone app also sets this natively).
function enablePlaybackAudio() { try { const nav = navigator as unknown as { audioSession?: { type: string } }; if (nav.audioSession) nav.audioSession.type = "playback"; } catch {} }
function localeFor(lang: string) { return lang === "es" ? "es-ES" : lang === "nl" ? "nl-NL" : "en-US"; }
function nlName(en: string) { return NL_NAMES[en] ?? en; }
function withNl<T extends { en: string }>(list: T[]): (T & { nl: string })[] { return list.map((o) => ({ ...o, nl: nlName(o.en) })); }

// Grouped so the "what happened" picker reads as four short rows instead of one wall of chips.
const SESSION_ISSUE_GROUPS_BASE: { title: { en: string; es: string }; tags: { en: string; es: string }[] }[] = [
  { title: { en: "Grip and tension", es: "Agarre y tensión" }, tags: [
    { en: "Wrist tension", es: "Tensión en la muñeca" },
    { en: "Thumb tension", es: "Tensión en el pulgar" },
    { en: "Index finger issue", es: "Problema con el dedo índice" },
    { en: "Stick slides", es: "La baqueta se resbala" },
    { en: "Lost control of the stick", es: "Perdí el control de la baqueta" },
  ] },
  { title: { en: "Sound and timing", es: "Sonido y tiempo" }, tags: [
    { en: "Uneven timing", es: "Tiempo irregular" },
    { en: "Rushing", es: "Me aceleré" },
    { en: "Messy dynamics", es: "Dinámica desordenada" },
    { en: "Feels shaky", es: "Se siente inestable" },
  ] },
  { title: { en: "Weaker hand", es: "Mano más débil" }, tags: [
    { en: "Left hand", es: "Mano izquierda" },
    { en: "Right hand", es: "Mano derecha" },
  ] },
  { title: { en: "Mind and body", es: "Mente y cuerpo" }, tags: [
    { en: "Getting tired", es: "Me cansé" },
    { en: "Lost focus", es: "Perdí la concentración" },
    { en: "Got stuck", es: "Me atasqué" },
  ] },
];
const SESSION_ISSUE_GROUPS = SESSION_ISSUE_GROUPS_BASE.map((g) => ({ title: { ...g.title, nl: nlName(g.title.en) }, tags: withNl(g.tags) }));
const SESSION_ISSUE_TAGS = SESSION_ISSUE_GROUPS.flatMap((g) => g.tags);
// Items named after rudiments or books also stay in English everywhere.
const ENGLISH_ONLY_ITEMS = new Set(["Rudiments", "Single Strokes", "Double Strokes", "Paradiddles", "Stick Control", "Fills"]);
const PRACTICE_ITEMS = withNl([
  { en: "Rudiments", es: "Rudimentos" },
  { en: "Single Strokes", es: "Golpes simples" },
  { en: "Double Strokes", es: "Golpes dobles" },
  { en: "Paradiddles", es: "Paradiddles" },
  { en: "Stick Control", es: "Control de baquetas" },
  { en: "Coordination", es: "Coordinación" },
  { en: "Footwork", es: "Trabajo de pies" },
  { en: "Rhythms", es: "Ritmos" },
  { en: "Permutations", es: "Permutaciones" },
  { en: "Fills", es: "Fills" },
  { en: "Songs", es: "Canciones" },
]).map((o) => ENGLISH_ONLY_ITEMS.has(o.en) ? { ...o, es: o.en, nl: o.en } : o);
// Quick Practice's own top-level order (Rudiments renders separately as an expandable picker,
// and Stick Control lives in the Books picker instead, so both are excluded here).
const QUICK_PRACTICE_ITEM_ORDER = ["Rhythms", "Coordination", "Footwork", "Permutations", "Fills", "Songs"];
// Shared between Quick Practice's card and the Metronome's free-play "Add Time" prompt so both
// offer the exact same top-level chips.
const QUICK_PRACTICE_ITEMS = QUICK_PRACTICE_ITEM_ORDER.map((en) => PRACTICE_ITEMS.find((item) => item.en === en)).filter(Boolean) as (typeof PRACTICE_ITEMS)[number][];
// Curated method-book titles offered in the Books picker -- proper nouns, so no translation.
// Students can add their own on top of this list (stored per-user, see user_practice_items).
const PRACTICE_BOOKS = ["Stick Control", "Syncopation", "4-Way Coordination", "Rhythmic Illusions", "150 Rudimental Solos"];
function practiceItemLabel(en: string, lang: Lang) {
  return PRACTICE_ITEMS.find((item) => item.en === en)?.[lang] ?? en;
}
// Quick Practice's checklist tags and Skill Trainer's exercise names come from two different
// catalogs (PRACTICE_ITEMS vs PRACTICE_EXERCISES) -- this covers both when rendering a merged
// chip list of "what was practiced" that can contain either kind of entry.
function practicedItemLabel(en: string, lang: Lang) {
  return PRACTICE_EXERCISES.find((item) => item.en === en)?.[lang] ?? practiceItemLabel(en, lang);
}
// A "what was practiced" chip, marked with a small target icon + warmer style when it came from
// a tracked Skill Trainer session rather than a manually-picked Quick Practice tag -- so the
// two sources stay visually distinct wherever this merged chip list is shown.
// Every time a tempo was unlocked (reached "comfortable" or better for the required minutes), newest first, from your own sessions.
type TempoUnlock = { key: string; exerciseEn: string; bpm: number; date: string };
function tempoUnlocksFrom(sessions: { item_en: string; bpm: number; rating: string; duration_minutes: number; practiced_on: string }[]): TempoUnlock[] {
  const byExercise: Record<string, typeof sessions> = {};
  sessions.forEach((x) => { (byExercise[x.item_en] ??= []).push(x); });
  const events: TempoUnlock[] = [];
  Object.entries(byExercise).forEach(([exerciseEn, list]) => {
    const levels = bpmLevelsFor(exerciseEn);
    const qualifying: Record<number, number> = {};
    const unlockedBefore = new Set<number>();
    Array.from(new Set(list.map((x) => x.practiced_on))).sort().forEach((date) => {
      list.filter((x) => x.practiced_on === date).forEach((x) => { if (x.rating === "comfortable" || x.rating === "mastered") qualifying[x.bpm] = (qualifying[x.bpm] ?? 0) + x.duration_minutes; });
      levels.forEach((level) => {
        if (!unlockedBefore.has(level) && (qualifying[level] ?? 0) >= UNLOCK_MINUTES) { unlockedBefore.add(level); events.push({ key: `${exerciseEn}::${level}`, exerciseEn, bpm: level, date }); }
      });
    });
  });
  return events.sort((a, b) => b.date.localeCompare(a.date) || b.bpm - a.bpm);
}
function UnlocksFeed({ sessions, limit, expandable, language, T, onOpenExercise, onSeeAll, titleClass, hideEmpty }: { hideEmpty?: boolean; sessions: { item_en: string; bpm: number; rating: string; duration_minutes: number; practiced_on: string }[]; limit: number; expandable?: boolean; language: Lang; T: any; onOpenExercise?: (en: string) => void; onSeeAll?: () => void; titleClass: string }) {
  const [open, setOpen] = useState(false);
  const events = useMemo(() => tempoUnlocksFrom(sessions), [sessions]);
  const shown = events.slice(0, limit);
  if (hideEmpty && !events.length) return null;
  // One row; clicking opens the exercise (and closes the pop-up if it was opened from there).
  const renderEvent = (ev: TempoUnlock, afterOpen?: () => void) => {
    const label = PRACTICE_EXERCISES.find((e) => e.en === ev.exerciseEn)?.[language] ?? ev.exerciseEn;
    const inner = <><span className="unlock-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span><span className="unlock-text"><b>{label}</b><small>{T.progressPage.unlockedBpm(ev.bpm)}</small></span><span className="unlock-date">{formatDMY(ev.date).slice(0, 5)}</span></>;
    return onOpenExercise ? <button type="button" key={ev.key} className="unlock-row" onClick={() => { afterOpen?.(); onOpenExercise(ev.exerciseEn); }}>{inner}</button> : <div key={ev.key} className="unlock-row">{inner}</div>;
  };
  return <div className="unlocks">
    <div className="unlocks-head"><h2 className={titleClass}>{T.progressPage.unlocksTitle}</h2>{!expandable && events.length > limit && onSeeAll && <button type="button" className="unlocks-all" onClick={onSeeAll}>{T.today.seeAll}</button>}</div>
    {!events.length ? <p className="hint unlocks-empty">{T.progressPage.unlocksEmpty}</p> : <div className="unlocks-list">{shown.map((ev) => renderEvent(ev))}</div>}
    {expandable && events.length > limit && <button type="button" className="see-more-btn" onClick={() => setOpen(true)}>{T.progressPage.seeMore}</button>}
    {open && <div className="modal modal-center" onClick={() => setOpen(false)}>
      <div className="sk-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sk-modal-head"><h3>{T.progressPage.unlocksTitle}</h3><button type="button" className="sk-modal-close" onClick={() => setOpen(false)} aria-label="Close">×</button></div>
        <div className="sk-modal-body unlocks-list unlocks-modal-list">{events.map((ev) => renderEvent(ev, () => setOpen(false)))}</div>
      </div>
    </div>}
  </div>;
}
function PracticedChip({ item, skill, language, onOpen }: { item: string; skill: boolean; language: Lang; onOpen?: () => void }) {
  // A Skill Trainer item can open its exercise page (on Home); other chips are just labels.
  if (skill && onOpen) return <em className="skill-chip skill-chip-link" role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></svg>
    {practicedItemLabel(item, language)}
    <svg className="skill-chip-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
  </em>;
  return <em className={skill ? "skill-chip" : undefined}>
    {skill && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></svg>}
    {practicedItemLabel(item, language)}
  </em>;
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
const MEMBER_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#8b5cf6", "#4dd0c4", "#c9a24a"];
function autoColorForUserId(userId: string) {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) % MEMBER_COLORS.length;
  return MEMBER_COLORS[hash];
}
// autoColorForUserId hashes each id independently, so two members in the same small group can
// land on the same color purely by chance (not rare with only 8 colors) -- this keeps the first
// member's color (their own pick, or their auto-color) and bumps any later member who'd collide
// with an already-used color onto the next unused one from the palette, so every member in a
// given group is visually distinguishable on its leaderboards/calendar.
// The Group tab uses one warm palette instead of each person's own colour pick, so it matches the rest of the app.
// The viewer always gets the vivid orange; everyone else follows in a fixed order (sorted by id, so it is stable).
const GROUP_PALETTE = ["#ff7a3c", "#f4d9bd", "#c4561f", "#ffb27a", "#8f5a34", "#e8c39a", "#6e4528", "#b9b1a8"];
function applyGroupPalette<T extends { id: string; color: string }>(members: T[], viewerId: string): T[] {
  const ordered = [...members].sort((a, b) => (a.id === viewerId ? -1 : b.id === viewerId ? 1 : a.id.localeCompare(b.id)));
  const colorById: Record<string, string> = {};
  ordered.forEach((m, i) => { colorById[m.id] = GROUP_PALETTE[i % GROUP_PALETTE.length]; });
  return members.map((m) => ({ ...m, color: colorById[m.id] }));
}
function dedupeMemberColors<T extends { color: string }>(members: T[]): T[] {
  const used = new Set<string>();
  return members.map((m) => {
    let color = m.color;
    if (used.has(color)) {
      color = MEMBER_COLORS.find((c) => !used.has(c)) ?? color;
    }
    used.add(color);
    return { ...m, color };
  });
}
const CHALLENGE_PRESETS: { key: string; type: "daily" | "minutes" | "sessions"; goal: number; days: number }[] = [
  { key: "daily3", type: "daily", goal: 3, days: 7 },
  { key: "daily30x5", type: "daily", goal: 30, days: 5 },
  { key: "sessions3weekly", type: "sessions", goal: 3, days: 7 },
  { key: "daily5x20", type: "daily", goal: 5, days: 20 },
];

const PRACTICE_CATEGORIES = ["rudiments", "exercises"] as const;
const CATEGORY_ICON_SRC: Record<string, string> = { rudiments: "/icons/rudiments.png", exercises: "/icons/exercises.png", rhythms: "/icons/rhythms.png" };
const PRACTICE_EXERCISES_BASE: { category: typeof PRACTICE_CATEGORIES[number]; subcategory: { en: string; es: string } | null; en: string; es: string; difficulty: "core" | "advanced"; subdivision?: "quarter" | "eighth" | "triplet" | "sixteenth" | "sixteenthTriplet"; tempoRange?: "extended" | "footwork" | "cap180"; tier?: "basics" | "intermediate" | "advanced"; prerequisites?: string[]; exerciseGroup?: "hand" | "footwork" | "coordination"; pattern?: { en: string; es: string } }[] = [
  { category: "rudiments", subcategory: null, en: "Single Strokes", es: "Golpes simples", difficulty: "core", subdivision: "sixteenth", tier: "basics", prerequisites: [] },
  { category: "rudiments", subcategory: null, en: "Double Strokes", es: "Golpes dobles", difficulty: "core", subdivision: "sixteenth", tier: "basics", prerequisites: [] },
  { category: "rudiments", subcategory: null, en: "Single Paradiddle", es: "Paradiddle simple", difficulty: "core", subdivision: "sixteenth", tier: "basics", prerequisites: ["Single Strokes", "Double Strokes"] },
  { category: "rudiments", subcategory: null, en: "Double Paradiddle", es: "Paradiddle doble", difficulty: "core", subdivision: "triplet", tempoRange: "extended", tier: "intermediate", prerequisites: ["Single Paradiddle"] },
  { category: "rudiments", subcategory: null, en: "Triple Paradiddle", es: "Paradiddle triple", difficulty: "core", subdivision: "eighth", tempoRange: "extended", tier: "intermediate", prerequisites: ["Double Paradiddle"] },
  { category: "rudiments", subcategory: null, en: "Paradiddle-Diddle", es: "Paradiddle-diddle", difficulty: "advanced", subdivision: "triplet", tempoRange: "extended", tier: "intermediate", prerequisites: ["Triple Paradiddle"] },
  { category: "rudiments", subcategory: null, en: "Flam", es: "Flam", difficulty: "core", subdivision: "quarter", tempoRange: "extended", tier: "basics", prerequisites: [] },
  { category: "rudiments", subcategory: null, en: "Flam Accent", es: "Flam acentuado", difficulty: "advanced", subdivision: "triplet", tier: "basics", prerequisites: ["Flam Tap"] },
  { category: "rudiments", subcategory: null, en: "Flam Tap", es: "Flam tap", difficulty: "advanced", subdivision: "eighth", tier: "basics", prerequisites: ["Flam"] },
  { category: "rudiments", subcategory: null, en: "Drag", es: "Drag", difficulty: "advanced", subdivision: "quarter", tier: "basics", prerequisites: ["Flam"] },
  { category: "rudiments", subcategory: null, en: "Ratamacue", es: "Ratamacue", difficulty: "advanced", subdivision: "triplet", tier: "intermediate", prerequisites: ["Drag"] },
  { category: "rudiments", subcategory: null, en: "Single Strokes Four", es: "Golpes Simples Cuatro", difficulty: "advanced", subdivision: "triplet", tempoRange: "extended", tier: "intermediate", prerequisites: ["Single Strokes"] },
  { category: "rudiments", subcategory: null, en: "Single Strokes Seven", es: "Golpes Simples Siete", difficulty: "advanced", subdivision: "sixteenthTriplet", tempoRange: "cap180", tier: "intermediate", prerequisites: ["Single Strokes Four"] },
  { category: "rudiments", subcategory: null, en: "5 Stroke Roll", es: "Redoble de 5 Golpes", difficulty: "advanced", subdivision: "sixteenth", tier: "basics", prerequisites: ["Single Strokes", "Double Strokes"] },
  { category: "rudiments", subcategory: null, en: "6 Stroke Roll", es: "Redoble de 6 Golpes", difficulty: "advanced", subdivision: "sixteenth", tier: "intermediate", prerequisites: ["5 Stroke Roll"] },
  { category: "rudiments", subcategory: null, en: "7 Stroke Roll", es: "Redoble de 7 Golpes", difficulty: "advanced", subdivision: "sixteenth", tier: "intermediate", prerequisites: ["6 Stroke Roll"] },
  { category: "rudiments", subcategory: null, en: "9 Stroke Roll", es: "Redoble de 9 Golpes", difficulty: "advanced", subdivision: "sixteenth", tier: "intermediate", prerequisites: ["7 Stroke Roll"] },
  { category: "rudiments", subcategory: null, en: "10 Stroke Roll", es: "Redoble de 10 Golpes", difficulty: "advanced", subdivision: "sixteenth", tier: "advanced", prerequisites: ["9 Stroke Roll"] },
  { category: "rudiments", subcategory: null, en: "11 Stroke Roll", es: "Redoble de 11 Golpes", difficulty: "advanced", subdivision: "sixteenth", tier: "advanced", prerequisites: ["10 Stroke Roll"] },
  { category: "rudiments", subcategory: null, en: "13 Stroke Roll", es: "Redoble de 13 Golpes", difficulty: "advanced", subdivision: "sixteenth", tier: "advanced", prerequisites: ["11 Stroke Roll"] },
  { category: "rudiments", subcategory: null, en: "15 Stroke Roll", es: "Redoble de 15 Golpes", difficulty: "advanced", subdivision: "sixteenth", tier: "advanced", prerequisites: ["13 Stroke Roll"] },
  { category: "rudiments", subcategory: null, en: "17 Stroke Roll", es: "Redoble de 17 Golpes", difficulty: "advanced", subdivision: "sixteenth", tier: "advanced", prerequisites: ["15 Stroke Roll"] },
  { category: "rudiments", subcategory: null, en: "Lesson 25", es: "Lección 25", difficulty: "advanced", subdivision: "eighth", tier: "intermediate", prerequisites: ["Single Strokes", "Double Strokes"] },
  { category: "rudiments", subcategory: null, en: "Single Drag Tap", es: "Drag Tap Simple", difficulty: "advanced", subdivision: "eighth", tempoRange: "cap180", tier: "intermediate", prerequisites: ["Drag"] },
  { category: "rudiments", subcategory: null, en: "Single Dragadiddle", es: "Dragadiddle Simple", difficulty: "advanced", subdivision: "sixteenth", tier: "intermediate", prerequisites: ["Drag"] },
  { category: "rudiments", subcategory: null, en: "Drag Paradiddle #1", es: "Drag Paradiddle #1", difficulty: "advanced", subdivision: "sixteenth", tier: "advanced", prerequisites: ["Single Paradiddle", "Drag"] },
  { category: "rudiments", subcategory: null, en: "Drag Paradiddle #2", es: "Drag Paradiddle #2", difficulty: "advanced", subdivision: "sixteenth", tier: "advanced", prerequisites: ["Double Paradiddle", "Drag"] },
  { category: "rudiments", subcategory: null, en: "Flammed Mill", es: "Flammed Mill", difficulty: "advanced", subdivision: "sixteenth", tier: "advanced", prerequisites: ["Flam"] },
  { category: "rudiments", subcategory: null, en: "Swiss Army Triplet", es: "Swiss Army Triplet", difficulty: "advanced", subdivision: "triplet", tier: "advanced", prerequisites: ["Single Paradiddle"] },
  { category: "rudiments", subcategory: null, en: "Flamacue", es: "Flamacue", difficulty: "advanced", subdivision: "sixteenth", tempoRange: "cap180", tier: "intermediate", prerequisites: ["Flam"] },
  { category: "rudiments", subcategory: null, en: "Triple Stroke Roll", es: "Redoble Triple", difficulty: "advanced", subdivision: "triplet", tier: "intermediate", prerequisites: ["Double Strokes"] },
  { category: "rudiments", subcategory: null, en: "Flam Paradiddle", es: "Flam Paradiddle", difficulty: "advanced", subdivision: "sixteenth", tier: "intermediate", prerequisites: ["Single Paradiddle", "Flam"] },
  { category: "rudiments", subcategory: null, en: "Patafla-fla", es: "Patafla-fla", difficulty: "advanced", subdivision: "eighth", tier: "advanced", prerequisites: ["Flam"] },
  { category: "rudiments", subcategory: null, en: "Double Drag Tap", es: "Drag Tap Doble", difficulty: "advanced", subdivision: "triplet", tier: "advanced", prerequisites: ["Drag"] },
  { category: "rudiments", subcategory: null, en: "Flam Paradiddle-diddle", es: "Flam Paradiddle-diddle", difficulty: "advanced", subdivision: "triplet", tempoRange: "cap180", tier: "advanced", prerequisites: ["Flam Paradiddle"] },
  { category: "rudiments", subcategory: null, en: "Single Ratamacue", es: "Ratamacue Simple", difficulty: "advanced", subdivision: "triplet", tier: "intermediate", prerequisites: ["Ratamacue"] },
  { category: "rudiments", subcategory: null, en: "Double Ratamacue", es: "Ratamacue Doble", difficulty: "advanced", subdivision: "triplet", tier: "advanced", prerequisites: ["Single Ratamacue"] },
  { category: "rudiments", subcategory: null, en: "Triple Ratamacue", es: "Ratamacue Triple", difficulty: "advanced", subdivision: "triplet", tier: "advanced", prerequisites: ["Double Ratamacue"] },
  { category: "rudiments", subcategory: null, en: "Inverted Flam Tap", es: "Flam Tap Invertido", difficulty: "advanced", subdivision: "eighth", tier: "advanced", prerequisites: ["Flam"] },
  { category: "rudiments", subcategory: null, en: "Flam Drag", es: "Flam Drag", difficulty: "advanced", subdivision: "triplet", tier: "advanced", prerequisites: ["Flam"] },
  { category: "exercises", subcategory: null, en: "Push Pull - Right Hand", es: "Push Pull - Mano Derecha", difficulty: "advanced", subdivision: "eighth", exerciseGroup: "hand" },
  { category: "exercises", subcategory: null, en: "Push Pull - Left Hand", es: "Push Pull - Mano Izquierda", difficulty: "advanced", subdivision: "eighth", exerciseGroup: "hand" },
  { category: "exercises", subcategory: null, en: "Bass Drum - Heel Down", es: "Bombo - Talón Abajo", difficulty: "core", subdivision: "eighth", exerciseGroup: "footwork", tempoRange: "footwork" },
  { category: "exercises", subcategory: null, en: "Bass Drum - Heel Up", es: "Bombo - Talón Arriba", difficulty: "core", subdivision: "eighth", exerciseGroup: "footwork" },
  { category: "exercises", subcategory: null, en: "Bass Drum - Slide Technique", es: "Bombo - Técnica de Deslizamiento", difficulty: "advanced", subdivision: "eighth", exerciseGroup: "footwork" },
  { category: "exercises", subcategory: null, en: "Double Bass Drum", es: "Doble bombo", difficulty: "advanced", exerciseGroup: "footwork" },
  { category: "exercises", subcategory: null, en: "Flow, 16th Notes", es: "Flow, semicorcheas", difficulty: "advanced", exerciseGroup: "coordination" },
  { category: "exercises", subcategory: null, en: "RLKK", es: "RLKK", difficulty: "advanced", exerciseGroup: "coordination" },
  { category: "exercises", subcategory: null, en: "RKKL", es: "RKKL", difficulty: "advanced", exerciseGroup: "coordination" },
  { category: "exercises", subcategory: null, en: "KKRL", es: "KKRL", difficulty: "advanced", exerciseGroup: "coordination" },
  { category: "exercises", subcategory: null, en: "KRLK", es: "KRLK", difficulty: "advanced", exerciseGroup: "coordination" },
  { category: "exercises", subcategory: null, en: "RLLK", es: "RLLK", difficulty: "advanced", exerciseGroup: "coordination" },
  { category: "exercises", subcategory: null, en: "R L L (Triplets)", es: "R L L (Tresillos)", difficulty: "advanced", exerciseGroup: "coordination" },
  { category: "exercises", subcategory: null, en: "Finger Technique (Single-Handed)", es: "Técnica de dedos (una mano)", difficulty: "core", exerciseGroup: "hand" },
  { category: "exercises", subcategory: null, en: "16th Note Single Strokes Around the Set", es: "Golpes simples en semicorcheas alrededor de la batería", difficulty: "core", exerciseGroup: "coordination" },
  { category: "exercises", subcategory: null, en: "Hi-hat Pedal - Heel Up", es: "Pedal de Hi-hat - Talón Arriba", difficulty: "advanced", subdivision: "eighth", exerciseGroup: "footwork" },
  { category: "exercises", subcategory: null, en: "Hi-hat Pedal - Heel Down", es: "Pedal de Hi-hat - Talón Abajo", difficulty: "advanced", subdivision: "eighth", exerciseGroup: "footwork" },
  { category: "exercises", subcategory: null, en: "Three-Note Pattern #1", es: "Patrón de Tres Notas #1", difficulty: "core", subdivision: "sixteenth", exerciseGroup: "hand", pattern: { en: "1 eighth note + 2 sixteenth notes", es: "1 corchea + 2 semicorcheas" } },
  { category: "exercises", subcategory: null, en: "Three-Note Pattern #2", es: "Patrón de Tres Notas #2", difficulty: "core", subdivision: "sixteenth", exerciseGroup: "hand", pattern: { en: "2 sixteenth notes + 1 eighth note", es: "2 semicorcheas + 1 corchea" } },
  { category: "exercises", subcategory: null, en: "Three-Note Pattern #3", es: "Patrón de Tres Notas #3", difficulty: "core", subdivision: "sixteenth", exerciseGroup: "hand", pattern: { en: "1 sixteenth note + 1 eighth note + 1 sixteenth note", es: "1 semicorchea + 1 corchea + 1 semicorchea" } },
];
// Rudiment names stay in English in every language (they are international); exercise names are translated.
const PRACTICE_EXERCISES = withNl(PRACTICE_EXERCISES_BASE).map((o) => o.category === "rudiments" ? { ...o, es: o.en, nl: o.en } : o);
// Structured sticking data for the Practice Mode metronome's sticking panel. A token is one stroke:
// hand ("R"/"L"), an optional grace flag (soft pre-stroke for flams/drags, rendered smaller/dimmer),
// and an optional count (for repeated strokes shown as a superscript, e.g. R R -> R²). Authored below
// as compact shorthand strings ("l l R L R L") and parsed once into tokens at module load, so the
// value every component actually reads (EXERCISE_STICKING) is real structured data, not a string
// re-parsed at render time. Shorthand: uppercase = normal stroke, lowercase = grace note, a trailing
// digit = stroke count (R2 -> R with a superscript 2).
type StickingToken = { hand: "R" | "L"; grace?: boolean; count?: number };
// `secondTokens` is set for rudiments given as two sides (e.g. "starting on R" — "starting on L"),
// shown split by a dash so a long pattern wraps to a new line as a whole side, not mid-letter.
type StickingEntry = { tokens: StickingToken[]; secondTokens?: StickingToken[] };
function parseSticking(shorthand: string): StickingToken[] {
  return shorthand.trim().split(/\s+/).map((raw): StickingToken => {
    const letter = raw[0];
    const hand = letter.toUpperCase() as "R" | "L";
    const grace = letter !== letter.toUpperCase();
    const count = raw.length > 1 ? Number(raw.slice(1)) : undefined;
    return grace ? { hand, grace: true, count } : { hand, count };
  });
}
function parseStickingEntry(shorthand: string): StickingEntry {
  const [first, second] = shorthand.split("—").map((side) => side.trim());
  return second ? { tokens: parseSticking(first), secondTokens: parseSticking(second) } : { tokens: parseSticking(first) };
}
const EXERCISE_STICKING: Record<string, StickingEntry> = Object.fromEntries(
  Object.entries({
    "Single Strokes": "R L R L",
    "Double Strokes": "R R L L",
    "Single Paradiddle": "R L R R L R L L",
    "Double Paradiddle": "R L R L R R L R L R L L",
    "Triple Paradiddle": "R L R L R L R R L R L R L R L L",
    "Paradiddle-Diddle": "R L R R L L",
    "Flam": "l R",
    "Flam Accent": "l R L R",
    "Flam Tap": "l R R r L L",
    "Drag": "l l R",
    "Ratamacue": "l l R L R L",
    "Single Strokes Four": "R L R L",
    "Single Strokes Seven": "R L R L R L R",
    "5 Stroke Roll": "R R L L R",
    "6 Stroke Roll": "R L L R R L",
    "7 Stroke Roll": "R R L L R R L",
    "9 Stroke Roll": "R2 L2 R2 L",
    "10 Stroke Roll": "R2 L2 R2 L2",
    "11 Stroke Roll": "R2 L2 R2 L2 R",
    "13 Stroke Roll": "R2 L2 R2 L2 R2 L",
    "15 Stroke Roll": "R2 L2 R2 L2 R2 L2 R",
    "17 Stroke Roll": "R2 L2 R2 L2 R2 L2 R2 L",
    "Lesson 25": "l l R L R",
    "Single Drag Tap": "l l R L",
    "Single Dragadiddle": "l l R L R R — r r L R L L",
    "Drag Paradiddle #1": "R l l R L R R",
    "Drag Paradiddle #2": "R l l R l l R L R R",
    "Flammed Mill": "l R R L R",
    "Swiss Army Triplet": "l R R L",
    "Flamacue": "l R L R L r L",
    "Triple Stroke Roll": "R R R L L L",
    "Flam Paradiddle": "l R L R R",
    "Patafla-fla": "l R L R r L",
    "Double Drag Tap": "l l R l l R L — r r L r r L R",
    "Flam Paradiddle-diddle": "l R L R R L L",
    "Single Ratamacue": "l l R L R L",
    "Double Ratamacue": "l l R l l R L R L",
    "Triple Ratamacue": "l l R l l R l l R L R L",
    "Inverted Flam Tap": "l R L",
    "Flam Drag": "l R l l R",
    "R L L (Triplets)": "R L L",
  }).map(([key, shorthand]) => [key, parseStickingEntry(shorthand)])
);
const CHALLENGE_EXERCISE_OPTIONS: { en: string; es: string; nl: string }[] = (() => {
  const seen = new Set<string>();
  const combined: { en: string; es: string; nl: string }[] = [];
  [...PRACTICE_EXERCISES, ...PRACTICE_ITEMS].forEach((item) => {
    if (!seen.has(item.en)) { seen.add(item.en); combined.push({ en: item.en, es: item.es, nl: item.nl }); }
  });
  return combined;
})();
const BPM_LEVELS = [50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 165, 170, 175, 180, 185, 190, 195, 200, 205, 210, 215, 220];
const PRACTICE_TIERS = [
  { key: "beginner", min: 50, max: 90 },
  { key: "intermediate", min: 100, max: 150 },
  { key: "advanced", min: 160, max: 190 },
  { key: "legend", min: 195, max: 220 },
];
// A handful of harder rudiments (flams, triplet/8th-note-counted patterns) get a wider ceiling --
// an advanced player can genuinely go faster on these than the default 220 cap allows. Only
// PRACTICE_EXERCISES entries tagged tempoRange:"extended" use these; everything else keeps the
// default ladder above unchanged.
const EXTENDED_BPM_LEVELS = [...BPM_LEVELS, 225, 230, 235, 240, 245, 250, 255, 260, 265, 270, 275, 280];
const EXTENDED_PRACTICE_TIERS = [
  { key: "beginner", min: 50, max: 90 },
  { key: "intermediate", min: 100, max: 170 },
  { key: "advanced", min: 180, max: 220 },
  { key: "legend", min: 220, max: 280 },
];
// Bass Drum - Heel Down: a 50-200 BPM ladder in flat 5-BPM steps, instead of the default
// 50-220 ladder's mixed granularity, with tier boundaries given directly (these overlap at
// 90/130/160, same as EXTENDED_PRACTICE_TIERS' advanced/legend boundary at 220 above).
// Single Strokes Seven, Single Drag Tap, Flamacue and Flam Paradiddle-diddle are very hard at speed, so their ladder stops at 180 BPM (50-150 in 10s, then 5s)
// with four even tiers over that range.
const CAP180_BPM_LEVELS = [50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 165, 170, 175, 180];
const CAP180_PRACTICE_TIERS = [
  { key: "beginner", min: 50, max: 80 },
  { key: "intermediate", min: 90, max: 120 },
  { key: "advanced", min: 130, max: 160 },
  { key: "legend", min: 165, max: 180 },
];
const FOOTWORK_BPM_LEVELS = [50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 105, 110, 115, 120, 125, 130, 135, 140, 145, 150, 155, 160, 165, 170, 175, 180, 185, 190, 195, 200];
const FOOTWORK_PRACTICE_TIERS = [
  { key: "beginner", min: 50, max: 90 },
  { key: "intermediate", min: 90, max: 130 },
  { key: "advanced", min: 130, max: 160 },
  { key: "legend", min: 160, max: 200 },
];
function bpmLevelsFor(itemEn: string) {
  const tempoRange = PRACTICE_EXERCISES.find((e) => e.en === itemEn)?.tempoRange;
  return tempoRange === "extended" ? EXTENDED_BPM_LEVELS : tempoRange === "footwork" ? FOOTWORK_BPM_LEVELS : tempoRange === "cap180" ? CAP180_BPM_LEVELS : BPM_LEVELS;
}
function tiersFor(itemEn: string) {
  const tempoRange = PRACTICE_EXERCISES.find((e) => e.en === itemEn)?.tempoRange;
  return tempoRange === "extended" ? EXTENDED_PRACTICE_TIERS : tempoRange === "footwork" ? FOOTWORK_PRACTICE_TIERS : tempoRange === "cap180" ? CAP180_PRACTICE_TIERS : PRACTICE_TIERS;
}
const RATING_RANK: Record<string, number> = { not_ready: 1, tense: 2, almost: 3, comfortable: 4, mastered: 5 };
const RATING_ORDER = ["not_ready", "tense", "almost", "comfortable", "mastered"];
const RATINGS_NEEDING_NOTE = ["not_ready", "tense", "almost"];
const RATING_COLOR: Record<string, string> = { not_ready: "#e2877d", tense: "#f6ad55", almost: "#f2c94c", comfortable: "#68d391", mastered: "#68d391" };
// Essentials library: the only Skill Trainer exercises shown (the Exercises list). Rudiments keep their own "core only" rule.
const ESSENTIAL_EXERCISES = new Set(["Finger Technique (Single-Handed)", "Bass Drum - Heel Down", "Bass Drum - Heel Up", "16th Note Single Strokes Around the Set"]);
// Comfortable minutes needed to unlock a tempo (AGE_CONFIG: 1 for under 14, otherwise 2). It is set from the age band of whoever
// is being shown (the signed-in student, or the student the admin has open) at the start of each render, before anything reads it.
let UNLOCK_MINUTES = 2;
const IS_ANDROID = typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
// How far ahead (seconds) the metronome schedules clicks on the audio clock. Longer on Android, where timers and audio can hiccup.
const SCHEDULE_AHEAD_SECONDS = IS_ANDROID ? 0.25 : 0.1;
// When the app is sent to the background the phone slows our timers to about once a second, so the clicks are scheduled this far ahead
// on the audio clock instead (the audio keeps playing on its own); they are cancelled and re-planned when the app comes back.
const BACKGROUND_AHEAD_SECONDS = 45;
function setUnlockMinutesForAge(band: AgeBand | null) { UNLOCK_MINUTES = band ? AGE_CONFIG[band].unlockMinutes : 2; }
const MAX_PINNED_EXERCISES = 5;
const RATING_ICON: Record<string, string> = { not_ready: "🔴", tense: "🟠", almost: "🟡", comfortable: "🟢", mastered: "⭐" };
function qualifyingMinutesFor(sessions: { item_en: string; bpm: number; rating: string; duration_minutes: number }[], itemEn: string, targetBpm: number) {
  return sessions.filter((s) => s.item_en === itemEn && s.bpm === targetBpm && (s.rating === "comfortable" || s.rating === "mastered")).reduce((sum, s) => sum + s.duration_minutes, 0);
}
function tierProgressFor(sessions: { item_en: string; bpm: number; rating: string; duration_minutes: number }[], itemEn: string, tier: { min: number; max: number }) {
  const levels = bpmLevelsFor(itemEn).filter((l) => l >= tier.min && l <= tier.max);
  const done = levels.filter((l) => qualifyingMinutesFor(sessions, itemEn, l) >= UNLOCK_MINUTES);
  return levels.length ? (done.length / levels.length) * 100 : 0;
}
// A tier's unfinished remainder reads as "skipped" (dotted, not empty) when a later tier already
// has some progress — i.e. the user jumped ahead instead of working through what's left here. This
// applies even when the tier itself is partially done (not just fully untouched), so e.g. practicing
// 50 and 100 but not 60-90 dots out the Beginner tier's remaining, unpracticed levels.
// "later" uses >= (not just >) on purpose: some tier sets give adjacent tiers a shared boundary
// BPM (e.g. FOOTWORK_PRACTICE_TIERS' 90/130/160) rather than a gap between them -- with a strict
// >, a tier whose max exactly equals the next tier's min was never recognized as "later", so
// jumping ahead past that shared boundary silently never showed the dotted remainder.
function tierIsSkipped(sessions: { item_en: string; bpm: number; rating: string; duration_minutes: number }[], itemEn: string, tier: { min: number; max: number }) {
  return tiersFor(itemEn).some((t) => t.min >= tier.max && t !== tier && tierProgressFor(sessions, itemEn, t) > 0);
}
// Solid fill for what's actually done, plus a dashed remainder for what's left when tierIsSkipped
// flags this tier as jumped-ahead-past, so the gap reads as "skipped" rather than "not reached yet".
function renderTierSegBar(pct: number, skipped: boolean) {
  return <div className="seg-bar">
    {pct > 0 && <i className="seg-bar-fill" style={{ width: `${pct}%` }} />}
    {skipped && pct < 100 && <i className="seg-bar-remainder" style={{ width: `${100 - pct}%` }} />}
  </div>;
}

const translations = {
  en: {
    nav: { today: "Home", practice: "Practice", group: "Group", progress: "Progress", settings: "Settings", admin: "Admin" },
    confirm: { cancel: "Cancel", confirm: "Confirm" },
    drumPoints: { yearAndWeek: "You're #1 this year and this week!", weekBest: "You're #1 this week!", weekPoints: (n: number) => `${n} ${n === 1 ? "point" : "points"} this week`, askTitle: "Drum Points", askText: "Get 1 point for every minute you practise. Compare with drummers your age (first names only).", askYes: "Yes, count my points", askNo: "Not now", earned: (n: number) => `+${n} ${n === 1 ? "point" : "points"}`, thisYear: "this year", yearTotal: "Points this year", movedUp: "You moved up!", passed: (name: string) => `You passed ${name}!`, passMore: (g: number, name: string) => `Practise ${g} more ${g === 1 ? "minute" : "minutes"} to pass ${name}`, numberOne: "You're #1 this year!", nice: "Nice!", boardYear: "This year", boardAll: "All time", boardTitle: "Drum Points ranking", boardEmpty: "No points yet. Practise a tempo for a minute to start.", switchLabel: "Drum Points", switchDesc: "Earn points for practising and compare with drummers your age.", cardYear: "This year" },
    today: {
      heroLine1: "DISCIPLINE", heroLine1b: "BUILDS", heroLine2: "SKILL.", startPracticeTitle: "Start Practice", startPracticeSub: "Set a timer and get to it", noPracticeTitle: "No practice yet", goalShort: "Goal", practiceRudiment: "Practice a rudiment", seeAll: "See all", currentStreak: "Current streak", days: "days", pointsTitle: "POINTS",
      pointsCardTitle: "YOUR POINTS", pointsCardCta: "View rewards", pointsCardKickoff: "Start earning points", pointsCardRankOne: "You're #1", pointsCardTop3: "You're in the Top 3", pointsCardKeepGoing: "Keep going",
      todaysPractice: "Today's practice", metronome: "Metronome", howLong: "HOW LONG DID YOU PRACTISE?", practiceTimeHeading: "PRACTICE TIME", whatPractised: "ADD WHAT YOU PRACTISED",
      notes: "NOTES", notesPrefix: "Notes:", optional: "OPTIONAL", notesPlaceholder: "What did you practise today?", savePractice: "Save practice", practiceSaved: "✓ Practice saved",
      todayGoal: "TODAY'S GOAL", equipment: "PRACTISED WITH", drumset: "Drum Set", pad: "Practice Pad", equipmentBoth: "Drum Set & Practice Pad", addNotes: "+ Add notes", minShort: "min", minOn: (minutes: number, equipmentName: string) => `${formatMinutes(minutes)} on ${equipmentName}`,
      todaySummary: "TODAY", noPracticeYet: "No practice yet.", secondsCarried: "extra (not counted in minutes yet)", todaySoFar: (total: string) => `${total} already logged today, this adds on top`,
      resetPractice: "Reset", confirmResetPractice: "Clear today's practice and start over? This can't be undone.",
      noGoalTitle: "Set your daily goal", noGoalSubtitle: "Small daily minutes turn into real progress. Pick a goal and start your streak today.", noGoalBtn: "Set my goal",
      whatDidYouPractiseTitle: "WHAT DID YOU PRACTISE?", whatDidYouPractiseSubtitle: "Pick at least one.", addOwnPlaceholder: "Add your own...", addOwnBtn: "Add",
      rudiments: "Rudiments", searchRudiments: "Search rudiments...", searchExercises: "Search exercises...", books: "Books", myItems: "My Items", addOwnBookPlaceholder: "Add your own book...", pickerDone: "Done",
    },
    calendar: {
      title: "CALENDAR", longestStreak: "Longest streak", daysThisYear: "Days this year",
      weekdays: ["M", "T", "W", "T", "F", "S", "S"], futureDay: "You can't log practice for a future day.",
      noPractice: "No practice logged for this day. Log today's practice from the Today tab.", minPractised: "practised",
      notesPlaceholder: "What did you practise that day?", saving: "Saving...",
      deleteEntry: "Delete entry", pickOneItem: "Pick at least one thing you practised.", confirmDeleteEntry: "Delete this day's practice? This can't be undone.", couldNotDeleteEntry: "Could not delete this entry.",
      goalMet: "🎯 Daily goal reached", goalMissed: (done: string, total: string) => `${done} / ${total} toward your goal`,
      onEquipment: (label: string) => `On ${label}`,
      streakOnDay: (n: number) => `🔥 ${n}-day streak`, noPracticeShort: "No practice logged for this day.",
      editDay: "Edit this day", nothingToEdit: "+ Log practice for this day", todayBtn: "Today",
    },
    group: {
      yourCrew: "YOUR CREW", youreIn: "You're in.", inviteMsg: "Invite drummers with this code:", copyInvite: "Copy invite code",
      challenges: "CHALLENGES",
      practiseTogether: "PRACTISE TOGETHER", yourGroup: "YOUR GROUP", switchGroup: "SWITCH GROUP", moreOptions: "More", inviteShort: "Invite code", noChallengesShort: "No challenges yet.", showMore: (n: number) => `Show ${n} more`, showLess: "Show less", findCrew: "Find your crew.", startGroup: "Start a group", joinCrew: "Join your crew",
      intro: "Stay accountable, climb the leaderboard, and make practice more fun.", createGroupBtn: "Create a group", joinWithCode: "Join with invite code",
      groupNamePlaceholder: "Group name", inviteCodePlaceholder: "Invite code", pleaseWait: "Please wait...", createGroup: "Create group",
      joinGroup: "Join group", back: "Back", inviteNotFound: "That invite code was not found.", couldNotCreate: "Could not create group.",
      leaderboard: "LEADERBOARD", timePractised: "TIME PRACTISED", daysShort: "days", you: "You",
      teacherBadge: "Admin", showTeacherStats: "Show admin stats",
      awardMostDays: "Most practice days this year", awardMostMinutes: "Most time practised",
      medalBoard: "Hall of Fame", medalBoardEmpty: "No one yet", medalBoardAllTime: "ALL-TIME", medalBoardThisWeek: "THIS WEEK",
      awardConsistency: "Most Consistent", awardStreak: "On a Streak", awardChallenge: "Challenge Champion", awardImproved: "Most Improved",
      awardDaysValue: (v: number) => `${v} day${v === 1 ? "" : "s"}`, awardUnlocksValue: (v: number) => `${v} new tempo${v === 1 ? "" : "s"}`, awardChallengeValue: (pct: number) => `${pct}% there`,
      groupSettings: "GROUP SETTINGS", countFromCreation: "Stats start tracking from", enableWeeklyAwards: "Enable weekly awards",
      dateModeCalendar: "Jan 1", dateModeToday: "Group start", dateModeCustom: "Custom date",
      countFromCreationDesc: "Sets the starting date for this group's practice-day and time-practised leaderboards.",
      noChallenges: "No challenges yet. Start one with your crew!", noChallengesMember: "No challenges yet. Your teacher can start one.", newChallenge: "+ New challenge", cancel: "Cancel", challengeNamePlaceholder: "Challenge name",
      typeDaily: "Every day", typeMinutes: "Total minutes", typeSessions: "Days practised", goalLabel: "GOAL", startLabel: "START", endLabel: "END", quickStart: "QUICK START", typeLabel: "TYPE", lengthLabel: "LENGTH", lengthDays: (n: number) => `${n} day${n === 1 ? "" : "s"}`, lengthCustom: "Custom", stakesToggle: "Reward / If you lose (optional)",
      rewardPlaceholder: "Reward (optional)", punishmentPlaceholder: "If you lose (optional)", createChallengeBtn: "Create challenge",
      joinChallengeBtn: "Join challenge", joined: "Joined", participants: (n: number) => `${n} joined`,
      dailyGoalDesc: (min: number) => `${min}+ min every day`, minutesGoalDesc: (total: number) => `Reach ${total} total min`,
      sessionsGoalDesc: (days: number) => `Practise on ${days} days`, daysProgress: (p: number, t: number) => `${p}/${t} days`,
      minutesProgress: (p: number, t: number) => `${p}/${t} min`, reward: "Reward:", punishment: "If you lose:", couldNotCreateChallenge: "Could not create challenge.",
      presetDaily5: "3 min every day", presetDaily30x5: "30+ min, 5 days straight", presetSessions3weekly: "3 sessions this week", presetDaily5x20: "20-day challenge: 5+ min daily",
      noOnePractised: "No one practised on this day.",
      weekdaysMon: ["M", "T", "W", "T", "F", "S", "S"], copied: "Copied!", progress: "PROGRESS", leaveGroup: "Leave group",
      confirmLeave: "Leave this group? You can rejoin later with the invite code.", confirmDeleteChallenge: "Delete this challenge? This can't be undone.",
      deleteChallenge: "Delete", since: (date: string) => `Since ${date}`, couldNotLeave: "Could not leave the group.", couldNotDeleteChallenge: "Could not delete the challenge.",
      deleteGroupBtn: "Delete group", confirmDeleteGroup: "Delete this group? This removes it for everyone and can't be undone.", couldNotDeleteGroup: "Could not delete the group.",
    },
    achievements: {
      unlocked: "unlocked", nextUp: "Next", allDone: "All unlocked", done: "Unlocked",
      level: (l: number, n: number) => l === 0 ? "Locked" : `Level ${l} of ${n}`, levelShort: (l: number) => `Level ${l}`, notYet: "Not yet",
      category: { time: "Time", streak: "Streak", days: "Consistency", sessions: "Trainer", tempo: "Tempo", variety: "Variety", long: "Long day", challenges: "Challenges", mastery: "Mastery" } as Record<string, string>,
      label: (key: string, n: number) => {
        switch (key) {
          case "time": return n < 1 ? `${Math.round(n * 60)} minutes practised` : `${n} ${n === 1 ? "hour" : "hours"} practised`;
          case "streak": return `${n}-day streak`;
          case "days": return `${n} days practised`;
          case "sessions": return n === 1 ? "First Skill Trainer session" : `${n} Skill Trainer sessions`;
          case "tempo": { const need = TEMPO_REQUIRED_BY_BPM[n] ?? 5; return `${need} ${need === 1 ? "rudiment" : "rudiments"} at ${n} BPM`; }
          case "variety": return `${n} different exercises`;
          case "long": return `${n} min in one day`;
          case "mastery": return n === 1 ? "First session rated mastered" : `${n} sessions rated mastered`;
          default: return n === 1 ? "First challenge won" : `${n} challenges won`;
        }
      },
    },
    progressPage: {
      eyebrow: "PRACTICE SUMMARY", title: "PROGRESS", yourPractice: "YOUR PRACTICE",
      noData: "Log some practice to see your progress here.", pinned: "YOUR FOCUS", generalPractice: "General Practice", seeMore: "See more", seeLess: "See less",
      skillProgress: "SKILL PROGRESS", noSkillData: "Train an exercise's BPM levels to see your skill progress here.",
      levelsLabel: (done: number, total: number) => `${done}/${total} levels`, overallLevel: "Overall level", levelOf: (n: number, total: number) => `Level ${n} of ${total}`, infoTitle: "How is this calculated?", info1: "An exercise reaches a tier when you unlock one tempo in it.", info2: "Your level is the highest tier that at least 1 in 4 of your exercises has reached.", info3: "The bars show how many of your exercises reached each tier.", infoClose: "Got it", overallReached: (n: number, total: number, tier: string) => `${n} of ${total} exercises reached ${tier}`, noTierExercises: "No exercises at this level yet.", unlocksTitle: "RECENT UNLOCKS", unlocksEmpty: "Unlock a tempo in the Skill Trainer to see it here.", unlockedBpm: (bpm: number) => `${bpm} BPM unlocked`,
      achievements: "MILESTONES", achievementsIntro: "Complete a Personal Challenge on the Practice tab to win a trophy here. More milestones coming soon.",
    },
    cheers: {
      sendBtn: "Send a cheer", recentTitle: "RECENT CHEERS", remove: "Remove", undo: "Undo", undoSent: "Undo (removes it for everyone)", you: "You", bellTitle: "CHEERS", heart: "Like", heartedYours: (name: string) => `${name} liked your cheer`, inboxEmpty: "No cheers yet.", cheerGroupBtn: "Cheer the whole group", cheerGroup: "CHEER THE GROUP", cheerPerson: (name: string) => `CHEER ${name.toUpperCase()}`, tapNameHint: "Tap a name to send a cheer.", incoming: (name: string) => `${name} sent a cheer`, sheetTitle: "SEND A CHEER", toLabel: "TO", everyone: "Everyone", sent: "Cheer sent!",
      newCount: (n: number) => n === 1 ? "1 new cheer" : `${n} new cheers`, gotIt: "Got it", toYou: "to you",
      couldNotSend: "Could not send the cheer.",
    },
    personalChallenges: {
      title: "Personal Challenges", homeTitle: "PERSONAL CHALLENGES", subtitle: "Set your own practice goal.",
      newChallenge: "+ New challenge", cancel: "Cancel",
      exerciseLabel: "Exercise", minutesLabel: "Minutes per day", bpmLabel: "Target BPM (optional)", bpmPlaceholder: "Any tempo",
      lengthLabel: "Challenge length (days)", startChallenge: "Start challenge", pleaseWait: "Please wait...",
      noChallenges: "No personal challenges yet.",
      challengeTitle: (exercise: string, days: number) => `${exercise} — ${days} Day Challenge`, wonTitle: "Challenges won", wonPopupTitle: "Congratulations!", wonPopupOwn: (n: string) => `You completed your challenge: ${n}.`, wonPopupTeacher: (n: string) => `You completed the challenge from your teacher: ${n}.`, wonPopupSaved: "Your trophy is saved in Progress, under \"Challenges won\".", wonPopupSee: "See my trophies", wonPopupClose: "Close", wonEmpty: "Finish a personal challenge to win your first trophy.", wonMeta: (minutes: number, days: number, bpm: number | null) => `${minutes} min a day · ${days} days${bpm ? ` · ${bpm} BPM` : ""}`, wonFromTeacher: "From your teacher",
      challengeDescription: (minutes: number, bpm: number | null, days: number) => bpm ? `Practice ${minutes} min at ${bpm}+ BPM every day for ${days} consecutive days.` : `Practice ${minutes} min every day for ${days} consecutive days.`,
      statusActive: (done: number, total: number) => `${done}/${total} days`, statusCompleted: "✓ Completed — achievement unlocked!", statusFailed: "Challenge failed. Want to start over?",
      deleteChallenge: "Delete", confirmDelete: "Delete this challenge? This can't be undone.",
      fromTeacher: "From your teacher", failedShort: "Missed a day", statusCompletedShort: "Completed", perDayShort: "min / day", bpmShort: "BPM",
      giveTitle: "GIVE A CHALLENGE", giveBtn: "Give challenge", giveHint: "Shows on their Home and Challenges as \"From your teacher\". They can't delete it.", givenLabel: "CHALLENGES", noneGiven: "No challenges yet.", givenBadge: "Given by you", confirmRemove: "Remove this challenge from the student?", remove: "Remove", perDay: (m: number) => `${m} min a day`, couldNotGive: "Could not give the challenge.", lengthDaysN: (n: number) => `${n} days`, lengthCustomShort: "Other",
      resetChallenge: "Try again", confirmReset: "Restart this challenge from day 1?",
      couldNotCreate: "Could not create challenge.",
    },
    practiceMode: {
      eyebrow: "TRACK YOUR LEVELS", title: "PRACTICE MODE", pageEyebrow: "TRAIN", pageTitle: "PRACTICE",
      currentLevel: "CURRENT LEVEL", levelsUnlocked: (n: number, total: number) => `${n} of ${total} levels unlocked`,
      notStarted: "Not started",
      inProgress: "In progress", unlockedLabel: "Unlocked", confirmResetLevel: (bpm: number) => `Reset your progress at ${bpm} BPM? This can't be undone.`,
      editRatingTitle: "Change rating", skippedLabel: "Skipped",
      improvedToast: (from: string, to: string, exercise: string, bpm: number, days: number) => `Improved from ${from} to ${to} on ${exercise} · ${bpm} BPM in ${days} day${days === 1 ? "" : "s"}`, niceBtn: "Nice!",
      struggledFlagTitle: "You used to struggle at this tempo",
      tierBeginner: "BEGINNER", tierIntermediate: "INTERMEDIATE", tierAdvanced: "ADVANCED", tierLegend: "LEGEND",
      rudimentTierBasics: "FOUNDATION", rudimentTierIntermediate: "INTERMEDIATE", rudimentTierAdvanced: "COMPLEX",
      unlockFirst: (names: string) => `Unlock ${names} first`,
      tierUnlockedCount: (unlocked: number, total: number) => `${unlocked} of ${total} unlocked`,
      exerciseGroupHand: "HAND TECHNIQUES", exerciseGroupFootwork: "FOOTWORK", exerciseGroupCoordination: "COORDINATION",
      exercisesPracticedCount: (n: number, total: number) => `${n} of ${total} practiced`,
      subdivisionQuarter: "Quarter Notes", subdivisionEighth: "8th Notes", subdivisionTriplet: "Triplets", subdivisionSixteenth: "16th Notes", subdivisionSixteenthTriplet: "16th Note Triplets",
      ratingNotReady: "Not ready", ratingTense: "Tense", ratingAlmost: "Almost there", ratingComfortable: "Comfortable", ratingMastered: "Mastered",
      rateTitle: "HOW DID THAT FEEL?", rateSubtitle: (bpm: number) => `Rate your session at ${bpm} BPM to save it.`, skipRating: "Skip, don't log this",
      issueLabel: "WHAT HAPPENED? (OPTIONAL)", sessionNotePlaceholder: "Add a note (optional)", saveRating: "Save",
      backToBook: "Back to Practice Mode", couldNotSaveSession: "Could not save this session.",
      categoryRudiments: "Rudiments", categoryExercises: "Exercises", categoryRhythms: "Rhythms",
      pin: "Pin", pinned: "Pinned",
      maxPinnedReached: (max: number) => `You can pin up to ${max} exercises. Unpin one first.`,
      pinManagerEyebrow: (count: number, max: number) => `${count}/${max} PINNED`, pinManagerTitle: "Your Focus", pinManagerDone: "Done",
      pinManagerAddBtn: "+ Add exercise", pinManagerSearchPlaceholder: "Search exercises...", pinManagerEmpty: "Nothing pinned yet. Add up to 5 to track here.",
      quickTitle: "Quick Practice", quickSub: "Log minutes, metronome, timer", continueLabel: "Continue where you left off", recentDays: "RECENT DAYS", noRecentDays: "Nothing logged yet.", skillSearchPlaceholder: "Search rudiments and exercises", skillNoMatch: "Nothing matches that search.", skillSub: "Rudiments and exercises", challengesSub: "Set your own practice goal",
      trainTitle: "Skill Trainer",
      rudimentListIntro: "Unlock 2 tempos to open the next rudiment.",
      tempoCompleteIntro: (min: number) => `Practice a tempo for ${min} min to complete it.`,
      listIntroExercises: (min: number) => `Practice for ${min} min at each tempo to unlock the next level.`,
      listIntroRhythms: (min: number) => `Grooves and styles to build your musical vocabulary. Tap one, then log at least ${min} comfortable min at each BPM level to unlock it and move up.`,
    },
    onboarding: {
      languageTitle: "Choose your language", eyebrow: "WELCOME", exercisesTitle: "Pick your focus", goalTitle: "Daily practice goal", modeTitle: "Choose your content library", dobTitle: "When were you born?", dobHint: "We use this to set up your practice and your leaderboard group. Nobody else ever sees it.", dobError: "That date could not be saved. Check it and try again.",
      continueBtn: "Continue", finishBtn: "Finish", skipBtn: "Skip for now",
    },
    settings: {
      makeItYours: "MAKE IT YOURS", title: "SETTINGS", displayName: "DISPLAY NAME", dailyGoal: "DAILY PRACTICE GOAL", minutes: "minutes",
      language: "LANGUAGE", pushLabel: "Cheer notifications", pushDesc: "Get a notification on this phone when someone in your group sends you a cheer.", pushBlocked: "Notifications are blocked. Turn them on for DrumSkills in your phone's settings.", pushError: "Could not turn on notifications. Please try again.", showDaysThisYear: "Days practiced this year", showDaysThisYearDesc: "Adds a count of practice days this year to your Home stats.", on: "ON", off: "OFF", save: "Save settings", saved: "✓ Settings saved", logout: "Log out", calendarColor: "GROUP CALENDAR COLOR", autoColor: "Auto",
      metronomeTone: "METRONOME TONE", toneNames: { click: "Click", beep: "Beep", wood: "Wood", clave: "Clave" },
      profileSection: "PROFILE", practiceSection: "PRACTICE", preferencesSection: "PREFERENCES", accountSection: "ACCOUNT SETTINGS", pleaseWait: "Please wait...",
      confirmLogout: "Log out of DrumSkills?", libraryLabel: "CONTENT LIBRARY", libraryFull: "Full Library", libraryEssentials: "Essentials", libraryHint: "Essentials shows a shorter list for beginners.", dobLabel: "DATE OF BIRTH", dobSaved: "Saved. It stays private. If it is wrong, contact support to correct it.", dobHint: "Add it to get the right leaderboard group and starting settings. It stays private.", dobSave: "Save", difficultyLabel: "PRACTICE DIFFICULTY", difficultyBeginner: "Beginner", difficultyDeveloping: "Developing", difficultyStandard: "Standard", difficultyHint: "Beginner: quarter notes. Developing: eighth notes. Standard: the rudiment as written. The tempo (BPM) never changes.",
      changeEmail: "Change email", newEmailPlaceholder: "New email address", updateEmail: "Update email", emailChangeSent: "Check your new email to confirm the change.",
      changePassword: "Change password", newPasswordPlaceholder: "New password", confirmPasswordPlaceholder: "Confirm new password", updatePassword: "Update password", passwordChanged: "✓ Password updated", passwordMismatch: "Passwords don't match.", passwordTooShort: "Password must be at least 6 characters.",
      privacyPolicy: "Privacy Policy", termsOfUse: "Terms of Use", support: "Support",
      deleteAccount: "Delete account", deleteAccountWarning: "This permanently deletes your account and all your practice history. This can't be undone.", deleteAccountConfirmPrompt: (email: string) => `Type your email (${email}) to confirm:`, deleteAccountBtn: "Delete my account", deleteAccountBusy: "Deleting…", couldNotDeleteAccount: "Could not delete your account.",
    },
    admin: {
      title: "USER ACTIVITY", eyebrow: "ADMIN", noUsers: "No users yet.", neverPracticed: "Never practiced",
      dailyLogs: "DAILY LOGS", practiceSessions: "SKILL TRAINER SESSIONS", noDailyLogs: "No daily logs yet.", noPracticeSessions: "No skill trainer sessions yet.",
      notesPrefix: "Notes:",
      usersLabel: (n: number) => n === 1 ? "USER" : "USERS",
      totalMinutesLabel: "total", totalLogsLabel: "logs", totalPracticeLabel: "Total practice", focusLabel: "FOCUS", mostPracticedLabel: "MOST PRACTICED",
      pointsLabel: "POINTS", awardHint: "Award or remove points", reasonPlaceholder: "Reason", awardBtn: "Award", modeLabel: "MODE", modeStandard: "Full Library", modeBeginner: "Essentials", pointGameLabel: "POINT GAME", pointGameOn: "On", pointGameOff: "Off", leaderboardLabel: "LEADERBOARD", leaderboardShown: "Shown", leaderboardHiddenOpt: "Hidden", pointsHistory: "POINTS HISTORY", noPoints: "No points awarded yet.",
      metronomeBadge: "Metronome", skillTrainerBadge: "Skill Trainer", noElements: "No practice element chosen", quickEntryBadge: "Quick entry",
      mostMinutesTitle: "MOST PRACTICE TIME", allUsersTitle: "ALL USERS", excludeSelfLabel: "Exclude my account from stats",
      statsRangeLabel: "Time range", statsRangeAll: "All", statsRangeMonth: "This Month", statsRangeLastMonth: "Last Month", statsRangeYear: "Year",
      skillProgressLabel: "SKILL PROGRESS",
      monthlyPracticeLabel: "MONTHLY PRACTICE", achievementsLabel: "ACHIEVEMENTS", noAchievements: "No achievements yet.",
      historyBtn: "History", hideHistoryBtn: "Hide history",
      speedLabel: "SPEED BY EXERCISE", speedHint: "Highest BPM each student has played comfortably, over time.",
      speedNoData: "No sessions logged for this exercise yet.", speedNotQualified: "Practising, not yet at a steady speed:",
      speedBpmSuffix: "BPM",
      improvementsLabel: "RECENT IMPROVEMENTS", improvementsEmpty: "No tempo improvements yet.",
      improvedTo: (exercise: string, bpm: number) => `${exercise} → ${bpm} BPM`,
    },
    metronome: {
      practiceTool: "PRACTICE TOOL", title: "METRONOME", practiceTimer: "PRACTICE TIMER", sessionTime: "SESSION TIME", tapTempo: "TAP TEMPO",
      startPractice: "Start Practice", stickingLabel: "STICKING",
      start: "▶ Start", stop: "■ Stop", clickSettings: "Click sound", subClicks: "Subdivision clicks", volOff: "Only the beat", volFull: "Full", subClicksHint: "The click on every beat stays the same. This only changes the clicks in between.", sessionComplete: "SESSION COMPLETE",
      addTimeQuestion: (label: string) => `Add ${label} to today's practice?`, addTimeTooShort: "Too short to log — adjust the timer above", sessionLasted: (time: string) => `Your metronome session lasted ${time}.`, minAbbr: "min", secAbbr: "sec",
      notNow: "Not now", addTime: "Add time",
      timeSignature: "BEATS / BAR", bannerTitle: "Metronome", pause: "Pause", resume: "Resume", viewStrokes: "Strokes", viewNotation: "Notation", subdivisionLabel: "CLICKS / BEAT", leadHand: "STARTS WITH", clicksFixed: ((n: number) => `${n} per beat (set by the exercise)`), historyTitle: (n: number) => `HISTORY (${n})`,
    },
    sessionTimer: {
      focusRunning: "Your timer is running", focusTitle: "What are you working on?", focusSkip: "Skip", focusPinned: "Pinned exercises", focusRudimentsSub: "Skill Trainer", focusExercisesSub: "Hands, feet and patterns", focusMetronomeSub: "Practice with a click", focusFree: "Free play", focusFreeSub: "Play what you like", pillLabel: "Session Timer", title: "SESSION TIMER", metronomeShared: "Session timer", allAlreadyLogged: "All of this time was already logged from Skill Trainer.", alreadyLogged: (t: string) => `${t} of this was already logged from Skill Trainer, so it is not counted twice.`, modeStopwatch: "Stopwatch", modeTimer: "Timer",
      durationLabel: "DURATION", timeUp: "Time's up!", sessionFinished: "Session finished", tapToOpen: "tap to open", tapToLog: "tap to log it", longSessionWarning: "That is over 3 hours. If you forgot to stop it, adjust the time below or tap Not now.", logTitle: "Log your practice", addToToday: "Add to today", receiptSession: "Session total", receiptLogged: "Counted in Skill Trainer", receiptAdding: "Adding now", changeAmount: "Change amount", hideChange: "Hide", whatDidYouPractise: "What did you practise?", anythingElse: "Anything else?", chooseWhat: "Choose what you practised", pickAtLeastOne: "Pick at least one thing to save this.", skillTrainerBadge: "Skill Trainer", addAmount: (t: string) => `Add ${t}`, adjustHint: "ADJUST TIME", resetTime: (original: string) => `Reset to ${original}`,
    },
  },
  es: {
    nav: { today: "Inicio", practice: "Práctica", group: "Grupo", progress: "Progreso", settings: "Ajustes", admin: "Admin" },
    confirm: { cancel: "Cancelar", confirm: "Confirmar" },
    drumPoints: { yearAndWeek: "¡Eres el n.º 1 este año y esta semana!", weekBest: "¡Eres el n.º 1 esta semana!", weekPoints: (n: number) => `${n} ${n === 1 ? "punto" : "puntos"} esta semana`, askTitle: "Drum Points", askText: "Gana 1 punto por cada minuto que practicas. Compárate con bateristas de tu edad (solo nombres).", askYes: "Sí, cuenta mis puntos", askNo: "Ahora no", earned: (n: number) => `+${n} ${n === 1 ? "punto" : "puntos"}`, thisYear: "este año", yearTotal: "Puntos este año", movedUp: "¡Has subido!", passed: (name: string) => `¡Superaste a ${name}!`, passMore: (g: number, name: string) => `Practica ${g} ${g === 1 ? "minuto" : "minutos"} más para superar a ${name}`, numberOne: "¡Eres el n.º 1 este año!", nice: "¡Genial!", boardYear: "Este año", boardAll: "Siempre", boardTitle: "Clasificación Drum Points", boardEmpty: "Aún no hay puntos. Practica un tempo durante un minuto para empezar.", switchLabel: "Drum Points", switchDesc: "Gana puntos por practicar y compárate con bateristas de tu edad.", cardYear: "Este año" },
    today: {
      heroLine1: "DISCIPLINA", heroLine1b: "CONSTRUYE", heroLine2: "HABILIDAD.", startPracticeTitle: "Empezar práctica", startPracticeSub: "Pon un temporizador y a ello", noPracticeTitle: "Aún no hay práctica", goalShort: "Meta", practiceRudiment: "Practica un rudimento", seeAll: "Ver todo", currentStreak: "Racha actual", days: "días", pointsTitle: "PUNTOS",
      pointsCardTitle: "TUS PUNTOS", pointsCardCta: "Ver recompensas", pointsCardKickoff: "Empieza a ganar puntos", pointsCardRankOne: "Eres el número 1", pointsCardTop3: "Estás en el Top 3", pointsCardKeepGoing: "Sigue así",
      todaysPractice: "Práctica de hoy", metronome: "Metrónomo", howLong: "¿CUÁNTO TIEMPO PRACTICASTE?", practiceTimeHeading: "TIEMPO DE PRÁCTICA", whatPractised: "AÑADE LO QUE PRACTICASTE",
      notes: "NOTAS", notesPrefix: "Notas:", optional: "OPCIONAL", notesPlaceholder: "¿Qué practicaste hoy?", savePractice: "Guardar práctica", practiceSaved: "✓ Práctica guardada",
      todayGoal: "META DE HOY", equipment: "PRACTICASTE CON", drumset: "Batería", pad: "Pad de práctica", equipmentBoth: "Batería y pad de práctica", addNotes: "+ Añadir notas", minShort: "min", minOn: (minutes: number, equipmentName: string) => `${formatMinutes(minutes)} en ${equipmentName}`,
      todaySummary: "HOY", noPracticeYet: "Aún no hay práctica.", secondsCarried: "extra (aún no contado en minutos)", todaySoFar: (total: string) => `${total} ya registrados hoy, esto se suma`,
      resetPractice: "Reiniciar", confirmResetPractice: "¿Borrar la práctica de hoy y empezar de nuevo? Esta acción no se puede deshacer.",
      noGoalTitle: "Define tu meta diaria", noGoalSubtitle: "Unos minutos cada día se convierten en progreso real. Elige una meta y empieza tu racha hoy.", noGoalBtn: "Definir mi meta",
      whatDidYouPractiseTitle: "¿QUÉ PRACTICASTE?", whatDidYouPractiseSubtitle: "Elige al menos uno.", addOwnPlaceholder: "Añade lo tuyo...", addOwnBtn: "Añadir",
      rudiments: "Rudiments", searchRudiments: "Buscar rudiments...", searchExercises: "Buscar ejercicios...", books: "Libros", myItems: "Mis elementos", addOwnBookPlaceholder: "Añade tu propio libro...", pickerDone: "Listo",
    },
    calendar: {
      title: "CALENDARIO", longestStreak: "Racha más larga", daysThisYear: "Días este año",
      weekdays: ["L", "M", "X", "J", "V", "S", "D"], futureDay: "No puedes registrar práctica en un día futuro.",
      noPractice: "No hay práctica registrada para este día. Regístrala desde la pestaña Hoy.", minPractised: "practicados",
      notesPlaceholder: "¿Qué practicaste ese día?", saving: "Guardando...",
      deleteEntry: "Eliminar entrada", pickOneItem: "Elige al menos una cosa que practicaste.", confirmDeleteEntry: "¿Eliminar la práctica de este día? Esta acción no se puede deshacer.", couldNotDeleteEntry: "No se pudo eliminar esta entrada.",
      goalMet: "🎯 Meta diaria alcanzada", goalMissed: (done: string, total: string) => `${done} / ${total} hacia tu meta`,
      onEquipment: (label: string) => `Con ${label}`,
      streakOnDay: (n: number) => `🔥 Racha de ${n} días`, noPracticeShort: "No hay práctica registrada para este día.",
      editDay: "Editar este día", nothingToEdit: "+ Registrar práctica de este día", todayBtn: "Hoy",
    },
    group: {
      yourCrew: "TU GRUPO", youreIn: "Ya estás dentro.", inviteMsg: "Invita a otros bateristas con este código:", copyInvite: "Copiar código de invitación",
      challenges: "DESAFÍOS",
      practiseTogether: "PRACTICA EN GRUPO", yourGroup: "TU GRUPO", switchGroup: "CAMBIAR DE GRUPO", moreOptions: "Más", inviteShort: "Código de invitación", noChallengesShort: "Aún no hay desafíos.", showMore: (n: number) => `Ver ${n} más`, showLess: "Ver menos", findCrew: "Encuentra tu grupo.", startGroup: "Crear un grupo", joinCrew: "Únete a un grupo",
      intro: "Mantente responsable, sube en la clasificación y haz que practicar sea más divertido.", createGroupBtn: "Crear un grupo", joinWithCode: "Unirse con código de invitación",
      groupNamePlaceholder: "Nombre del grupo", inviteCodePlaceholder: "Código de invitación", pleaseWait: "Un momento...", createGroup: "Crear grupo",
      joinGroup: "Unirse al grupo", back: "Atrás", inviteNotFound: "No se encontró ese código de invitación.", couldNotCreate: "No se pudo crear el grupo.",
      leaderboard: "CLASIFICACIÓN", timePractised: "TIEMPO PRACTICADO", daysShort: "días", you: "Tú",
      teacherBadge: "Admin", showTeacherStats: "Mostrar estadísticas del admin",
      awardMostDays: "Más días de práctica este año", awardMostMinutes: "Más tiempo practicado",
      medalBoard: "Salón de la Fama", medalBoardEmpty: "Nadie todavía", medalBoardAllTime: "SIEMPRE", medalBoardThisWeek: "ESTA SEMANA",
      awardConsistency: "Más Constante", awardStreak: "En Racha", awardChallenge: "Campeón del Reto", awardImproved: "Más Mejorado",
      awardDaysValue: (v: number) => `${v} día${v === 1 ? "" : "s"}`, awardUnlocksValue: (v: number) => `${v} tiempo${v === 1 ? "" : "s"} nuevo${v === 1 ? "" : "s"}`, awardChallengeValue: (pct: number) => `${pct}% completado`,
      groupSettings: "AJUSTES DEL GRUPO", countFromCreation: "Las estadísticas empiezan desde", enableWeeklyAwards: "Activar premios semanales",
      dateModeCalendar: "1 de enero", dateModeToday: "Inicio del grupo", dateModeCustom: "Fecha personalizada",
      countFromCreationDesc: "Define la fecha desde la que se cuentan los días y el tiempo de práctica del grupo.",
      noChallenges: "Aún no hay desafíos. ¡Empieza uno con tu grupo!", noChallengesMember: "Aún no hay desafíos. Tu profesor puede empezar uno.", newChallenge: "+ Nuevo desafío", cancel: "Cancelar", challengeNamePlaceholder: "Nombre del desafío",
      typeDaily: "Todos los días", typeMinutes: "Minutos totales", typeSessions: "Días practicados", goalLabel: "META", startLabel: "INICIO", endLabel: "FIN", quickStart: "INICIO RÁPIDO", typeLabel: "TIPO", lengthLabel: "DURACIÓN", lengthDays: (n: number) => `${n} día${n === 1 ? "" : "s"}`, lengthCustom: "Personalizado", stakesToggle: "Recompensa / Si pierdes (opcional)",
      rewardPlaceholder: "Recompensa (opcional)", punishmentPlaceholder: "Si pierdes (opcional)", createChallengeBtn: "Crear desafío",
      joinChallengeBtn: "Unirse al desafío", joined: "Unido", participants: (n: number) => `${n} unidos`,
      dailyGoalDesc: (min: number) => `${min}+ min cada día`, minutesGoalDesc: (total: number) => `Llega a ${total} min en total`,
      sessionsGoalDesc: (days: number) => `Practica ${days} días`, daysProgress: (p: number, t: number) => `${p}/${t} días`,
      minutesProgress: (p: number, t: number) => `${p}/${t} min`, reward: "Recompensa:", punishment: "Si pierdes:", couldNotCreateChallenge: "No se pudo crear el desafío.",
      presetDaily5: "3 min cada día", presetDaily30x5: "30+ min, 5 días seguidos", presetSessions3weekly: "3 sesiones esta semana", presetDaily5x20: "Reto de 20 días: 5+ min diarios",
      noOnePractised: "Nadie practicó ese día.",
      weekdaysMon: ["L", "M", "X", "J", "V", "S", "D"], copied: "¡Copiado!", progress: "PROGRESO", leaveGroup: "Salir del grupo",
      confirmLeave: "¿Salir de este grupo? Puedes volver a unirte más tarde con el código de invitación.", confirmDeleteChallenge: "¿Eliminar este desafío? Esta acción no se puede deshacer.",
      deleteChallenge: "Eliminar", since: (date: string) => `Desde ${date}`, couldNotLeave: "No se pudo salir del grupo.", couldNotDeleteChallenge: "No se pudo eliminar el desafío.",
      deleteGroupBtn: "Eliminar grupo", confirmDeleteGroup: "¿Eliminar este grupo? Se eliminará para todos y no se puede deshacer.", couldNotDeleteGroup: "No se pudo eliminar el grupo.",
    },
    achievements: {
      unlocked: "desbloqueados", nextUp: "Siguiente", allDone: "Todo desbloqueado", done: "Desbloqueado",
      level: (l: number, n: number) => l === 0 ? "Bloqueado" : `Nivel ${l} de ${n}`, levelShort: (l: number) => `Nivel ${l}`, notYet: "Aún no",
      category: { time: "Tiempo", streak: "Racha", days: "Constancia", sessions: "Trainer", tempo: "Tempo", variety: "Variedad", long: "Día largo", challenges: "Retos", mastery: "Maestría" } as Record<string, string>,
      label: (key: string, n: number) => {
        switch (key) {
          case "time": return n < 1 ? `${Math.round(n * 60)} minutos practicados` : `${n} ${n === 1 ? "hora" : "horas"} practicadas`;
          case "streak": return `Racha de ${n} días`;
          case "days": return `${n} días practicados`;
          case "sessions": return n === 1 ? "Primera sesión de Skill Trainer" : `${n} sesiones de Skill Trainer`;
          case "tempo": { const need = TEMPO_REQUIRED_BY_BPM[n] ?? 5; return `${need} ${need === 1 ? "rudiment" : "rudiments"} a ${n} BPM`; }
          case "variety": return `${n} ejercicios distintos`;
          case "long": return `${n} min en un día`;
          case "mastery": return n === 1 ? "Primera sesión dominada" : `${n} sesiones dominadas`;
          default: return n === 1 ? "Primer reto ganado" : `${n} retos ganados`;
        }
      },
    },
    progressPage: {
      eyebrow: "RESUMEN DE PRÁCTICA", title: "PROGRESO", yourPractice: "TU PRÁCTICA",
      noData: "Registra algo de práctica para ver tu progreso aquí.", pinned: "TU ENFOQUE", generalPractice: "Práctica general", seeMore: "Ver más", seeLess: "Ver menos",
      skillProgress: "PROGRESO TÉCNICO", noSkillData: "Entrena los niveles de BPM de un ejercicio para ver tu progreso técnico aquí.",
      levelsLabel: (done: number, total: number) => `${done}/${total} niveles`, overallLevel: "Nivel general", levelOf: (n: number, total: number) => `Nivel ${n} de ${total}`, infoTitle: "¿Cómo se calcula?", info1: "Un ejercicio llega a un tier cuando desbloqueas un tempo en él.", info2: "Tu nivel es el tier más alto al que han llegado al menos 1 de cada 4 de tus ejercicios.", info3: "Las barras muestran cuántos de tus ejercicios han llegado a cada tier.", infoClose: "Entendido", overallReached: (n: number, total: number, tier: string) => `${n} de ${total} ejercicios llegaron a ${tier}`, noTierExercises: "Aún no hay ejercicios en este nivel.", unlocksTitle: "DESBLOQUEOS RECIENTES", unlocksEmpty: "Desbloquea un tempo en el Skill Trainer para verlo aquí.", unlockedBpm: (bpm: number) => `${bpm} BPM desbloqueado`,
      achievements: "HITOS", achievementsIntro: "Completa un Reto personal en la pestaña Práctica para ganar un trofeo aquí. Próximamente, más logros.",
    },
    cheers: {
      sendBtn: "Enviar ánimo", recentTitle: "ÁNIMOS RECIENTES", remove: "Quitar", undo: "Deshacer", undoSent: "Deshacer (lo quita para todos)", you: "Tú", bellTitle: "ÁNIMOS", heart: "Me gusta", heartedYours: (name: string) => `A ${name} le gustó tu ánimo`, inboxEmpty: "Aún no hay ánimos.", cheerGroupBtn: "Animar a todo el grupo", cheerGroup: "ANIMAR AL GRUPO", cheerPerson: (name: string) => `ANIMAR A ${name.toUpperCase()}`, tapNameHint: "Toca un nombre para enviar ánimo.", incoming: (name: string) => `${name} envió un ánimo`, sheetTitle: "ENVIAR ÁNIMO", toLabel: "PARA", everyone: "Todos", sent: "¡Ánimo enviado!",
      newCount: (n: number) => n === 1 ? "1 ánimo nuevo" : `${n} ánimos nuevos`, gotIt: "Entendido", toYou: "para ti",
      couldNotSend: "No se pudo enviar el ánimo.",
    },
    personalChallenges: {
      title: "Retos personales", homeTitle: "RETOS PERSONALES", subtitle: "Ponte tu propia meta de práctica.",
      newChallenge: "+ Nuevo reto", cancel: "Cancelar",
      exerciseLabel: "Ejercicio", minutesLabel: "Minutos por día", bpmLabel: "BPM objetivo (opcional)", bpmPlaceholder: "Cualquier tempo",
      lengthLabel: "Duración del reto (días)", startChallenge: "Empezar reto", pleaseWait: "Un momento...",
      noChallenges: "Aún no tienes retos personales.",
      challengeTitle: (exercise: string, days: number) => `${exercise} — Reto de ${days} Días`, wonTitle: "Retos ganados", wonPopupTitle: "¡Felicidades!", wonPopupOwn: (n: string) => `Completaste tu reto: ${n}.`, wonPopupTeacher: (n: string) => `Completaste el reto de tu profesor: ${n}.`, wonPopupSaved: "Tu trofeo queda guardado en Progreso, en \"Retos ganados\".", wonPopupSee: "Ver mis trofeos", wonPopupClose: "Cerrar", wonEmpty: "Completa un reto personal para ganar tu primer trofeo.", wonMeta: (minutes: number, days: number, bpm: number | null) => `${minutes} min al día · ${days} días${bpm ? ` · ${bpm} BPM` : ""}`, wonFromTeacher: "De tu profesor",
      challengeDescription: (minutes: number, bpm: number | null, days: number) => bpm ? `Practica ${minutes} min a ${bpm}+ BPM cada día durante ${days} días consecutivos.` : `Practica ${minutes} min cada día durante ${days} días consecutivos.`,
      statusActive: (done: number, total: number) => `${done}/${total} días`, statusCompleted: "✓ Completado — ¡logro desbloqueado!", statusFailed: "Reto fallido. ¿Quieres empezar de nuevo?",
      deleteChallenge: "Eliminar", confirmDelete: "¿Eliminar este reto? Esta acción no se puede deshacer.",
      fromTeacher: "De tu profesor", failedShort: "Falló un día", statusCompletedShort: "Completado", perDayShort: "min / día", bpmShort: "BPM",
      giveTitle: "DAR UN RETO", giveBtn: "Dar reto", giveHint: "Le aparece en Inicio y en Retos como \"De tu profesor\". No puede borrarlo.", givenLabel: "RETOS", noneGiven: "Aún no hay retos.", givenBadge: "Dado por ti", confirmRemove: "¿Quitar este reto al alumno?", remove: "Quitar", perDay: (m: number) => `${m} min al día`, couldNotGive: "No se pudo dar el reto.", lengthDaysN: (n: number) => `${n} días`, lengthCustomShort: "Otro",
      resetChallenge: "Intentar de nuevo", confirmReset: "¿Reiniciar este reto desde el día 1?",
      couldNotCreate: "No se pudo crear el reto.",
    },
    practiceMode: {
      eyebrow: "SIGUE TUS NIVELES", title: "MODO PRÁCTICA", pageEyebrow: "ENTRENA", pageTitle: "PRÁCTICA",
      currentLevel: "NIVEL ACTUAL", levelsUnlocked: (n: number, total: number) => `${n} de ${total} niveles desbloqueados`,
      notStarted: "Sin empezar",
      inProgress: "En progreso", unlockedLabel: "Desbloqueado", confirmResetLevel: (bpm: number) => `¿Reiniciar tu progreso a ${bpm} BPM? Esta acción no se puede deshacer.`,
      editRatingTitle: "Cambiar calificación", skippedLabel: "Omitido",
      improvedToast: (from: string, to: string, exercise: string, bpm: number, days: number) => `Mejoraste de ${from} a ${to} en ${exercise} · ${bpm} BPM en ${days} día${days === 1 ? "" : "s"}`, niceBtn: "¡Genial!",
      struggledFlagTitle: "Antes te costaba este tempo",
      tierBeginner: "PRINCIPIANTE", tierIntermediate: "INTERMEDIO", tierAdvanced: "AVANZADO", tierLegend: "LEYENDA",
      rudimentTierBasics: "FUNDAMENTOS", rudimentTierIntermediate: "INTERMEDIO", rudimentTierAdvanced: "COMPLEJO",
      unlockFirst: (names: string) => `Desbloquea ${names} primero`,
      tierUnlockedCount: (unlocked: number, total: number) => `${unlocked} de ${total} desbloqueados`,
      exerciseGroupHand: "TÉCNICA DE MANOS", exerciseGroupFootwork: "TÉCNICA DE PIES", exerciseGroupCoordination: "COORDINACIÓN",
      exercisesPracticedCount: (n: number, total: number) => `${n} de ${total} practicados`,
      subdivisionQuarter: "Negras", subdivisionEighth: "Corcheas", subdivisionTriplet: "Tresillos", subdivisionSixteenth: "Semicorcheas", subdivisionSixteenthTriplet: "Tresillos de semicorcheas",
      ratingNotReady: "No listo", ratingTense: "Con tensión", ratingAlmost: "Casi listo", ratingComfortable: "Cómodo", ratingMastered: "Dominado",
      rateTitle: "¿CÓMO TE SENTISTE?", rateSubtitle: (bpm: number) => `Califica tu sesión a ${bpm} BPM para guardarla.`, skipRating: "Omitir, no guardar esto",
      issueLabel: "¿QUÉ PASÓ? (OPCIONAL)", sessionNotePlaceholder: "Añade una nota (opcional)", saveRating: "Guardar",
      backToBook: "Volver a Modo práctica", couldNotSaveSession: "No se pudo guardar esta sesión.",
      categoryRudiments: "Rudiments", categoryExercises: "Ejercicios", categoryRhythms: "Ritmos",
      pin: "Fijar", pinned: "Fijado",
      maxPinnedReached: (max: number) => `Puedes fijar hasta ${max} ejercicios. Quita uno primero.`,
      pinManagerEyebrow: (count: number, max: number) => `${count}/${max} FIJADOS`, pinManagerTitle: "Tu enfoque", pinManagerDone: "Listo",
      pinManagerAddBtn: "+ Añadir ejercicio", pinManagerSearchPlaceholder: "Buscar ejercicios...", pinManagerEmpty: "Aún no hay nada fijado. Añade hasta 5 para verlos aquí.",
      quickTitle: "Práctica rápida", quickSub: "Registra minutos, metrónomo, temporizador", continueLabel: "Continúa donde lo dejaste", recentDays: "DÍAS RECIENTES", noRecentDays: "Aún no hay registros.", skillSearchPlaceholder: "Buscar rudiments y ejercicios", skillNoMatch: "Nada coincide con esa búsqueda.", skillSub: "Rudiments y ejercicios", challengesSub: "Ponte tu propia meta de práctica",
      trainTitle: "Skill Trainer",
      rudimentListIntro: "Desbloquea 2 tempos para abrir el siguiente rudimento.",
      tempoCompleteIntro: (min: number) => `Practica un tempo durante ${min} min para completarlo.`,
      listIntroExercises: (min: number) => `Practica ${min} min en cada tempo para desbloquear el siguiente nivel.`,
      listIntroRhythms: (min: number) => `Grooves y estilos para ampliar tu vocabulario musical. Toca uno y registra al menos ${min} min cómodos en cada nivel de BPM para desbloquearlo y subir de nivel.`,
    },
    onboarding: {
      languageTitle: "Elige tu idioma", eyebrow: "BIENVENIDO", exercisesTitle: "Elige tu enfoque", goalTitle: "Meta diaria de práctica", modeTitle: "Elige tu biblioteca de contenido", dobTitle: "¿Cuándo naciste?", dobHint: "Lo usamos para preparar tu práctica y tu grupo de la tabla. Nadie más lo ve nunca.", dobError: "No se pudo guardar esa fecha. Revísala e inténtalo de nuevo.",
      continueBtn: "Continuar", finishBtn: "Finalizar", skipBtn: "Omitir por ahora",
    },
    settings: {
      makeItYours: "PERSONALÍZALO", title: "AJUSTES", displayName: "NOMBRE", dailyGoal: "META DIARIA DE PRÁCTICA", minutes: "minutos",
      language: "IDIOMA", pushLabel: "Notificaciones de ánimo", pushDesc: "Recibe una notificación en este teléfono cuando alguien de tu grupo te envíe un ánimo.", pushBlocked: "Las notificaciones están bloqueadas. Actívalas para DrumSkills en los ajustes del teléfono.", pushError: "No se pudieron activar las notificaciones. Inténtalo de nuevo.", showDaysThisYear: "Días practicados este año", showDaysThisYearDesc: "Añade un contador de días practicados este año a tus estadísticas de Inicio.", on: "SÍ", off: "NO", save: "Guardar ajustes", saved: "✓ Ajustes guardados", logout: "Cerrar sesión", calendarColor: "COLOR DEL CALENDARIO DE GRUPO", autoColor: "Auto",
      metronomeTone: "SONIDO DEL METRÓNOMO", toneNames: { click: "Click", beep: "Bip", wood: "Madera", clave: "Clave" },
      profileSection: "PERFIL", practiceSection: "PRÁCTICA", preferencesSection: "PREFERENCIAS", accountSection: "AJUSTES DE CUENTA", pleaseWait: "Un momento...",
      confirmLogout: "¿Cerrar sesión en DrumSkills?", libraryLabel: "BIBLIOTECA DE CONTENIDO", libraryFull: "Biblioteca Completa", libraryEssentials: "Esenciales", libraryHint: "Esenciales muestra una lista más corta para principiantes.", dobLabel: "FECHA DE NACIMIENTO", dobSaved: "Guardada. Se mantiene privada. Si es incorrecta, contacta con soporte para corregirla.", dobHint: "Añádela para tener el grupo de la tabla y los ajustes iniciales correctos. Se mantiene privada.", dobSave: "Guardar", difficultyLabel: "DIFICULTAD DE PRÁCTICA", difficultyBeginner: "Principiante", difficultyDeveloping: "En desarrollo", difficultyStandard: "Estándar", difficultyHint: "Principiante: negras. En desarrollo: corcheas. Estándar: el rudimento tal como está escrito. El tempo (BPM) nunca cambia.",
      changeEmail: "Cambiar correo electrónico", newEmailPlaceholder: "Nuevo correo electrónico", updateEmail: "Actualizar correo", emailChangeSent: "Revisa tu nuevo correo para confirmar el cambio.",
      changePassword: "Cambiar contraseña", newPasswordPlaceholder: "Nueva contraseña", confirmPasswordPlaceholder: "Confirmar nueva contraseña", updatePassword: "Actualizar contraseña", passwordChanged: "✓ Contraseña actualizada", passwordMismatch: "Las contraseñas no coinciden.", passwordTooShort: "La contraseña debe tener al menos 6 caracteres.",
      privacyPolicy: "Política de privacidad", termsOfUse: "Términos de uso", support: "Soporte",
      deleteAccount: "Eliminar cuenta", deleteAccountWarning: "Esto elimina tu cuenta y todo tu historial de práctica de forma permanente. Esta acción no se puede deshacer.", deleteAccountConfirmPrompt: (email: string) => `Escribe tu correo (${email}) para confirmar:`, deleteAccountBtn: "Eliminar mi cuenta", deleteAccountBusy: "Eliminando…", couldNotDeleteAccount: "No se pudo eliminar tu cuenta.",
    },
    admin: {
      title: "ACTIVIDAD DE USUARIOS", eyebrow: "ADMIN", noUsers: "Aún no hay usuarios.", neverPracticed: "Nunca practicó",
      dailyLogs: "REGISTROS DIARIOS", practiceSessions: "SESIONES DE SKILL TRAINER", noDailyLogs: "Aún no hay registros diarios.", noPracticeSessions: "Aún no hay sesiones de Skill Trainer.",
      notesPrefix: "Notas:",
      usersLabel: (n: number) => n === 1 ? "USUARIO" : "USUARIOS",
      totalMinutesLabel: "total", totalLogsLabel: "registros", totalPracticeLabel: "Práctica total", focusLabel: "ENFOQUE", mostPracticedLabel: "MÁS PRACTICADO",
      pointsLabel: "PUNTOS", awardHint: "Otorgar o quitar puntos", reasonPlaceholder: "Motivo", awardBtn: "Dar", modeLabel: "MODO", modeStandard: "Biblioteca Completa", modeBeginner: "Esenciales", pointGameLabel: "JUEGO DE PUNTOS", pointGameOn: "Activado", pointGameOff: "Desactivado", leaderboardLabel: "TABLA MUNDIAL", leaderboardShown: "Visible", leaderboardHiddenOpt: "Oculto", pointsHistory: "HISTORIAL DE PUNTOS", noPoints: "Aún no se han otorgado puntos.",
      metronomeBadge: "Metrónomo", skillTrainerBadge: "Skill Trainer", noElements: "No se eligió ningún elemento de práctica", quickEntryBadge: "Entrada rápida",
      mostMinutesTitle: "MÁS TIEMPO DE PRÁCTICA", allUsersTitle: "TODOS LOS USUARIOS", excludeSelfLabel: "Excluir mi cuenta de las estadísticas",
      statsRangeLabel: "Rango de tiempo", statsRangeAll: "Todo", statsRangeMonth: "Este Mes", statsRangeLastMonth: "Mes Pasado", statsRangeYear: "Año",
      skillProgressLabel: "PROGRESO DE HABILIDADES",
      monthlyPracticeLabel: "PRÁCTICA MENSUAL", achievementsLabel: "LOGROS", noAchievements: "Aún no hay logros.",
      historyBtn: "Historial", hideHistoryBtn: "Ocultar historial",
      speedLabel: "VELOCIDAD POR EJERCICIO", speedHint: "El BPM más alto que cada estudiante ha tocado con soltura, a lo largo del tiempo.",
      speedNoData: "Aún no hay sesiones registradas para este ejercicio.", speedNotQualified: "Practicando, aún sin una velocidad estable:",
      speedBpmSuffix: "BPM",
      improvementsLabel: "MEJORAS RECIENTES", improvementsEmpty: "Aún no hay mejoras de tempo.",
      improvedTo: (exercise: string, bpm: number) => `${exercise} → ${bpm} BPM`,
    },
    metronome: {
      practiceTool: "HERRAMIENTA DE PRÁCTICA", title: "METRÓNOMO", practiceTimer: "TEMPORIZADOR", sessionTime: "TIEMPO DE SESIÓN", tapTempo: "MARCAR TEMPO",
      startPractice: "Empezar práctica", stickingLabel: "BAQUETEO",
      start: "▶ Iniciar", stop: "■ Detener", clickSettings: "Sonido del clic", subClicks: "Clics de subdivisión", volOff: "Solo el pulso", volFull: "Máximo", subClicksHint: "El clic de cada pulso no cambia. Esto solo cambia los clics intermedios.", sessionComplete: "SESIÓN COMPLETA",
      addTimeQuestion: (label: string) => `¿Añadir ${label} a la práctica de hoy?`, addTimeTooShort: "Muy corto para registrar — ajusta el tiempo arriba", sessionLasted: (time: string) => `Tu sesión de metrónomo duró ${time}.`, minAbbr: "min", secAbbr: "seg",
      notNow: "Ahora no", addTime: "Añadir tiempo",
      timeSignature: "TIEMPOS / COMPÁS", bannerTitle: "Metrónomo", pause: "Pausa", resume: "Reanudar", viewStrokes: "Golpes", viewNotation: "Notación", subdivisionLabel: "CLICS / TIEMPO", leadHand: "EMPIEZA CON", clicksFixed: ((n: number) => `${n} por tiempo (según el ejercicio)`), historyTitle: (n: number) => `HISTORIAL (${n})`,
    },
    sessionTimer: {
      focusRunning: "Tu temporizador está en marcha", focusTitle: "¿En qué vas a trabajar?", focusSkip: "Omitir", focusPinned: "Ejercicios fijados", focusRudimentsSub: "Skill Trainer", focusExercisesSub: "Manos, pies y patrones", focusMetronomeSub: "Practica con un clic", focusFree: "Juego libre", focusFreeSub: "Toca lo que quieras", pillLabel: "Temporizador de Sesión", title: "TEMPORIZADOR DE SESIÓN", metronomeShared: "Temporizador de sesión", allAlreadyLogged: "Todo este tiempo ya se registró desde el Skill Trainer.", alreadyLogged: (t: string) => `${t} de esto ya se registró desde el Skill Trainer, así que no se cuenta dos veces.`, modeStopwatch: "Cronómetro", modeTimer: "Temporizador",
      durationLabel: "DURACIÓN", timeUp: "¡Se acabó el tiempo!", sessionFinished: "Sesión terminada", tapToOpen: "toca para abrir", tapToLog: "toca para registrarla", longSessionWarning: "Son más de 3 horas. Si olvidaste pararlo, ajusta el tiempo abajo o toca Ahora no.", logTitle: "Registra tu práctica", addToToday: "Añadir a hoy", receiptSession: "Total de la sesión", receiptLogged: "Contado en Skill Trainer", receiptAdding: "Añadiendo ahora", changeAmount: "Cambiar cantidad", hideChange: "Ocultar", whatDidYouPractise: "¿Qué practicaste?", anythingElse: "¿Algo más?", chooseWhat: "Elige qué practicaste", pickAtLeastOne: "Elige al menos una cosa para guardarlo.", skillTrainerBadge: "Skill Trainer", addAmount: (t: string) => `Añadir ${t}`, adjustHint: "AJUSTAR TIEMPO", resetTime: (original: string) => `Restablecer a ${original}`,
    },
  },
  nl: {
    nav: { today: "Home", practice: "Oefenen", group: "Groep", progress: "Voortgang", settings: "Instellingen", admin: "Beheer" },
    confirm: { cancel: "Annuleren", confirm: "Bevestigen" },
    drumPoints: { yearAndWeek: "Je staat #1 dit jaar en deze week!", weekBest: "Je staat #1 deze week!", weekPoints: (n: number) => `${n} ${n === 1 ? "punt" : "punten"} deze week`, askTitle: "Drum Points", askText: "Krijg 1 punt voor elke minuut oefenen. Vergelijk met drummers van jouw leeftijd (alleen voornamen).", askYes: "Ja, tel mijn punten", askNo: "Nu niet", earned: (n: number) => `+${n} ${n === 1 ? "punt" : "punten"}`, thisYear: "dit jaar", yearTotal: "Punten dit jaar", movedUp: "Je bent gestegen!", passed: (name: string) => `Je bent ${name} voorbij!`, passMore: (g: number, name: string) => `Oefen nog ${g} ${g === 1 ? "minuut" : "minuten"} om ${name} voorbij te gaan`, numberOne: "Je staat #1 dit jaar!", nice: "Top!", boardYear: "Dit jaar", boardAll: "Altijd", boardTitle: "Drum Points ranglijst", boardEmpty: "Nog geen punten. Oefen een minuut op een tempo om te beginnen.", switchLabel: "Drum Points", switchDesc: "Verdien punten met oefenen en vergelijk je met drummers van jouw leeftijd.", cardYear: "Dit jaar" },
    today: {
      heroLine1: "DISCIPLINE", heroLine1b: "BOUWT", heroLine2: "VAARDIGHEID.", startPracticeTitle: "Begin met oefenen", startPracticeSub: "Zet een timer en ga aan de slag", noPracticeTitle: "Nog niet geoefend", goalShort: "Doel", practiceRudiment: "Oefen een rudiment", seeAll: "Alles bekijken", currentStreak: "Huidige reeks", days: "dagen", pointsTitle: "PUNTEN",
      pointsCardTitle: "JOUW PUNTEN", pointsCardCta: "Beloningen bekijken", pointsCardKickoff: "Begin met punten verdienen", pointsCardRankOne: "Je staat op nummer 1", pointsCardTop3: "Je staat in de top 3", pointsCardKeepGoing: "Ga zo door",
      todaysPractice: "Oefening van vandaag", metronome: "Metronoom", howLong: "HOE LANG HEB JE GEOEFEND?", practiceTimeHeading: "OEFENTIJD", whatPractised: "VOEG TOE WAT JE GEOEFEND HEBT",
      notes: "NOTITIES", notesPrefix: "Notities:", optional: "OPTIONEEL", notesPlaceholder: "Wat heb je vandaag geoefend?", savePractice: "Oefening opslaan", practiceSaved: "✓ Oefening opgeslagen",
      todayGoal: "DOEL VAN VANDAAG", equipment: "GEOEFEND OP", drumset: "Drumstel", pad: "Oefenpad", equipmentBoth: "Drumstel en oefenpad", addNotes: "+ Notitie toevoegen", minShort: "min", minOn: (minutes: number, equipmentName: string) => `${formatMinutes(minutes)} op ${equipmentName}`,
      todaySummary: "VANDAAG", noPracticeYet: "Nog niet geoefend.", secondsCarried: "extra (nog niet meegeteld in minuten)", todaySoFar: (total: string) => `${total} vandaag al opgeslagen, dit komt erbij`,
      resetPractice: "Wissen", confirmResetPractice: "De oefening van vandaag wissen en opnieuw beginnen? Dit kan niet ongedaan worden gemaakt.",
      noGoalTitle: "Stel je dagelijkse doel in", noGoalSubtitle: "Een paar minuten per dag worden echte vooruitgang. Kies een doel en begin vandaag je reeks.", noGoalBtn: "Mijn doel instellen",
      whatDidYouPractiseTitle: "WAT HEB JE GEOEFEND?", whatDidYouPractiseSubtitle: "Kies er minstens één.", addOwnPlaceholder: "Voeg je eigen toe...", addOwnBtn: "Toevoegen",
      rudiments: "Rudiments", searchRudiments: "Zoek rudiments...", searchExercises: "Zoek oefeningen...", books: "Boeken", myItems: "Mijn items", addOwnBookPlaceholder: "Voeg je eigen boek toe...", pickerDone: "Klaar",
    },
    calendar: {
      title: "KALENDER", longestStreak: "Langste reeks", daysThisYear: "Dagen dit jaar",
      weekdays: ["M", "D", "W", "D", "V", "Z", "Z"], futureDay: "Je kunt geen oefening loggen voor een dag in de toekomst.",
      noPractice: "Geen oefening gelogd voor deze dag. Log de oefening van vandaag via het tabblad Home.", minPractised: "geoefend",
      notesPlaceholder: "Wat heb je die dag geoefend?", saving: "Opslaan...",
      deleteEntry: "Invoer verwijderen", pickOneItem: "Kies minstens één ding dat je hebt geoefend.", confirmDeleteEntry: "De oefening van deze dag verwijderen? Dit kan niet ongedaan worden gemaakt.", couldNotDeleteEntry: "Deze invoer kon niet worden verwijderd.",
      goalMet: "🎯 Dagelijks doel bereikt", goalMissed: (done: string, total: string) => `${done} / ${total} richting je doel`,
      onEquipment: (label: string) => `Op ${label}`,
      streakOnDay: (n: number) => `🔥 Reeks van ${n} dagen`, noPracticeShort: "Geen oefening gelogd voor deze dag.",
      editDay: "Deze dag bewerken", nothingToEdit: "+ Oefening loggen voor deze dag", todayBtn: "Vandaag",
    },
    group: {
      yourCrew: "JOUW GROEP", youreIn: "Je doet mee.", inviteMsg: "Nodig drummers uit met deze code:", copyInvite: "Uitnodigingscode kopiëren",
      challenges: "UITDAGINGEN",
      practiseTogether: "SAMEN OEFENEN", yourGroup: "JOUW GROEP", switchGroup: "ANDERE GROEP KIEZEN", moreOptions: "Meer", inviteShort: "Uitnodigingscode", noChallengesShort: "Nog geen uitdagingen.", showMore: (n: number) => `Toon nog ${n}`, showLess: "Toon minder", findCrew: "Vind je groep.", startGroup: "Start een groep", joinCrew: "Sluit je aan bij je groep",
      intro: "Hou elkaar scherp, klim op de ranglijst en maak oefenen leuker.", createGroupBtn: "Maak een groep", joinWithCode: "Meedoen met uitnodigingscode",
      groupNamePlaceholder: "Naam van de groep", inviteCodePlaceholder: "Uitnodigingscode", pleaseWait: "Even geduld...", createGroup: "Groep maken",
      joinGroup: "Meedoen", back: "Terug", inviteNotFound: "Die uitnodigingscode is niet gevonden.", couldNotCreate: "De groep kon niet worden gemaakt.",
      leaderboard: "RANGLIJST", timePractised: "GEOEFENDE TIJD", daysShort: "dagen", you: "Jij",
      teacherBadge: "Beheerder", showTeacherStats: "Toon statistieken van de beheerder",
      awardMostDays: "Meeste oefendagen dit jaar", awardMostMinutes: "Meeste tijd geoefend",
      medalBoard: "Hall of Fame", medalBoardEmpty: "Nog niemand", medalBoardAllTime: "ALLE TIJDEN", medalBoardThisWeek: "DEZE WEEK",
      awardConsistency: "Meest regelmatig", awardStreak: "Op een reeks", awardChallenge: "Uitdagingskampioen", awardImproved: "Meest verbeterd",
      awardDaysValue: (v: number) => `${v} ${v === 1 ? "dag" : "dagen"}`, awardUnlocksValue: (v: number) => `${v} ${v === 1 ? "nieuw tempo" : "nieuwe tempo's"}`, awardChallengeValue: (pct: number) => `${pct}% bereikt`,
      groupSettings: "GROEPSINSTELLINGEN", countFromCreation: "Statistieken tellen vanaf", enableWeeklyAwards: "Wekelijkse prijzen aanzetten",
      dateModeCalendar: "1 jan", dateModeToday: "Start groep", dateModeCustom: "Eigen datum",
      countFromCreationDesc: "Bepaalt vanaf welke datum de ranglijsten voor oefendagen en geoefende tijd van deze groep tellen.",
      noChallenges: "Nog geen uitdagingen. Begin er een met je groep!", noChallengesMember: "Nog geen uitdagingen. Je leraar kan er een starten.", newChallenge: "+ Nieuwe uitdaging", cancel: "Annuleren", challengeNamePlaceholder: "Naam van de uitdaging",
      typeDaily: "Elke dag", typeMinutes: "Totaal aantal minuten", typeSessions: "Geoefende dagen", goalLabel: "DOEL", startLabel: "START", endLabel: "EINDE", quickStart: "SNELSTART", typeLabel: "SOORT", lengthLabel: "LENGTE", lengthDays: (n: number) => `${n} ${n === 1 ? "dag" : "dagen"}`, lengthCustom: "Eigen", stakesToggle: "Beloning / Als je verliest (optioneel)",
      rewardPlaceholder: "Beloning (optioneel)", punishmentPlaceholder: "Als je verliest (optioneel)", createChallengeBtn: "Uitdaging maken",
      joinChallengeBtn: "Meedoen met uitdaging", joined: "Meegedaan", participants: (n: number) => `${n} doen mee`,
      dailyGoalDesc: (min: number) => `${min}+ min elke dag`, minutesGoalDesc: (total: number) => `Haal ${total} minuten in totaal`,
      sessionsGoalDesc: (days: number) => `Oefen op ${days} dagen`, daysProgress: (p: number, t: number) => `${p}/${t} dagen`,
      minutesProgress: (p: number, t: number) => `${p}/${t} min`, reward: "Beloning:", punishment: "Als je verliest:", couldNotCreateChallenge: "De uitdaging kon niet worden gemaakt.",
      presetDaily5: "3 min elke dag", presetDaily30x5: "30+ min, 5 dagen op rij", presetSessions3weekly: "3 sessies deze week", presetDaily5x20: "Uitdaging van 20 dagen: 5+ min per dag",
      noOnePractised: "Niemand heeft op deze dag geoefend.",
      weekdaysMon: ["M", "D", "W", "D", "V", "Z", "Z"], copied: "Gekopieerd!", progress: "VOORTGANG", leaveGroup: "Groep verlaten",
      confirmLeave: "Deze groep verlaten? Je kunt later weer meedoen met de uitnodigingscode.", confirmDeleteChallenge: "Deze uitdaging verwijderen? Dit kan niet ongedaan worden gemaakt.",
      deleteChallenge: "Verwijderen", since: (date: string) => `Sinds ${date}`, couldNotLeave: "De groep kon niet worden verlaten.", couldNotDeleteChallenge: "De uitdaging kon niet worden verwijderd.",
      deleteGroupBtn: "Groep verwijderen", confirmDeleteGroup: "Deze groep verwijderen? Dit verwijdert de groep voor iedereen en kan niet ongedaan worden gemaakt.", couldNotDeleteGroup: "De groep kon niet worden verwijderd.",
    },
    achievements: {
      unlocked: "ontgrendeld", nextUp: "Volgende", allDone: "Alles ontgrendeld", done: "Ontgrendeld",
      level: (l: number, n: number) => l === 0 ? "Vergrendeld" : `Niveau ${l} van ${n}`, levelShort: (l: number) => `Niveau ${l}`, notYet: "Nog niet",
      category: { time: "Tijd", streak: "Reeks", days: "Regelmaat", sessions: "Trainer", tempo: "Tempo", variety: "Variatie", long: "Lange dag", challenges: "Uitdagingen", mastery: "Beheersing" } as Record<string, string>,
      label: (key: string, n: number) => {
        switch (key) {
          case "time": return n < 1 ? `${Math.round(n * 60)} minuten geoefend` : `${n} uur geoefend`;
          case "streak": return `Reeks van ${n} dagen`;
          case "days": return `${n} dagen geoefend`;
          case "sessions": return n === 1 ? "Eerste Skill Trainer-sessie" : `${n} Skill Trainer-sessies`;
          case "tempo": { const need = TEMPO_REQUIRED_BY_BPM[n] ?? 5; return `${need} ${need === 1 ? "rudiment" : "rudiments"} op ${n} BPM`; }
          case "variety": return `${n} verschillende oefeningen`;
          case "long": return `${n} min op één dag`;
          case "mastery": return n === 1 ? "Eerste sessie als beheerst beoordeeld" : `${n} sessies als beheerst beoordeeld`;
          default: return n === 1 ? "Eerste uitdaging gewonnen" : `${n} uitdagingen gewonnen`;
        }
      },
    },
    progressPage: {
      eyebrow: "OEFENOVERZICHT", title: "VOORTGANG", yourPractice: "JOUW OEFENING",
      noData: "Log wat oefening om hier je voortgang te zien.", pinned: "JOUW FOCUS", generalPractice: "Algemeen oefenen", seeMore: "Meer tonen", seeLess: "Minder tonen",
      skillProgress: "VAARDIGHEIDSVOORTGANG", noSkillData: "Train de BPM-niveaus van een oefening om hier je vaardigheidsvoortgang te zien.",
      levelsLabel: (done: number, total: number) => `${done}/${total} niveaus`, overallLevel: "Algemeen niveau", levelOf: (n: number, total: number) => `Niveau ${n} van ${total}`, infoTitle: "Hoe wordt dit berekend?", info1: "Een oefening bereikt een tier als je er een tempo in ontgrendelt.", info2: "Je niveau is de hoogste tier die minstens 1 op de 4 van je oefeningen heeft bereikt.", info3: "De balken tonen hoeveel van je oefeningen elke tier hebben bereikt.", infoClose: "Begrepen", overallReached: (n: number, total: number, tier: string) => `${n} van de ${total} oefeningen op ${tier}`, noTierExercises: "Nog geen oefeningen op dit niveau.", unlocksTitle: "RECENTE ONTGRENDELINGEN", unlocksEmpty: "Ontgrendel een tempo in de Skill Trainer om het hier te zien.", unlockedBpm: (bpm: number) => `${bpm} BPM ontgrendeld`,
      achievements: "MIJLPALEN", achievementsIntro: "Voltooi een persoonlijke uitdaging op het tabblad Oefenen om hier een trofee te winnen. Meer mijlpalen komen eraan.",
    },
    cheers: {
      sendBtn: "Stuur een aanmoediging", recentTitle: "RECENTE AANMOEDIGINGEN", remove: "Verwijderen", undo: "Ongedaan maken", undoSent: "Ongedaan maken (verwijdert het voor iedereen)", you: "Jij", bellTitle: "AANMOEDIGINGEN", heart: "Vind ik leuk", heartedYours: (name: string) => `${name} vond je aanmoediging leuk`, inboxEmpty: "Nog geen aanmoedigingen.", cheerGroupBtn: "Moedig de hele groep aan", cheerGroup: "MOEDIG DE GROEP AAN", cheerPerson: (name: string) => `MOEDIG ${name.toUpperCase()} AAN`, tapNameHint: "Tik op een naam om een aanmoediging te sturen.", incoming: (name: string) => `${name} stuurde een aanmoediging`, sheetTitle: "STUUR EEN AANMOEDIGING", toLabel: "AAN", everyone: "Iedereen", sent: "Aanmoediging verstuurd!",
      newCount: (n: number) => n === 1 ? "1 nieuwe aanmoediging" : `${n} nieuwe aanmoedigingen`, gotIt: "Begrepen", toYou: "voor jou",
      couldNotSend: "De aanmoediging kon niet worden verstuurd.",
    },
    personalChallenges: {
      title: "Persoonlijke uitdagingen", homeTitle: "PERSOONLIJKE UITDAGINGEN", subtitle: "Stel je eigen oefendoel in.",
      newChallenge: "+ Nieuwe uitdaging", cancel: "Annuleren",
      exerciseLabel: "Oefening", minutesLabel: "Minuten per dag", bpmLabel: "Doeltempo in BPM (optioneel)", bpmPlaceholder: "Elk tempo",
      lengthLabel: "Lengte van de uitdaging (dagen)", startChallenge: "Uitdaging starten", pleaseWait: "Even geduld...",
      noChallenges: "Nog geen persoonlijke uitdagingen.",
      challengeTitle: (exercise: string, days: number) => `${exercise}: uitdaging van ${days} dagen`, wonTitle: "Gewonnen uitdagingen", wonPopupTitle: "Gefeliciteerd!", wonPopupOwn: (n: string) => `Je hebt je uitdaging voltooid: ${n}.`, wonPopupTeacher: (n: string) => `Je hebt de uitdaging van je leraar voltooid: ${n}.`, wonPopupSaved: "Je trofee staat bij Voortgang, onder \"Gewonnen uitdagingen\".", wonPopupSee: "Bekijk mijn trofeeën", wonPopupClose: "Sluiten", wonEmpty: "Voltooi een persoonlijke uitdaging om je eerste trofee te winnen.", wonMeta: (minutes: number, days: number, bpm: number | null) => `${minutes} min per dag · ${days} dagen${bpm ? ` · ${bpm} BPM` : ""}`, wonFromTeacher: "Van je leraar",
      challengeDescription: (minutes: number, bpm: number | null, days: number) => bpm ? `Oefen ${minutes} min op ${bpm}+ BPM, ${days} dagen achter elkaar, elke dag.` : `Oefen ${minutes} min, ${days} dagen achter elkaar, elke dag.`,
      statusActive: (done: number, total: number) => `${done}/${total} dagen`, statusCompleted: "✓ Voltooid, prestatie ontgrendeld!", statusFailed: "Uitdaging mislukt. Opnieuw beginnen?",
      deleteChallenge: "Verwijderen", confirmDelete: "Deze uitdaging verwijderen? Dit kan niet ongedaan worden gemaakt.",
      fromTeacher: "Van je leraar", failedShort: "Dag gemist", statusCompletedShort: "Voltooid", perDayShort: "min / dag", bpmShort: "BPM",
      giveTitle: "GEEF EEN UITDAGING", giveBtn: "Uitdaging geven", giveHint: "Verschijnt bij de leerling op Home en bij Uitdagingen als \"Van je leraar\". De leerling kan hem niet verwijderen.", givenLabel: "UITDAGINGEN", noneGiven: "Nog geen uitdagingen.", givenBadge: "Door jou gegeven", confirmRemove: "Deze uitdaging bij de leerling weghalen?", remove: "Weghalen", perDay: (m: number) => `${m} min per dag`, couldNotGive: "De uitdaging kon niet worden gegeven.", lengthDaysN: (n: number) => `${n} dagen`, lengthCustomShort: "Anders",
      resetChallenge: "Opnieuw proberen", confirmReset: "Deze uitdaging opnieuw starten vanaf dag 1?",
      couldNotCreate: "De uitdaging kon niet worden gemaakt.",
    },
    practiceMode: {
      eyebrow: "VOLG JE NIVEAUS", title: "OEFENMODUS", pageEyebrow: "TRAINEN", pageTitle: "OEFENEN",
      currentLevel: "HUIDIG NIVEAU", levelsUnlocked: (n: number, total: number) => `${n} van ${total} niveaus ontgrendeld`,
      notStarted: "Niet begonnen",
      inProgress: "Bezig", unlockedLabel: "Ontgrendeld", confirmResetLevel: (bpm: number) => `Je voortgang op ${bpm} BPM terugzetten? Dit kan niet ongedaan worden gemaakt.`,
      editRatingTitle: "Beoordeling wijzigen", skippedLabel: "Overgeslagen",
      improvedToast: (from: string, to: string, exercise: string, bpm: number, days: number) => `Verbeterd van ${from} naar ${to} bij ${exercise} · ${bpm} BPM in ${days} ${days === 1 ? "dag" : "dagen"}`, niceBtn: "Mooi!",
      struggledFlagTitle: "Je had vroeger moeite met dit tempo",
      tierBeginner: "BEGINNER", tierIntermediate: "GEMIDDELD", tierAdvanced: "GEVORDERD", tierLegend: "LEGENDE",
      rudimentTierBasics: "BASIS", rudimentTierIntermediate: "GEMIDDELD", rudimentTierAdvanced: "COMPLEX",
      unlockFirst: (names: string) => `Ontgrendel eerst ${names}`,
      tierUnlockedCount: (unlocked: number, total: number) => `${unlocked} van ${total} ontgrendeld`,
      exerciseGroupHand: "HANDTECHNIEKEN", exerciseGroupFootwork: "VOETWERK", exerciseGroupCoordination: "COÖRDINATIE",
      exercisesPracticedCount: (n: number, total: number) => `${n} van ${total} geoefend`,
      subdivisionQuarter: "Kwartnoten", subdivisionEighth: "Achtste noten", subdivisionTriplet: "Triolen", subdivisionSixteenth: "Zestiende noten", subdivisionSixteenthTriplet: "Zestiende triolen",
      ratingNotReady: "Nog niet klaar", ratingTense: "Gespannen", ratingAlmost: "Bijna", ratingComfortable: "Comfortabel", ratingMastered: "Beheerst",
      rateTitle: "HOE VOELDE DAT?", rateSubtitle: (bpm: number) => `Beoordeel je sessie op ${bpm} BPM om hem op te slaan.`, skipRating: "Overslaan, niet loggen",
      issueLabel: "WAT GEBEURDE ER? (OPTIONEEL)", sessionNotePlaceholder: "Voeg een notitie toe (optioneel)", saveRating: "Opslaan",
      backToBook: "Terug naar oefenmodus", couldNotSaveSession: "Deze sessie kon niet worden opgeslagen.",
      categoryRudiments: "Rudiments", categoryExercises: "Oefeningen", categoryRhythms: "Ritmes",
      pin: "Vastzetten", pinned: "Vastgezet",
      maxPinnedReached: (max: number) => `Je kunt maximaal ${max} oefeningen vastzetten. Haal er eerst een los.`,
      pinManagerEyebrow: (count: number, max: number) => `${count}/${max} VASTGEZET`, pinManagerTitle: "Jouw focus", pinManagerDone: "Klaar",
      pinManagerAddBtn: "+ Oefening toevoegen", pinManagerSearchPlaceholder: "Zoek oefeningen...", pinManagerEmpty: "Nog niets vastgezet. Voeg er maximaal 5 toe om hier te volgen.",
      quickTitle: "Snel oefenen", quickSub: "Minuten loggen, metronoom, timer", continueLabel: "Ga verder waar je gebleven was", recentDays: "RECENTE DAGEN", noRecentDays: "Nog niets gelogd.", skillSearchPlaceholder: "Zoek rudiments en oefeningen", skillNoMatch: "Niets gevonden voor die zoekopdracht.", skillSub: "Rudiments en oefeningen", challengesSub: "Stel je eigen oefendoel in",
      trainTitle: "Skill Trainer",
      rudimentListIntro: "Ontgrendel 2 tempo's om het volgende rudiment te openen.",
      tempoCompleteIntro: (min: number) => `Oefen een tempo ${min} min om het te voltooien.`,
      listIntroExercises: (min: number) => `Oefen ${min} min op elk tempo om het volgende niveau te ontgrendelen.`,
      listIntroRhythms: (min: number) => `Grooves en stijlen om je muzikale woordenschat op te bouwen. Tik er een aan en log minstens ${min} comfortabele minuten op elk BPM-niveau om het te ontgrendelen en door te gaan.`,
    },
    onboarding: {
      languageTitle: "Kies je taal", eyebrow: "WELKOM", exercisesTitle: "Kies je focus", goalTitle: "Dagelijks oefendoel", modeTitle: "Kies je inhoudsbibliotheek", dobTitle: "Wanneer ben je geboren?", dobHint: "We gebruiken dit om je oefening en je ranglijstgroep in te stellen. Niemand anders ziet het ooit.", dobError: "Die datum kon niet worden opgeslagen. Controleer hem en probeer opnieuw.",
      continueBtn: "Doorgaan", finishBtn: "Klaar", skipBtn: "Nu overslaan",
    },
    settings: {
      makeItYours: "MAAK HET JOUW EIGEN", title: "INSTELLINGEN", displayName: "WEERGAVENAAM", dailyGoal: "DAGELIJKS OEFENDOEL", minutes: "minuten",
      language: "TAAL", pushLabel: "Aanmoedigingsmeldingen", pushDesc: "Krijg een melding op deze telefoon als iemand in je groep je aanmoedigt.", pushBlocked: "Meldingen staan uit. Zet ze aan voor DrumSkills in de instellingen van je telefoon.", pushError: "Meldingen aanzetten is niet gelukt. Probeer het opnieuw.", showDaysThisYear: "Geoefende dagen dit jaar", showDaysThisYearDesc: "Voegt het aantal oefendagen dit jaar toe aan je Home-statistieken.", on: "AAN", off: "UIT", save: "Instellingen opslaan", saved: "✓ Instellingen opgeslagen", logout: "Uitloggen", calendarColor: "KALENDERKLEUR IN DE GROEP", autoColor: "Automatisch",
      metronomeTone: "METRONOOMGELUID", toneNames: { click: "Klik", beep: "Piep", wood: "Hout", clave: "Clave" },
      profileSection: "PROFIEL", practiceSection: "OEFENEN", preferencesSection: "VOORKEUREN", accountSection: "ACCOUNTINSTELLINGEN", pleaseWait: "Even geduld...",
      confirmLogout: "Uitloggen bij DrumSkills?", libraryLabel: "INHOUDSBIBLIOTHEEK", libraryFull: "Volledige bibliotheek", libraryEssentials: "Basis", libraryHint: "Basis toont een kortere lijst voor beginners.", dobLabel: "GEBOORTEDATUM", dobSaved: "Opgeslagen. Het blijft privé. Klopt het niet, neem dan contact op met support om het te corrigeren.", dobHint: "Voeg het toe voor de juiste ranglijstgroep en beginstanden. Het blijft privé.", dobSave: "Opslaan", difficultyLabel: "OEFENNIVEAU", difficultyBeginner: "Beginner", difficultyDeveloping: "Opbouw", difficultyStandard: "Standaard", difficultyHint: "Beginner: kwartnoten. Opbouw: achtste noten. Standaard: de rudiment zoals geschreven. Het tempo (BPM) verandert nooit.",
      changeEmail: "E-mailadres wijzigen", newEmailPlaceholder: "Nieuw e-mailadres", updateEmail: "E-mailadres bijwerken", emailChangeSent: "Controleer je nieuwe e-mail om de wijziging te bevestigen.",
      changePassword: "Wachtwoord wijzigen", newPasswordPlaceholder: "Nieuw wachtwoord", confirmPasswordPlaceholder: "Bevestig nieuw wachtwoord", updatePassword: "Wachtwoord bijwerken", passwordChanged: "✓ Wachtwoord bijgewerkt", passwordMismatch: "De wachtwoorden komen niet overeen.", passwordTooShort: "Het wachtwoord moet minstens 6 tekens hebben.",
      privacyPolicy: "Privacybeleid", termsOfUse: "Gebruiksvoorwaarden", support: "Ondersteuning",
      deleteAccount: "Account verwijderen", deleteAccountWarning: "Hiermee verwijder je je account en je hele oefengeschiedenis definitief. Dit kan niet ongedaan worden gemaakt.", deleteAccountConfirmPrompt: (email: string) => `Typ je e-mailadres (${email}) om te bevestigen:`, deleteAccountBtn: "Mijn account verwijderen", deleteAccountBusy: "Verwijderen…", couldNotDeleteAccount: "Je account kon niet worden verwijderd.",
    },
    admin: {
      title: "GEBRUIKERSACTIVITEIT", eyebrow: "BEHEER", noUsers: "Nog geen gebruikers.", neverPracticed: "Nooit geoefend",
      dailyLogs: "DAGELIJKSE LOGS", practiceSessions: "SKILL TRAINER-SESSIES", noDailyLogs: "Nog geen dagelijkse logs.", noPracticeSessions: "Nog geen Skill Trainer-sessies.",
      notesPrefix: "Notities:",
      usersLabel: (n: number) => n === 1 ? "GEBRUIKER" : "GEBRUIKERS",
      totalMinutesLabel: "totaal", totalLogsLabel: "logs", totalPracticeLabel: "Totaal geoefend", focusLabel: "FOCUS", mostPracticedLabel: "MEEST GEOEFEND",
      pointsLabel: "PUNTEN", awardHint: "Punten geven of afnemen", reasonPlaceholder: "Reden", awardBtn: "Geven", modeLabel: "MODUS", modeStandard: "Volledige bibliotheek", modeBeginner: "Basis", pointGameLabel: "PUNTENSPEL", pointGameOn: "Aan", pointGameOff: "Uit", leaderboardLabel: "RANGLIJST", leaderboardShown: "Zichtbaar", leaderboardHiddenOpt: "Verborgen", pointsHistory: "PUNTENGESCHIEDENIS", noPoints: "Nog geen punten gegeven.",
      metronomeBadge: "Metronoom", skillTrainerBadge: "Skill Trainer", noElements: "Geen oefenonderdeel gekozen", quickEntryBadge: "Snelle invoer",
      mostMinutesTitle: "MEESTE OEFENTIJD", allUsersTitle: "ALLE GEBRUIKERS", excludeSelfLabel: "Mijn account uitsluiten van statistieken",
      statsRangeLabel: "Periode", statsRangeAll: "Alles", statsRangeMonth: "Deze maand", statsRangeLastMonth: "Vorige maand", statsRangeYear: "Jaar",
      skillProgressLabel: "VAARDIGHEIDSVOORTGANG",
      monthlyPracticeLabel: "OEFENEN PER MAAND", achievementsLabel: "PRESTATIES", noAchievements: "Nog geen prestaties.",
      historyBtn: "Geschiedenis", hideHistoryBtn: "Geschiedenis verbergen",
      speedLabel: "SNELHEID PER OEFENING", speedHint: "Het hoogste BPM dat elke leerling comfortabel heeft gespeeld, in de loop van de tijd.",
      speedNoData: "Nog geen sessies gelogd voor deze oefening.", speedNotQualified: "Aan het oefenen, nog niet op een vast tempo:",
      speedBpmSuffix: "BPM",
      improvementsLabel: "RECENTE VERBETERINGEN", improvementsEmpty: "Nog geen tempoverbeteringen.",
      improvedTo: (exercise: string, bpm: number) => `${exercise} → ${bpm} BPM`,
    },
    metronome: {
      practiceTool: "OEFENHULP", title: "METRONOOM", practiceTimer: "OEFENTIMER", sessionTime: "SESSIETIJD", tapTempo: "TEMPO TIKKEN",
      startPractice: "Begin met oefenen", stickingLabel: "HANDENVOLGORDE",
      start: "▶ Start", stop: "■ Stop", clickSettings: "Klikgeluid", subClicks: "Kliks tussen de tellen", volOff: "Alleen de tel", volFull: "Vol", subClicksHint: "De klik op elke tel blijft gelijk. Dit verandert alleen de kliks ertussen.", sessionComplete: "SESSIE VOLTOOID",
      addTimeQuestion: (label: string) => `${label} toevoegen aan de oefening van vandaag?`, addTimeTooShort: "Te kort om te loggen, pas de timer hierboven aan", sessionLasted: (time: string) => `Je metronoomsessie duurde ${time}.`, minAbbr: "min", secAbbr: "sec",
      notNow: "Nu niet", addTime: "Tijd toevoegen",
      timeSignature: "SLAGEN / MAAT", bannerTitle: "Metronoom", pause: "Pauze", resume: "Hervat", viewStrokes: "Slagen", viewNotation: "Notatie", subdivisionLabel: "KLIKS / SLAG", leadHand: "BEGINT MET", clicksFixed: ((n: number) => `${n} per tel (bepaald door de oefening)`), historyTitle: (n: number) => `GESCHIEDENIS (${n})`,
    },
    sessionTimer: {
      focusRunning: "Je timer loopt", focusTitle: "Waar ga je aan werken?", focusSkip: "Overslaan", focusPinned: "Vastgezette oefeningen", focusRudimentsSub: "Skill Trainer", focusExercisesSub: "Handen, voeten en patronen", focusMetronomeSub: "Oefen met een klik", focusFree: "Vrij spelen", focusFreeSub: "Speel wat je wilt", pillLabel: "Sessietimer", title: "SESSIETIMER", metronomeShared: "Sessietimer", allAlreadyLogged: "Al deze tijd is al gelogd via de Skill Trainer.", alreadyLogged: (t: string) => `${t} hiervan was al gelogd via de Skill Trainer en wordt dus niet dubbel geteld.`, modeStopwatch: "Stopwatch", modeTimer: "Timer",
      durationLabel: "DUUR", timeUp: "De tijd is om!", sessionFinished: "Sessie afgelopen", tapToOpen: "tik om te openen", tapToLog: "tik om te loggen", longSessionWarning: "Dat is meer dan 3 uur. Als je vergeten bent te stoppen, pas de tijd hieronder aan of tik op Nu niet.", logTitle: "Log je oefening", addToToday: "Voeg toe aan vandaag", receiptSession: "Totaal van de sessie", receiptLogged: "Geteld in Skill Trainer", receiptAdding: "Nu toevoegen", changeAmount: "Hoeveelheid aanpassen", hideChange: "Verberg", whatDidYouPractise: "Wat heb je geoefend?", anythingElse: "Nog iets anders?", chooseWhat: "Kies wat je geoefend hebt", pickAtLeastOne: "Kies minstens één ding om dit op te slaan.", skillTrainerBadge: "Skill Trainer", addAmount: (t: string) => `${t} toevoegen`, adjustHint: "TIJD AANPASSEN", resetTime: (original: string) => `Terugzetten naar ${original}`,
    },
  },
} as const;


// Ready-made group cheers (no typing). Keep the keys in sync with the check constraint on group_cheers in schema.sql.
const CHEER_KEYS_BASE: { key: string; en: string; es: string }[] = [
  { key: "letsgo", en: "Let's go, you can do it!", es: "¡Vamos, tú puedes!" },
  { key: "keepitup", en: "Keep it up, team!", es: "¡Sigan así, equipo!" },
  { key: "greatpractice", en: "Great practice today!", es: "¡Gran práctica hoy!" },
  { key: "streak", en: "Don't break the streak!", es: "¡No rompas la racha!" },
  { key: "proud", en: "Proud of you all!", es: "¡Orgulloso de todos!" },
  { key: "gopractice", en: "Go practice!", es: "¡A practicar!" },
  { key: "goodjob", en: "Good job!", es: "¡Buen trabajo!" },
  { key: "yes", en: "Yes!", es: "¡Sí!" },
];
const CHEER_KEYS = withNl(CHEER_KEYS_BASE);
type CheerHeart = { user_id: string; created_at: string; name: string };
type Cheer = { id: string; group_id: string; from_user: string; to_user: string | null; cheer_key: string; created_at: string; from_name: string; hearts: CheerHeart[] };
// TEST ONLY: lets a sender heart their own cheer so hearts can be tried with a single account. Set to false (and
// run the "revert" SQL at the end of schema.sql) to go back to hearts from other people only.
const ALLOW_SELF_HEART = true;
const countsAsHeart = (heartUserId: string, me: string) => ALLOW_SELF_HEART || heartUserId !== me;
// Unread = cheers sent to me that are newer than what I last saw, plus new hearts other people put on cheers I sent.
function cheerUnreadCount(cheers: Cheer[], me: string, seenAt: string, groupId?: string) {
  let count = 0;
  cheers.forEach((c) => {
    if (groupId && c.group_id !== groupId) return;
    if (c.from_user !== me && c.created_at > seenAt) count++;
    if (c.from_user === me) count += c.hearts.filter((h) => countsAsHeart(h.user_id, me) && h.created_at > seenAt).length;
  });
  return count;
}
function HeartIcon({ filled }: { filled?: boolean }) {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20.5s-7.5-4.6-9.2-9.3C1.7 8 3.4 5 6.5 5c1.9 0 3.5 1.1 4.3 2.5L12 9.2l1.2-1.7C14 6.1 15.6 5 17.5 5c3.1 0 4.8 3 3.7 6.2-1.7 4.7-9.2 9.3-9.2 9.3z" /></svg>;
}
function cheerAge(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  return `${Math.floor(mins / 1440)}d`;
}
function cheerText(key: string, language: Lang) {
  const c = CHEER_KEYS.find((x) => x.key === key);
  return c ? c[language] : "";
}
const NAV_ICONS: Record<Tab, React.ReactNode> = {
  today: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5L10 3l7 6.5" /><path d="M4.5 8.5V17h11V8.5" /><path d="M8 17v-4.5a1 1 0 011-1h2a1 1 0 011 1V17" /></svg>,
  practice: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="10" cy="10" r="7" /><circle cx="10" cy="10" r="4" /><circle cx="10" cy="10" r="1.1" fill="currentColor" stroke="none" /></svg>,
  group: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="7.2" cy="7" r="2.6" /><path d="M2.5 17c0-2.9 2.1-5 4.7-5s4.7 2.1 4.7 5" /><circle cx="14.5" cy="7.8" r="2.1" /><path d="M12.7 12.3c1.9.4 3.3 2.1 3.3 4.7" /></svg>,
  progress: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 16.5V9.5M10 16.5V3.5M16 16.5v-6" /></svg>,
  settings: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" /></svg>,
  admin: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2.5l6 2.2v4.8c0 4-2.6 6.8-6 8-3.4-1.2-6-4-6-8V4.7l6-2.2z" /><path d="M7.3 10l1.9 1.9 3.5-3.9" /></svg>,
};
function formatLocalDate(year: number, monthIndex0based: number, day: number) {
  return `${year}-${String(monthIndex0based + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
const now = new Date();
const dateKey = formatLocalDate(now.getFullYear(), now.getMonth(), now.getDate());
const monthStartKey = formatLocalDate(now.getFullYear(), now.getMonth(), 1);
const yearStartKey = formatLocalDate(now.getFullYear(), 0, 1);
// getMonth() - 1 rolls back into December of the prior year on its own (JS Date normalizes it),
// so this works correctly in January too.
const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
const lastMonthStartKey = formatLocalDate(lastMonthDate.getFullYear(), lastMonthDate.getMonth(), 1);
// Monday of the current calendar week -- "this week" means Mon-Sun (matching the group calendar's
// Monday-first layout), not a rolling last-7-days window. getDay() is 0 for Sunday, hence the shift.
const weekStartKey = shiftDateKey(dateKey, -((now.getDay() + 6) % 7));

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
// "2026-10-05" -> "05/10/2026". Group dates are always shown day/month/year, whatever the
// device's own locale would do (a US-set phone would otherwise show month/day/year).
function formatDMY(key: string) { return `${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(0, 4)}`; }
// Picker that always reads day / month / year. A native <input type="date"> uses the device's
// locale order and the page can't override it, so this uses three selects instead. Values stay
// "YYYY-MM-DD" strings like the native input, and min/max are enforced by clamping.
function DateDMY({ value, onChange, min, max }: { value: string; onChange: (value: string) => void; min?: string; max?: string }) {
  const [y, m, d] = value.split("-").map(Number);
  const thisYear = new Date().getFullYear();
  const firstYear = Math.min(min ? Number(min.slice(0, 4)) : thisYear - 5, y);
  const lastYear = Math.max(max ? Number(max.slice(0, 4)) : thisYear + 5, y);
  const pad = (n: number) => String(n).padStart(2, "0");
  function commit(ny: number, nm: number, nd: number) {
    let next = `${ny}-${pad(nm)}-${pad(Math.min(nd, new Date(ny, nm, 0).getDate()))}`;
    if (min && next < min) next = min;
    if (max && next > max) next = max;
    onChange(next);
  }
  return <div className="date-dmy">
    <select aria-label="Day" value={d} onChange={(e) => commit(y, m, Number(e.target.value))}>{Array.from({ length: new Date(y, m, 0).getDate() }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{pad(n)}</option>)}</select>
    <span>/</span>
    <select aria-label="Month" value={m} onChange={(e) => commit(y, Number(e.target.value), d)}>{Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{pad(n)}</option>)}</select>
    <span>/</span>
    <select aria-label="Year" value={y} onChange={(e) => commit(Number(e.target.value), m, d)}>{Array.from({ length: lastYear - firstYear + 1 }, (_, i) => firstYear + i).map((n) => <option key={n} value={n}>{n}</option>)}</select>
  </div>;
}
// Little music-note drawing for the note-value chip on an exercise's detail screen.
function NoteValueIcon({ subdivision }: { subdivision: "quarter" | "eighth" | "triplet" | "sixteenth" | "sixteenthTriplet" }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return <svg className="note-value-icon" viewBox="0 0 24 24" aria-hidden="true">
    {subdivision === "triplet" || subdivision === "sixteenthTriplet" ? <>
      <ellipse cx="5" cy="18" rx="2.3" ry="1.8" fill="currentColor" stroke="none" /><ellipse cx="12" cy="18" rx="2.3" ry="1.8" fill="currentColor" stroke="none" /><ellipse cx="19" cy="18" rx="2.3" ry="1.8" fill="currentColor" stroke="none" />
      <path d="M7.2 17.5V9M14.2 17.5V9M21.2 17.5V9M7.2 9h14" {...common} />
      {subdivision === "sixteenthTriplet" && <path d="M7.2 12.4h14" {...common} />}
      <text x="14.2" y="6.4" fontSize="7" fontWeight="800" textAnchor="middle" fill="currentColor" stroke="none">3</text>
    </> : <>
      <ellipse cx="8.5" cy="18" rx="3.4" ry="2.5" fill="currentColor" stroke="none" transform="rotate(-18 8.5 18)" />
      <path d="M11.6 17V3.5" {...common} />
      {(subdivision === "eighth" || subdivision === "sixteenth") && <path d="M11.6 3.5c0 4.2 6 4.6 6 9.5" {...common} />}
      {subdivision === "sixteenth" && <path d="M11.6 8c0 4.2 6 4.6 6 9.5" {...common} />}
    </>}
  </svg>;
}
function challengeExerciseLabel(en: string, language: Lang) {
  return CHALLENGE_EXERCISE_OPTIONS.find((e) => e.en === en)?.[language] ?? en;
}
type ChallengeLogEntry = { minutes: number; items: string[]; customItems: string[]; updatedAt: string };
function isChallengeDayValid(challenge: any, date: string, practiceSessions: { item_en: string; bpm: number; duration_minutes: number; practiced_on: string; created_at: string }[], logsCache: Record<string, ChallengeLogEntry>) {
  // Skill Trainer exercises are tracked by their sessions, at the target BPM or faster (any BPM when the
  // challenge has none). Anti-backdating: same idea as the log-based check below, but against the
  // session's own created_at (server-controlled, see the practice_sessions_lock_created_at trigger)
  // instead of practiced_on, since a session has no separate "edited" timestamp to forge.
  const minBpm = challenge.target_bpm ?? 0;
  const sessionMinutes = practiceSessions.filter((s) => s.item_en === challenge.exercise_en && s.practiced_on === date && s.bpm >= minBpm && s.created_at && localDateFromTimestamp(s.created_at) === date).reduce((sum, s) => sum + s.duration_minutes, 0);
  if (sessionMinutes >= challenge.target_minutes) return true;
  if (challenge.target_bpm) return false;
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
function evaluateChallenge(challenge: any, practiceSessions: { item_en: string; bpm: number; duration_minutes: number; practiced_on: string; created_at: string }[], logsCache: Record<string, ChallengeLogEntry>) {
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

// A group's chosen practice-tracking start date (custom date, or its own creation date), or
// null when it's just using the default calendar year -- shared by the leaderboard math in
// loadGroupDetail and the calendar's day-dots/day-detail fetches, so "where stats start" means
// the same thing everywhere in the group, not just on the leaderboards.
function groupStatsStart(group: any): string | null {
  if (!group) return null;
  return group.stats_start_date || (group.count_days_from_creation ? String(group.created_at).slice(0, 10) : null);
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
  // Android Back button: close an open window, else go back one screen, else return to Today, else leave the app.
  const backRef = useRef<() => void>(() => {});
  backRef.current = () => {
    const closeButton = document.querySelector<HTMLElement>(".modal .close");
    if (closeButton) { closeButton.click(); return; }
    const backButton = document.querySelector<HTMLElement>(".back-row button, .page-back");
    if (backButton) { backButton.click(); return; }
    if (tab !== "today") { setTab("today"); return; }
    import("@capacitor/app").then(({ App }) => App.exitApp());
  };
  useEffect(() => {
    if (!IS_NATIVE_BUILD || !IS_ANDROID) return;
    let handle: { remove: () => void } | null = null;
    let cancelled = false;
    import("@capacitor/app").then(({ App }) => App.addListener("backButton", () => backRef.current())).then((h) => { if (cancelled) h.remove(); else handle = h; });
    return () => { cancelled = true; handle?.remove(); };
  }, []);
  const [minutes, setMinutes] = useState("0");
  const [seconds, setSeconds] = useState("0");
  // Quick Practice's own entry field -- how much to ADD right now, always starting back at 0,
  // kept separate from `minutes` (today's real running total, which Skill Trainer sessions add
  // to automatically) so the two never fight over the same editable number.
  const [quickAddMinutes, setQuickAddMinutes] = useState("0");
  const [customItems, setCustomItems] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [equipment, setEquipment] = useState<string | null>(null);
  const [drumsetMinutes, setDrumsetMinutes] = useState("");
  const [padMinutes, setPadMinutes] = useState("");
  const [logs, setLogs] = useState<Record<string, Log>>({});
  const [saved, setSaved] = useState(false);
  const [metronome, setMetronome] = useState(false);
  const [sessionTimer, setSessionTimer] = useState(false);
  const [timerBanner, setTimerBanner] = useState(false);
  const [metroBanner, setMetroBanner] = useState(false);
  const [confirmState, setConfirmState] = useState<{ message: string; resolve: (value: boolean) => void } | null>(null);
  function askConfirm(message: string): Promise<boolean> {
    return new Promise((resolve) => setConfirmState({ message, resolve }));
  }
  const [user, setUser] = useState<any>(null);
  // Group cheers: loaded for every group the user is in (RLS decides what is visible), polled gently so the
  // Group tab can show an "unread" dot. "Seen" is a per-device convenience, so it lives in localStorage.
  // Session Timer <-> everything else. While the timer RUNS, the free metronome shares its clock instead of keeping its
  // own, and minutes that Skill Trainer (or the metronome) adds to today's total during the run are remembered as
  // "credit", so the timer doesn't add them a second time when it is logged. Stored so a reload doesn't lose it.
  const [timerRun, setTimerRun] = useState<{ startedAt: number; mode: "stopwatch" | "timer"; durationMinutes: number } | null>(null);
  const [timerCredit, setTimerCredit] = useState<{ startedAt: number; seconds: number; metronome: boolean; items: string[] } | null>(null);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("session_timer_credit_v1") ?? "null");
      if (saved && Number.isFinite(saved.startedAt) && Number.isFinite(saved.seconds)) setTimerCredit({ startedAt: saved.startedAt, seconds: saved.seconds, metronome: !!saved.metronome, items: Array.isArray(saved.items) ? saved.items.filter((x: unknown) => typeof x === "string") : [] });
    } catch { /* ignore unreadable data */ }
  }, []);
  function saveTimerCredit(next: { startedAt: number; seconds: number; metronome: boolean; items: string[] } | null) {
    setTimerCredit(next);
    try { if (next) localStorage.setItem("session_timer_credit_v1", JSON.stringify(next)); else localStorage.removeItem("session_timer_credit_v1"); } catch {}
  }
  function addTimerCredit(seconds: number, metronome: boolean, itemEn?: string) {
    if (!timerRun) return;
    const base = timerCredit && timerCredit.startedAt === timerRun.startedAt ? timerCredit : { startedAt: timerRun.startedAt, seconds: 0, metronome: false, items: [] as string[] };
    saveTimerCredit({ startedAt: base.startedAt, seconds: base.seconds + Math.max(0, Math.round(seconds)), metronome: base.metronome || metronome, items: itemEn && !base.items.includes(itemEn) ? [...base.items, itemEn] : base.items });
  }
  const [cheers, setCheers] = useState<Cheer[]>([]);
  const [cheersSeenAt, setCheersSeenAt] = useState("");
  const [groupPickerKey, setGroupPickerKey] = useState(0);
  const [groupCount, setGroupCount] = useState(0); // reported by the Group screen; used for the "tap again to switch" arrow on the tab
  // A new cheer from someone else slides in at the top (like a message notification) and fades after a few seconds.
  const knownCheerIds = useRef<Set<string> | null>(null);
  const knownHeartKeys = useRef<Set<string> | null>(null);
  const [incomingCheer, setIncomingCheer] = useState<{ kind: "cheer" | "heart"; name: string; cheerKey: string } | null>(null);
  useEffect(() => {
    if (!incomingCheer) return;
    const timer = window.setTimeout(() => setIncomingCheer(null), 6000);
    return () => window.clearTimeout(timer);
  }, [incomingCheer]);
  const loadCheers = useCallback(async () => {
    if (!user) return;
    const since = new Date(Date.now() - 3 * 86400000).toISOString();
    const base = "id,group_id,from_user,to_user,cheer_key,created_at,from_profile:profiles!group_cheers_from_user_fkey(name)";
    let { data, error } = (await supabase.from("group_cheers").select(`${base},hearts:group_cheer_hearts(user_id,created_at,profile:profiles(name))`).gte("created_at", since).order("created_at", { ascending: false }).limit(50)) as { data: any[] | null; error: any };
    // If the hearts table isn't set up yet, still show the cheers themselves.
    if (error) ({ data } = await supabase.from("group_cheers").select(base).gte("created_at", since).order("created_at", { ascending: false }).limit(50));
    const list: Cheer[] = (data ?? []).map((row: any) => ({ id: row.id, group_id: row.group_id, from_user: row.from_user, to_user: row.to_user, cheer_key: row.cheer_key, created_at: row.created_at, from_name: row.from_profile?.name || "Drummer", hearts: (row.hearts ?? []).map((h: any) => ({ user_id: h.user_id, created_at: h.created_at, name: h.profile?.name || "Drummer" })) }));
    const known = knownCheerIds.current;
    const knownHearts = knownHeartKeys.current;
    if (known && knownHearts) {
      const fresh = list.filter((c) => !known.has(c.id) && c.from_user !== user.id);
      const freshHearts = list.filter((c) => c.from_user === user.id).flatMap((c) => c.hearts.filter((h) => countsAsHeart(h.user_id, user.id) && !knownHearts.has(`${c.id}:${h.user_id}`)).map((h) => ({ cheer: c, heart: h })));
      if (fresh.length) setIncomingCheer({ kind: "cheer", name: fresh[0].from_name, cheerKey: fresh[0].cheer_key });
      else if (freshHearts.length) setIncomingCheer({ kind: "heart", name: freshHearts[0].heart.name, cheerKey: freshHearts[0].cheer.cheer_key });
    }
    knownHeartKeys.current = new Set(list.flatMap((c) => c.hearts.map((h) => `${c.id}:${h.user_id}`)));
    knownCheerIds.current = new Set(list.map((c) => c.id));
    setCheers(list);
  }, [user?.id]);
  useEffect(() => {
    knownCheerIds.current = null;
    knownHeartKeys.current = null;
    if (!user) { setCheers([]); return; }
    const storageKey = `cheers_seen_${user.id}`;
    let seen = "";
    try { seen = localStorage.getItem(storageKey) ?? ""; } catch {}
    if (!seen) { seen = new Date().toISOString(); try { localStorage.setItem(storageKey, seen); } catch {} }
    setCheersSeenAt(seen);
    loadCheers();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") loadCheers(); }, 45000);
    const onVisible = () => { if (document.visibilityState === "visible") loadCheers(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [user?.id, loadCheers]);
  useEffect(() => { if (user && tab === "group") loadCheers(); }, [tab]);
  function markCheersSeen() {
    if (!user) return;
    const stamps = cheers.flatMap((c) => [c.created_at, ...c.hearts.map((h) => h.created_at)]);
    const latest = stamps.length ? stamps.reduce((max, v) => (v > max ? v : max), stamps[0]) : new Date().toISOString();
    setCheersSeenAt(latest);
    try { localStorage.setItem(`cheers_seen_${user.id}`, latest); } catch {}
  }
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [progressToast, setProgressToast] = useState("");
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const { current: streak, longest: longestStreak } = useMemo(() => calculateStreaks(logs, dateKey), [logs]);
  // Rudiments this student actually logs most often float to the top of the picker instead of
  // making them scroll a long alphabetical-ish list every time -- "remembered" from their own
  // saved history rather than a separate counter that could drift out of sync.
  const sortedRudiments = useMemo(() => {
    const counts: Record<string, number> = {};
    Object.values(logs).forEach((log) => { (log.customItems ?? []).forEach((ci) => { counts[ci] = (counts[ci] ?? 0) + 1; }); });
    return [...PRACTICE_EXERCISES.filter((e) => e.category === "rudiments")].sort((a, b) => (counts[b.en] ?? 0) - (counts[a.en] ?? 0));
  }, [logs]);
  // Same idea as sortedRudiments, but for Skill Trainer's "exercises" category (Push Pull, Heel
  // Down/Up, RLKK-style patterns, etc.) -- these had no way to be tagged from Quick Practice at
  // all before, only reachable by drilling into Skill Trainer itself.
  const sortedExercises = useMemo(() => {
    const counts: Record<string, number> = {};
    Object.values(logs).forEach((log) => { (log.customItems ?? []).forEach((ci) => { counts[ci] = (counts[ci] ?? 0) + 1; }); });
    return [...PRACTICE_EXERCISES.filter((e) => e.category === "exercises")].sort((a, b) => (counts[b.en] ?? 0) - (counts[a.en] ?? 0));
  }, [logs]);
  const daysThisYear = useMemo(() => Object.keys(logs).filter((key) => key.startsWith(dateKey.slice(0, 4)) && logs[key].minutes > 0).length, [logs]);
  const [profileName, setProfileName] = useState("");
  const displayName = profileName || user?.user_metadata?.display_name || String(user?.user_metadata?.full_name ?? "").trim().split(/\s+/)[0] || user?.email?.split("@")[0] || "Drummer";
  const [language, setLanguage] = useState<Lang>("en");
  const [dailyGoal, setDailyGoal] = useState<number | null>(null);
  const [metronomeTone, setMetronomeTone] = useState("wood");
  // Picked right inside the metronome; saved straight away.
  async function changeMetronomeTone(key: string) {
    setMetronomeTone(key);
    if (user) failed(await supabase.from("settings").upsert({ user_id: user.id, metronome_tone: key }, { onConflict: "user_id" }));
  }
  const [showDaysThisYear, setShowDaysThisYear] = useState(true);
  // A self-service preference (set during onboarding, editable any time in Settings) that hides
  // advanced rudiments/exercises from Skill Trainer -- the admin can also set a default for a
  // student via admin_set_kid_mode, but it's not an enforced restriction: the student can always
  // change it back themselves.
  const [kidMode, setKidMode] = useState(false);
  // Age category (asked once in onboarding; stays empty for accounts that never answered) and the practice difficulty that picks the
  // rhythmic arrangement in the Skill Trainer. Difficulty starts from the age but is independent of it and can always be changed.
  const [userDataReady, setUserDataReady] = useState(false);
  const [wonPopup, setWonPopup] = useState<any[]>([]);
  const [ageGroup, setAgeGroup] = useState<AgeBand | null>(null); // the server-computed age band; null until a date of birth has been given
  const [practiceDifficulty, setPracticeDifficulty] = useState<Difficulty>("standard");
  // Admin-only (see admin_set_points_enabled), and actually enforced -- whether this student is
  // opted into the teacher-run point game and its ranking, on Home. The database now rejects a
  // direct client write to this column; only the admin_set_points_enabled RPC can change it.
  const [pointsEnabled, setPointsEnabled] = useState(false);
  // Drum Points: players up to 16 can switch them on themselves (the server decides who may). Adults never see any of it.
  const [drumState, setDrumState] = useState<{ eligible: boolean; enabled: boolean; prompted: boolean } | null>(null);
  const [showPointsAsk, setShowPointsAsk] = useState(false);
  const [pointsGain, setPointsGain] = useState<PointsGain | null>(null);
  const T = translations[language];
  setUnlockMinutesForAge(ageGroup);
  const [skillTab, setSkillTab] = useState<"rudiments" | "exercises">("rudiments");
  const [practiceStep, setPracticeStep] = useState<"home" | "quick" | "skill" | "challenges" | "skillList" | "detail" | "session" | "rate">("home");
  const [practiceCategory, setPracticeCategory] = useState<string | null>(null);
  // Which of the Rudiments list's three tier cards (Foundation/Intermediate/Complex) is open --
  // separate from practiceCategory since it's only meaningful when category is "rudiments".
  const [practiceRudimentTier, setPracticeRudimentTier] = useState<string | null>(null);
  // Same idea for the Exercises list's three group cards (Hand Techniques/Footwork/Coordination).
  const [practiceExerciseGroup, setPracticeExerciseGroup] = useState<string | null>(null);
  const [practiceExercise, setPracticeExercise] = useState<string | null>(null);
  // Bumped to force AdminPage to remount (dropping back to its user list) when the admin nav
  // icon is tapped again while already inside a specific student's detail page.
  const [adminResetKey, setAdminResetKey] = useState(0);
  function openExerciseDetail(itemEn: string) {
    const match = PRACTICE_EXERCISES.find((e) => e.en === itemEn);
    setPracticeCategory(match?.category ?? null);
    setPracticeRudimentTier(match?.tier ?? null);
    setPracticeExerciseGroup(match?.exerciseGroup ?? null);
    setPracticeExercise(itemEn);
    setPracticeStep("detail");
    setTab("practice");
    window.scrollTo(0, 0);
  }
  const [practiceBpm, setPracticeBpm] = useState(100);
  const [pendingSessionMinutes, setPendingSessionMinutes] = useState(0);
  const [practiceSessions, setPracticeSessions] = useState<{ item_en: string; bpm: number; rating: string; duration_minutes: number; practiced_on: string; issues: string[]; notes: string | null; created_at: string }[]>([]);
  const [pinnedExercises, setPinnedExercises] = useState<string[]>([]);
  // After "Start" on the Session Timer: where the player wants to go. The timer keeps running (its bar stays at the top of every screen).
  function handleFocusChoice(choice: "rudiments" | "exercises" | "metronome" | "free" | { exercise: string }) {
    if (choice === "free") return;
    if (choice === "metronome") { setMetronome(true); return; }
    if (typeof choice === "object") { openExerciseDetail(choice.exercise); window.scrollTo(0, 0); return; }
    setSkillTab(choice); setPracticeStep("skill"); setTab("practice"); window.scrollTo(0, 0);
  }
  const [userItems, setUserItems] = useState<string[]>([]);
  const [userBooks, setUserBooks] = useState<string[]>([]);
  const [showPinManager, setShowPinManager] = useState(false);
  const [showPointsDetail, setShowPointsDetail] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  // Remembered on this device so the menu never flickers between 4 and 5 items while the check runs.
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => { try { if (localStorage.getItem("is_admin_cache") === "1") setIsAdmin(true); } catch {} }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setUser(data.session?.user ?? null); setLoading(false); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (_event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
    });
    return () => listener.subscription.unsubscribe();
  }, []);
  // A congratulations pop-up the first time a personal challenge (your own, or one from your teacher) is completed. The ids already shown are
  // remembered on this device; the first time ever, challenges that were already won are marked as seen without a pop-up.
  useEffect(() => {
    if (!user || !userDataReady) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("personal_challenges").select("id,exercise_en,target_minutes,target_bpm,length_days,start_date,assigned_by").eq("user_id", user.id);
      const list = data ?? [];
      if (!list.length || cancelled) return;
      const earliestStart = list.reduce((min: string, c: any) => (c.start_date < min ? c.start_date : min), list[0].start_date);
      const logsCache = await fetchChallengeLogsCache(user.id, earliestStart);
      const completed = list.filter((c: any) => evaluateChallenge(c, practiceSessions, logsCache).status === "completed");
      const key = `won_seen_${user.id}`;
      let seen: string[] | null = null;
      try { const raw = localStorage.getItem(key); seen = raw ? JSON.parse(raw) : null; } catch { seen = null; }
      if (seen === null) { try { localStorage.setItem(key, JSON.stringify(completed.map((c: any) => c.id))); } catch { /* ignore */ } return; }
      const fresh = completed.filter((c: any) => !seen!.includes(c.id));
      if (!fresh.length || cancelled) return;
      try { localStorage.setItem(key, JSON.stringify([...seen, ...fresh.map((c: any) => c.id)])); } catch { /* ignore */ }
      setWonPopup((current) => [...current, ...fresh.filter((f: any) => !current.some((x) => x.id === f.id))]);
    })();
    return () => { cancelled = true; };
  }, [user?.id, userDataReady, practiceSessions, logs]); // eslint-disable-line react-hooks/exhaustive-deps
  // Cheer notifications (phone apps only): keep this phone registered if the person turned them on, and open the Group tab when one is tapped.
  useEffect(() => {
    if (!user || !userDataReady) return;
    refreshPush(supabase, user.id).catch(() => {});
  }, [user?.id, userDataReady]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let remove: (() => void) | null = null;
    let cancelled = false;
    listenForPushTaps(() => { setTab("group"); window.scrollTo(0, 0); }).then((r) => { if (cancelled) r(); else remove = r; }).catch(() => {});
    return () => { cancelled = true; remove?.(); };
  }, []);
  async function loadUserData(currentUser: any, hydrateToday = true, isRetry = false) {
    const fallbackName = (currentUser.user_metadata?.display_name?.trim() || String(currentUser.user_metadata?.full_name ?? "").trim().split(/\s+/)[0] || currentUser.email?.split("@")[0] || "Drummer");
    // is_admin() is security definer and checks the caller's own admin_users row
    // server-side -- this can't be spoofed by the client either way. Kept out of the
    // retry group below since worst case it just self-corrects on the next successful load.
    // A failed or empty check (e.g. a network hiccup during a tab switch) must not hide the Admin tab.
    supabase.rpc("is_admin").then(({ data, error }) => {
      if (error || typeof data !== "boolean") return;
      setIsAdmin(data);
      try { localStorage.setItem("is_admin_cache", data ? "1" : "0"); } catch {}
    });
    const [profileRes, settingsRes, logsRes, sessionsRes, pinnedRes, itemsRes] = await Promise.all([
      supabase.from("profiles").select("name").eq("id", currentUser.id).maybeSingle(),
      supabase.from("settings").select("language, daily_goal_minutes, metronome_tone, show_days_this_year, onboarded, kid_mode, points_enabled").eq("user_id", currentUser.id).maybeSingle(),
      supabase.from("practice_logs").select("practiced_on,minutes,seconds,notes,equipment,drumset_minutes,pad_minutes,custom_items,practice_log_items(practice_items(name_en))").eq("user_id", currentUser.id),
      supabase.from("practice_sessions").select("bpm,rating,duration_minutes,practiced_on,issues,notes,created_at,practice_exercises(name_en)").eq("user_id", currentUser.id).order("created_at"),
      supabase.from("pinned_exercises").select("exercise_en").eq("user_id", currentUser.id).order("sort_order"),
      supabase.from("user_practice_items").select("kind,name").eq("user_id", currentUser.id).order("created_at"),
    ]);
    // A transient failure here (e.g. the phone just woke up and the network/auth session hasn't
    // caught up yet) used to fall straight through to `data ?? []`/`?? {}`, silently wiping the
    // whole app back to a "brand new account" look -- including re-opening onboarding, since a
    // failed settings fetch reads as "not onboarded" -- until the user manually refreshed. One
    // short retry covers that common case; if it fails twice in a row, bail out and leave
    // whatever was already on screen rather than blanking it out.
    if ([profileRes, settingsRes, logsRes, sessionsRes, pinnedRes, itemsRes].some((r) => r.error)) {
      if (!isRetry) setTimeout(() => loadUserData(currentUser, hydrateToday, true), 1500);
      return;
    }
    if (profileRes.data?.name) { setProfileName(profileRes.data.name); }
    else {
      setProfileName(fallbackName);
      // Only ever FILL IN a missing name: a fetch that comes back empty (e.g. a phone waking up with
      // a stale login) lands here too, and a plain upsert used to overwrite the real saved name
      // with the email prefix. No row at all -> create it without touching an existing one;
      // a row with an empty name -> fill just the name.
      if (!profileRes.data) supabase.from("profiles").upsert({ id: currentUser.id, name: fallbackName }, { onConflict: "id", ignoreDuplicates: true }).then();
      else supabase.from("profiles").update({ name: fallbackName }).eq("id", currentUser.id).then();
    }
    const settingsData = settingsRes.data;
    if (settingsData?.language === "es" || settingsData?.language === "en" || settingsData?.language === "nl") setLanguage(settingsData.language);
    if (settingsData?.daily_goal_minutes != null) setDailyGoal(settingsData.daily_goal_minutes);
    if (settingsData?.metronome_tone) setMetronomeTone(settingsData.metronome_tone);
    if (settingsData?.show_days_this_year != null) setShowDaysThisYear(settingsData.show_days_this_year);
    setKidMode(!!settingsData?.kid_mode);
    // Drum Points: the server says whether this player may use them (up to 16) and whether they switched them on.
    // If the database does not know the new function yet, the old admin switch is used as before.
    setPointsEnabled(false);
    supabase.rpc("drum_points_state").then(({ data, error }: any) => {
      const st = Array.isArray(data) ? data[0] : data;
      if (error || !st) { setPointsEnabled(!!settingsData?.points_enabled); return; }
      setDrumState({ eligible: !!st.eligible, enabled: !!st.enabled, prompted: !!st.prompted });
      setPointsEnabled(!!st.eligible && !!st.enabled);
    });
    // Age band and difficulty are fetched on their own so an older database (without these yet) can never break the main settings load.
    // The band is worked out by the server from the date of birth each time, so it moves on by itself at a birthday.
    supabase.rpc("my_age_band").then(({ data, error }: any) => { if (!error) setAgeGroup(asAgeBand(data)); });
    supabase.from("settings").select("practice_difficulty").eq("user_id", currentUser.id).maybeSingle().then(({ data, error }: any) => {
      if (error || !data) return;
      setPracticeDifficulty(data.practice_difficulty === "beginner" || data.practice_difficulty === "developing" ? data.practice_difficulty : "standard");
    });
    // Only decide this on the initial load, not a background refetch (e.g. tab regaining focus) —
    // otherwise an in-progress onboarding flow could get yanked back open mid-flow.
    if (hydrateToday) setShowOnboarding(!settingsData?.onboarded);
    const nextLogs: Record<string, Log> = {};
    (logsRes.data ?? []).forEach((row: any) => { nextLogs[row.practiced_on] = { minutes: row.minutes, seconds: row.seconds ?? 0, notes: row.notes ?? "", equipment: row.equipment ?? null, drumsetMinutes: row.drumset_minutes ?? null, padMinutes: row.pad_minutes ?? null, customItems: row.custom_items ?? [], items: (row.practice_log_items ?? []).map((entry: any) => entry.practice_items?.name_en).filter(Boolean) }; });
    setLogs(nextLogs);
    // Only hydrate the in-progress Quick Practice form from today's saved log on first load —
    // a background refetch (e.g. after the tab regains focus) shouldn't clobber unsaved edits.
    const todayLog = nextLogs[dateKey];
    if (hydrateToday && todayLog) { setMinutes(String(todayLog.minutes)); setSeconds(String(todayLog.seconds)); setNotes(todayLog.notes); setEquipment(todayLog.equipment); setDrumsetMinutes(todayLog.drumsetMinutes != null ? String(todayLog.drumsetMinutes) : ""); setPadMinutes(todayLog.padMinutes != null ? String(todayLog.padMinutes) : ""); setCustomItems(todayLog.customItems); if (todayLog.items.length) setSelected(todayLog.items); }
    setPracticeSessions((sessionsRes.data ?? []).map((row: any) => ({ item_en: row.practice_exercises?.name_en, bpm: row.bpm, rating: row.rating, duration_minutes: row.duration_minutes ?? 0, practiced_on: row.practiced_on, issues: row.issues ?? [], notes: row.notes ?? null, created_at: row.created_at })).filter((s: any) => s.item_en));
    setPinnedExercises((pinnedRes.data ?? []).map((row: any) => row.exercise_en));
    setUserItems((itemsRes.data ?? []).filter((row: any) => row.kind === "item").map((row: any) => row.name));
    setUserBooks((itemsRes.data ?? []).filter((row: any) => row.kind === "book").map((row: any) => row.name));
    setUserDataReady(true);
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
  const didMountTabEffect = useRef(false);
  useEffect(() => {
    // Refetch settings (kid_mode, points_enabled, etc.) on every tab switch -- otherwise an
    // admin change made to your own account (e.g. toggling Mode on yourself while testing)
    // stays stale in this session until the browser tab loses and regains focus.
    if (!didMountTabEffect.current) { didMountTabEffect.current = true; return; }
    if (user) loadUserData(user, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);
  async function togglePin(itemEn: string) {
    if (!user) return;
    if (pinnedExercises.includes(itemEn)) {
      if (failed(await supabase.from("pinned_exercises").delete().eq("user_id", user.id).eq("exercise_en", itemEn))) return;
      setPinnedExercises((current) => current.filter((en) => en !== itemEn));
      return;
    }
    if (pinnedExercises.length >= MAX_PINNED_EXERCISES) { setAuthError(T.practiceMode.maxPinnedReached(MAX_PINNED_EXERCISES)); return; }
    const { error } = await supabase.from("pinned_exercises").insert({ user_id: user.id, exercise_en: itemEn, sort_order: pinnedExercises.length });
    if (error) { setAuthError(error.message); return; }
    setPinnedExercises((current) => [...current, itemEn]);
    setShowPinManager(true);
  }
  async function addUserPracticeItem(kind: "item" | "book", name: string) {
    if (!user) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const { error } = await supabase.from("user_practice_items").insert({ user_id: user.id, kind, name: trimmed });
    // A duplicate (already saved from another device/session) isn't a real error -- just adopt it locally.
    if (error && error.code !== "23505") { setAuthError(error.message); return; }
    if (kind === "item") setUserItems((current) => current.includes(trimmed) ? current : [...current, trimmed]);
    else setUserBooks((current) => current.includes(trimmed) ? current : [...current, trimmed]);
  }
  async function removeUserPracticeItem(kind: "item" | "book", name: string) {
    if (!user) return;
    failed(await supabase.from("user_practice_items").delete().eq("user_id", user.id).eq("kind", kind).eq("name", name));
    if (kind === "item") setUserItems((current) => current.filter((v) => v !== name));
    else setUserBooks((current) => current.filter((v) => v !== name));
    setCustomItems((current) => current.filter((v) => v !== name));
  }
  async function answerDrumPoints(on: boolean) {
    const { error } = await supabase.rpc("set_my_drum_points", { p_on: on });
    if (error) { setAuthError(error.message); return false; }
    setDrumState({ eligible: true, enabled: on, prompted: true });
    setPointsEnabled(on);
    setShowPointsAsk(false);
    return true;
  }
  // Players up to 16 who were not asked yet (accounts made before Drum Points existed) are asked once, after the setup screens.
  useEffect(() => { if (user && drumState?.eligible && !drumState.prompted && !showOnboarding) setShowPointsAsk(true); }, [user, drumState, showOnboarding]);
  async function chooseLanguage(next: Lang, save: boolean) {
    setLanguage(next);
    if (save && user) failed(await supabase.from("settings").upsert({ user_id: user.id, language: next }, { onConflict: "user_id" }));
  }
  async function fetchPointsSummary(): Promise<PointsSummary | null> {
    const { data, error } = await supabase.rpc("drum_points_summary", { p_period: "year" });
    const r: any = Array.isArray(data) ? data[0] : data;
    if (error || !r) return null;
    return { points: Number(r.points), pos: Number(r.pos), total: Number(r.total), above_name: r.above_name ?? null, above_gap: r.above_gap != null ? Number(r.above_gap) : null };
  }
  async function skipOnboarding() {
    if (!user) return;
    setShowOnboarding(false);
    failed(await supabase.from("settings").upsert({ user_id: user.id, onboarded: true }, { onConflict: "user_id" }));
  }
  async function finishOnboarding(selectedExercises: string[], goalMinutes: number | null, kidModeChoice: boolean, band: AgeBand | null) {
    if (!user) return;
    setShowOnboarding(false);
    if (selectedExercises.length) {
      const pinResults = await Promise.all(selectedExercises.map((en, i) => supabase.from("pinned_exercises").insert({ user_id: user.id, exercise_en: en, sort_order: i })));
      pinResults.forEach((res) => failed(res));
      setPinnedExercises((current) => [...current, ...selectedExercises]);
    }
    // goalMinutes is only null when skipping with no prior goal to fall back to -- leave
    // daily_goal_minutes untouched (still unset) rather than writing a fabricated number.
    const settingsRow: any = { user_id: user.id, onboarded: true, kid_mode: kidModeChoice };
    if (goalMinutes != null) settingsRow.daily_goal_minutes = goalMinutes;
    failed(await supabase.from("settings").upsert(settingsRow, { onConflict: "user_id" }));
    if (goalMinutes != null) setDailyGoal(goalMinutes);
    setKidMode(kidModeChoice);
    // The starting practice difficulty comes from the age band (the server worked it out); it can be changed any time in Settings.
    if (band) {
      const difficulty = AGE_CONFIG[band].difficulty;
      if (!failed(await supabase.from("settings").upsert({ user_id: user.id, practice_difficulty: difficulty }, { onConflict: "user_id" }))) setPracticeDifficulty(difficulty);
    }
  }
  async function unpinExercise(itemEn: string) {
    if (!user) return;
    if (failed(await supabase.from("pinned_exercises").delete().eq("user_id", user.id).eq("exercise_en", itemEn))) return;
    setPinnedExercises((current) => current.filter((en) => en !== itemEn));
  }
  async function movePin(itemEn: string, direction: -1 | 1) {
    if (!user) return;
    const index = pinnedExercises.indexOf(itemEn);
    const newIndex = index + direction;
    if (index < 0 || newIndex < 0 || newIndex >= pinnedExercises.length) return;
    const next = [...pinnedExercises];
    [next[index], next[newIndex]] = [next[newIndex], next[index]];
    setPinnedExercises(next);
    const results = await Promise.all(next.map((en, i) => supabase.from("pinned_exercises").update({ sort_order: i }).eq("user_id", user.id).eq("exercise_en", en)));
    results.forEach((res) => failed(res));
  }
  // Shows the database's message if a write was refused (instead of failing silently). Returns true when it failed.
  function failed(res: { error?: { message: string } | null } | null | undefined) { if (res?.error) { setAuthError(res.error.message); return true; } return false; }
  async function saveLogFor(targetDate: string, targetMinutes: number, targetItems: string[], targetNotes: string, targetEquipment: string | null, targetDrumsetMinutes?: number | null, targetPadMinutes?: number | null, targetSeconds?: number, targetCustomItems?: string[], targetUsedMetronome?: boolean) {
    if (!user) return false;
    // used_metronome is only ever included (and only ever true) when a metronome session
    // actually contributed to this save -- omitted otherwise so a later plain edit can't
    // clobber an earlier metronome session's flag back to false.
    // Look the tags up first: a tag the catalog doesn't know is kept as a custom item instead of being silently dropped.
    const { data: itemRows, error: itemsError } = await supabase.from("practice_items").select("id,name_en").in("name_en", targetItems);
    if (itemsError) { setAuthError(itemsError.message); return false; }
    const knownTags = new Set((itemRows ?? []).map((row) => row.name_en));
    const catalogTags = targetItems.filter((name) => knownTags.has(name));
    const customToSave = Array.from(new Set([...(targetCustomItems ?? []), ...targetItems.filter((name) => !knownTags.has(name))]));
    const { data: log, error } = await supabase.from("practice_logs").upsert({ user_id: user.id, practiced_on: targetDate, minutes: Math.min(1440, targetMinutes), seconds: targetSeconds ?? 0, notes: targetNotes, equipment: targetEquipment, drumset_minutes: targetDrumsetMinutes ?? null, pad_minutes: targetPadMinutes ?? null, custom_items: customToSave, ...(targetUsedMetronome ? { used_metronome: true } : {}) }, { onConflict: "user_id,practiced_on" }).select().single();
    if (error || !log) { setAuthError(error?.message ?? "Could not save your practice."); return false; }
    if (failed(await supabase.from("practice_log_items").delete().eq("log_id", log.id))) return false;
    if (itemRows?.length && failed(await supabase.from("practice_log_items").insert(itemRows.map((item) => ({ log_id: log.id, item_id: item.id }))))) return false;
    setLogs((current) => ({ ...current, [targetDate]: { minutes: targetMinutes, seconds: targetSeconds ?? 0, items: catalogTags, customItems: customToSave, notes: targetNotes, equipment: targetEquipment, drumsetMinutes: targetDrumsetMinutes ?? null, padMinutes: targetPadMinutes ?? null } }));
    return true;
  }
  async function deleteLogFor(targetDate: string) {
    if (!user) return false;
    const { error, count } = await supabase.from("practice_logs").delete({ count: "exact" }).eq("user_id", user.id).eq("practiced_on", targetDate);
    if (error || !count) { setAuthError(error?.message ?? T.calendar.couldNotDeleteEntry); return false; }
    setLogs((current) => { const next = { ...current }; delete next[targetDate]; return next; });
    return true;
  }
  async function logPracticeSession(itemEn: string, bpm: number, rating: string, durationMinutes: number, elapsedSeconds: number = durationMinutes * 60, issues: string[] = [], note = "") {
    if (!user) return false;
    const { data: exerciseRow } = await supabase.from("practice_exercises").select("id").eq("name_en", itemEn).maybeSingle();
    const pointsBefore = pointsEnabled ? await fetchPointsSummary() : null;
    const sessionRow: any = { user_id: user.id, practice_exercise_id: exerciseRow?.id ?? null, bpm, rating, duration_minutes: durationMinutes, practiced_on: dateKey, issues, notes: note || null, duration_seconds: Math.max(0, Math.round(elapsedSeconds)) };
    let { error } = await supabase.from("practice_sessions").insert(sessionRow);
    // A database that does not have the seconds column yet: save the session the old way, so practice is never lost.
    if (error && /duration_seconds/.test(error.message)) { delete sessionRow.duration_seconds; ({ error } = await supabase.from("practice_sessions").insert(sessionRow)); }
    if (error) { setAuthError(error.message); return false; }
    if (pointsBefore) fetchPointsSummary().then((after) => { if (after && after.points > pointsBefore.points) setPointsGain({ prev: pointsBefore, next: after, earned: after.points - pointsBefore.points }); });
    // Celebrate a genuine new personal-best rating at this exact exercise + BPM (not just "better
    // than last time", which could just mean re-reaching a level already hit before).
    const priorSessions = practiceSessions.filter((s) => s.item_en === itemEn && s.bpm === bpm);
    if (priorSessions.length > 0) {
      const newRank = RATING_RANK[rating] ?? 0;
      const priorBest = priorSessions.reduce((best, s) => (RATING_RANK[s.rating] ?? 0) > (RATING_RANK[best.rating] ?? 0) ? s : best, priorSessions[0]);
      if (newRank > (RATING_RANK[priorBest.rating] ?? 0)) {
        const ratingLabel: Record<string, string> = { not_ready: T.practiceMode.ratingNotReady, tense: T.practiceMode.ratingTense, almost: T.practiceMode.ratingAlmost, comfortable: T.practiceMode.ratingComfortable, mastered: T.practiceMode.ratingMastered };
        const earliestDate = priorSessions.reduce((min, s) => (s.practiced_on < min ? s.practiced_on : min), priorSessions[0].practiced_on);
        const days = Math.max(1, Math.round((new Date(dateKey + "T12:00:00").getTime() - new Date(earliestDate + "T12:00:00").getTime()) / 86400000));
        const exerciseLabel = PRACTICE_EXERCISES.find((e) => e.en === itemEn)?.[language] ?? itemEn;
        setProgressToast(T.practiceMode.improvedToast(ratingLabel[priorBest.rating] ?? priorBest.rating, ratingLabel[rating] ?? rating, exerciseLabel, bpm, days));
      }
    }
    // Merge the exact elapsed time into today's practice_logs total using the same floor/modulo
    // carry as the standalone Metronome's "add time" flow, instead of adding the rounded
    // duration_minutes value -- summing rounded minutes across repeated sessions compounds error
    // (two 3:30 sessions would round to 4+4=8 instead of the correct 7:00).
    const totalSeconds = (Number(minutes) || 0) * 60 + (Number(seconds) || 0) + elapsedSeconds;
    const newMinutes = Math.floor(totalSeconds / 60);
    const newSeconds = totalSeconds % 60;
    setMinutes(String(newMinutes));
    setSeconds(String(newSeconds));
    addTimerCredit(elapsedSeconds, false, itemEn);
    // Quick Practice's own "what did you practice" tags stay independent of Skill Trainer --
    // finishing a rudiment/exercise session here no longer auto-checks it in that picker, since
    // the two are meant to be separate logs of what was actually intentionally tagged.
    const isSplit = equipment === "both";
    await saveLogFor(dateKey, newMinutes, selected, notes, equipment, isSplit ? (Number(drumsetMinutes) || 0) : null, isSplit ? (Number(padMinutes) || 0) : null, newSeconds, customItems);
    setPracticeSessions((current) => [...current, { item_en: itemEn, bpm, rating, duration_minutes: durationMinutes, practiced_on: dateKey, issues, notes: note || null, created_at: new Date().toISOString() }]);
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
  async function editSessionDetails(itemEn: string, bpm: number, newRating: string, issues: string[], note: string) {
    if (!user) return false;
    const { data: exerciseRow } = await supabase.from("practice_exercises").select("id").eq("name_en", itemEn).maybeSingle();
    if (!exerciseRow) return false;
    // Applies to every session logged at this level rather than just the latest one, since the app
    // only ever displays a single aggregate rating/note per level — keeping every row in sync avoids
    // a correction silently getting overridden by an older, stale value.
    const { error } = await supabase.from("practice_sessions").update({ rating: newRating, issues, notes: note || null }).eq("user_id", user.id).eq("practice_exercise_id", exerciseRow.id).eq("bpm", bpm);
    if (error) { setAuthError(error.message); return false; }
    setPracticeSessions((current) => current.map((s) => (s.item_en === itemEn && s.bpm === bpm) ? { ...s, rating: newRating, issues, notes: note || null } : s));
    return true;
  }
  async function resetPractice() {
    if (logs[dateKey]) await deleteLogFor(dateKey);
    setMinutes("0");
    setQuickAddMinutes("0");
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
    // Quick Practice always ADDS its entered amount onto whatever's already logged today
    // (e.g. from Skill Trainer sessions) instead of overwriting the day's total outright.
    const newTotal = (Number(minutes) || 0) + (Number(quickAddMinutes) || 0);
    const ok = await saveLogFor(dateKey, newTotal, selected, notes, equipment, isSplit ? (Number(drumsetMinutes) || 0) : null, isSplit ? (Number(padMinutes) || 0) : null, Number(seconds) || 0, customItems);
    if (ok) { setMinutes(String(newTotal)); setQuickAddMinutes("0"); setSaved(true); setTimeout(() => setSaved(false), 2200); }
  }
  function toggle(item: string) { setSelected((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item]); }
  // markMetronome=false is for the Session Timer, which shares this save path but isn't a
  // metronome session -- keeps the admin's "Metronome" badge for days that actually used one.
  async function addMetronomePractice(addedSeconds: number, items: string[], addCustomItems: string[], markMetronome = true) {
    const totalSeconds = (Number(minutes) || 0) * 60 + (Number(seconds) || 0) + addedSeconds;
    const newMinutes = Math.floor(totalSeconds / 60);
    const newSeconds = totalSeconds % 60;
    const newSelected = items.length ? Array.from(new Set([...selected, ...items])) : selected;
    const newCustomItems = addCustomItems.length ? Array.from(new Set([...customItems, ...addCustomItems])) : customItems;
    setMinutes(String(newMinutes));
    setSeconds(String(newSeconds));
    setSelected(newSelected);
    setCustomItems(newCustomItems);
    const isSplit = equipment === "both";
    await saveLogFor(dateKey, newMinutes, newSelected, notes, equipment, isSplit ? (Number(drumsetMinutes) || 0) : null, isSplit ? (Number(padMinutes) || 0) : null, newSeconds, newCustomItems, markMetronome);
  }
  async function signOut() { try { await removeToken(supabase); } catch { /* keep going */ } await supabase.auth.signOut(); }
  if (passwordRecovery) return <ResetPassword onDone={() => setPasswordRecovery(false)} />;
  if (loading) return <main className="shell"><div className="auth-shell"><p className="eyebrow">DRUMSKILLS</p><h1>LOADING<span>.</span></h1></div></main>;
  if (!user) return <Login error={authError} setError={setAuthError} />;
  const hasUnreadCheers = cheerUnreadCount(cheers, user.id, cheersSeenAt) > 0;
  const visibleTabs = isAdmin ? [...NAV_TABS, "admin" as Tab] : NAV_TABS;
  return <main className={timerBanner && metroBanner ? "shell has-timer-banner has-two-banners" : timerBanner || metroBanner ? "shell has-timer-banner" : "shell"}>
    {tab === "today" && <Today onGoToProgress={() => { setTab("progress"); window.scrollTo(0, 0); }} streak={streak} longestStreak={longestStreak} daysThisYear={daysThisYear} showDaysThisYear={showDaysThisYear} pinnedExercises={pinnedExercises} practiceSessions={practiceSessions} user={user} pointsEnabled={pointsEnabled} dailyGoal={dailyGoal} logs={logs} saveLogFor={saveLogFor} deleteLogFor={deleteLogFor} confirm={askConfirm} openSettings={() => setTab("settings")} onGoToPractice={() => { setPracticeStep("home"); setTab("practice"); window.scrollTo(0, 0); }} onGoToRudiments={() => { setSkillTab("rudiments"); setPracticeStep("skill"); setTab("practice"); window.scrollTo(0, 0); }} onOpenExercise={openExerciseDetail} onManagePins={() => setShowPinManager(true)} onViewPoints={() => setShowPointsDetail(true)} onOpenSessionTimer={() => setSessionTimer(true)} onOpenMetronome={() => setMetronome(true)} displayName={displayName} language={language} T={T} />}
    {tab === "practice" && <PracticeMode onMetronomeToneChange={changeMetronomeTone} skillTab={skillTab} setSkillTab={setSkillTab} step={practiceStep} setStep={setPracticeStep} category={practiceCategory} setCategory={setPracticeCategory} rudimentTier={practiceRudimentTier} setRudimentTier={setPracticeRudimentTier} exerciseGroup={practiceExerciseGroup} setExerciseGroup={setPracticeExerciseGroup} exercise={practiceExercise} setExercise={setPracticeExercise} bpm={practiceBpm} setBpm={setPracticeBpm} pendingMinutes={pendingSessionMinutes} setPendingMinutes={setPendingSessionMinutes} sessions={practiceSessions} onLogSession={logPracticeSession} onResetLevel={resetPracticeLevel} onEditRating={editSessionDetails} pinnedExercises={pinnedExercises} onTogglePin={togglePin} userItems={userItems} userBooks={userBooks} onAddUserItem={addUserPracticeItem} onRemoveUserItem={removeUserPracticeItem} sortedRudiments={sortedRudiments} sortedExercises={sortedExercises} kidMode={kidMode} minutes={minutes} setMinutes={setMinutes} quickAddMinutes={quickAddMinutes} setQuickAddMinutes={setQuickAddMinutes} seconds={seconds} selected={selected} toggle={toggle} customItems={customItems} setCustomItems={setCustomItems} notes={notes} setNotes={setNotes} equipment={equipment} setEquipment={setEquipment} drumsetMinutes={drumsetMinutes} setDrumsetMinutes={setDrumsetMinutes} padMinutes={padMinutes} setPadMinutes={setPadMinutes} save={save} onReset={resetPractice} saved={saved} dailyGoal={dailyGoal} logs={logs} confirm={askConfirm} openMetronome={() => setMetronome(true)} openSessionTimer={() => setSessionTimer(true)} metronomeTone={metronomeTone} user={user} setError={setAuthError} language={language} practiceDifficulty={practiceDifficulty} T={T} />}
    {tab === "group" && <Group onGroupCount={setGroupCount} user={user} setError={setAuthError} logs={logs} dailyGoal={dailyGoal} saveLogFor={saveLogFor} deleteLogFor={deleteLogFor} confirm={askConfirm} language={language} T={T} cheers={cheers} cheersSeenAt={cheersSeenAt} onCheersSeen={markCheersSeen} onCheersChanged={loadCheers} groupPickerKey={groupPickerKey} />}
    {tab === "progress" && <Progress onOpenExercise={openExerciseDetail} onOpenSettings={() => { setTab("settings"); window.scrollTo(0, 0); }} practiceSessions={practiceSessions} logs={logs} user={user} language={language} kidMode={kidMode} T={T} />}
    {tab === "settings" && <Settings signOut={async () => { if (await askConfirm(T.settings.confirmLogout)) signOut(); }} user={user} setError={setAuthError} profileName={displayName} onProfileNameSaved={setProfileName} language={language} onLanguageSaved={setLanguage} dailyGoal={dailyGoal} onGoalSaved={setDailyGoal} metronomeTone={metronomeTone} onMetronomeToneSaved={setMetronomeTone} showDaysThisYear={showDaysThisYear} onShowDaysThisYearSaved={setShowDaysThisYear} kidMode={kidMode} onKidModeSaved={setKidMode} drumState={drumState} onDrumPoints={answerDrumPoints} ageBand={ageGroup} practiceDifficulty={practiceDifficulty} onAgeBandSaved={setAgeGroup} onDifficultySaved={setPracticeDifficulty} onBack={() => setTab("today")} T={T} />}
    {tab === "admin" && isAdmin && <AdminPage key={adminResetKey} user={user} language={language} T={T} />}
    {incomingCheer && <button type="button" className="cheer-incoming" onClick={() => { setTab("group"); setIncomingCheer(null); }}>
      <strong>{incomingCheer.kind === "heart" ? T.cheers.heartedYours(incomingCheer.name) : T.cheers.incoming(incomingCheer.name)}</strong>
      <span>{cheerText(incomingCheer.cheerKey, language)}</span>
    </button>}
    {authError && <button className="error-toast" onClick={() => setAuthError("")}>{authError} ×</button>}
    {progressToast && <div className="modal modal-center" onClick={() => setProgressToast("")}>
      <div className="confirm-card progress-card" onClick={(e) => e.stopPropagation()}>
        <div className="progress-emoji">🎉</div>
        <p className="progress-message">{progressToast}</p>
        <button className="save" onClick={() => setProgressToast("")}>{T.practiceMode.niceBtn}</button>
      </div>
    </div>}
    <nav className="bottom-nav">{visibleTabs.map((id) => <button key={id} className={tab === id ? "active" : ""} onClick={() => { if (id === "admin" && tab === "admin") setAdminResetKey((k) => k + 1); if (id === "group" && tab === "group") setGroupPickerKey((k) => k + 1); setTab(id); if (id === "practice") setPracticeStep("home"); }}><span>{NAV_ICONS[id]}{id === "group" && hasUnreadCheers && tab !== "group" && <i className="nav-dot" />}</span><em className="nav-label">{T.nav[id]}{id === "group" && tab === "group" && groupCount > 1 && <svg className="nav-switch-hint" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6" /></svg>}</em></button>)}</nav>
    <Metronome open={metronome} close={() => setMetronome(false)} onOpen={() => setMetronome(true)} onBannerChange={setMetroBanner} stacked={timerBanner} onAddPractice={addMetronomePractice} sharedTimer={timerRun} onUsedDuringTimer={() => addTimerCredit(0, true)} tone={metronomeTone} onToneChange={changeMetronomeTone} userItems={userItems} userBooks={userBooks} onAddUserItem={addUserPracticeItem} onRemoveUserItem={removeUserPracticeItem} sortedRudiments={sortedRudiments} sortedExercises={sortedExercises} language={language} T={T} />
    <SessionTimer pinnedExercises={pinnedExercises} onFocusChoice={handleFocusChoice} open={sessionTimer} close={() => setSessionTimer(false)} onOpen={() => setSessionTimer(true)} onBannerChange={setTimerBanner} onRunChange={setTimerRun} timerCredit={timerCredit} onCreditReset={() => saveTimerCredit(null)} onAddPractice={(seconds, items, customItems, usedMetronome) => addMetronomePractice(seconds, items, customItems, usedMetronome)} userItems={userItems} userBooks={userBooks} onAddUserItem={addUserPracticeItem} onRemoveUserItem={removeUserPracticeItem} sortedRudiments={sortedRudiments} sortedExercises={sortedExercises} language={language} T={T} />
    {confirmState && <ConfirmModal message={confirmState.message} onConfirm={() => { confirmState.resolve(true); setConfirmState(null); }} onCancel={() => { confirmState.resolve(false); setConfirmState(null); }} T={T} />}
    {showPinManager && <PinManagerModal pinnedExercises={pinnedExercises} onMove={movePin} onUnpin={unpinExercise} onTogglePin={togglePin} onClose={() => setShowPinManager(false)} language={language} T={T} />}
    {showPointsDetail && <PointsDetailModal user={user} onClose={() => setShowPointsDetail(false)} T={T} />}
    {wonPopup.length > 0 && !showOnboarding && (() => {
      const c = wonPopup[0];
      const P = T.personalChallenges;
      const name = challengeExerciseLabel(c.exercise_en, language);
      return <div className="modal modal-center" onClick={() => setWonPopup((current) => current.slice(1))}><div className="day-summary won-popup" role="dialog" aria-label={P.wonPopupTitle} onClick={(e) => e.stopPropagation()}>
        <span className="won-popup-trophy" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M7 4h10v5a5 5 0 01-10 0V4z" /><path d="M7 6H4v2a3 3 0 003 3M17 6h3v2a3 3 0 01-3 3" /><path d="M12 14v4M8.5 20h7" /></svg></span>
        <h2 className="won-popup-title">{P.wonPopupTitle}</h2>
        <p className="won-popup-text">{c.assigned_by ? P.wonPopupTeacher(name) : P.wonPopupOwn(name)}</p>
        <p className="won-popup-meta">{P.wonMeta(c.target_minutes, c.length_days, c.target_bpm)}</p>
        <p className="won-popup-saved">{P.wonPopupSaved}</p>
        <button className="save" onClick={() => { setWonPopup((current) => current.slice(1)); setTab("progress"); window.scrollTo(0, 0); }}>{P.wonPopupSee}</button>
        <button className="auth-switch" onClick={() => setWonPopup((current) => current.slice(1))}>{P.wonPopupClose}</button>
      </div></div>;
    })()}
    {showOnboarding && <OnboardingModal currentGoal={dailyGoal} onSkip={skipOnboarding} onFinish={finishOnboarding} onBand={setAgeGroup} onLanguage={chooseLanguage} onPointsAnswer={answerDrumPoints} language={language} T={T} />}
    {showPointsAsk && !showOnboarding && <PointsAskModal onAnswer={answerDrumPoints} T={T} />}
    {pointsGain && <PointsGainModal gain={pointsGain} onClose={() => setPointsGain(null)} T={T} />}
  </main>;
}
function PinManagerModal({ pinnedExercises, onMove, onUnpin, onTogglePin, onClose, language, T }: { pinnedExercises: string[]; onMove: (itemEn: string, direction: -1 | 1) => void; onUnpin: (itemEn: string) => void; onTogglePin: (itemEn: string) => void; onClose: () => void; language: Lang; T: any }) {
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");
  const canAddMore = pinnedExercises.length < MAX_PINNED_EXERCISES;
  const availableExercises = PRACTICE_EXERCISES.filter((e) => (e.category === "rudiments" || e.category === "exercises") && !pinnedExercises.includes(e.en) && (!search.trim() || e[language as Lang].toLowerCase().includes(search.trim().toLowerCase())));
  return <div className="modal modal-center" onClick={onClose}><div className="day-summary day-editor-modal" onClick={(e) => e.stopPropagation()}>
    <div className="ds-head">
      <span className="eyebrow">{T.practiceMode.pinManagerTitle}</span>
      <button className="close" onClick={onClose}>×</button>
    </div>
    <div className="day-summary-body">
      <p className="pin-manager-count">{T.practiceMode.pinManagerEyebrow(pinnedExercises.length, MAX_PINNED_EXERCISES)}</p>
      {pinnedExercises.length > 0 ? <div className="pin-manager-list">
        {pinnedExercises.map((en, i) => {
          const label = PRACTICE_EXERCISES.find((e) => e.en === en)?.[language as Lang] ?? en;
          return <div key={en} className="pin-manager-row">
            <span className="pin-manager-name">{label}</span>
            <div className="pin-manager-actions">
              <button disabled={i === 0} onClick={() => onMove(en, -1)}>↑</button>
              <button disabled={i === pinnedExercises.length - 1} onClick={() => onMove(en, 1)}>↓</button>
              <button className="pin-manager-remove" onClick={() => onUnpin(en)}>✕</button>
            </div>
          </div>;
        })}
      </div> : <p className="pin-manager-hint">{T.practiceMode.pinManagerEmpty}</p>}
      {canAddMore && (addOpen ? <>
        <input className="rudiment-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={T.practiceMode.pinManagerSearchPlaceholder} autoFocus />
        <div className="onboard-exercise-list rudiment-list">
          {availableExercises.map((e) => <button key={e.en} type="button" className="onboard-row" onClick={() => { onTogglePin(e.en); setSearch(""); }}>
            <span className="onboard-row-name">{e[language as Lang]}</span>
          </button>)}
        </div>
      </> : <button type="button" className="notes-toggle" onClick={() => setAddOpen(true)}>{T.practiceMode.pinManagerAddBtn}</button>)}
    </div>
  </div></div>;
}

const POINTS_DETAIL_HISTORY_LIMIT = 5;
// Asked once of players up to 16 who have not answered yet (new accounts answer it during the setup screens instead).
function PointsAskModal({ onAnswer, T }: { onAnswer: (on: boolean) => Promise<boolean>; T: any }) {
  const [busy, setBusy] = useState(false);
  async function answer(on: boolean) { setBusy(true); await onAnswer(on); setBusy(false); }
  return <div className="modal modal-center"><div className="day-summary points-ask">
    <h2 className="edit-rating-title">{T.drumPoints.askTitle}</h2>
    <p className="points-ask-text">{T.drumPoints.askText}</p>
    <button className="save" disabled={busy} onClick={() => answer(true)}>{T.drumPoints.askYes}</button>
    <button className="auth-switch" disabled={busy} onClick={() => answer(false)}>{T.drumPoints.askNo}</button>
  </div></div>;
}
// Shown right after a tempo is rated. Step 1: the points just earned counting up. Step 2: the ranking, with the new points added
// to the player's own row and the row sliding up past the drummers they overtook (or what is needed to pass the next one).
function PointsGainModal({ gain, onClose, T }: { gain: PointsGain; onClose: () => void; T: any }) {
  const PITCH = 58;
  const [step, setStep] = useState<1 | 2>(1);
  const [shown, setShown] = useState(0);
  const [board, setBoard] = useState<{ pos: number; display_name: string; points: number; is_me: boolean }[] | null>(null);
  const [settled, setSettled] = useState(false);
  const [meShown, setMeShown] = useState(gain.prev.points);
  const [week, setWeek] = useState<{ points: number; pos: number } | null>(null);
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => { const t = Math.min(1, (now - start) / 900); setShown(Math.round(gain.earned * t)); if (t < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    playPointsChime();
    // This week's standing (older databases do not know "week" yet: then nothing about the week is shown).
    supabase.rpc("drum_points_summary", { p_period: "week" }).then(({ data, error }: any) => { const r = Array.isArray(data) ? data[0] : data; if (!error && r) setWeek({ points: Number(r.points), pos: Number(r.pos) }); });
    supabase.rpc("drum_points_board", { p_period: "year", p_limit: 12 }).then(({ data }: any) => setBoard(Array.isArray(data) ? data : []));
    return () => cancelAnimationFrame(raf);
  }, [gain]);
  // Step 2 (the ranking) opens when "Nice!" is tapped, even when the player is alone on the board. Only if the ranking could not be loaded does it just close.
  const hasBoard = board !== null && board.some((r) => r.is_me);
  useEffect(() => {
    if (step !== 2) return;
    const slide = window.setTimeout(() => setSettled(true), 700);
    const close = window.setTimeout(onClose, 20000);
    return () => { window.clearTimeout(slide); window.clearTimeout(close); };
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!settled) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => { const t = Math.min(1, (now - start) / 900); setMeShown(Math.round(gain.prev.points + (gain.next.points - gain.prev.points) * t)); if (t < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [settled, gain]);

  // Before / after order of the list. The others' points did not change; mine went from prev to next.
  type Row = { key: string; name: string; me: boolean; pts: number };
  const after: Row[] = (board ?? []).map((r) => ({ key: `${r.display_name}|${r.is_me ? 1 : 0}`, name: r.is_me ? T.group.you : r.display_name, me: r.is_me, pts: Number(r.points) }));
  const before: Row[] = after.map((r) => (r.me ? { ...r, pts: gain.prev.points } : r)).map((r, i) => ({ r, i })).sort((a, b) => b.r.pts - a.r.pts || (a.r.me ? 1 : 0) - (b.r.me ? 1 : 0) || a.i - b.i).map((x) => x.r);
  const idxIn = (list: Row[], key: string) => list.findIndex((r) => r.key === key);
  const meKey = after.find((r) => r.me)?.key ?? "";
  const a = idxIn(after, meKey), b = idxIn(before, meKey);
  const n = after.length;
  let lo = b > a ? Math.max(0, a - 1) : Math.max(0, a - 2);
  let hi = b > a ? Math.min(n, b + 2) : Math.min(n, a + 3);
  if (hi - lo > 7) hi = lo + 7;
  const rankOf = (list: Row[], r: Row) => 1 + list.filter((x) => x.pts > r.pts).length;
  const climbed = gain.next.pos < gain.prev.pos && !!gain.prev.above_name;
  const weekFirst = !!week && week.pos === 1 && week.points > 0;
  // Everyone who was above me before and is below me now (more than one when several drummers were overtaken at once).
  const passedNames = before.slice(0, Math.max(0, b)).filter((r) => idxIn(after, r.key) > a).map((r) => r.name).join(" & ");
  const medal = (rank: number) => (rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`);
  const fromPct = gain.prev.points % 100, toPct = gain.next.points % 100 < fromPct ? 100 : gain.next.points % 100;

  if (step === 1 || !hasBoard) return <div className="modal modal-center" onClick={() => { if (hasBoard) setStep(2); else onClose(); }}><div className="day-summary points-gain" onClick={(e) => e.stopPropagation()}>
    <div className="points-gain-burst" aria-hidden="true">{[0, 1, 2, 3, 4, 5].map((i) => <i key={i} style={{ "--i": i } as React.CSSProperties} />)}</div>
    <svg className="points-gain-star" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7L12 2z" /></svg>
    <strong className="points-gain-number">{T.drumPoints.earned(shown)}</strong>
    <p className="points-gain-sub">{gain.next.points} {T.drumPoints.thisYear}</p>
    <div className="points-gain-track"><div className="points-gain-fill" style={{ "--from": `${fromPct}%`, "--to": `${toPct}%` } as React.CSSProperties} /></div>
    <button type="button" className="save" onClick={() => { if (hasBoard) setStep(2); else onClose(); }}>{T.drumPoints.nice}</button>
  </div></div>;

  return <div className="modal modal-center" onClick={onClose}><div className="day-summary points-gain points-gain-step2" onClick={(e) => e.stopPropagation()}>
    <span className="ladder-label">{T.drumPoints.boardTitle} · {T.drumPoints.boardYear}</span>
    <div className="pgb" style={{ height: (hi - lo) * PITCH - 6 }}>
      {after.filter((r) => { const ai = idxIn(after, r.key), bi = idxIn(before, r.key); return (ai >= lo && ai < hi) || (bi >= lo && bi < hi); }).map((r) => {
        const idx = Math.min(hi - lo, Math.max(0, (settled ? idxIn(after, r.key) : idxIn(before, r.key)) - lo));
        const rank = settled ? rankOf(after, r) : rankOf(before, r);
        return <div key={r.key} className={r.me ? "points-board-row pgb-row me" : "points-board-row pgb-row"} style={{ transform: `translateY(${idx * PITCH}px)` }}>
          <span className="points-board-pos">{medal(rank)}</span>
          <span className="points-board-name">{r.name}</span>
          <strong className="points-board-pts">{r.me ? meShown : r.pts}</strong>
          {r.me && settled && <span className="pgb-plus" key="plus">+{gain.earned}</span>}
        </div>;
      })}
    </div>
    <div className={settled ? "points-gain-rank pgb-msg on" : "points-gain-rank pgb-msg"}>
      {climbed ? <><strong>{T.drumPoints.movedUp}</strong><span className="points-gain-places">#{gain.prev.pos} → #{gain.next.pos}</span><p>{T.drumPoints.passed(passedNames || (gain.prev.above_name as string))}</p></>
        : gain.next.pos === 1 ? <strong>{weekFirst ? T.drumPoints.yearAndWeek : T.drumPoints.numberOne}</strong>
        : weekFirst ? <strong>{T.drumPoints.weekBest}</strong> : null}
      {!climbed && gain.next.pos !== 1 && gain.next.above_name && gain.next.above_gap ? <p className="points-gain-push">{T.drumPoints.passMore(gain.next.above_gap, gain.next.above_name)}</p> : null}
      {climbed && weekFirst ? <p>{T.drumPoints.weekBest}</p> : null}
      {week && week.points > 0 ? <p className="points-gain-week">{T.drumPoints.weekPoints(week.points)}</p> : null}
    </div>
    <button type="button" className="save" onClick={onClose}>{T.drumPoints.nice}</button>
  </div></div>;
}
function PointsDetailModal({ user, onClose, T }: { user: any; onClose: () => void; T: any }) {
  const [points, setPoints] = useState<{ id: string; amount: number; reason: string | null; created_at: string }[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [period, setPeriod] = useState<"year" | "all">("year");
  const [board, setBoard] = useState<{ pos: number; display_name: string; points: number; is_me: boolean }[] | null>(null);
  useEffect(() => {
    setBoard(null);
    supabase.rpc("drum_points_board", { p_period: period, p_limit: 20 }).then(({ data }: any) => setBoard(data ?? []));
  }, [period]);
  useEffect(() => {
    supabase.from("point_awards").select("id,amount,reason,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).then(({ data }) => setPoints(data ?? []));
  }, [user.id]);
  const total = (points ?? []).reduce((sum, p) => sum + p.amount, 0);
  return <div className="modal modal-center" onClick={onClose}><div className="day-summary" onClick={(e) => e.stopPropagation()}>
    <div className="ds-head">
      <span className="eyebrow">{T.today.pointsCardTitle}</span>
      <button className="close" onClick={onClose}>×</button>
    </div>
    <div className="day-summary-body">
      <strong className="points-card-value points-detail-total">{total}</strong>
      <span className="ladder-label admin-section-gap">{T.drumPoints.boardTitle}</span>
      <div className="equipment-toggle points-board-toggle">
        <button type="button" className={period === "year" ? "equipment-option selected" : "equipment-option"} onClick={() => setPeriod("year")}>{T.drumPoints.boardYear}</button>
        <button type="button" className={period === "all" ? "equipment-option selected" : "equipment-option"} onClick={() => setPeriod("all")}>{T.drumPoints.boardAll}</button>
      </div>
      {board === null ? <p className="hint">…</p> : board.filter((r) => r.points > 0).length === 0 ? <p className="hint">{T.drumPoints.boardEmpty}</p> : <div className="points-board">
        {board.map((r) => <div key={`${r.pos}-${r.display_name}-${r.is_me}`} className={r.is_me ? "points-board-row me" : "points-board-row"}>
          <span className="points-board-pos">{Number(r.pos) === 1 ? "🥇" : Number(r.pos) === 2 ? "🥈" : Number(r.pos) === 3 ? "🥉" : `#${r.pos}`}</span>
          <span className="points-board-name">{r.is_me ? T.group.you : r.display_name}</span>
          <strong className="points-board-pts">{r.points}</strong>
        </div>)}
      </div>}
      <span className="ladder-label admin-section-gap">{T.admin.pointsHistory}</span>
      {points === null ? <p className="hint">…</p> : points.length === 0 ? <p className="hint">{T.admin.noPoints}</p> : (<>
        <div className="admin-log-list">
          {(showAll ? points : points.slice(0, POINTS_DETAIL_HISTORY_LIMIT)).map((p) => <div key={p.id} className="admin-log-row">
            <div className="admin-log-head"><span>{formatDMY(localDateFromTimestamp(p.created_at))}</span><span className={p.amount > 0 ? "admin-points-positive" : "admin-points-negative"}>{p.amount > 0 ? `+${p.amount}` : p.amount}</span></div>
            {p.reason && <p className="today-notes">{p.reason}</p>}
          </div>)}
        </div>
        {points.length > POINTS_DETAIL_HISTORY_LIMIT && <button type="button" className="see-more-btn" onClick={() => setShowAll(!showAll)}>{showAll ? T.progressPage.seeLess : T.progressPage.seeMore}</button>}
      </>)}
    </div>
  </div></div>;
}

// A short two-note bell ("tu-dum") when points are earned. Sound is a nicety: any problem is ignored, never blocks the pop-up.
let chimeCtx: AudioContext | null = null;
function playPointsChime() {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    chimeCtx = chimeCtx ?? new AC();
    const ctx = chimeCtx;
    const go = () => {
      const t0 = ctx.currentTime + 0.05;
      const notes: [number, number, number][] = [[659.25, 0, 0.3], [987.77, 0.14, 1.0]]; // E5 then B5: frequency, start offset, length (seconds)
      const partials: [number, number][] = [[1, 0.22], [2.76, 0.07], [5.4, 0.025]]; // a bell is a fundamental plus a few inharmonic partials
      notes.forEach(([freq, offset, length]) => partials.forEach(([mult, amp]) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = t0 + offset;
        osc.type = "sine";
        osc.frequency.value = freq * mult;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(amp, start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(start); osc.stop(start + length + 0.05);
      }));
    };
    if (ctx.state === "suspended") ctx.resume().then(go).catch(() => {}); else go();
  } catch { /* no sound available */ }
}
type PointsSummary = { points: number; pos: number; total: number; above_name: string | null; above_gap: number | null };
type PointsGain = { prev: PointsSummary; next: PointsSummary; earned: number };
function OnboardingModal({ currentGoal, onSkip, onFinish, onBand, onLanguage, onPointsAnswer, language, T }: { onLanguage: (language: Lang, save: boolean) => void; onPointsAnswer: (on: boolean) => Promise<boolean>; currentGoal: number | null; onSkip: () => void; onFinish: (selected: string[], goalMinutes: number | null, kidMode: boolean, band: AgeBand | null) => void; onBand: (band: AgeBand | null) => void; language: Lang; T: any }) {
  const [step, setStep] = useState<"language" | "dob" | "points" | "exercises" | "goal" | "mode">("language");
  const [afterPoints, setAfterPoints] = useState<"exercises" | "goal">("exercises");
  // The language starts as the phone's language (Dutch, Spanish or English) and follows what is picked.
  useEffect(() => { try { const n = navigator.language?.toLowerCase() ?? ""; const guess: Lang = n.startsWith("nl") ? "nl" : n.startsWith("es") ? "es" : "en"; if (guess !== language) onLanguage(guess, false); } catch { /* keep English */ } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [dob, setDob] = useState("");
  const [dobBusy, setDobBusy] = useState(false);
  const [dobError, setDobError] = useState("");
  const [band, setBand] = useState<AgeBand | null>(null);
  // Under 14: no exercise pinning and no library question. They get the Essentials library automatically (changeable in Settings);
  // only 14+ (or no answer) sees the full flow.
  const young = !!band && AGE_CONFIG[band].essentials;
  // The server works out the age band from the date of birth (the app never calculates an age) and the date is never shown again.
  async function saveDob() {
    if (!dob) return;
    setDobBusy(true); setDobError("");
    const { data, error } = await supabase.rpc("set_my_date_of_birth", { p_dob: dob });
    setDobBusy(false);
    if (error) { setDobError(T.onboarding.dobError); return; }
    const next = asAgeBand(data);
    setBand(next); onBand(next);
    const after = next && AGE_CONFIG[next].essentials ? "goal" : "exercises";
    // Players up to 16 are asked about Drum Points here (the server works out the exact age).
    const { data: st } = await supabase.rpc("drum_points_state");
    const state: any = Array.isArray(st) ? st[0] : st;
    if (state?.eligible && !state.prompted) { setAfterPoints(after); setStep("points"); } else setStep(after);
  }
  const [selected, setSelected] = useState<string[]>([]);
  const [openCategories, setOpenCategories] = useState<string[]>([]);
  // 30 here is just a suggested starting point shown in the input -- it's only ever
  // saved if the user explicitly hits Finish. Skip leaves the goal genuinely unset.
  const [goalInput, setGoalInput] = useState(String(currentGoal ?? 30));
  const [finalGoal, setFinalGoal] = useState<number | null>(currentGoal);
  const [kidModeChoice, setKidModeChoice] = useState(false);
  function toggleExercise(en: string) {
    setSelected((current) => current.includes(en) ? current.filter((v) => v !== en) : current.length >= MAX_PINNED_EXERCISES ? current : [...current, en]);
  }
  function toggleCategory(cat: string) {
    setOpenCategories((current) => current.includes(cat) ? current.filter((c) => c !== cat) : [...current, cat]);
  }
  return <div className="modal modal-center" onClick={onSkip}><div className="day-summary" onClick={(e) => e.stopPropagation()}>
    <p className="eyebrow">{T.onboarding.eyebrow}</p>
    {step === "language" ? <>
      <h2 className="edit-rating-title">{T.onboarding.languageTitle}</h2>
      <div className="onboard-languages">
        {([["en", "English"], ["es", "Español"], ["nl", "Nederlands"]] as [Lang, string][]).map(([code, label]) => <button type="button" key={code} className={language === code ? "onboard-row selected" : "onboard-row"} onClick={() => onLanguage(code, false)}><span className="onboard-row-name">{label}</span>{language === code && <span className="onboard-check">✓</span>}</button>)}
      </div>
      <button className="save" onClick={() => { onLanguage(language, true); setStep("dob"); }}>{T.onboarding.continueBtn}</button>
    </> : step === "points" ? <>
      <h2 className="edit-rating-title">{T.drumPoints.askTitle}</h2>
      <p className="points-ask-text">{T.drumPoints.askText}</p>
      <button className="save" onClick={async () => { if (await onPointsAnswer(true)) setStep(afterPoints); }}>{T.drumPoints.askYes}</button>
      <button className="auth-switch" onClick={async () => { if (await onPointsAnswer(false)) setStep(afterPoints); }}>{T.drumPoints.askNo}</button>
    </> : step === "dob" ? <>
      <h2 className="edit-rating-title">{T.onboarding.dobTitle}</h2>
      <p className="settings-neutral-hint">{T.onboarding.dobHint}</p>
      <input type="date" className="dob-input" aria-label={T.onboarding.dobTitle} value={dob} max={new Date().toISOString().slice(0, 10)} min={`${new Date().getFullYear() - 110}-01-01`} onChange={(e) => { setDob(e.target.value); setDobError(""); }} />
      {dobError && <p className="auth-error-inline">{dobError}</p>}
      <button className="save" disabled={!dob || dobBusy} onClick={saveDob}>{T.onboarding.continueBtn}</button>
      <button className="auth-switch" onClick={() => { setBand(null); setStep("exercises"); }}>{T.onboarding.skipBtn}</button>
    </> : step === "exercises" ? <>
      <h2 className="edit-rating-title">{T.onboarding.exercisesTitle}</h2>
      <p className="onboard-count">{T.practiceMode.pinManagerEyebrow(selected.length, MAX_PINNED_EXERCISES)}</p>
      <div className="onboard-exercise-list">
        {PRACTICE_CATEGORIES.map((cat) => {
          const isOpen = openCategories.includes(cat);
          const catLabel = cat === "rudiments" ? T.practiceMode.categoryRudiments : T.practiceMode.categoryExercises;
          const catItems = PRACTICE_EXERCISES.filter((e) => e.category === cat);
          const selectedInCat = catItems.filter((e) => selected.includes(e.en)).length;
          return <div key={cat} className="onboard-category">
            <button type="button" className="collapsible-header" onClick={() => toggleCategory(cat)}>
              <span className="ladder-label">{catLabel.toUpperCase()}{selectedInCat > 0 ? ` (${selectedInCat})` : ""}</span>
              <span className={isOpen ? "collapse-chevron open" : "collapse-chevron"}><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 7.5l5 5 5-5" /></svg></span>
            </button>
            {isOpen && catItems.map((item) => {
              const isSelected = selected.includes(item.en);
              return <button key={item.en} type="button" className={isSelected ? "onboard-row selected" : "onboard-row"} onClick={() => toggleExercise(item.en)}>
                <span className="onboard-row-name">{item[language as Lang]}</span>
                {isSelected && <span className="onboard-check">✓</span>}
              </button>;
            })}
          </div>;
        })}
      </div>
      <button className="save" onClick={() => setStep("goal")}>{T.onboarding.continueBtn}</button>
    </> : step === "goal" ? <>
      <h2 className="edit-rating-title">{T.onboarding.goalTitle}</h2>
      <div className="minutes-island">
        <button className="minutes-step" onClick={() => setGoalInput(String(Math.max(5, (Number(goalInput) || 0) - 5)))}>-5</button>
        <div className="minutes-value"><input inputMode="numeric" size={3} value={goalInput} onChange={(e: any) => setGoalInput(e.target.value.replace(/\D/g, ""))} /><span>{T.settings.minutes}</span></div>
        <button className="minutes-step" onClick={() => setGoalInput(String((Number(goalInput) || 0) + 5))}>+5</button>
      </div>
      <button className="save" onClick={() => { const g = Number(goalInput) || currentGoal || 30; setFinalGoal(g); if (young) onFinish([], g, true, band); else setStep("mode"); }}>{young ? T.onboarding.finishBtn : T.onboarding.continueBtn}</button>
      <button className="auth-switch" onClick={() => { setFinalGoal(currentGoal); if (young) onFinish([], currentGoal, true, band); else setStep("mode"); }}>{T.onboarding.skipBtn}</button>
    </> : <>
      <h2 className="edit-rating-title">{T.onboarding.modeTitle}</h2>
      <p className="settings-neutral-hint">{T.settings.libraryHint}</p>
      <div className="equipment-toggle onboard-mode-toggle">
        <button type="button" className={!kidModeChoice ? "equipment-option selected" : "equipment-option"} onClick={() => setKidModeChoice(false)}>{T.settings.libraryFull}</button>
        <button type="button" className={kidModeChoice ? "equipment-option selected" : "equipment-option"} onClick={() => setKidModeChoice(true)}>{T.settings.libraryEssentials}</button>
      </div>
      <button className="save" onClick={() => onFinish(selected, finalGoal, kidModeChoice, band)}>{T.onboarding.finishBtn}</button>
    </>}
  </div></div>;
}

// Password box with a show/hide eye, so people can check what they typed.
function PasswordField({ value, onChange, placeholder, isNew }: { value: string; onChange: (v: string) => void; placeholder: string; isNew?: boolean }) {
  const [shown, setShown] = useState(false);
  return <div className="pw-field">
    <input type={shown ? "text" : "password"} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={isNew ? "new-password" : "current-password"} />
    <button type="button" className="pw-toggle" onClick={() => setShown(!shown)} aria-label={shown ? "Hide password" : "Show password"} aria-pressed={shown}>
      {shown
        ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17.9 17.9A10.1 10.1 0 0 1 12 20c-6.5 0-10-8-10-8a17.6 17.6 0 0 1 4.1-5.1M9.9 4.2A9.8 9.8 0 0 1 12 4c6.5 0 10 8 10 8a17.7 17.7 0 0 1-2.2 3.2M1 1l22 22M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>
        : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
    </button>
  </div>;
}
// Login and password-reset screens appear before the app knows the user's language, so they follow the phone/browser language.
const AUTH_TEXT = {
  en: { tagline: "Build your daily drumming habit, one session at a time.", welcome: "Welcome back", start: "Start your streak", reset: "Reset your password", firstName: "First name or nickname (one word)", email: "Email address", password: "Password", forgot: "Forgot password?",
    consentA: "I am 16 or older, or I am a parent or guardian creating this account for my child (or the child's teacher, with the parent's permission). I agree to the ", terms: "Terms", and: " and ", privacy: "Privacy Policy", support: "Support", privacyShort: "Privacy",
    wait: "Please wait...", logIn: "Log in", create: "Create account", sendLink: "Send reset link", or: "OR", google: "Continue with Google", newHere: "New here? Create an account", haveAccount: "Already have an account? Log in", back: "Back to log in",
    resetSent: "Check your email for a password reset link.", checkEmail: "If this is a new account, check your email to confirm it. Already have an account with this email? Just log in instead.", newPasswordTitle: "Set a new password", newPasswordIntro: "Choose a new password for your account.", newPassword: "New password", update: "Update password" },
  nl: { tagline: "Bouw je dagelijkse drumgewoonte op, sessie voor sessie.", welcome: "Welkom terug", start: "Begin je reeks", reset: "Wachtwoord opnieuw instellen", firstName: "Voornaam of bijnaam (één woord)", email: "E-mailadres", password: "Wachtwoord", forgot: "Wachtwoord vergeten?",
    consentA: "Ik ben 16 jaar of ouder, of ik ben een ouder of voogd die dit account maakt voor mijn kind (of de leraar van het kind, met toestemming van de ouder). Ik ga akkoord met de ", terms: "Gebruiksvoorwaarden", and: " en het ", privacy: "Privacybeleid", support: "Ondersteuning", privacyShort: "Privacy",
    wait: "Even geduld...", logIn: "Inloggen", create: "Account maken", sendLink: "Herstellink sturen", or: "OF", google: "Doorgaan met Google", newHere: "Nieuw hier? Maak een account", haveAccount: "Heb je al een account? Log in", back: "Terug naar inloggen",
    resetSent: "Controleer je e-mail voor een link om je wachtwoord opnieuw in te stellen.", checkEmail: "Als dit een nieuw account is, controleer dan je e-mail om het te bevestigen. Heb je al een account met dit e-mailadres? Log dan gewoon in.", newPasswordTitle: "Stel een nieuw wachtwoord in", newPasswordIntro: "Kies een nieuw wachtwoord voor je account.", newPassword: "Nieuw wachtwoord", update: "Wachtwoord bijwerken" },
};
function useAuthText() {
  const [lang, setLang] = useState<"en" | "nl">("en");
  useEffect(() => { try { if (navigator.language?.toLowerCase().startsWith("nl")) setLang("nl"); } catch {} }, []);
  return AUTH_TEXT[lang];
}
function Login({ error, setError }: { error: string; setError: (message: string) => void }) {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [mode, setMode] = useState<"login" | "signup" | "forgot">("login"); const [consent, setConsent] = useState(false); const [busy, setBusy] = useState(false); const [firstName, setFirstName] = useState("");
  const A = useAuthText();
  async function submit() {
    setBusy(true); setError("");
    if (mode === "forgot") {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: WEB_URL || window.location.origin });
      setBusy(false);
      if (resetError) setError(resetError.message); else setError(A.resetSent);
      return;
    }
    const result = mode === "login" ? await supabase.auth.signInWithPassword({ email, password }) : await supabase.auth.signUp({ email, password, options: { data: { display_name: firstName.trim(), consent_at: new Date().toISOString(), consent_version: LEGAL_VERSION } } });
    // When email confirmation is on, Supabase deliberately doesn't say whether an email is already
    // registered (prevents an attacker from probing which emails have accounts), so signUp()
    // "succeeds" with no session either way and the message below has to make sense for both cases.
    // When confirmation is off, signUp() returns a live session and the user is simply logged in,
    // so there is nothing to tell them.
    setBusy(false); if (result.error) setError(result.error.message); else if (mode === "signup" && !(result.data as { session?: unknown } | null)?.session) setError(A.checkEmail);
  }
  async function google() { setBusy(true); const { error: oauthError } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } }); if (oauthError) { setError(oauthError.message); setBusy(false); } }
  return <main className="shell"><section className="auth-shell"><h1>DrumSkills</h1><p>{A.tagline}</p><div className="auth-card">
    <h2>{mode === "login" ? A.welcome : mode === "signup" ? A.start : A.reset}</h2>
    {mode === "signup" && <input type="text" placeholder={A.firstName} value={firstName} maxLength={20} autoComplete="given-name" autoCapitalize="words" onChange={e => setFirstName(e.target.value.replace(/\s/g, ""))} />}
    <input type="email" placeholder={A.email} value={email} onChange={e => setEmail(e.target.value)} />
    {mode !== "forgot" && <PasswordField value={password} onChange={setPassword} placeholder={A.password} isNew={mode === "signup"} />}
    {mode === "login" && <button className="auth-forgot" onClick={() => { setMode("forgot"); setError(""); }}>{A.forgot}</button>}
    {mode === "signup" && <label className="auth-consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /><span>{A.consentA}<a href={LEGAL_URLS.terms} target="_blank" rel="noopener noreferrer">{A.terms}</a>{A.and}<a href={LEGAL_URLS.privacy} target="_blank" rel="noopener noreferrer">{A.privacy}</a>.</span></label>}
    <button className="auth-primary" disabled={busy || !email || (mode !== "forgot" && !password) || (mode === "signup" && (!consent || !firstName.trim()))} onClick={submit}>{busy ? A.wait : mode === "login" ? A.logIn : mode === "signup" ? A.create : A.sendLink}</button>
    {mode !== "forgot" && !IS_NATIVE_BUILD && <div className="or">{A.or}</div>}
    {mode !== "forgot" && !IS_NATIVE_BUILD && <button className="google" disabled={busy || (mode === "signup" && !consent)} onClick={google}>G <span>{A.google}</span></button>}
    <button className="auth-switch" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}>{mode === "login" ? A.newHere : mode === "signup" ? A.haveAccount : A.back}</button>
  </div>{error && <p className="auth-error">{error}</p>}
  <p className="auth-legal"><a href={LEGAL_URLS.privacy} target="_blank" rel="noopener noreferrer">{A.privacyShort}</a> · <a href={LEGAL_URLS.terms} target="_blank" rel="noopener noreferrer">{A.terms}</a> · <a href={LEGAL_URLS.support} target="_blank" rel="noopener noreferrer">{A.support}</a></p></section></main>;
}
function ResetPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const A = useAuthText();
  async function submit() {
    setBusy(true); setError("");
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) setError(updateError.message); else onDone();
  }
  return <main className="shell"><section className="auth-shell"><h1>DrumSkills</h1><p>{A.newPasswordIntro}</p><div className="auth-card"><h2>{A.newPasswordTitle}</h2><PasswordField value={password} onChange={setPassword} placeholder={A.newPassword} isNew /><button className="auth-primary" disabled={busy || !password} onClick={submit}>{busy ? A.wait : A.update}</button></div>{error && <p className="auth-error">{error}</p>}</section></main>;
}

function YourPointsCard({ pointsEnabled, rows, onViewPoints, T }: any) {
  // Same rule as the leaderboard below it: nothing renders (no placeholder, no flash of
  // zero) until the admin has opted this student into the point game and the shared
  // points_leaderboard() fetch (kicked off once in Today) has actually landed.
  if (!pointsEnabled || !rows) return null;
  const mine = rows.find((r: any) => r.is_me);
  const total = mine ? Number(mine.points) : 0;
  const rank = mine ? Number(mine.pos) : 0;
  const status = total === 0 ? T.today.pointsCardKickoff : rank === 1 ? T.today.pointsCardRankOne : rank > 0 && rank <= 3 ? T.today.pointsCardTop3 : T.today.pointsCardKeepGoing;
  const ringPct = Math.max(0, Math.min(1, (total % 100) / 100));
  const ringOffset = 88 - 88 * ringPct;
  return <button type="button" className="form-card points-card" onClick={onViewPoints}>
    <div className="points-card-top">
      <div className="points-card-main">
        <span className="input-label points-card-label">{T.today.pointsCardTitle} · {T.drumPoints.cardYear}</span>
        <strong className="points-card-value">{total}</strong>
      </div>
      <div className="points-card-ring">
        <svg viewBox="0 0 36 36">
          <circle cx="18" cy="18" r="14" className="points-ring-track" />
          <circle cx="18" cy="18" r="14" className="points-ring-progress" strokeDasharray="88" strokeDashoffset={ringOffset} />
        </svg>
        <svg className="points-card-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7L12 2z" /></svg>
      </div>
    </div>
    <p className="points-card-status">{status}</p>
    <span className="points-card-cta">{T.today.pointsCardCta}<span>→</span></span>
  </button>;
}
function PointsLeaderboard({ pointsEnabled, rows, T }: any) {
  // Hidden entirely for students the admin hasn't opted into the point game, and stays
  // hidden until at least one point has actually been awarded anywhere -- an all-zero
  // leaderboard on a brand new feature would read as broken, not motivating.
  if (!pointsEnabled || !rows || !rows.some((r: any) => Number(r.points) !== 0)) return null;
  const topRows = rows.slice(0, 6);
  const maxPoints = Math.max(1, ...topRows.map((r: any) => Number(r.points)));
  return <div className="form-card">
    <span className="section-label">{T.today.pointsTitle}</span>
    <div className="leaderboard">
      {topRows.map((r: any) => <div key={`${r.pos}-${r.display_name}-${r.is_me}`} className="leaderboard-row">
        <span className="leaderboard-name">{(Number(r.pos) === 1 ? "🥇 " : Number(r.pos) === 2 ? "🥈 " : Number(r.pos) === 3 ? "🥉 " : "")}{r.is_me ? T.group.you : r.display_name}</span>
        <div className="leaderboard-bar-track"><div className="leaderboard-bar" style={{ width: `${Math.max(0, Math.min(100, (Number(r.points) / maxPoints) * 100))}%` }} /></div>
        <span className="leaderboard-value">{r.points}</span>
      </div>)}
    </div>
  </div>;
}
function HomeChallenges({ user, practiceSessions, language, T, onSeeAll, onOpenExercise }: any) {
  const [challenges, setChallenges] = useState<any[]>([]);
  const [logsCache, setLogsCache] = useState<Record<string, ChallengeLogEntry>>({});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("personal_challenges").select("id,exercise_en,target_minutes,target_bpm,length_days,start_date,assigned_by").eq("user_id", user.id).order("start_date", { ascending: false });
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
  const R = 22, CIRC = 2 * Math.PI * R;
  return <div className="home-challenges">
    <h2 className="home-title home-challenges-title">{T.personalChallenges.homeTitle}</h2>
    {active.map((c) => <button type="button" key={c.id} className="home-challenge-card" onClick={() => (PRACTICE_EXERCISES.some((e) => e.en === c.exercise_en) ? onOpenExercise(c.exercise_en) : onSeeAll())}>
      <span className="challenge-ring">
        <svg viewBox="0 0 56 56" aria-hidden="true"><circle cx="28" cy="28" r={R} fill="none" stroke="#232826" strokeWidth="4" /><circle cx="28" cy="28" r={R} fill="none" stroke="#68d391" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${(c.completedCount / Math.max(1, c.length_days)) * CIRC} ${CIRC}`} transform="rotate(-90 28 28)" /></svg>
        <b>{c.completedCount}</b>
      </span>
      <span className="hc-text"><strong>{challengeExerciseLabel(c.exercise_en, language)}{c.assigned_by && <span className="from-teacher-badge from-teacher-inline">{T.personalChallenges.fromTeacher}</span>}</strong><small>{c.completedCount} / {c.length_days} {T.today.days}</small></span>
      <svg className="hc-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
    </button>)}
  </div>;
}
const HOME_ICONS = {
  flame: <path d="M12 3c.8 3.2 5 5 5 10a5 5 0 01-10 0c0-2 1-3.2 2-4.2 0 2 .9 3 2 3 0-3-1-5 1-8.8z" />,
  crown: <path d="M3 8l5 4 4-7 4 7 5-4-2 11H5L3 8z" />,
  bars: <><path d="M5 20v-6M12 20V6M19 20v-10" /></>,
};
function HomeStat({ icon, label, value }: { icon: keyof typeof HOME_ICONS; label: string; value: string }) {
  return <div className="stat-cell"><svg viewBox="0 0 24 24" fill={icon === "bars" ? "none" : "currentColor"} stroke="currentColor" strokeWidth={icon === "bars" ? 3.2 : 1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{HOME_ICONS[icon]}</svg><span>{label}</span><strong>{value}</strong></div>;
}
function Today({ onGoToProgress, streak, longestStreak, daysThisYear, showDaysThisYear, pinnedExercises, practiceSessions, user, pointsEnabled, dailyGoal, logs, saveLogFor, deleteLogFor, confirm, openSettings, onGoToPractice, onGoToRudiments, onOpenExercise, onManagePins, onViewPoints, onOpenSessionTimer, onOpenMetronome, displayName, language, T }: any) {
  const todayLog: Log | undefined = logs[dateKey];
  const todayMinutes = todayLog?.minutes ?? 0;
  const goalAchieved = dailyGoal != null && todayMinutes >= dailyGoal;
  const goalPct = dailyGoal != null ? Math.min(100, (todayMinutes / Math.max(1, dailyGoal)) * 100) : 0;
  const TIER_LABEL: Record<string, string> = { beginner: T.practiceMode.tierBeginner, intermediate: T.practiceMode.tierIntermediate, advanced: T.practiceMode.tierAdvanced, legend: T.practiceMode.tierLegend };
  // Fetched once here and handed to both the personal points card and the group leaderboard
  // below it, instead of each issuing its own points_leaderboard() call for the same data.
  const [pointsRows, setPointsRows] = useState<{ pos: number; display_name: string; points: number; is_me: boolean }[] | null>(null);
  useEffect(() => {
    if (!pointsEnabled) { setPointsRows(null); return; }
    supabase.rpc("drum_points_board", { p_period: "year", p_limit: 5 }).then(({ data, error }: any) => setPointsRows(error ? null : (data ?? [])));
  }, [pointsEnabled]);
  // Skill Trainer sessions are logged separately from Quick Practice's "what did you practice"
  // tags (see logPracticeSession) -- a day with only Skill Trainer minutes would otherwise show
  // "No practice yet." here despite the goal bar above it being full, which reads as broken.
  const todaySkillExercises: string[] = Array.from(new Set(practiceSessions.filter((s: any) => s.practiced_on === dateKey).map((s: any) => s.item_en as string)));
  return <section className="page today">
    <header className="hero home-hero"><div className="hero-text"><h1 className="today-hero-heading">{T.today.heroLine1}<br/>{T.today.heroLine1b}<br/><i>{T.today.heroLine2}</i></h1></div><div className="hero-actions"><button type="button" className="avatar settings-avatar metro-avatar" onClick={onOpenMetronome} aria-label={T.today.metronome}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3h6l3.5 17.5a1 1 0 01-1 1.2h-11a1 1 0 01-1-1.2z" /><path d="M12 17.5L15.5 6.5" /><circle cx="14.2" cy="10.4" r="1.3" fill="currentColor" /></svg></button><button className="avatar settings-avatar" onClick={openSettings} aria-label={T.nav.settings}>{NAV_ICONS.settings}</button></div></header>
    <button type="button" className="start-cta" onClick={onOpenSessionTimer}>
      <span className="start-cta-play"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" /></svg></span>
      <span className="start-cta-text"><strong>{T.today.startPracticeTitle}</strong><small>{T.today.startPracticeSub}</small></span>
      <svg className="start-cta-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
    </button>
    <YourPointsCard user={user} pointsEnabled={pointsEnabled} rows={pointsRows} onViewPoints={onViewPoints} T={T} />
    <div className="form-card stats-tile stats-icons"><div className={showDaysThisYear ? "stats" : "stats stats-2"}><HomeStat icon="flame" label={T.today.currentStreak} value={String(streak) + " " + T.today.days} /><HomeStat icon="crown" label={T.calendar.longestStreak} value={String(longestStreak) + " " + T.today.days} />{showDaysThisYear && <HomeStat icon="bars" label={T.calendar.daysThisYear} value={String(daysThisYear) + " / 365"} />}</div></div>
    <PointsLeaderboard user={user} pointsEnabled={pointsEnabled} rows={pointsRows} T={T} />
    {todayMinutes === 0 && dailyGoal != null && !todayLog?.notes && todaySkillExercises.length === 0 ? <div className="form-card today-goal-card today-empty">
      <div className="today-empty-text">
        <label className="input-label">{T.today.todaySummary}</label>
        <h3 className="today-empty-title">{T.today.noPracticeTitle}</h3>
      </div>
      <span className="goal-chip goal-chip-corner">{T.today.goalShort} {formatMinutes(dailyGoal)}</span>
      <button type="button" className="start-session-btn today-empty-cta" onClick={onGoToRudiments}>{T.today.practiceRudiment}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg></button>
    </div> : <div className={todayMinutes === 0 ? "form-card today-goal-card today-goal-card-empty" : "form-card today-goal-card"} onClick={todayMinutes === 0 ? onGoToPractice : undefined}>
      <label className="input-label">{T.today.todaySummary}</label>
      {dailyGoal != null ? (
        <div className="goal-progress"><div className="goal-progress-label"><strong className={goalAchieved ? "achieved" : ""}>{formatMinutes(todayMinutes)} / {formatMinutes(dailyGoal)}</strong></div><div className="goal-progress-track"><div className={goalAchieved ? "goal-progress-bar achieved" : "goal-progress-bar"} style={{ width: `${goalPct}%` }} /></div></div>
      ) : (
        <div className="no-goal-card">
          <p className="no-goal-title">{T.today.noGoalTitle}</p>
          <p className="no-goal-subtitle">{T.today.noGoalSubtitle}</p>
          <button className="no-goal-btn" onClick={(e) => { e.stopPropagation(); openSettings(); }}>{T.today.noGoalBtn}</button>
        </div>
      )}
      {todayLog && todayLog.equipment && <span className="roster-equipment">{equipmentSplitLabel(todayLog.drumsetMinutes, todayLog.padMinutes, T) ?? T.calendar.onEquipment(equipmentLabel(todayLog.equipment, T))}</span>}
      {(() => {
        const loggedItems = todayLog ? [...todayLog.items, ...todayLog.customItems] : [];
        const allItems: string[] = Array.from(new Set([...loggedItems, ...todaySkillExercises]));
        return allItems.length > 0 ? <div className="detail-chips">{allItems.map((item) => <PracticedChip key={item} item={item} skill={todaySkillExercises.includes(item)} language={language} onOpen={todaySkillExercises.includes(item) && PRACTICE_EXERCISES.some((e) => e.en === item) ? () => onOpenExercise(item) : undefined} />)}</div> : (todayMinutes === 0 ? <p className="hint">{T.today.noPracticeYet}</p> : null);
      })()}
      {todayLog && todayLog.notes && <p className="today-notes"><b>{T.today.notesPrefix}</b> {todayLog.notes}</p>}
    </div>}
    <HomeChallenges user={user} practiceSessions={practiceSessions} language={language} T={T} onSeeAll={onGoToPractice} onOpenExercise={onOpenExercise} />
    <UnlocksFeed sessions={practiceSessions} limit={2} language={language} T={T} onOpenExercise={onOpenExercise} onSeeAll={onGoToProgress} titleClass="home-title" hideEmpty />
    <div className="home-pinned">
      <div className="home-pinned-head-row">
        <button type="button" className="home-title home-pinned-title" onClick={onManagePins}><svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4a1 1 0 011-1h10a1 1 0 011 1v16l-6-4-6 4V4z" /></svg>{T.progressPage.pinned}</button>
        <button type="button" className="home-pinned-settings" onClick={onManagePins} aria-label={T.practiceMode.pinManagerTitle} title={T.practiceMode.pinManagerTitle}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></svg>
        </button>
      </div>
      {pinnedExercises.length > 0 ? <>
        <div className="tier-strip tier-strip-header focus-header">
          {PRACTICE_TIERS.map((tier) => <div key={tier.key} className="tier-seg"><span className="seg-label focus-pill-label">{TIER_LABEL[tier.key]}</span></div>)}
        </div>
        {pinnedExercises.slice(0, MAX_PINNED_EXERCISES).map((en: string) => {
          const label = PRACTICE_EXERCISES.find((e) => e.en === en)?.[language as Lang] ?? en;
          const unlockedLevels = bpmLevelsFor(en).filter((level) => qualifyingMinutesFor(practiceSessions, en, level) >= UNLOCK_MINUTES);
          const totalMinutes = practiceSessions.filter((s: any) => s.item_en === en).reduce((sum: number, s: any) => sum + s.duration_minutes, 0);
          return <button key={en} className="home-pinned-row" onClick={() => onOpenExercise(en)}>
            <div className="home-pinned-head"><span className="home-pinned-name">{label}</span><span className="home-pinned-time">{formatMinutes(totalMinutes)}</span></div>
            {unlockedLevels.length > 0 ? <>
              <div className="tier-strip home-pinned-tier-strip">
                {tiersFor(en).map((tier) => <div key={tier.key} className="tier-seg">{renderTierSegBar(tierProgressFor(practiceSessions, en, tier), tierIsSkipped(practiceSessions, en, tier))}</div>)}
              </div>
            </> : <span className="home-pinned-bpm">{T.practiceMode.notStarted}</span>}
          </button>;
        })}
      </> : <button type="button" className="home-pinned-empty" onClick={onManagePins}>{T.practiceMode.pinManagerEmpty}</button>}
    </div>
    <div className="section-title"><h2 className="home-title">{T.calendar.title}</h2></div>
    <Calendar logs={logs} dailyGoal={dailyGoal} saveLogFor={saveLogFor} deleteLogFor={deleteLogFor} confirm={confirm} practiceSessions={practiceSessions} language={language} T={T} />
  </section>;
}

type SaveLogFor = (targetDate: string, targetMinutes: number, targetItems: string[], targetNotes: string, targetEquipment: string | null, targetDrumsetMinutes?: number | null, targetPadMinutes?: number | null, targetSeconds?: number, targetCustomItems?: string[]) => Promise<boolean>;

function Calendar({ logs, dailyGoal, saveLogFor, deleteLogFor, confirm, practiceSessions, language, T }: { logs: Record<string, Log>; dailyGoal: number | null; saveLogFor: SaveLogFor; deleteLogFor: (date: string) => Promise<boolean>; confirm: (message: string) => Promise<boolean>; practiceSessions: any[]; language: Lang; T: any }) {
  const today = new Date(); const [selectedDate, setSelectedDate] = useState(dateKey); const [viewDate, setViewDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1)); const year = viewDate.getFullYear(); const month = viewDate.getMonth(); const days = new Date(year, month + 1, 0).getDate(); const starts = (new Date(year, month, 1).getDay() + 6) % 7; const selectedLog = logs[selectedDate];
  const locale = localeFor(language);
  const [summaryDate, setSummaryDate] = useState<string | null>(null);
  function changeMonth(delta: number) { setViewDate(new Date(year, month + delta, 1)); }
  function tapDay(key: string) {
    setSelectedDate(key);
    if (key <= dateKey) setSummaryDate(key);
  }
  function goToToday() {
    setViewDate(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDate(dateKey);
  }
  const isFuture = selectedDate > dateKey;
  const isTodayView = month === today.getMonth() && year === today.getFullYear() && selectedDate === dateKey;
  return <>
    <div className="calendar-card"><div className="cal-head"><div className="cal-nav"><button onClick={() => changeMonth(-1)}>‹</button><h2>{viewDate.toLocaleString(locale, { month: "long", year: "numeric" })}</h2><button onClick={() => changeMonth(1)}>›</button></div>{!isTodayView && <button type="button" className="cal-today-btn" onClick={goToToday}>{T.calendar.todayBtn}</button>}</div><div className="week">{T.calendar.weekdays.map((x: string, i: number)=><span key={i}>{x}</span>)}</div><div className="days">{Array.from({ length: starts }).map((_,i)=><i key={"b" + i}/>)}{Array.from({ length: days }).map((_,i) => { const d=i+1; const key = formatLocalDate(year, month, d); const isToday=d===today.getDate() && month===today.getMonth() && year===today.getFullYear(); const done=(logs[key]?.minutes ?? 0) > 0; const className=(isToday ? "is-today " : "") + (selectedDate === key ? "is-selected " : "") + (done ? "done" : ""); return <button key={d} onClick={() => tapDay(key)} className={className}><span>{d}</span>{done && <b>✓</b>}</button> })}</div></div>
    {selectedDate !== dateKey && <div className="day-detail"><span>{new Date(selectedDate + "T12:00:00").toLocaleDateString(locale, { weekday: "long", month: "long", day: "numeric" })}</span>
      {isFuture && <p>{T.calendar.futureDay}</p>}
      {!isFuture && (selectedLog && selectedLog.minutes > 0 ? (() => {
        const selectedSkillExercises = practiceSessions.filter((s) => s.practiced_on === selectedDate).map((s) => s.item_en);
        const allItems = Array.from(new Set([...selectedLog.items, ...selectedLog.customItems, ...selectedSkillExercises]));
        return <><strong>{formatMinutes(selectedLog.minutes)} {T.calendar.minPractised}</strong><div className="detail-chips">{allItems.map((item) => <PracticedChip key={item} item={item} skill={selectedSkillExercises.includes(item)} language={language} />)}</div>{selectedLog.notes && <p>{selectedLog.notes}</p>}</>;
      })() : <p>{T.calendar.noPractice}</p>)}
    </div>}
    {summaryDate && <DaySummaryModal date={summaryDate} log={logs[summaryDate]} dailyGoal={dailyGoal} logs={logs} practiceSessions={practiceSessions} locale={locale} language={language} T={T}
      onClose={() => setSummaryDate(null)} onSave={saveLogFor} onDelete={deleteLogFor} confirm={confirm}
      onNavigateDay={(delta) => setSummaryDate((current) => current ? shiftDateKey(current, delta) : current)} />}
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
// "What did you practise?" for the add-time prompts: the Skill Trainer items from this session come first (ticked, tap to untick),
// then one "Anything else?" menu that holds every other choice, so the prompt does not open with a wall of pills.
function PracticedPicker({ title, skillRows, skillBadge, moreLabel, extraCount, children }: { title: string; skillRows: { key: string; label: string; selected: boolean; onToggle: () => void }[]; skillBadge: string; moreLabel: string; extraCount: number; children: React.ReactNode }) {
  const [moreOpen, setMoreOpen] = useState(false);
  return <div className="practiced-picker">
    {skillRows.length > 0 ? <span className="metro-section-label">{title}</span> : <span className="practiced-gap" />}
    {skillRows.map((r) => <button type="button" key={r.key} className={r.selected ? "pick-row on" : "pick-row"} onClick={r.onToggle}>
      <span className="pick-check">{r.selected ? "✓" : ""}</span><span className="pick-name">{r.label}</span><span className="pick-badge">{skillBadge}</span>
    </button>)}
    <button type="button" className={moreOpen ? "pick-more open" : "pick-more"} aria-expanded={moreOpen} onClick={() => setMoreOpen(!moreOpen)}>
      <span>{moreLabel}{extraCount > 0 ? ` (${extraCount})` : ""}</span><span className="pick-caret">▾</span>
    </button>
    {moreOpen && <div className="pick-menu">{children}</div>}
  </div>;
}
// Shared expandable pill+flyout used for Rudiments, Books, and My Items in Quick Practice's
// save modal -- defined at module level (not inside PracticeMode) so its identity is stable
// across renders and a controlled search/add input inside it doesn't lose focus on every keystroke.
function ChipDropdown({ label, selectedCount, open, onToggleOpen, searchable, searchValue, onSearchChange, searchPlaceholder, rows, addPlaceholder, addBtnLabel, addValue, onAddChange, onAdd, doneLabel, asRow }: {
  asRow?: boolean; label: string; selectedCount: number; open: boolean; onToggleOpen: () => void;
  searchable?: boolean; searchValue?: string; onSearchChange?: (value: string) => void; searchPlaceholder?: string;
  rows: { key: string; label: string; selected: boolean; onToggle: () => void; onDelete?: () => void }[];
  addPlaceholder?: string; addBtnLabel?: string; addValue?: string; onAddChange?: (value: string) => void; onAdd?: () => void; doneLabel?: string;
}) {
  return <>
    {asRow
      ? <button type="button" className={selectedCount > 0 ? "pick-row on" : "pick-row"} onClick={onToggleOpen}>
        <span className="pick-check">{selectedCount > 0 ? "✓" : ""}</span><span className="pick-name">{label}{selectedCount > 0 ? ` (${selectedCount})` : ""}</span><span className="pick-go">›</span>
      </button>
      : <button type="button" className={selectedCount > 0 ? "chip selected" : "chip"} onClick={onToggleOpen}>
      {selectedCount > 0 && <b>✓</b>}{label}{selectedCount > 0 ? ` (${selectedCount})` : ""}
      <span className="chip-caret">▾</span>
    </button>}
    {open && <div className="modal modal-center picker-window" onClick={onToggleOpen}>
      <div className="day-summary picker-window-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="close" onClick={onToggleOpen}>×</button>
        <h2 className="edit-rating-title">{label}</h2>
        {searchable && <input className="rudiment-search" value={searchValue} onChange={(e) => onSearchChange?.(e.target.value)} placeholder={searchPlaceholder} />}
        <div className="onboard-exercise-list rudiment-list">
          {rows.map((r) => r.onDelete ? (
            <div key={r.key} className={r.selected ? "onboard-row selected" : "onboard-row"}>
              <button type="button" className="onboard-row-tap" onClick={r.onToggle}>
                <span className="onboard-row-name">{r.label}</span>
                {r.selected && <span className="onboard-check">✓</span>}
              </button>
              <button type="button" className="own-item-delete" onClick={r.onDelete}>✕</button>
            </div>
          ) : (
            <button key={r.key} type="button" className={r.selected ? "onboard-row selected" : "onboard-row"} onClick={r.onToggle}>
              <span className="onboard-row-name">{r.label}</span>
              {r.selected && <span className="onboard-check">✓</span>}
            </button>
          ))}
        </div>
        {onAdd && <div className="custom-item-row">
          <input value={addValue} onChange={(e) => onAddChange?.(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onAdd(); } }} placeholder={addPlaceholder} />
          <button type="button" className="custom-item-add" onClick={onAdd} disabled={!addValue?.trim()}>{addBtnLabel}</button>
        </div>}
        <button type="button" className="save" onClick={onToggleOpen}>{doneLabel}</button>
      </div>
    </div>}
  </>;
}
function DaySummaryModal({ date, log, dailyGoal, logs, practiceSessions, locale, language, T, onClose, onSave, onDelete, confirm, roster, onNavigateDay }: {
  date: string; log?: Log; dailyGoal: number | null; logs: Record<string, Log>; practiceSessions?: any[]; locale: string; language: Lang; T: any;
  onClose: () => void; onSave: SaveLogFor; onDelete: (date: string) => Promise<boolean>; confirm: (message: string) => Promise<boolean>;
  roster?: { members: { id: string; name: string; color: string }[]; dayLogs: Record<string, { minutes: number; seconds: number; equipment: string | null; drumsetMinutes: number | null; padMinutes: number | null; items: string[]; customItems: string[]; notes: string; skillItems?: string[] }>; currentUserId: string };
  onNavigateDay?: (delta: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const streakHere = calculateStreaks(logs, date).current;
  const hasPractice = !!log && log.minutes > 0;
  const daySkillExercises = (practiceSessions ?? []).filter((s) => s.practiced_on === date).map((s) => s.item_en);
  const rosterRows = roster ? roster.members.filter((m) => (roster.dayLogs[m.id]?.minutes ?? 0) > 0).map((m) => ({ ...m, ...roster.dayLogs[m.id] })).sort((a, b) => b.minutes - a.minutes) : null;
  return <div className="modal modal-center" onClick={onClose}><div className="day-summary day-editor-modal" onClick={(e) => e.stopPropagation()}>
    <div className="ds-head">
      {editing && <button className="ds-back" onClick={() => setEditing(false)}>‹</button>}
      {!editing && onNavigateDay && <button type="button" className="ds-day-nav" onClick={() => onNavigateDay(-1)}>‹</button>}
      <span className="eyebrow">{new Date(date + "T12:00:00").toLocaleDateString(locale, { weekday: "long", month: "long", day: "numeric" })}</span>
      {!editing && onNavigateDay && <button type="button" className="ds-day-nav" onClick={() => onNavigateDay(1)} disabled={date >= dateKey}>›</button>}
      <button className="close" onClick={onClose}>×</button>
    </div>
    <div className="day-summary-body">
    {editing ? <DayEditor key={date} date={date} log={log} onSave={onSave} onDelete={onDelete} confirm={confirm} language={language} T={T} /> : <>
      {roster ? (
        rosterRows && rosterRows.length ? <div className="challenge-ranking">{rosterRows.map((m) => <div key={m.id} className="roster-detail-row">
          <i style={{ width: 8, height: 8, borderRadius: "50%", background: m.color, flexShrink: 0, marginTop: 4 }} />
          <div className="roster-detail-info">
            <div className="roster-detail-head"><span className="rank-name">{m.name}</span><span className="rank-value">{formatMinutes(m.minutes)}</span></div>
            {m.equipment && <span className="roster-equipment">{equipmentSplitLabel(m.drumsetMinutes, m.padMinutes, T) ?? T.calendar.onEquipment(equipmentLabel(m.equipment, T))}</span>}
            {((m.items && m.items.length > 0) || (m.customItems && m.customItems.length > 0)) && <div className="detail-chips">{Array.from(new Set([...(m.items ?? []), ...(m.customItems ?? [])])).map((item) => <PracticedChip key={item} item={item} skill={(m.skillItems ?? []).includes(item)} language={language} />)}</div>}
            {m.id === roster?.currentUserId && log?.notes && <p className="today-notes"><b>{T.today.notesPrefix}</b> {log.notes}</p>}
          </div>
        </div>)}</div> : <p className="hint">{T.group.noOnePractised}</p>
      ) : (
        hasPractice && log ? <>
          <strong className="ds-minutes">{formatMinutes(log.minutes)} {T.calendar.minPractised}{log.equipment ? ` - ${equipmentSplitLabel(log.drumsetMinutes, log.padMinutes, T) ?? T.calendar.onEquipment(equipmentLabel(log.equipment, T))}` : ""}</strong>
          {(log.items.length > 0 || log.customItems.length > 0 || daySkillExercises.length > 0) && <div className="detail-chips">{Array.from(new Set([...log.items, ...log.customItems, ...daySkillExercises])).map((item) => <PracticedChip key={item} item={item} skill={daySkillExercises.includes(item)} language={language} />)}</div>}
          {log.notes && <p className="today-notes"><b>{T.today.notesPrefix}</b> {log.notes}</p>}
          {dailyGoal != null && <p className={log.minutes >= dailyGoal ? "ds-goal met" : "ds-goal"}>{log.minutes >= dailyGoal ? T.calendar.goalMet : T.calendar.goalMissed(formatMinutes(log.minutes), formatMinutes(dailyGoal))}</p>}
          {streakHere > 1 && <p className="ds-streak">{T.calendar.streakOnDay(streakHere)}</p>}
        </> : <p className="hint">{T.calendar.noPracticeShort}</p>
      )}
      <button className="secondary" onClick={() => setEditing(true)}>{hasPractice ? T.calendar.editDay : T.calendar.nothingToEdit}</button>
    </>}
    </div>
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
  // Collapsed by default so the popup fits on screen -- open automatically if this entry
  // already has items picked, so editing an existing day doesn't hide its own selections.
  const [itemsOpen, setItemsOpen] = useState((log?.items ?? []).length > 0);
  const [hasEntry, setHasEntry] = useState(!!log);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [needItem, setNeedItem] = useState(false);
  function toggle(item: string) { setNeedItem(false); setSelected((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item]); }
  function handleEquipmentToggle(value: "drumset" | "pad") {
    const next = toggleEquipmentValue(equipment, value);
    setEquipment(next);
    if (next === "both") { setDrumsetMinutes(String(Number(minutes) || 0)); setPadMinutes("0"); }
    else { setDrumsetMinutes(""); setPadMinutes(""); }
  }
  function updateDrumsetMinutes(value: string) { setDrumsetMinutes(value); setMinutes(String((Number(value) || 0) + (Number(padMinutes) || 0))); }
  function updatePadMinutes(value: string) { setPadMinutes(value); setMinutes(String((Number(drumsetMinutes) || 0) + (Number(value) || 0))); }
  async function handleSave() {
    // Like Quick Practice, a day with minutes needs at least one practice element, so every log says what was practised.
    if ((Number(minutes) || 0) > 0 && selected.length === 0 && (log?.customItems ?? []).length === 0) { setNeedItem(true); setItemsOpen(true); return; }
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
      <div className="minutes-island compact">
        <button className="minutes-step" onClick={() => setMinutes(String(Math.max(0, (Number(minutes) || 0) - 5)))}>-5</button>
        <button className="minutes-step" onClick={() => setMinutes(String(Math.max(0, (Number(minutes) || 0) - 1)))}>-1</button>
        <div className="minutes-value"><input inputMode="numeric" size={3} value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ""))} /><span>min</span></div>
        <button className="minutes-step" onClick={() => setMinutes(String((Number(minutes) || 0) + 1))}>+1</button>
        <button className="minutes-step" onClick={() => setMinutes(String((Number(minutes) || 0) + 5))}>+5</button>
      </div>
    )}
    </div>
    <div className="form-card">
    <button type="button" className="collapsible-header" onClick={() => setItemsOpen(!itemsOpen)}>
      <span className="input-label checklist-label">{T.today.whatPractised}{selected.length > 0 ? ` (${selected.length})` : ""}</span>
      <span className={itemsOpen ? "collapse-chevron open" : "collapse-chevron"}><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 7.5l5 5 5-5" /></svg></span>
    </button>
    {itemsOpen && <div className="chips">{PRACTICE_ITEMS.map((item) => <button key={item.en} onClick={() => toggle(item.en)} className={selected.includes(item.en) ? "chip selected" : "chip"}>{selected.includes(item.en) && <b>✓</b>}{item[language]}</button>)}</div>}
    <label className="input-label equipment-label">{T.today.equipment}</label>
    <div className="equipment-toggle">
      <button className={equipment === "drumset" || equipment === "both" ? "equipment-option selected" : "equipment-option"} onClick={() => handleEquipmentToggle("drumset")}>{T.today.drumset}</button>
      <button className={equipment === "pad" || equipment === "both" ? "equipment-option selected" : "equipment-option"} onClick={() => handleEquipmentToggle("pad")}>{T.today.pad}</button>
    </div>
    {showNotes ? <><label className="input-label notes-label">{T.today.notes} <em>{T.today.optional}</em></label><textarea maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={T.calendar.notesPlaceholder} autoFocus={notesOpen} /></> : <button className="notes-toggle" onClick={() => setNotesOpen(true)}>{T.today.addNotes}</button>}
    {needItem && <p className="auth-error-inline" role="alert">{T.calendar.pickOneItem}</p>}
    <button className={saved ? "save saved" : "save"} onClick={handleSave} disabled={busy}>{saved ? T.today.practiceSaved : busy ? T.calendar.saving : T.today.savePractice}<span>→</span></button>
    {hasEntry && <button className="delete-entry" onClick={handleDelete} disabled={busy}>{T.calendar.deleteEntry}</button>}
  </div>
  </>;
}
function Stat({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><strong>{value}</strong></div>; }
function TeacherBadge({ T }: { T: any }) {
  return <span className="teacher-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l9 4.5-9 4.5-9-4.5L12 3z" /><path d="M7 10.5V16c0 1.1 2.24 2 5 2s5-.9 5-2v-5.5" /></svg>{T.group.teacherBadge}</span>;
}
// Trophy/medal/consistency/streak/challenge/improved silhouettes are Lucide's (ISC license,
// lucide.dev) -- their proportions are hand-tuned by icon designers, not something worth
// re-drawing from scratch. The gold fill + star/shine accents are the only custom part,
// layered on top to match this app's palette.
type AwardIconId = "trophy" | "medal" | "consistency" | "streak" | "challenge" | "improved";
const AWARD_ICON_PATHS: Record<string, React.ReactNode> = {
  trophy: <>
    <defs><linearGradient id="award-gold-trophy" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ffe08a" /><stop offset="100%" stopColor="#f0b429" /></linearGradient></defs>
    <path d="M10 14.66V17a1 1 0 0 1-1 1 2 2 0 0 0-2 2v2" />
    <path d="M14 14.66V17a1 1 0 0 0 1 1 2 2 0 0 1 2 2v2" />
    <path d="M17.916 10H19.5A2.5 2.5 0 0 0 22 7.5V5a1 1 0 0 0-1-1h-3" />
    <path d="M4 22h16" />
    <path d="M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z" fill="url(#award-gold-trophy)" stroke="#ffe08a" strokeWidth="1.3" />
    <ellipse cx="9" cy="5.6" rx="0.9" ry="1.7" fill="#fff3d6" opacity="0.6" transform="rotate(-15 9 5.6)" />
    <path d="M6.084 10H4.5A2.5 2.5 0 0 1 2 7.5V5a1 1 0 0 1 1-1h3" />
  </>,
  medal: <>
    <defs><radialGradient id="award-gold-medal" cx="35%" cy="30%" r="75%"><stop offset="0%" stopColor="#fff0c2" /><stop offset="55%" stopColor="#f6c445" /><stop offset="100%" stopColor="#d99a1f" /></radialGradient></defs>
    <path d="m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526" />
    <circle cx="12" cy="8" r="6" fill="url(#award-gold-medal)" stroke="#ffe9ad" strokeWidth="1.3" />
    <path d="M12 5.3l1 2.1 2.3.35-1.65 1.6.4 2.25-2.05-1.1-2.05 1.1.4-2.25-1.65-1.6 2.3-.35z" fill="#fff8e6" stroke="none" />
  </>,
  consistency: <>
    <defs><linearGradient id="award-gold-consistency" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ffe08a" /><stop offset="100%" stopColor="#f0b429" /></linearGradient></defs>
    <path d="M8 2v3" /><path d="M16 2v3" />
    <rect x="3" y="3" width="18" height="18" rx="2" fill="url(#award-gold-consistency)" stroke="#ffe08a" strokeWidth="1.3" />
    <path d="M3 9h18" stroke="#8a5a1a" strokeWidth="1.4" />
    <path d="m9 15.2 2 2 4-4.2" stroke="#7a3f0c" strokeWidth="2.1" />
  </>,
  streak: <>
    <defs><linearGradient id="award-gold-streak" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ffdc7a" /><stop offset="55%" stopColor="#ffb029" /><stop offset="100%" stopColor="#e2580c" /></linearGradient></defs>
    <path d="M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4" fill="url(#award-gold-streak)" stroke="#ffe6ad" strokeWidth="1.2" />
    <ellipse cx="11" cy="15" rx="1" ry="1.8" fill="#fff3d6" opacity="0.55" />
  </>,
  challenge: <>
    <defs><radialGradient id="award-gold-challenge" cx="35%" cy="30%" r="75%"><stop offset="0%" stopColor="#fff0c2" /><stop offset="55%" stopColor="#f6c445" /><stop offset="100%" stopColor="#d99a1f" /></radialGradient></defs>
    <circle cx="12" cy="12" r="10" fill="url(#award-gold-challenge)" stroke="#ffe9ad" strokeWidth="1.2" />
    <circle cx="12" cy="12" r="6" fill="none" stroke="#c2571a" strokeWidth="1.4" opacity="0.6" />
    <circle cx="12" cy="12" r="2" fill="#8a3d10" stroke="none" />
  </>,
  improved: <>
    <defs><radialGradient id="award-gold-improved" cx="40%" cy="30%" r="80%"><stop offset="0%" stopColor="#fff3d6" /><stop offset="60%" stopColor="#ffcf5e" /><stop offset="100%" stopColor="#e8a021" /></radialGradient></defs>
    <path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z" fill="url(#award-gold-improved)" stroke="#ffe9ad" strokeWidth="1.2" />
    <path d="M20 2v4" /><path d="M22 4h-4" /><circle cx="4" cy="20" r="2" />
  </>,
};
// Award icons render only inside the Medal Board popup now (rows built below), not scattered
// next to names elsewhere -- see MedalBoardModal. Extensibility lives in that row list: one
// more row (icon + title + holder + value) covers a future award type, no structural change.
function MedalBoardModal({ daysTotals, totals, weeklyRows, onClose, T }: any) {
  const allTimeRows = [
    { icon: "trophy" as const, title: T.group.awardMostDays, leader: daysTotals[0], hasValue: (daysTotals[0]?.days ?? 0) > 0, value: daysTotals[0] ? `${daysTotals[0].days} / ${daysTotals[0].totalDays}` : "" },
    { icon: "medal" as const, title: T.group.awardMostMinutes, leader: totals[0], hasValue: (totals[0]?.total ?? 0) > 0, value: totals[0] ? formatMinutes(totals[0].total) : "" },
  ];
  const renderRow = (row: any) => <div key={row.icon} className="admin-log-row medal-board-row">
    <span className="medal-board-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{AWARD_ICON_PATHS[row.icon]}</svg></span>
    <div className="medal-board-info">
      <span className="medal-board-title">{row.title}</span>
      <span className="medal-board-holder">{row.hasValue ? row.leader.name : T.group.medalBoardEmpty}</span>
    </div>
    {row.hasValue && <span className="medal-board-value">{row.value}</span>}
  </div>;
  return <div className="modal modal-center" onClick={onClose}><div className="day-summary" onClick={(e) => e.stopPropagation()}>
    <div className="ds-head">
      <span className="eyebrow">{T.group.medalBoard}</span>
      <button className="close" onClick={onClose}>×</button>
    </div>
    <div className="day-summary-body">
      <span className="ladder-label">{T.group.medalBoardAllTime}</span>
      <div className="admin-log-list">{allTimeRows.map(renderRow)}</div>
      {weeklyRows && weeklyRows.length > 0 && <>
        <span className="ladder-label admin-section-gap">{T.group.medalBoardThisWeek}</span>
        <div className="admin-log-list">{weeklyRows.map(renderRow)}</div>
      </>}
    </div>
  </div></div>;
}
function GroupSettingsModal({ group, setGroupSetting, setGroupDateMode, onClose, T }: any) {
  return <div className="modal modal-center" onClick={onClose}><div className="day-summary" onClick={(e) => e.stopPropagation()}>
    <div className="ds-head">
      <span className="eyebrow">{T.group.groupSettings}</span>
      <button className="close" onClick={onClose}>×</button>
    </div>
    <div className="day-summary-body">
      <h2 className="edit-rating-title">{group.name}</h2>
      <div className="admin-settings-list admin-settings-list-nodivider">
        <div className="admin-settings-row admin-settings-row-stack">
          <span>{T.group.countFromCreation}</span>
          <span className="toggle-row-desc">{T.group.countFromCreationDesc}</span>
          <div className="admin-mini-toggle">
            <button type="button" className={!group.stats_start_date && !group.count_days_from_creation ? "selected" : ""} onClick={() => setGroupDateMode("calendar")}>{T.group.dateModeCalendar}</button>
            <button type="button" className={!group.stats_start_date && group.count_days_from_creation ? "selected" : ""} onClick={() => setGroupDateMode("creation")}>{T.group.dateModeToday}</button>
            <button type="button" className={group.stats_start_date ? "selected" : ""} onClick={() => setGroupDateMode("custom")}>{T.group.dateModeCustom}</button>
          </div>
          {group.stats_start_date && <DateDMY value={group.stats_start_date} max={dateKey} onChange={(v) => setGroupDateMode("custom", v)} />}
        </div>
        <div className="admin-settings-row">
          <span>{T.group.showTeacherStats}</span>
          <div className="admin-mini-toggle">
            <button type="button" className={!group.show_teacher_stats ? "selected" : ""} onClick={() => setGroupSetting("show_teacher_stats", "p_show_teacher_stats", false)}>{T.admin.pointGameOff}</button>
            <button type="button" className={group.show_teacher_stats ? "selected" : ""} onClick={() => setGroupSetting("show_teacher_stats", "p_show_teacher_stats", true)}>{T.admin.pointGameOn}</button>
          </div>
        </div>
        <div className="admin-settings-row">
          <span>{T.group.enableWeeklyAwards}</span>
          <div className="admin-mini-toggle">
            <button type="button" className={!group.weekly_awards_enabled ? "selected" : ""} onClick={() => setGroupSetting("weekly_awards_enabled", "p_weekly_awards_enabled", false)}>{T.admin.pointGameOff}</button>
            <button type="button" className={group.weekly_awards_enabled ? "selected" : ""} onClick={() => setGroupSetting("weekly_awards_enabled", "p_weekly_awards_enabled", true)}>{T.admin.pointGameOn}</button>
          </div>
        </div>
      </div>
    </div>
  </div></div>;
}

function Group({ onGroupCount, user, setError, logs, dailyGoal, saveLogFor, deleteLogFor, confirm, language, T, cheers, cheersSeenAt, onCheersSeen, onCheersChanged, groupPickerKey }: { groupPickerKey: number; cheers: Cheer[]; cheersSeenAt: string; onCheersSeen: () => void; onCheersChanged: () => void; onGroupCount?: (n: number) => void; user: any; setError: (message: string) => void; logs: Record<string, Log>; dailyGoal: number | null; saveLogFor: SaveLogFor; deleteLogFor: (date: string) => Promise<boolean>; confirm: (message: string) => Promise<boolean>; language: Lang; T: any }) {
  const [mode, setMode] = useState<"start" | "create" | "join">("start"); const [name, setName] = useState(""); const [code, setCode] = useState(""); const [groups, setGroups] = useState<any[]>([]); const [activeGroupId, setActiveGroupId] = useState<string | null>(null); const [addingGroup, setAddingGroup] = useState(false); const [busy, setBusy] = useState(false);
  // New-group setup defaults -- practice tracking defaults to "from today" (matching the
  // suggested creation-form layout), everything else defaults on. Existing groups are
  // unaffected: their columns default the opposite way at the DB level (see schema.sql), these
  // only apply to what THIS form inserts for a brand new group.
  const [newDateMode, setNewDateMode] = useState<"calendar" | "creation" | "custom">("creation");
  const [newCustomStartDate, setNewCustomStartDate] = useState(dateKey);
  const [newShowTeacherStats, setNewShowTeacherStats] = useState(true);
  const [newWeeklyAwards, setNewWeeklyAwards] = useState(true);
  const group = useMemo(() => groups.find((g) => g.id === activeGroupId) ?? null, [groups, activeGroupId]);
  const [groupLoading, setGroupLoading] = useState(true);
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [members, setMembers] = useState<{ id: string; name: string; color: string }[]>([]);
  const [totals, setTotals] = useState<{ id: string; name: string; color: string; total: number }[]>([]);
  const [weekTotals, setWeekTotals] = useState<{ id: string; name: string; color: string; total: number }[]>([]);
  const [timeView, setTimeView] = useState<"all" | "week">("all");
  const [daysTotals, setDaysTotals] = useState<{ id: string; name: string; color: string; days: number; totalDays: number }[]>([]);
  const [groupImprovements, setGroupImprovements] = useState<{ key: string; name: string; exerciseEn: string; bpm: number; date: string }[]>([]);
  const [weeklyAwards, setWeeklyAwards] = useState<{ icon: AwardIconId; title: string; leader: { id: string; name: string } | null; hasValue: boolean; value: string }[]>([]);
  const [showMedalBoard, setShowMedalBoard] = useState(false);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [viewDate, setViewDate] = useState(() => new Date());
  const [monthLogs, setMonthLogs] = useState<Record<string, Record<string, number>>>({});
  const [summaryDayKey, setSummaryDayKey] = useState<string | null>(null);
  const [dayDetailLogs, setDayDetailLogs] = useState<Record<string, { minutes: number; seconds: number; equipment: string | null; drumsetMinutes: number | null; padMinutes: number | null; items: string[]; customItems: string[]; notes: string; skillItems: string[] }>>({});
  const [copied, setCopied] = useState(false);
  const [challenges, setChallenges] = useState<any[]>([]);
  const [showNewChallenge, setShowNewChallenge] = useState(false);
  const [challengeName, setChallengeName] = useState("");
  const [challengeType, setChallengeType] = useState<"daily" | "minutes" | "sessions">("sessions");
  const [challengeGoal, setChallengeGoal] = useState("5");
  const [showCustomDates, setShowCustomDates] = useState(false);
  const [showStakes, setShowStakes] = useState(false);
  const [challengeStart, setChallengeStart] = useState(dateKey);
  const [challengeEnd, setChallengeEnd] = useState(shiftDateKey(dateKey, 6));
  const [challengeReward, setChallengeReward] = useState("");
  const [challengePunishment, setChallengePunishment] = useState("");
  const [challengeBusy, setChallengeBusy] = useState(false);
  const locale = localeFor(language);
  const [showCheerSheet, setShowCheerSheet] = useState(false);
  const [cheerTo, setCheerTo] = useState<string | null>(null);
  const [cheerToast, setCheerToast] = useState(false);
  const [cheerBusy, setCheerBusy] = useState(false);
  // Removing a cheer: your own are deleted for everyone (an undo); cheers from others are only hidden on this device
  // (a per-viewer convenience, so it lives in localStorage).
  const hiddenKey = `cheers_hidden_${user.id}`;
  const [hiddenCheers, setHiddenCheers] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(hiddenKey) ?? "[]"); } catch { return []; } });
  async function removeCheer(c: { id: string; from_user: string }) {
    if (c.from_user === user.id) {
      const { error } = await supabase.from("group_cheers").delete().eq("id", c.id);
      if (error) { setError(error.message); return false; }
      onCheersChanged();
      return true;
    }
    const next = [...hiddenCheers, c.id].slice(-200);
    setHiddenCheers(next);
    try { localStorage.setItem(hiddenKey, JSON.stringify(next)); } catch {}
    return true;
  }
  async function toggleHeart(c: Cheer) {
    const mineHeart = c.hearts.some((h) => h.user_id === user.id);
    const { error } = mineHeart
      ? await supabase.from("group_cheer_hearts").delete().eq("cheer_id", c.id).eq("user_id", user.id)
      : await supabase.from("group_cheer_hearts").insert({ cheer_id: c.id, user_id: user.id });
    if (error) { setError(error.message); return; }
    onCheersChanged();
  }
  const [lastSentCheerId, setLastSentCheerId] = useState<string | null>(null);
  const [showCheerInbox, setShowCheerInbox] = useState(false);
  const [challengeMenuId, setChallengeMenuId] = useState<string | null>(null);
  const [openChallenge, setOpenChallenge] = useState<string | null>(null);
  const [showAllImprovements, setShowAllImprovements] = useState(false);
  const [showGroupMore, setShowGroupMore] = useState(false);
  // The "tap a name" hint is only needed until someone has sent their first cheer to a person.
  const [cheerHintSeen, setCheerHintSeen] = useState(() => { try { return localStorage.getItem("cheer_hint_seen") === "1"; } catch { return false; } });
  // Tapping the Group tab again (or the group's name) opens a small list to switch between groups.
  const [showGroupPicker, setShowGroupPicker] = useState(false);
  const pickerKeySeen = useRef(groupPickerKey);
  useEffect(() => {
    if (groupPickerKey === pickerKeySeen.current) return;
    pickerKeySeen.current = groupPickerKey;
    if (groups.length > 1) setShowGroupPicker(true);
  }, [groupPickerKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { onGroupCount?.(groups.length); }, [groups.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const [inboxSeenAt, setInboxSeenAt] = useState("");
  // Opening the bell marks everything as seen, but the cheers that were new stay highlighted while it is open.
  function openCheerInbox() { setInboxSeenAt(cheersSeenAt); setShowCheerInbox(true); onCheersSeen(); }
  function openCheerFor(userId: string | null) { if (userId) { setCheerHintSeen(true); try { localStorage.setItem("cheer_hint_seen", "1"); } catch {} } setCheerTo(userId); setShowCheerInbox(false); setShowCheerSheet(true); }
  async function sendCheer(key: string) {
    if (!group || cheerBusy) return;
    setCheerBusy(true);
    const { data: inserted, error } = await supabase.from("group_cheers").insert({ group_id: group.id, from_user: user.id, to_user: cheerTo, cheer_key: key }).select("id").single();
    setCheerBusy(false);
    if (error) { setError(error.message || T.cheers.couldNotSend); return; }
    setShowCheerSheet(false);
    setCheerTo(null);
    setLastSentCheerId(inserted?.id ?? null);
    setCheerToast(true);
    window.setTimeout(() => setCheerToast(false), 5000);
    onCheersChanged();
  }
  const groupCheers = group ? cheers.filter((c) => c.group_id === group.id && !hiddenCheers.includes(c.id)) : [];
  const unreadCount = cheerUnreadCount(groupCheers, user.id, cheersSeenAt);
  const presetOptions = [
    { ...CHALLENGE_PRESETS[0], label: T.group.presetDaily5 },
    { ...CHALLENGE_PRESETS[1], label: T.group.presetDaily30x5 },
    { ...CHALLENGE_PRESETS[2], label: T.group.presetSessions3weekly },
    { ...CHALLENGE_PRESETS[3], label: T.group.presetDaily5x20 },
  ];
  // Fetches one group's members/leaderboard/days-practiced data, WITHOUT clearing the previous
  // group's data first -- callers only swap the state once the new data has actually arrived, so
  // switching groups (or the very first load) never shows an in-between empty state.
  async function loadGroupDetail(targetGroup: any) {
    if (!targetGroup) { setTeacherId(null); setMembers([]); setTotals([]); setWeekTotals([]); setDaysTotals([]); setGroupImprovements([]); setWeeklyAwards([]); return; }
    const [{ data }, { data: teacherIdRes }] = await Promise.all([
      supabase.from("group_members").select("user_id, profiles(name, color)").eq("group_id", targetGroup.id).order("user_id"),
      supabase.rpc("group_teacher_id", { target_group_id: targetGroup.id }),
    ]);
    const resolvedTeacherId: string | null = teacherIdRes ?? null;
    const memberList = applyGroupPalette((data ?? []).map((row: any) => ({ id: row.user_id, name: row.profiles?.name ?? "Drummer", color: row.profiles?.color ?? autoColorForUserId(row.user_id) })), user.id);
    const memberIds = memberList.map((m: any) => m.id);
    // A group's admin stays a full member (roster/calendar legend) even with stats
    // hidden -- only the ranked leaderboard arrays below exclude them. This applies to the
    // admin's own view too, not just students': hiding stats hides them from everyone,
    // including the admin looking at their own group.
    const statsMembers = (resolvedTeacherId && !targetGroup.show_teacher_stats) ? memberList.filter((m: any) => m.id !== resolvedTeacherId) : memberList;
    let totalsResult: any[] = [];
    let weekTotalsResult: any[] = [];
    let daysTotalsResult: any[] = [];
    let improvementsResult: { key: string; id: string; name: string; exerciseEn: string; bpm: number; date: string }[] = [];
    let weeklyAwardsResult: { icon: AwardIconId; title: string; leader: { id: string; name: string } | null; hasValue: boolean; value: string }[] = [];
    if (memberIds.length) {
      const createdAt = String(targetGroup.created_at).slice(0, 10);
      // Practice-day/time-practised counting window: either a specific date the teacher picked
      // (stats_start_date), "from this group's creation date" (count_days_from_creation), or
      // the default calendar year (Jan1-Dec31 for days, all-time-since-creation for total
      // minutes) -- otherwise a group created mid-year makes a recent joiner's "150/365" look
      // worse than it is. A custom date takes priority over the plain from-creation flag.
      const effectiveStart = groupStatsStart(targetGroup);
      const since = effectiveStart ?? createdAt;
      const yearStart = effectiveStart ?? `${dateKey.slice(0, 4)}-01-01`;
      const yearEnd = effectiveStart ? dateKey : `${dateKey.slice(0, 4)}-12-31`;
      const totalDaysElapsed = effectiveStart ? Math.max(1, Math.round((new Date(dateKey + "T12:00:00").getTime() - new Date(yearStart + "T12:00:00").getTime()) / 86400000) + 1) : 365;
      const [logsRes, yearRes, sessionsRes, exerciseRows] = await Promise.all([
        supabase.from("group_practice_logs").select("user_id, minutes").in("user_id", memberIds).gte("practiced_on", since),
        supabase.from("group_practice_logs").select("user_id, practiced_on, minutes").in("user_id", memberIds).gte("practiced_on", yearStart).lte("practiced_on", yearEnd),
        supabase.from("group_practice_sessions").select("user_id,practice_exercise_id,bpm,rating,duration_minutes,practiced_on").in("user_id", memberIds).order("practiced_on"),
        supabase.from("practice_exercises").select("id,name_en"),
      ]);
      const sums: Record<string, number> = {};
      (logsRes.data ?? []).forEach((row: any) => { sums[row.user_id] = (sums[row.user_id] ?? 0) + row.minutes; });
      totalsResult = statsMembers.map((m: any) => ({ ...m, total: sums[m.id] ?? 0 })).sort((a: any, b: any) => b.total - a.total);
      // "This week" totals (Monday through today, same window as the weekly awards below) reuse
      // yearRes -- it already covers this range (yearStart is always Jan 1 or an even earlier
      // custom stats-start date), so no extra query is needed.
      const weekStart = weekStartKey;
      const weekSums: Record<string, number> = {};
      (yearRes.data ?? []).forEach((row: any) => { if (row.practiced_on >= weekStart) weekSums[row.user_id] = (weekSums[row.user_id] ?? 0) + row.minutes; });
      weekTotalsResult = statsMembers.map((m: any) => ({ ...m, total: weekSums[m.id] ?? 0 })).sort((a: any, b: any) => b.total - a.total);
      const daySets: Record<string, Set<string>> = {};
      (yearRes.data ?? []).forEach((row: any) => {
        if (row.minutes <= 0) return;
        if (!daySets[row.user_id]) daySets[row.user_id] = new Set();
        daySets[row.user_id].add(row.practiced_on);
      });
      daysTotalsResult = statsMembers.map((m: any) => ({ ...m, days: daySets[m.id]?.size ?? 0, totalDays: totalDaysElapsed })).sort((a: any, b: any) => b.days - a.days);
      // Same tempo-unlock detection as the admin dashboard's "Recent Improvements" board, scoped
      // to this group's own members instead of every student in the app.
      const exerciseNames: Record<string, string> = Object.fromEntries((exerciseRows.data ?? []).map((r: any) => [r.id, r.name_en]));
      const byUserExercise: Record<string, any[]> = {};
      const hideAdminSessions = resolvedTeacherId && !targetGroup.show_teacher_stats;
      (sessionsRes.data ?? []).forEach((s: any) => {
        if (hideAdminSessions && s.user_id === resolvedTeacherId) return;
        const key = `${s.user_id}::${s.practice_exercise_id}`; (byUserExercise[key] ??= []).push(s);
      });
      Object.entries(byUserExercise).forEach(([key, sess]) => {
        const [uid, exerciseId] = key.split("::");
        const exerciseEn = exerciseNames[exerciseId];
        if (!exerciseEn) return;
        const levels = bpmLevelsFor(exerciseEn);
        const dates = Array.from(new Set(sess.map((s) => s.practiced_on))).sort();
        const qualifyingByBpm: Record<number, number> = {};
        let previousHighest: number | null = null;
        const meta = memberList.find((m) => m.id === uid);
        const name = meta?.name ?? uid;
        dates.forEach((date) => {
          sess.filter((s) => s.practiced_on === date).forEach((s) => {
            if (s.rating === "comfortable" || s.rating === "mastered") qualifyingByBpm[s.bpm] = (qualifyingByBpm[s.bpm] ?? 0) + s.duration_minutes;
          });
          const unlocked = levels.filter((l) => (qualifyingByBpm[l] ?? 0) >= UNLOCK_MINUTES);
          const highest = unlocked.length ? Math.max(...unlocked) : null;
          if (highest !== null && highest !== previousHighest) improvementsResult.push({ key: `${key}::${date}`, id: uid, name, exerciseEn, bpm: highest, date });
          previousHighest = highest;
        });
      });
      improvementsResult.sort((a, b) => b.date.localeCompare(a.date));
      // Weekly recognition (opt-in per group, off by default): four categories built from data
      // already fetched above, not a second "most minutes" leaderboard -- each looks at a
      // different signal so recognition can land on a different student each week instead of
      // always the same top practicer.
      if (targetGroup.weekly_awards_enabled) {
        const weekDayCounts: Record<string, number> = {};
        const logsByMember: Record<string, Record<string, { minutes: number }>> = {};
        (yearRes.data ?? []).forEach((row: any) => {
          (logsByMember[row.user_id] ??= {})[row.practiced_on] = { minutes: row.minutes };
          if (row.minutes > 0 && row.practiced_on >= weekStart) weekDayCounts[row.user_id] = (weekDayCounts[row.user_id] ?? 0) + 1;
        });
        const streakByMember: Record<string, number> = {};
        statsMembers.forEach((m: any) => { streakByMember[m.id] = calculateStreaks((logsByMember[m.id] ?? {}) as any, dateKey).current; });
        const weekImprovedCounts: Record<string, number> = {};
        improvementsResult.forEach((ev) => { if (ev.date >= weekStart) weekImprovedCounts[ev.id] = (weekImprovedCounts[ev.id] ?? 0) + 1; });
        const pickTop = (counts: Record<string, number>) => {
          let best: { id: string; value: number } | null = null;
          statsMembers.forEach((m: any) => { const v = counts[m.id] ?? 0; if (v > 0 && (!best || v > best.value)) best = { id: m.id, value: v }; });
          return best;
        };
        const toRow = (icon: AwardIconId, title: string, top: { id: string; value: number } | null, valueLabel: (v: number) => string): typeof weeklyAwardsResult[number] => {
          const leader = top ? statsMembers.find((m: any) => m.id === top.id) ?? null : null;
          return { icon, title, leader: leader ? { id: leader.id, name: leader.name } : null, hasValue: !!top, value: top ? valueLabel(top.value) : "" };
        };
        weeklyAwardsResult = [
          toRow("consistency", T.group.awardConsistency, pickTop(weekDayCounts), (v) => T.group.awardDaysValue(v)),
          toRow("streak", T.group.awardStreak, pickTop(streakByMember), (v) => T.group.awardDaysValue(v)),
          toRow("improved", T.group.awardImproved, pickTop(weekImprovedCounts), (v) => T.group.awardUnlocksValue(v)),
        ];
      }
    }
    setWeeklyAwards(weeklyAwardsResult);
    setTeacherId(resolvedTeacherId);
    setMembers(memberList);
    setTotals(totalsResult);
    setWeekTotals(weekTotalsResult);
    setDaysTotals(daysTotalsResult);
    setGroupImprovements(improvementsResult.slice(0, 5));
  }
  useEffect(() => {
    // Combines the groups list and the active group's detail into one continuous fetch chain
    // (rather than two separate effects/round trips) and only reveals the screen once both are
    // done, instead of showing the groups list first and then the leaderboard popping in after.
    (async () => {
      const { data } = await supabase.from("group_members").select("groups(id,name,invite_code,created_at,created_by,show_teacher_stats,count_days_from_creation,weekly_awards_enabled,stats_start_date)").eq("user_id", user.id).order("joined_at", { ascending: true });
      const list = (data ?? []).map((row: any) => row.groups).filter(Boolean);
      const nextId = (activeGroupId && list.some((g: any) => g.id === activeGroupId)) ? activeGroupId : (list[0]?.id ?? null);
      await loadGroupDetail(list.find((g: any) => g.id === nextId) ?? null);
      setGroups(list);
      setActiveGroupId(nextId);
      setGroupLoading(false);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    })();
  }, [user]);
  // Runs on every later group SWITCH (the mount guard skips the initial run, already handled
  // above). loadGroupDetail doesn't clear the old group's data until the new data is ready, so
  // switching groups swaps directly to the new leaderboard instead of flashing empty in between.
  const didMountGroupSwitch = useRef(false);
  useEffect(() => {
    if (!didMountGroupSwitch.current) { didMountGroupSwitch.current = true; return; }
    if (!group) { setMembers([]); setTotals([]); setWeekTotals([]); setDaysTotals([]); setChallenges([]); setWeeklyAwards([]); return; }
    loadGroupDetail(group);
  }, [group]);
  useEffect(() => { loadChallenges(); }, [group, members]);
  useEffect(() => {
    if (!group || !members.length) { setMonthLogs({}); return; }
    const year = viewDate.getFullYear(); const month = viewDate.getMonth();
    const monthStart = formatLocalDate(year, month, 1);
    const monthEnd = formatLocalDate(year, month, new Date(year, month + 1, 0).getDate());
    const memberIds = members.map((m) => m.id);
    // Same start date the leaderboards use (custom date, or the group's own creation date) --
    // days before it are outside the group's tracking window, so the calendar shouldn't show
    // activity for them even though the underlying practice_logs rows exist.
    const statsStart = groupStatsStart(group);
    supabase.from("group_practice_logs").select("practiced_on, user_id, minutes").in("user_id", memberIds).gte("practiced_on", monthStart).lte("practiced_on", monthEnd).then(({ data }) => {
      // Same hide-admin-stats rule as the leaderboards, applied to everyone including the
      // admin's own view -- students already get this for free via RLS (they never receive
      // the admin's rows at all when hidden), but the admin's own query still gets their own
      // rows back (they can always see their own data), so it needs an explicit client filter.
      const hideAdmin = teacherId && !group.show_teacher_stats;
      const byDay: Record<string, Record<string, number>> = {};
      (data ?? []).forEach((row: any) => {
        if (hideAdmin && row.user_id === teacherId) return;
        if (statsStart && row.practiced_on < statsStart) return;
        if (row.minutes > 0) byDay[row.practiced_on] = { ...(byDay[row.practiced_on] ?? {}), [row.user_id]: row.minutes };
      });
      setMonthLogs(byDay);
    });
  }, [group, members, viewDate, teacherId]);
  useEffect(() => {
    if (!summaryDayKey || !members.length) { setDayDetailLogs({}); return; }
    const statsStart = groupStatsStart(group);
    if (statsStart && summaryDayKey < statsStart) { setDayDetailLogs({}); return; }
    const memberIds = members.map((m) => m.id);
    const hideAdmin = teacherId && group && !group.show_teacher_stats;
    // Skill Trainer sessions save separately from a day's practice_logs tags (see
    // logPracticeSession) -- fetched and merged in here the same way it already is for the
    // TODAY card, Admin's daily logs, and Home's own calendar, so a group member's day that was
    // entirely Skill Trainer doesn't show a blank/incomplete chip list to the rest of the group.
    Promise.all([
      supabase.from("group_practice_logs").select("user_id,minutes,seconds,equipment,drumset_minutes,pad_minutes,custom_items,practice_log_items(practice_items(name_en))").eq("practiced_on", summaryDayKey).in("user_id", memberIds),
      supabase.from("group_practice_sessions").select("user_id,practice_exercises(name_en)").eq("practiced_on", summaryDayKey).in("user_id", memberIds),
    ]).then(([logsRes, sessionsRes]) => {
      const byUser: Record<string, { minutes: number; seconds: number; equipment: string | null; drumsetMinutes: number | null; padMinutes: number | null; items: string[]; customItems: string[]; notes: string; skillItems: string[] }> = {};
      (logsRes.data ?? []).forEach((row: any) => {
        if (hideAdmin && row.user_id === teacherId) return;
        byUser[row.user_id] = { minutes: row.minutes, seconds: row.seconds ?? 0, equipment: row.equipment ?? null, drumsetMinutes: row.drumset_minutes ?? null, padMinutes: row.pad_minutes ?? null, customItems: row.custom_items ?? [], notes: row.notes ?? "", items: (row.practice_log_items ?? []).map((entry: any) => entry.practice_items?.name_en).filter(Boolean), skillItems: [] };
      });
      (sessionsRes.data ?? []).forEach((row: any) => {
        if (hideAdmin && row.user_id === teacherId) return;
        const exerciseEn = row.practice_exercises?.name_en;
        if (!exerciseEn || !byUser[row.user_id]) return;
        if (!byUser[row.user_id].items.includes(exerciseEn)) byUser[row.user_id].items.push(exerciseEn);
        if (!byUser[row.user_id].skillItems.includes(exerciseEn)) byUser[row.user_id].skillItems.push(exerciseEn);
      });
      setDayDetailLogs(byUser);
    });
  }, [summaryDayKey, members, group, teacherId]);
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
    const { data: logRows } = await supabase.from("group_practice_logs").select("practiced_on,minutes,user_id").in("user_id", memberIds).gte("practiced_on", earliestStart);
    const logsByUser: Record<string, Record<string, number>> = {};
    (logRows ?? []).forEach((row: any) => { logsByUser[row.user_id] = { ...(logsByUser[row.user_id] ?? {}), [row.practiced_on]: row.minutes }; });
    const enriched = list.map((c: any) => {
      const participants = (memberRows ?? []).filter((m: any) => m.challenge_id === c.id);
      const joined = participants.some((m: any) => m.user_id === user.id);
      // Same hide-admin-stats rule as the leaderboards, including for the admin's own view:
      // a hidden admin's own challenge progress/ranking spot is a competitive stat too, so
      // it's excluded here as well.
      const hideTeacher = teacherId && group && !group.show_teacher_stats;
      const rankedParticipants = hideTeacher ? participants.filter((m: any) => m.user_id !== teacherId) : participants;
      const ranking = rankedParticipants.map((p: any) => {
        const member = members.find((m) => m.id === p.user_id);
        const { progress, target } = computeChallengeProgress(c.goal_type, c.goal_value, c.start_date, c.end_date, logsByUser[p.user_id] ?? {});
        return { id: p.user_id, name: member?.name ?? "Drummer", progress, target };
      }).sort((a, b) => b.progress - a.progress);
      const mine = ranking.find((r) => r.id === user.id);
      return { ...c, joined, participantCount: rankedParticipants.length, progress: mine?.progress ?? 0, target: mine?.target ?? c.goal_value, ranking };
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
    const joinRes = await supabase.from("challenge_members").insert({ challenge_id: data.id, user_id: user.id });
    if (joinRes.error) setError(joinRes.error.message);
    setChallengeName(""); setChallengeGoal("5"); setChallengeReward(""); setChallengePunishment(""); setChallengeStart(dateKey); setChallengeEnd(shiftDateKey(dateKey, 6)); setShowCustomDates(false); setShowStakes(false); setShowNewChallenge(false); setChallengeBusy(false);
    loadChallenges();
  }
  // 4th weekly category: best progress on a currently-active challenge. `challenges` (from
  // loadChallenges) already excludes a hidden teacher's own ranking row, so no extra filtering
  // is needed here.
  const challengeAward = useMemo(() => {
    if (!group || !group.weekly_awards_enabled) return null;
    const entries: { id: string; name: string; value: number }[] = [];
    challenges.forEach((c: any) => {
      if (c.start_date > dateKey || c.end_date < dateKey) return;
      (c.ranking ?? []).forEach((r: any) => {
        const pct = r.target > 0 ? r.progress / r.target : 0;
        if (pct > 0) entries.push({ id: r.id, name: r.name, value: pct });
      });
    });
    const best = entries.reduce((top: { id: string; name: string; value: number } | null, e) => (!top || e.value > top.value ? e : top), null);
    return { icon: "challenge" as AwardIconId, title: T.group.awardChallenge, leader: best ? { id: best.id, name: best.name } : null, hasValue: !!best, value: best ? T.group.awardChallengeValue(Math.round(best.value * 100)) : "" };
  }, [group, challenges, T]);
  async function createGroup() {
    setBusy(true);
    const invite = Math.random().toString(36).slice(2, 8).toUpperCase();
    const { data, error } = await supabase.from("groups").insert({
      name, invite_code: invite, created_by: user.id,
      count_days_from_creation: newDateMode === "creation", stats_start_date: newDateMode === "custom" ? newCustomStartDate : null,
      show_teacher_stats: newShowTeacherStats, weekly_awards_enabled: newWeeklyAwards,
    }).select().single();
    if (!error && data) {
      const member = await supabase.from("group_members").insert({ group_id: data.id, user_id: user.id, role: "owner" });
      if (!member.error) {
        setGroups((current) => [...current, data]); setActiveGroupId(data.id); setAddingGroup(false); setMode("start"); setName("");
        setNewDateMode("creation"); setNewCustomStartDate(dateKey); setNewShowTeacherStats(true); setNewWeeklyAwards(true);
      }
      else setError(member.error.message);
    } else setError(error?.message ?? T.group.couldNotCreate);
    setBusy(false);
  }
  async function joinGroup() {
    setBusy(true);
    // Looking up the group and inserting the membership row both happen server-side inside
    // join_group_by_code (security definer), so the invite code is actually verified — the client
    // can no longer join a group by guessing/enumerating group_id directly. See schema.sql.
    const { data, error } = await supabase.rpc("join_group_by_code", { p_code: code.trim() });
    const joined = data && data.length ? data[0] : null;
    if (error || !joined) { setError(T.group.inviteNotFound); setBusy(false); return; }
    setGroups((current) => current.some((g) => g.id === joined.id) ? current : [...current, joined]);
    setActiveGroupId(joined.id);
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
  // Re-validated server-side by admin_set_group_settings itself (checks is_admin() and
  // membership in this exact group) -- the client only decides whether to SHOW the controls.
  // `key` is the local groups-state field name; `param` is that field's RPC parameter name.
  async function setGroupSetting(key: "show_teacher_stats" | "weekly_awards_enabled" | "count_days_from_creation", param: "p_show_teacher_stats" | "p_weekly_awards_enabled" | "p_count_days_from_creation", enabled: boolean) {
    if (!group || enabled === group[key]) return;
    const { error } = await supabase.rpc("admin_set_group_settings", { target_group_id: group.id, [param]: enabled });
    if (error) { setError(error.message); return; }
    setGroups((current) => current.map((g) => (g.id === group.id ? { ...g, [key]: enabled } : g)));
  }
  // stats_start_date needs its own path since it's a tri-state choice (calendar / from-creation
  // / a specific date), not a plain on/off -- p_update_stats_start_date tells the RPC to apply
  // p_stats_start_date even when it's null (switching away from a custom date).
  async function setGroupDateMode(mode: "calendar" | "creation" | "custom", customDate?: string) {
    if (!group) return;
    const countFromCreation = mode === "creation";
    const statsStartDate = mode === "custom" ? (customDate ?? group.stats_start_date ?? dateKey) : null;
    const { error } = await supabase.rpc("admin_set_group_settings", { target_group_id: group.id, p_count_days_from_creation: countFromCreation, p_stats_start_date: statsStartDate, p_update_stats_start_date: true });
    if (error) { setError(error.message); return; }
    setGroups((current) => current.map((g) => (g.id === group.id ? { ...g, count_days_from_creation: countFromCreation, stats_start_date: statsStartDate } : g)));
  }
  if (groupLoading) return <PageSkeleton />;
  if (!addingGroup && group) {
    const year = viewDate.getFullYear(); const month = viewDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOffset = (new Date(year, month, 1).getDay() + 6) % 7;
    const challengeLen = Math.round((Date.parse(challengeEnd + "T00:00:00Z") - Date.parse(challengeStart + "T00:00:00Z")) / 86400000) + 1;
    const goalNum = Number(challengeGoal) || 0;
    const goalStep = challengeType === "minutes" ? 10 : 1;
    const goalSentence = challengeType === "daily" ? T.group.dailyGoalDesc(goalNum) : challengeType === "minutes" ? T.group.minutesGoalDesc(goalNum) : T.group.sessionsGoalDesc(goalNum);
    const sinceLabel = T.group.since(formatDMY(localDateFromTimestamp(group.created_at)));
    const weekRangeLabel = [weekStartKey, shiftDateKey(weekStartKey, 6)].map(formatDMY).join(" - ");
    return <section className="page">
      <header className="simple-head group-head">
        <div>{groups.length > 1
          ? <button type="button" className="group-title-btn" onClick={() => setShowGroupPicker(true)} aria-label={T.group.switchGroup} title={T.group.switchGroup}><h1>{(() => { const words = group.name.trim().split(" "); const last = words.pop() ?? ""; return <>{words.length ? words.join(" ") + " " : ""}<span className="group-title-last">{last}<span className="group-title-chev"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg></span></span></>; })()}</h1></button>
          : <h1>{group.name}</h1>}</div>
        <div className="group-head-actions">
          <button type="button" className="group-add-btn group-bell-btn" onClick={openCheerInbox} aria-label={T.cheers.bellTitle} title={T.cheers.bellTitle}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 10-12 0c0 7-3 8-3 8h18s-3-1-3-8" /><path d="M13.7 20a2 2 0 01-3.4 0" /></svg>
            {unreadCount > 0 && <i className="bell-badge">{unreadCount > 9 ? "9+" : unreadCount}</i>}
          </button>
          <button type="button" className="group-add-btn" onClick={() => setShowMedalBoard(true)} aria-label={T.group.medalBoard} title={T.group.medalBoard}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0V4z" /><path d="M7 6H4v1a3 3 0 003 3M17 6h3v1a3 3 0 01-3 3" /></svg>
          </button>
          {user.id === teacherId && <button type="button" className="group-add-btn" onClick={() => setShowGroupSettings(true)} aria-label={T.group.groupSettings} title={T.group.groupSettings}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></svg>
          </button>}
          <button type="button" className="group-add-btn" onClick={() => { setAddingGroup(true); setMode("start"); }}>+</button>
        </div>
      </header>
      {(() => {
        const rows = (timeView === "week" ? weekTotals : totals).map((m) => ({ ...m, days: daysTotals.find((d) => d.id === m.id) }));
        const sum = rows.reduce((acc, r) => acc + r.total, 0);
        const R = 47, C = 2 * Math.PI * R;
        let offset = 0;
        return <div className="time-card board-card">
          <div className="board-head">
            <span className="section-label">{T.group.leaderboard}</span>
            <div className="board-toggle">
              <button type="button" className={timeView === "all" ? "selected" : ""} onClick={() => setTimeView("all")}>{T.group.medalBoardAllTime}</button>
              <button type="button" className={timeView === "week" ? "selected" : ""} onClick={() => setTimeView("week")}>{T.group.medalBoardThisWeek}</button>
            </div>
          </div>
          {members.length > 1 && !cheerHintSeen && <span className="section-sublabel cheer-hint">{T.cheers.tapNameHint}</span>}
          <div className="board-body">
            <div className="board-donut">
              <svg viewBox="0 0 120 120" aria-hidden="true">
                <circle cx="60" cy="60" r={R} fill="none" stroke="#1d2220" strokeWidth="22" />
                {sum > 0 && rows.map((r) => {
                  const len = (r.total / sum) * C;
                  const seg = <circle key={r.id} cx="60" cy="60" r={R} fill="none" stroke={r.color} strokeWidth="22" strokeDasharray={`${Math.max(0, len - (rows.length > 1 ? 2.5 : 0))} ${C}`} strokeDashoffset={-offset} transform="rotate(-90 60 60)" />;
                  offset += len;
                  return seg;
                })}
              </svg>
              
            </div>
            <div className="board-list">
              {rows.map((r, idx) => <div key={r.id} className="board-row">
                <i className="board-dot" style={{ background: r.color }} />
                <span className="board-name">{r.id === user.id ? r.name : <span role="button" tabIndex={0} className="name-cheer" onClick={() => openCheerFor(r.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") openCheerFor(r.id); }}>{r.name}</span>}</span>
                <span className="board-time">{formatMinutes(r.total)}</span>
                <span className="board-days">{r.days ? `${r.days.days} / ${r.days.totalDays}` : ""}<small>{T.group.daysShort}</small></span>
              </div>)}
            </div>
          </div>
        </div>;
      })()}
      <div className="challenges-section">
        <div className="section-head"><span className="section-label">{T.group.challenges}</span>{user.id === teacherId && <button onClick={() => setShowNewChallenge(!showNewChallenge)}>{showNewChallenge ? T.group.cancel : T.group.newChallenge}</button>}</div>
        {showNewChallenge && <div className="challenge-form">
          <span className="cf-label">{T.group.quickStart}</span>
          <div className="preset-row">{presetOptions.map((p) => <button key={p.key} className="chip" onClick={() => applyPreset(p)}>{p.label}</button>)}</div>
          <input className="group-input" value={challengeName} onChange={e => setChallengeName(e.target.value)} placeholder={T.group.challengeNamePlaceholder} maxLength={80} />
          <span className="cf-label">{T.group.typeLabel}</span>
          <div className="admin-mini-toggle admin-mini-toggle-wide">
            <button type="button" className={challengeType === "sessions" ? "selected" : ""} onClick={() => setChallengeType("sessions")}>{T.group.typeSessions}</button>
            <button type="button" className={challengeType === "daily" ? "selected" : ""} onClick={() => setChallengeType("daily")}>{T.group.typeDaily}</button>
            <button type="button" className={challengeType === "minutes" ? "selected" : ""} onClick={() => setChallengeType("minutes")}>{T.group.typeMinutes}</button>
          </div>
          <div className="cf-goal">
            <div className="cf-goal-text"><span className="cf-label">{T.group.goalLabel}</span><p className="cf-hint">{goalSentence}</p></div>
            <div className="cf-stepper">
              <button type="button" aria-label="-" onClick={() => setChallengeGoal(String(Math.max(1, goalNum - goalStep)))}>−</button>
              <input inputMode="numeric" value={challengeGoal} onChange={e => setChallengeGoal(e.target.value.replace(/\D/g, ""))} />
              <button type="button" aria-label="+" onClick={() => setChallengeGoal(String(goalNum + goalStep))}>+</button>
            </div>
          </div>
          <span className="cf-label">{T.group.lengthLabel}</span>
          <div className="admin-mini-toggle admin-mini-toggle-wide">
            {[7, 14, 30].map((n) => <button key={n} type="button" className={!showCustomDates && challengeLen === n ? "selected" : ""} onClick={() => { setShowCustomDates(false); setChallengeEnd(shiftDateKey(challengeStart, n - 1)); }}>{T.group.lengthDays(n)}</button>)}
            <button type="button" className={showCustomDates || ![7, 14, 30].includes(challengeLen) ? "selected" : ""} onClick={() => setShowCustomDates(!showCustomDates)}>{T.group.lengthCustom}</button>
          </div>
          <p className="cf-hint cf-range">{formatDMY(challengeStart)} - {formatDMY(challengeEnd)} · {T.group.lengthDays(Math.max(1, challengeLen))}</p>
          {showCustomDates && <div className="cf-dates">
            <div className="cf-date-row"><span>{T.group.startLabel}</span><DateDMY value={challengeStart} onChange={(v) => { setChallengeStart(v); setChallengeEnd(shiftDateKey(v, Math.max(1, challengeLen) - 1)); }} /></div>
            <div className="cf-date-row"><span>{T.group.endLabel}</span><DateDMY value={challengeEnd} min={challengeStart} onChange={setChallengeEnd} /></div>
          </div>}
          <button type="button" className="cf-more" onClick={() => setShowStakes(!showStakes)}>{showStakes ? "−" : "+"} {T.group.stakesToggle}</button>
          {showStakes && <>
            <input className="group-input" value={challengeReward} onChange={e => setChallengeReward(e.target.value)} placeholder={T.group.rewardPlaceholder} maxLength={120} />
            <input className="group-input" value={challengePunishment} onChange={e => setChallengePunishment(e.target.value)} placeholder={T.group.punishmentPlaceholder} maxLength={120} />
          </>}
          <button className="primary cf-create" disabled={challengeBusy || !challengeName || challengeEnd < challengeStart || goalNum < 1} onClick={createChallenge}>{challengeBusy ? T.group.pleaseWait : T.group.createChallengeBtn}</button>
        </div>}
        {!challenges.length && !showNewChallenge && <p className="hint">{T.group.noChallengesShort}</p>}
        {challenges.map((c) => {
          const desc = c.goal_type === "daily" ? T.group.dailyGoalDesc(c.goal_value) : c.goal_type === "minutes" ? T.group.minutesGoalDesc(c.goal_value) : T.group.sessionsGoalDesc(c.goal_value);
          const progressLabel = c.goal_type === "minutes" ? T.group.minutesProgress(c.progress, c.target) : T.group.daysProgress(c.progress, c.target);
          const pct = Math.min(100, (c.progress / Math.max(1, c.target)) * 100);
          const stakes = [c.reward && `${T.group.reward} ${c.reward}`, c.punishment && `${T.group.punishment} ${c.punishment}`].filter(Boolean);
          const isOpen = openChallenge === c.id;
          return <div key={c.id} className="challenge-card challenge-compact">
            <div className="challenge-head challenge-head-tap" role="button" tabIndex={0} aria-expanded={isOpen} onClick={() => setOpenChallenge(isOpen ? null : c.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setOpenChallenge(isOpen ? null : c.id); }}><h3>{c.name}{c.joined && <i className="challenge-tick" role="img" aria-label={T.group.joined} title={T.group.joined}>✓</i>}</h3>
              <div className="challenge-head-right">
                {!c.joined ? <button type="button" className="challenge-join-chip" onClick={(e) => { e.stopPropagation(); joinChallenge(c.id); }}>{T.group.joinChallengeBtn}</button> : null}
                {c.created_by === user.id && <button type="button" className="challenge-more" aria-label="Menu" onClick={(e) => { e.stopPropagation(); setChallengeMenuId(challengeMenuId === c.id ? null : c.id); }}>⋯</button>}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={isOpen ? "give-chev open" : "give-chev"} aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
              </div>
            </div>
            {challengeMenuId === c.id && <div className="challenge-menu"><button type="button" className="challenge-delete" onClick={() => { setChallengeMenuId(null); deleteChallenge(c.id); }}>{T.group.deleteChallenge}</button></div>}
            {c.ranking.length <= 1 && <div className="challenge-bar-row"><div className="leaderboard-bar-track"><div className="leaderboard-bar" style={{ width: `${pct}%` }} /></div><span className="challenge-progress-label">{progressLabel}</span></div>}
            {c.ranking.length > 1 && <div className="challenge-ranking">{c.ranking.map((r: any, idx: number) => <div key={r.id} className={r.id === user.id ? "challenge-rank-row is-me" : "challenge-rank-row"}><span className="rank-medal">{idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}.`}</span><span className="rank-name">{r.name}</span><div className="rank-bar"><div style={{ width: `${Math.min(100, (r.progress / Math.max(1, r.target)) * 100)}%` }} /></div><span className="rank-value">{c.goal_type === "minutes" ? T.group.minutesProgress(r.progress, r.target) : T.group.daysProgress(r.progress, r.target)}</span></div>)}</div>}
            {isOpen && <>
            <p className="challenge-desc">{desc} · {formatDMY(c.start_date).slice(0, 5)} - {formatDMY(c.end_date).slice(0, 5)}</p>
            {stakes.length > 0 && <p className="challenge-stakes">{stakes.join("  ·  ")}</p>}
            </>}
          </div>;
        })}
      </div>
      <div className="group-progress"><div className="calendar-card">
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
        <div className="calendar-legend">{members.map((m) => <span key={m.id}><i style={{ background: m.color }} />{m.name}{m.id === teacherId && <TeacherBadge T={T} />}</span>)}</div>
      </div></div>
      {groupImprovements.length > 0 && <div className="time-card">
        <span className="section-label">{T.admin.improvementsLabel}</span>
        <div className="admin-log-list admin-log-list-compact">
          {(showAllImprovements ? groupImprovements : groupImprovements.slice(0, 3)).map((ev) => <div key={ev.key} className="admin-log-row improvement-row">
            <span className="improvement-chip">{ev.name}</span>
            <span className="improvement-text">{T.admin.improvedTo(PRACTICE_EXERCISES.find((e) => e.en === ev.exerciseEn)?.[language as Lang] ?? ev.exerciseEn, ev.bpm)}</span>
            <span className="improvement-date">{formatDMY(ev.date).slice(0, 5)}</span>
          </div>)}
        </div>
        {groupImprovements.length > 3 && <button type="button" className="cf-more" onClick={() => setShowAllImprovements(!showAllImprovements)}>{showAllImprovements ? T.group.showLess : T.group.showMore(groupImprovements.length - 3)}</button>}
      </div>}
      {summaryDayKey && <DaySummaryModal date={summaryDayKey} log={logs[summaryDayKey]} dailyGoal={dailyGoal} logs={logs} locale={locale} language={language} T={T}
        onClose={() => setSummaryDayKey(null)} onSave={saveLogFor} onDelete={deleteLogFor} confirm={confirm}
        roster={{ members, dayLogs: dayDetailLogs, currentUserId: user.id }}
        onNavigateDay={(delta) => setSummaryDayKey((current) => current ? shiftDateKey(current, delta) : current)} />}
      {showMedalBoard && <MedalBoardModal daysTotals={daysTotals} totals={totals} weeklyRows={group.weekly_awards_enabled ? [...weeklyAwards, ...(challengeAward ? [challengeAward] : [])] : []} onClose={() => setShowMedalBoard(false)} T={T} />}
      {showGroupPicker && <div className="modal modal-center" onClick={() => setShowGroupPicker(false)}><div className="day-summary cheer-sheet" onClick={(e) => e.stopPropagation()}>
        <span className="section-label">{T.group.switchGroup}</span>
        <div className="cheer-list">{groups.map((g) => <button key={g.id} type="button" className={g.id === activeGroupId ? "cheer-option group-pick selected" : "cheer-option group-pick"} onClick={() => { setActiveGroupId(g.id); setShowGroupPicker(false); }}>{g.name}{g.id === activeGroupId && <span className="group-pick-check">✓</span>}</button>)}</div>
      </div></div>}
      {showCheerInbox && <div className="modal modal-center" onClick={() => setShowCheerInbox(false)}><div className="day-summary cheer-sheet" onClick={(e) => e.stopPropagation()}>
        <span className="section-label">{T.cheers.bellTitle}</span>
        {groupCheers.length === 0 ? <p className="hint">{T.cheers.inboxEmpty}</p> : <div className="cheer-list">
          {groupCheers.slice(0, 40).map((c) => {
            const mine = c.from_user === user.id;
            const toName = c.to_user === null ? T.cheers.everyone : c.to_user === user.id ? T.cheers.you : (members.find((m) => m.id === c.to_user)?.name ?? "Drummer");
            const heartsFromOthers = c.hearts.filter((h) => countsAsHeart(h.user_id, user.id));
            const iHearted = c.hearts.some((h) => h.user_id === user.id);
            const isNew = mine ? heartsFromOthers.some((h) => h.created_at > inboxSeenAt) : c.created_at > inboxSeenAt;
            return <div key={c.id} className={isNew ? "cheer-inbox-row is-new" : "cheer-inbox-row"}>
              <span className="cheer-inbox-who">{mine ? <><b>{T.cheers.you}</b> → {toName}</> : <><b>{c.from_name}</b>{c.to_user === user.id ? ` (${T.cheers.toYou})` : ""}</>} · {cheerAge(c.created_at)}</span>
              <span className="cheer-inbox-text">{cheerText(c.cheer_key, language)}</span>
              {mine && heartsFromOthers.length > 0 && <span className="cheer-hearts"><HeartIcon filled />{heartsFromOthers.map((h) => h.name).join(", ")}</span>}
              {(!mine || ALLOW_SELF_HEART) && <button type="button" className={iHearted ? "cheer-heart on" : "cheer-heart"} aria-label={T.cheers.heart} title={T.cheers.heart} onClick={() => toggleHeart(c)}><HeartIcon filled={iHearted} /></button>}
              <button type="button" className="cheer-inbox-x" aria-label={mine ? T.cheers.undoSent : T.cheers.remove} title={mine ? T.cheers.undoSent : T.cheers.remove} onClick={() => removeCheer(c)}>×</button>
            </div>;
          })}
        </div>}
        <button type="button" className="primary cf-create" onClick={() => openCheerFor(null)}>{T.cheers.cheerGroupBtn}</button>
      </div></div>}
      {showCheerSheet && <div className="modal modal-center" onClick={() => setShowCheerSheet(false)}><div className="day-summary cheer-sheet" onClick={(e) => e.stopPropagation()}>
        <span className="section-label">{cheerTo ? T.cheers.cheerPerson(members.find((m) => m.id === cheerTo)?.name ?? "") : T.cheers.cheerGroup}</span>
        <div className="cheer-list">{CHEER_KEYS.map((c) => <button key={c.key} type="button" className="cheer-option" disabled={cheerBusy} onClick={() => sendCheer(c.key)}>{c[language as Lang]}</button>)}</div>
      </div></div>}
      {cheerToast && <div className="cheer-toast">✓ {T.cheers.sent}{lastSentCheerId && <button type="button" onClick={async () => { const id = lastSentCheerId; setLastSentCheerId(null); setCheerToast(false); if (id) await removeCheer({ id, from_user: user.id }); }}>{T.cheers.undo}</button>}</div>}
      {showGroupSettings && <GroupSettingsModal group={group} setGroupSetting={setGroupSetting} setGroupDateMode={setGroupDateMode} onClose={() => setShowGroupSettings(false)} T={T} />}
      <div className="group-invite-footer">
        <button type="button" className="group-more-btn" onClick={() => setShowGroupMore(!showGroupMore)}>{T.group.moreOptions} {showGroupMore ? "▴" : "▾"}</button>
        {showGroupMore && <>
          <div className="group-invite-row"><span className="section-sublabel">{T.group.inviteShort}</span><button className="invite-chip" onClick={copyInvite}>{copied ? T.group.copied : group.invite_code}</button></div>
          <button className="leave-group-btn" onClick={leaveGroup}>{T.group.leaveGroup}</button>
          {group.created_by === user.id && <button className="delete-group-btn" onClick={deleteGroup}>{T.group.deleteGroupBtn}</button>}
        </>}
      </div>
    </section>;
  }
  return <section className="page"><header className="simple-head"><p className="eyebrow">{T.group.practiseTogether}</p><h1>{T.group.yourGroup}</h1></header>
    {groups.length > 0 && <button className="page-back" onClick={() => setAddingGroup(false)}>‹ {T.group.back}</button>}
    <div className="group-card"><div className="group-icon">✦</div><h2>{mode === "start" ? T.group.findCrew : mode === "create" ? T.group.startGroup : T.group.joinCrew}</h2>
    {mode === "start" ? <>
      <p>{T.group.intro}</p>
      <button className="primary" onClick={() => setMode("create")}>{T.group.createGroupBtn} <span>→</span></button>
      <button className="secondary" onClick={() => setMode("join")}>{T.group.joinWithCode}</button>
    </> : mode === "join" ? <>
      <input className="group-input" value={code} onChange={e => setCode(e.target.value)} placeholder={T.group.inviteCodePlaceholder} />
      <button className="primary" disabled={busy || !code} onClick={joinGroup}>{busy ? T.group.pleaseWait : T.group.joinGroup}</button>
      <button className="secondary" onClick={() => setMode("start")}>{T.group.back}</button>
    </> : <>
      <input className="group-input" value={name} onChange={e => setName(e.target.value)} placeholder={T.group.groupNamePlaceholder} />
      <div className="admin-controls-card create-group-settings">
        <span className="ladder-label">{T.group.groupSettings}</span>
        <div className="admin-settings-list">
          <div className="admin-settings-row admin-settings-row-stack">
            <span>{T.group.countFromCreation}</span>
            <span className="toggle-row-desc">{T.group.countFromCreationDesc}</span>
            <div className="admin-mini-toggle">
              <button type="button" className={newDateMode === "calendar" ? "selected" : ""} onClick={() => setNewDateMode("calendar")}>{T.group.dateModeCalendar}</button>
              <button type="button" className={newDateMode === "creation" ? "selected" : ""} onClick={() => setNewDateMode("creation")}>{T.group.dateModeToday}</button>
              <button type="button" className={newDateMode === "custom" ? "selected" : ""} onClick={() => setNewDateMode("custom")}>{T.group.dateModeCustom}</button>
            </div>
            {newDateMode === "custom" && <DateDMY value={newCustomStartDate} max={dateKey} onChange={setNewCustomStartDate} />}
          </div>
          <div className="admin-settings-row">
            <span>{T.group.showTeacherStats}</span>
            <div className="admin-mini-toggle">
              <button type="button" className={!newShowTeacherStats ? "selected" : ""} onClick={() => setNewShowTeacherStats(false)}>{T.admin.pointGameOff}</button>
              <button type="button" className={newShowTeacherStats ? "selected" : ""} onClick={() => setNewShowTeacherStats(true)}>{T.admin.pointGameOn}</button>
            </div>
          </div>
          <div className="admin-settings-row">
            <span>{T.group.enableWeeklyAwards}</span>
            <div className="admin-mini-toggle">
              <button type="button" className={!newWeeklyAwards ? "selected" : ""} onClick={() => setNewWeeklyAwards(false)}>{T.admin.pointGameOff}</button>
              <button type="button" className={newWeeklyAwards ? "selected" : ""} onClick={() => setNewWeeklyAwards(true)}>{T.admin.pointGameOn}</button>
            </div>
          </div>
        </div>
      </div>
      <button className="primary" disabled={busy || !name} onClick={createGroup}>{busy ? T.group.pleaseWait : T.group.createGroup}</button>
      <button className="secondary" onClick={() => setMode("start")}>{T.group.back}</button>
    </>}
    </div></section>;
}
// ---------- Achievements (Progress tab) ----------
// Everything is worked out from data the app already has (logs, Skill Trainer sessions, won challenges), so there is
// nothing to store: an achievement is unlocked the moment the numbers reach its target.
type AchievementCategory = { key: string; targets: number[] };
const ACHIEVEMENT_CATEGORIES: AchievementCategory[] = [
  { key: "time", targets: [0.5, 2, 6, 15, 40] },          // hours practised in total (level 1 = just 30 minutes)
  { key: "streak", targets: [2, 4, 7, 14, 30] },          // longest streak in days
  { key: "days", targets: [1, 3, 7, 20, 50] },            // days practised in total
  { key: "sessions", targets: [1, 3, 6, 15, 40] },        // Skill Trainer sessions
  { key: "tempo", targets: [60, 80, 100, 120, 150] },     // tempos where enough different rudiments were played (see TEMPO_REQUIRED)
  { key: "variety", targets: [2, 5, 10, 18, 30] },        // different Skill Trainer exercises
  { key: "challenges", targets: [1, 2, 4, 7, 12] },       // personal challenges won
  { key: "mastery", targets: [1, 3, 8, 20, 40] },         // Skill Trainer sessions rated "mastered"
];
// Tempo milestone: level 1 needs 1 rudiment played at 60 BPM, level 2 needs 2 at 80 BPM, ... level 5 needs 5 at 150 BPM.
const TEMPO_REQUIRED = [1, 2, 3, 4, 5];
const TEMPO_REQUIRED_BY_BPM: Record<number, number> = { 60: 1, 80: 2, 100: 3, 120: 4, 150: 5 };
// Level 5 (the top) gets the brightest badge; the others step up through the darker oranges.
const badgeTierFor = (levelIndex: number, total: number) => Math.min(ACHIEVEMENT_TIERS.length - 1, levelIndex + (levelIndex === total - 1 ? 1 : 0));
// A badge is grey while it is locked and turns orange the moment it is achieved; higher levels fill up with more
// orange (a dark chip with an orange outline at level 1, solid bright orange at the top).
const ACHIEVEMENT_TIERS = [
  { from: "#1c130d", to: "#1c130d", stroke: "#5a2f17", glyph: "#b7743f", rim: "rgba(255,155,80,.14)" },
  { from: "#2a170a", to: "#2a170a", stroke: "#7a4220", glyph: "#d98543", rim: "rgba(255,155,80,.18)" },
  { from: "#351d0d", to: "#351d0d", stroke: "#a35a24", glyph: "#ef9248", rim: "rgba(255,155,80,.22)" },
  { from: "#4a2610", to: "#3a1e0c", stroke: "#d9773a", glyph: "#ff9b50", rim: "rgba(255,155,80,.28)" },
  { from: "#ff9b50", to: "#ff7a2e", stroke: "#ffb27a", glyph: "#241508", rim: "rgba(0,0,0,.18)" },
  { from: "#ffb27a", to: "#ff6b1a", stroke: "#ffd0a8", glyph: "#241508", rim: "rgba(0,0,0,.2)" },
];
const ACHIEVEMENT_GLYPHS: Record<string, React.ReactNode> = {
  time: <><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3.2 2" /></>,
  streak: <path d="M12 3c.8 3.2 5 5 5 10a5 5 0 01-10 0c0-2 1-3.2 2-4.2 0 2 .9 3 2 3 0-3-1-5 1-8.8z" />,
  days: <><rect x="4" y="5" width="16" height="15" rx="2.5" /><path d="M4 10h16M8 3v4M16 3v4M9 15l2 2 4-4" /></>,
  sessions: <><ellipse cx="12" cy="9" rx="8" ry="3" /><path d="M4 9v7c0 1.7 3.6 3 8 3s8-1.3 8-3V9M7 3.5l4 4M17 3.5l-4 4" /></>,
  tempo: <path d="M13 2.5L5.5 14H11l-1 7.5L18.5 10H13l0-7.5z" />,
  variety: <path d="M12 3l2.3 4.7 5.2.8-3.8 3.6.9 5.1-4.6-2.5-4.6 2.5.9-5.1L4.5 8.5l5.2-.8L12 3z" />,
  long: <path d="M7 3h10M7 21h10M8 3c0 5 4 6 4 9s-4 4-4 9M16 3c0 5-4 6-4 9s4 4 4 9" />,
  mastery: <path d="M3 8l5 4 4-7 4 7 5-4-2 11H5L3 8z" />,
  challenges: <><path d="M8 4h8v5a4 4 0 01-8 0V4zM8 6H5v1a3 3 0 003 3M16 6h3v1a3 3 0 01-3 3M12 13v4M9 20h6M10 17h4" /></>,
};
function AchievementBadge({ glyph, tier, locked, size = 56 }: { glyph: string; tier: number; locked?: boolean; size?: number }) {
  const gid = useId().replace(/:/g, "");
  const t = ACHIEVEMENT_TIERS[Math.min(tier, ACHIEVEMENT_TIERS.length - 1)];
  return <svg className={locked ? "ach-badge locked" : "ach-badge"} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
    <defs><linearGradient id={gid} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={t.from} /><stop offset="1" stopColor={t.to} /></linearGradient></defs>
    <polygon points="32,3 57,17.5 57,46.5 32,61 7,46.5 7,17.5" fill={locked ? "#1b1f1d" : `url(#${gid})`} stroke={locked ? "#2c3330" : t.stroke} strokeWidth="2.2" strokeLinejoin="round" />
    {!locked && <polygon points="32,9 52,20.5 52,43.5 32,55 12,43.5 12,20.5" fill="none" stroke={t.rim} strokeWidth="1.5" strokeLinejoin="round" />}
    <g transform="translate(17.5 17.5) scale(1.25)" fill="none" stroke={locked ? "#4a554f" : t.glyph} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{ACHIEVEMENT_GLYPHS[glyph]}</g>
  </svg>;
}
// A dedicated board for personal challenges the student has completed: a trophy card for each, newest first.
function ChallengesWonBoard({ won, language, T }: { won: any[]; language: Lang; T: any }) {
  const P = T.personalChallenges;
  const endDate = (c: any) => { const d = new Date(`${c.start_date}T00:00:00`); d.setDate(d.getDate() + Math.max(0, (c.length_days ?? 1) - 1)); return formatLocalDate(d.getFullYear(), d.getMonth(), d.getDate()); };
  const sorted = [...won].sort((a, b) => endDate(b).localeCompare(endDate(a)));
  return <div className="progress-section won-board">
    <div className="won-head"><span className="section-label">{P.wonTitle}</span>{sorted.length > 0 && <span className="won-count">{sorted.length}</span>}</div>
    {sorted.length === 0 ? <p className="hint won-empty">{P.wonEmpty}</p> : <div className="won-list">
      {sorted.map((c) => <div key={c.id} className="won-card">
        <span className="won-trophy" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M7 4h10v5a5 5 0 01-10 0V4z" /><path d="M7 6H4v2a3 3 0 003 3M17 6h3v2a3 3 0 01-3 3" /><path d="M12 14v4M8.5 20h7" /></svg></span>
        <span className="won-text"><b>{challengeExerciseLabel(c.exercise_en, language)}</b><small>{P.wonMeta(c.target_minutes, c.length_days, c.target_bpm)}</small></span>
        <span className="won-side"><em>{formatDMY(endDate(c))}</em>{c.assigned_by && <small>{P.wonFromTeacher}</small>}</span>
      </div>)}
    </div>}
  </div>;
}
function AchievementsSection({ stats, tempoCounts, wonChallenges, language, T }: { stats: Record<string, number>; tempoCounts: number[]; wonChallenges: any[]; language: Lang; T: any }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const rows = ACHIEVEMENT_CATEGORIES.map((cat) => {
    if (cat.key === "tempo") {
      // Tempos unlock in order; the progress shown is "rudiments played at the next tempo, out of 5".
      let level = 0;
      while (level < cat.targets.length && (tempoCounts[level] ?? 0) >= TEMPO_REQUIRED[level]) level++;
      const next = level < cat.targets.length ? cat.targets[level] : null;
      const need = next === null ? TEMPO_REQUIRED[TEMPO_REQUIRED.length - 1] : TEMPO_REQUIRED[level];
      const value = next === null ? need : Math.min(tempoCounts[level] ?? 0, need);
      return { cat, value, level, next, denom: need, pct: (value / need) * 100 };
    }
    const value = stats[cat.key] ?? 0;
    const level = cat.targets.filter((target) => value >= target).length;
    const prev = level > 0 ? cat.targets[level - 1] : 0;
    const next = level < cat.targets.length ? cat.targets[level] : null;
    const pct = next === null ? 100 : Math.max(0, Math.min(100, ((value - prev) / (next - prev)) * 100));
    return { cat, value, level, next, denom: next ?? 0, pct };
  });
  const unlocked = rows.reduce((sum, r) => sum + r.level, 0);
  const total = rows.reduce((sum, r) => sum + r.cat.targets.length, 0);
  const A = T.achievements;
  const fmt = (key: string, v: number) => key === "time" ? (Math.round(v * 10) / 10).toString() : String(Math.floor(v));
  // "Next up": the locked achievement that is closest to being reached.
  const upcoming = rows.filter((r) => r.next !== null).sort((a, b) => b.pct - a.pct)[0];
  const open = rows.find((r) => r.cat.key === openKey) ?? null;
  return <div className="progress-section ach-section">
    <span className="section-label">{T.progressPage.achievements}</span>
    <div className="ach-summary">
      <div className="ach-summary-top"><span className="ach-count"><b>{unlocked}</b> / {total} {A.unlocked}</span>{upcoming && upcoming.next !== null && <span className="ach-next-inline">{A.nextUp}: {A.label(upcoming.cat.key, upcoming.next)} ({fmt(upcoming.cat.key, upcoming.value)}/{upcoming.denom})</span>}</div>
      <div className="ach-bar"><div style={{ width: `${(unlocked / Math.max(1, total)) * 100}%` }} /></div>
    </div>
    <div className="ach-grid">
      {rows.map((r) => <button key={r.cat.key} type="button" className="ach-tile" onClick={() => setOpenKey(r.cat.key)}>
        <span className="ach-tile-name">{A.category[r.cat.key]}</span>
        <AchievementBadge glyph={r.cat.key} tier={badgeTierFor(Math.max(0, r.level - 1), r.cat.targets.length)} locked={r.level === 0} size={36} />
        <span className={r.level > 0 ? "ach-level on" : "ach-level"}>{r.level > 0 ? A.levelShort(r.level) : A.notYet}</span>
        <div className="ach-pips" aria-hidden="true">{r.cat.targets.map((_, i) => <i key={i} className={i < r.level ? "on" : ""} />)}</div>
      </button>)}
    </div>
    {open && <div className="modal modal-center" onClick={() => setOpenKey(null)}><div className="day-summary cheer-sheet" onClick={(e) => e.stopPropagation()}>
      <button className="close" onClick={() => setOpenKey(null)}>×</button>
      <span className="section-label">{A.category[open.cat.key]}</span>
      <div className="cheer-list">
        {open.cat.targets.map((target, i) => {
          const done = i < open.level;
          const sub = open.cat.key === "tempo" ? `${Math.min(tempoCounts[i] ?? 0, TEMPO_REQUIRED[i])} / ${TEMPO_REQUIRED[i]}` : `${fmt(open.cat.key, open.value)} / ${target}`;
          return <div key={target} className={done ? "ach-row done" : "ach-row"}>
            <AchievementBadge glyph={open.cat.key} tier={badgeTierFor(i, open.cat.targets.length)} locked={!done} size={42} />
            <div className="ach-row-text"><span className="ach-row-title">{A.levelShort(i + 1)} · {A.label(open.cat.key, target)}</span><span className="ach-row-sub">{done ? A.done : sub}</span></div>
            {done && <span className="ach-check">✓</span>}
          </div>;
        })}
      </div>
    </div></div>}
  </div>;
}
function Progress({ onOpenExercise, onOpenSettings, practiceSessions, logs, user, language, kidMode, embedded, T }: { kidMode: boolean; embedded?: boolean; onOpenSettings?: () => void; onOpenExercise?: (en: string) => void; practiceSessions: { item_en: string; bpm: number; rating: string; duration_minutes: number; practiced_on: string; created_at: string }[]; logs: Record<string, Log>; user: any; language: Lang; T: any }) {
  const TIER_LABEL: Record<string, string> = { beginner: T.practiceMode.tierBeginner, intermediate: T.practiceMode.tierIntermediate, advanced: T.practiceMode.tierAdvanced, legend: T.practiceMode.tierLegend };
  const VISIBLE_LIMIT = 5;
  const [showAllPractice, setShowAllPractice] = useState(false);
  const [showAllSkill, setShowAllSkill] = useState(false);
  const [showLevelInfo, setShowLevelInfo] = useState(false);
  // Universal leaderboard: null = closed, otherwise the screen is open (optionally pre-set to a category/period/level).
  const [board, setBoard] = useState<Partial<BoardFilter> | null>(null);
  const [boardKey, setBoardKey] = useState(0);
  const [wonChallenges, setWonChallenges] = useState<any[]>([]);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await supabase.from("personal_challenges").select("id,exercise_en,target_minutes,target_bpm,length_days,start_date,assigned_by").eq("user_id", user.id);
      const list = data ?? [];
      if (!list.length) { if (!cancelled) setWonChallenges([]); return; }
      const earliestStart = list.reduce((min: string, c: any) => (c.start_date < min ? c.start_date : min), list[0].start_date);
      const logsCache = await fetchChallengeLogsCache(user.id, earliestStart);
      const completed = list.filter((c: any) => evaluateChallenge(c, practiceSessions, logsCache).status === "completed");
      if (!cancelled) setWonChallenges(completed);
    }
    load();
    return () => { cancelled = true; };
  }, [user.id, practiceSessions.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const skillExercises = useMemo(() => {
    const practicedEnSet = new Set(practiceSessions.map((s) => s.item_en));
    return PRACTICE_EXERCISES
      .filter((e) => practicedEnSet.has(e.en))
      .map((e) => {
        // Highest tier with any progress (0 = Beginner ... 3 = Legend), plus how far through it they are.
        const tiers = tiersFor(e.en);
        let maxTier = -1, maxTierPct = 0;
        tiers.forEach((t, i) => { const pct = tierProgressFor(practiceSessions, e.en, t); if (pct > 0) { maxTier = i; maxTierPct = pct; } });
        // The tier the exercise is "at" (its highest tier with progress; the first tier if nothing is unlocked yet),
        // how many tempos of that tier are unlocked, and the fill of every tier's bar (0-100, from the real data).
        const current = tiers[Math.max(0, maxTier)];
        const tierLevels = bpmLevelsFor(e.en).filter((level) => level >= current.min && level <= current.max);
        const tierDone = tierLevels.filter((level) => qualifyingMinutesFor(practiceSessions, e.en, level) >= UNLOCK_MINUTES).length;
        const segs = tiers.map((t) => tierProgressFor(practiceSessions, e.en, t));
        // Real counts per tier (unlocked tempos / tempos in the tier), used for the overall level meter.
        const counts = tiers.map((t) => { const lv = bpmLevelsFor(e.en).filter((level) => level >= t.min && level <= t.max); return { key: t.key, done: lv.filter((level) => qualifyingMinutesFor(practiceSessions, e.en, level) >= UNLOCK_MINUTES).length, total: lv.length }; });
        return { en: e.en, label: e[language as Lang], maxTier, maxTierPct, tierKey: current.key, tierDone, tierTotal: tierLevels.length, segs, counts, unlockedCount: bpmLevelsFor(e.en).filter((level) => qualifyingMinutesFor(practiceSessions, e.en, level) >= UNLOCK_MINUTES).length };
      })
      // Organised by the highest tier reached, then how far through that tier, then total levels unlocked.
      .sort((a, b) => b.maxTier - a.maxTier || b.maxTierPct - a.maxTierPct || b.unlockedCount - a.unlockedCount || a.label.localeCompare(b.label));
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
  const achievementStats = useMemo(() => {
    const entries = Object.values(logs);
    const totalMinutes = entries.reduce((sum, l) => sum + (l.minutes || 0) + (l.seconds || 0) / 60, 0);
    return {
      time: totalMinutes / 60,
      streak: calculateStreaks(logs, dateKey).longest,
      days: entries.filter((l) => l.minutes > 0).length,
      sessions: practiceSessions.length,
      variety: new Set(practiceSessions.map((s) => s.item_en)).size,
      long: entries.reduce((max, l) => Math.max(max, l.minutes || 0), 0),
      challenges: wonChallenges.length,
      mastery: practiceSessions.filter((s) => s.rating === "mastered").length,
    } as Record<string, number>;
  }, [logs, practiceSessions, wonChallenges]);
  // Tempo milestones: a tempo counts once 5 different rudiments were played at it (or faster) and felt at least "almost" ready.
  const tempoCounts = useMemo(() => {
    const rudiments = new Set(PRACTICE_EXERCISES.filter((e) => e.category === "rudiments").map((e) => e.en));
    const targets = ACHIEVEMENT_CATEGORIES.find((c) => c.key === "tempo")!.targets;
    return targets.map((t) => new Set(practiceSessions.filter((s) => rudiments.has(s.item_en) && s.bpm >= t && (RATING_RANK[s.rating] ?? 0) >= 3).map((s) => s.item_en)).size);
  }, [practiceSessions]);
  if (board && !embedded) return <LeaderboardScreen db={supabase} user={user} language={language} onOpenSettings={onOpenSettings} initial={board} onBack={() => { setBoard(null); setBoardKey((k) => k + 1); }} />;
  const Wrapper = (embedded ? "div" : "section") as "div";
  return <Wrapper className={embedded ? "progress-embedded" : "page"}>{!embedded && <header className="simple-head"><p className="eyebrow">{T.progressPage.eyebrow}</p><h1>{T.progressPage.title}</h1></header>}
    {embedded ? <StudentLeaderboardCard db={supabase} language={language} studentId={user.id} /> : <LeaderboardCard db={supabase} language={language} refreshKey={boardKey} onOpen={(f) => setBoard(f ?? {})} />}
    <div className="progress-section">
      <span className="section-label">{T.progressPage.skillProgress}</span>
      {!skillExercises.length ? <p className="hint">{T.progressPage.noSkillData}</p> : (() => {
        // Overall level: for each tier, how many of your exercises have unlocked at least one tempo in it. Your level is the highest
        // tier that at least 1 in 4 of your exercises (and at least one exercise) has reached; the meter fills by that same share.
        const n = skillExercises.length;
        const overall = PRACTICE_TIERS.map((t) => { const reached = skillExercises.filter((e) => e.counts.some((c) => c.key === t.key && c.done > 0)).length; return { key: t.key, reached, pct: (reached / n) * 100 }; });
        const needed = Math.max(1, Math.ceil(n / 4));
        const levelTier = [...overall].reverse().find((o) => o.reached >= needed) ?? overall[0];
        const levelKey = levelTier.key;
        const levelWord = TIER_LABEL[levelKey].charAt(0) + TIER_LABEL[levelKey].slice(1).toLowerCase();
        const shown = skillExercises.slice(0, VISIBLE_LIMIT);
        const renderRow = (ex: (typeof skillExercises)[number], onOpen: () => void) => <button type="button" key={ex.en} className="sk-row" onClick={onOpen}>
              <span className="sk-name">{ex.label}</span>
              <span className="sk-bars" aria-hidden="true">{ex.segs.map((pct, i) => <i key={i} className="sk-seg"><b style={{ width: `${pct}%` }} /></i>)}</span>
              <span className="sk-meta"><em className="sk-badge sk-cap">{TIER_LABEL[ex.tierKey]}</em><small>{T.progressPage.levelsLabel(ex.tierDone, ex.tierTotal)}</small></span>
              <svg className="sk-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
            </button>;
        return <>
          <div className={`sk-overall sk-lv-${levelKey}`}>
            <div className="sk-overall-top"><span className="sk-overall-title">{T.progressPage.overallLevel}<button type="button" className="sk-info-btn" onClick={() => setShowLevelInfo(true)} aria-label={T.progressPage.infoTitle}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 7.6v.1" /></svg></button></span><span className="sk-overall-step">{T.progressPage.levelOf(PRACTICE_TIERS.findIndex((t) => t.key === levelKey) + 1, PRACTICE_TIERS.length)}</span></div>
            <div className="sk-overall-name">{TIER_LABEL[levelKey]}</div>
            <span className="sk-bars sk-bars-wide" aria-hidden="true">{overall.map((o) => <i key={o.key} className="sk-seg"><b style={{ width: `${o.pct}%` }} /></i>)}</span>
            <div className="sk-overall-ticks" aria-hidden="true">{PRACTICE_TIERS.map((t, i) => <span key={t.key} className={i <= PRACTICE_TIERS.findIndex((x) => x.key === levelKey) ? "on" : ""}>{TIER_LABEL[t.key]}</span>)}</div>
          </div>
          <div className="sk-list">
            {shown.map((ex) => renderRow(ex, () => onOpenExercise?.(ex.en)))}
          </div>
          {skillExercises.length > VISIBLE_LIMIT && <button type="button" className="see-more-btn" onClick={() => setShowAllSkill(true)}>{T.progressPage.seeMore}</button>}
          {showAllSkill && <div className="modal modal-center" onClick={() => setShowAllSkill(false)}>
            <div className="sk-modal" onClick={(e) => e.stopPropagation()}>
              <div className="sk-modal-head"><h3>{T.progressPage.skillProgress}</h3><button type="button" className="sk-modal-close" onClick={() => setShowAllSkill(false)} aria-label="Close">×</button></div>
              <div className="sk-modal-body sk-list">{skillExercises.map((ex) => renderRow(ex, () => { setShowAllSkill(false); onOpenExercise?.(ex.en); }))}</div>
            </div>
          </div>}
        </>;
      })()}
    </div>
    {showLevelInfo && <div className="modal modal-center" onClick={() => setShowLevelInfo(false)}>
      <div className="confirm-card sk-info-card" onClick={(e) => e.stopPropagation()}>
        <h3>{T.progressPage.infoTitle}</h3>
        <ol className="sk-info-list"><li>{T.progressPage.info1}</li><li>{T.progressPage.info2}</li><li>{T.progressPage.info3}</li></ol>
        <button className="save" onClick={() => setShowLevelInfo(false)}>{T.progressPage.infoClose}</button>
      </div>
    </div>}
    <AchievementsSection stats={achievementStats} tempoCounts={tempoCounts} wonChallenges={wonChallenges} language={language} T={T} />
    <ChallengesWonBoard won={wonChallenges} language={language} T={T} />
    <div className="progress-section"><UnlocksFeed sessions={practiceSessions} limit={3} expandable language={language} T={T} titleClass="section-label" onOpenExercise={onOpenExercise} /></div>
    {!totals.length ? <p className="hint">{T.progressPage.noData}</p> : <div className="progress-section">
      <span className="section-label">{T.progressPage.yourPractice}</span>
      <div className="minutes-chart">
        {(showAllPractice ? totals : totals.slice(0, VISIBLE_LIMIT)).map((t, idx) => <div key={t.en} className="minutes-row">
          <span className="minutes-rank">{idx + 1}</span>
          <div className="minutes-info">
            <span className="minutes-name">{t.label}</span>
            <span className="list-minutes-value">{formatMinutes(t.minutes)}</span>
          </div>
        </div>)}
      </div>
      {totals.length > VISIBLE_LIMIT && <button type="button" className="see-more-btn" onClick={() => setShowAllPractice(!showAllPractice)}>{showAllPractice ? T.progressPage.seeLess : T.progressPage.seeMore}</button>}
    </div>}
  </Wrapper>;
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
    const { data } = await supabase.from("personal_challenges").select("id,exercise_en,target_minutes,target_bpm,length_days,start_date,assigned_by").eq("user_id", user.id).order("start_date", { ascending: false });
    const list = data ?? [];
    setChallenges(list);
    if (!list.length) { setLogsCache({}); return; }
    const earliestStart = list.reduce((min: string, c: any) => (c.start_date < min ? c.start_date : min), list[0].start_date);
    setLogsCache(await fetchChallengeLogsCache(user.id, earliestStart));
  }
  useEffect(() => { loadChallenges(); }, [user]);

  async function createChallenge() {
    setBusy(true);
    const { error } = await supabase.from("personal_challenges").insert({ user_id: user.id, exercise_en: exerciseEn, target_minutes: Number(targetMinutes) || 1, target_bpm: isLadder && targetBpm ? Number(targetBpm) : null, length_days: Math.min(90, Number(lengthDays) || 1), start_date: dateKey });
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
          {!c.assigned_by && <button className="challenge-delete" onClick={() => deleteChallenge(c.id)}>{T.personalChallenges.deleteChallenge}</button>}
        </div>
        {c.assigned_by && <span className="from-teacher-badge">{T.personalChallenges.fromTeacher}</span>}
        <p className="challenge-desc">{T.personalChallenges.challengeDescription(c.target_minutes, c.target_bpm, c.length_days)}</p>
        {status === "failed" ? (
          <div className="challenge-failed-block">
            <p className="personal-challenge-status failed">{T.personalChallenges.statusFailed}</p>
            {!c.assigned_by && <button className="challenge-try-again" onClick={() => resetChallenge(c.id)}>{T.personalChallenges.resetChallenge}</button>}
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
function PracticeMode({ onMetronomeToneChange, skillTab, setSkillTab, step, setStep, category, setCategory, rudimentTier, setRudimentTier, exerciseGroup, setExerciseGroup, exercise, setExercise, bpm, setBpm, pendingMinutes, setPendingMinutes, sessions, onLogSession, onResetLevel, onEditRating, pinnedExercises, onTogglePin, userItems, userBooks, onAddUserItem, onRemoveUserItem, sortedRudiments, sortedExercises, kidMode, minutes, setMinutes, quickAddMinutes, setQuickAddMinutes, seconds, selected, toggle, customItems, setCustomItems, notes, setNotes, equipment, setEquipment, drumsetMinutes, setDrumsetMinutes, padMinutes, setPadMinutes, save, onReset, saved, dailyGoal, logs, confirm, openMetronome, openSessionTimer, metronomeTone, user, setError, language, practiceDifficulty, T }: any) {
  function handleEquipmentToggle(value: "drumset" | "pad") {
    const next = toggleEquipmentValue(equipment, value);
    setEquipment(next);
    if (next === "both") {
      // Minutes typed in the quick-add box but not saved yet become part of the split, so the split always adds up to the day's total.
      const total = (Number(minutes) || 0) + (Number(quickAddMinutes) || 0);
      setDrumsetMinutes(String(total)); setPadMinutes("0"); setMinutes(String(total)); setQuickAddMinutes("0");
    }
    else { setDrumsetMinutes(""); setPadMinutes(""); }
  }
  function updateDrumsetMinutes(value: string) { setDrumsetMinutes(value); setMinutes(String((Number(value) || 0) + (Number(padMinutes) || 0))); }
  function updatePadMinutes(value: string) { setPadMinutes(value); setMinutes(String((Number(drumsetMinutes) || 0) + (Number(value) || 0))); }
  const [notesOpen, setNotesOpen] = useState(false);
  const showNotes = notesOpen || !!notes;
  // The practice-element selector only exists inside this modal now -- Quick Practice's
  // top-level card never shows it, so tapping Save Practice always opens it first.
  const [showWhatModal, setShowWhatModal] = useState(false);
  const [skillSearch, setSkillSearch] = useState("");
  const [skillSection, setSkillSection] = useState<string | null>(null);
  // Coming back to the Practice hub forgets which Skill Trainer section was open, so the exercise screen's back button never points at a stale list.
  useEffect(() => { if (step === "home") setSkillSection(null); }, [step]);
  function handleSaveClick() { setShowWhatModal(true); }
  function handleModalSave() {
    if (selected.length === 0 && customItems.length === 0) return;
    save();
    setShowWhatModal(false);
  }
  const [selectedRating, setSelectedRating] = useState<string | null>(null);
  const [sessionIssues, setSessionIssues] = useState<string[]>([]);
  const [sessionNote, setSessionNote] = useState("");
  // Exact elapsed seconds from the just-finished session, kept alongside pendingMinutes (a
  // rounded whole-minute value used for the practice_sessions record itself) so the merge into
  // today's practice_logs total can use the precise duration instead of compounding rounding
  // error across repeated sessions.
  const [pendingSeconds, setPendingSeconds] = useState(0);
  function toggleSessionIssue(tagEn: string) {
    setSessionIssues((current) => current.includes(tagEn) ? current.filter((t) => t !== tagEn) : [...current, tagEn]);
  }
  // Reuses Practice Mode's own rudiment/exercise catalog directly -- no separate list to
  // maintain, so anything added to Practice Mode's rudiments or exercises automatically shows
  // up here too. Ordered by this student's own practice history (most-logged first).
  const rudimentExercises: { category: string; subcategory: { en: string; es: string } | null; en: string; es: string; nl: string }[] = sortedRudiments;
  const exerciseItems: { category: string; subcategory: { en: string; es: string } | null; en: string; es: string; nl: string }[] = sortedExercises ?? [];
  // Only one of the four dropdowns (Rudiments/Exercises/Books/My Items) is open at a time --
  // opening one closes the others so their flyouts never stack on top of each other.
  const [rudimentsOpen, setRudimentsOpenRaw] = useState(false);
  const [exercisesOpen, setExercisesOpenRaw] = useState(false);
  const [booksOpen, setBooksOpenRaw] = useState(false);
  const [myItemsOpen, setMyItemsOpenRaw] = useState(false);
  function setRudimentsOpen(next: boolean) { setRudimentsOpenRaw(next); if (next) { setExercisesOpenRaw(false); setBooksOpenRaw(false); setMyItemsOpenRaw(false); } }
  function setExercisesOpen(next: boolean) { setExercisesOpenRaw(next); if (next) { setRudimentsOpenRaw(false); setBooksOpenRaw(false); setMyItemsOpenRaw(false); } }
  function setBooksOpen(next: boolean) { setBooksOpenRaw(next); if (next) { setRudimentsOpenRaw(false); setExercisesOpenRaw(false); setMyItemsOpenRaw(false); } }
  function setMyItemsOpen(next: boolean) { setMyItemsOpenRaw(next); if (next) { setRudimentsOpenRaw(false); setExercisesOpenRaw(false); setBooksOpenRaw(false); } }
  const [rudimentSearch, setRudimentSearch] = useState("");
  const filteredRudiments = useMemo(() => {
    const q = rudimentSearch.trim().toLowerCase();
    if (!q) return rudimentExercises;
    return rudimentExercises.filter((r) => r[language as Lang].toLowerCase().includes(q));
  }, [rudimentExercises, rudimentSearch, language]);
  const [exerciseSearch, setExerciseSearch] = useState("");
  const filteredExercises = useMemo(() => {
    const q = exerciseSearch.trim().toLowerCase();
    if (!q) return exerciseItems;
    return exerciseItems.filter((r) => r[language as Lang].toLowerCase().includes(q));
  }, [exerciseItems, exerciseSearch, language]);
  // Specific rudiments/exercises aren't rows in the practice_items catalog table, so -- same as
  // how BPM-ladder exercise names already get handled -- they're saved via customItems (free
  // text) rather than selected (which requires a practice_items match).
  function toggleCustomItem(en: string) {
    setCustomItems((current: string[]) => current.includes(en) ? current.filter((v: string) => v !== en) : [...current, en]);
  }
  const selectedRudimentsCount = customItems.filter((ci: string) => rudimentExercises.some((r) => r.en === ci)).length;
  const selectedExercisesCount = customItems.filter((ci: string) => exerciseItems.some((r) => r.en === ci)).length;
  // Method books: a curated list plus whatever this student has added themselves (sticky,
  // saved to user_practice_items so it's still there next session). Selection is stored the
  // same way as rudiments -- customItems, since book titles aren't in the practice_items catalog.
  const [bookAddText, setBookAddText] = useState("");
  const allBooks = useMemo(() => [...PRACTICE_BOOKS, ...userBooks.filter((b: string) => !PRACTICE_BOOKS.includes(b))], [userBooks]);
  function toggleBook(name: string) {
    setCustomItems((current: string[]) => current.includes(name) ? current.filter((v: string) => v !== name) : [...current, name]);
  }
  async function addBook() {
    const trimmed = bookAddText.trim();
    if (!trimmed) return;
    if (!allBooks.includes(trimmed)) await onAddUserItem("book", trimmed);
    setCustomItems((current: string[]) => current.includes(trimmed) ? current : [...current, trimmed]);
    setBookAddText("");
  }
  const selectedBooksCount = customItems.filter((ci: string) => allBooks.includes(ci)).length;
  // "My Items" -- anything else the student wants to log that isn't a rudiment or a book.
  // Fully personal (no curated list), sticky the same way as books.
  const [myItemAddText, setMyItemAddText] = useState("");
  function toggleMyItem(name: string) {
    setCustomItems((current: string[]) => current.includes(name) ? current.filter((v: string) => v !== name) : [...current, name]);
  }
  async function addMyItem() {
    const trimmed = myItemAddText.trim();
    if (!trimmed) return;
    if (!userItems.includes(trimmed)) await onAddUserItem("item", trimmed);
    setCustomItems((current: string[]) => current.includes(trimmed) ? current : [...current, trimmed]);
    setMyItemAddText("");
  }
  const selectedMyItemsCount = customItems.filter((ci: string) => userItems.includes(ci)).length;
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
  // A permanent history marker, not a current-state one -- stays true forever once a level has ever
  // been rated not_ready/tense/almost, even after it's later unlocked. The point is being able to
  // look at an unlocked, mastered level and still see "I used to struggle here."
  function hasStruggledAt(itemEn: string, targetBpm: number) {
    return sessions.some((s: any) => s.item_en === itemEn && s.bpm === targetBpm && RATINGS_NEEDING_NOTE.includes(s.rating));
  }
  function exerciseStats(itemEn: string) {
    const unlockedLevels = bpmLevelsFor(itemEn).filter((level) => isUnlocked(itemEn, level));
    const bestBpm = unlockedLevels.length ? Math.max(...unlockedLevels) : null;
    const bestRating = bestBpm ? bestQualifyingRating(itemEn, bestBpm) : null;
    return { unlocked: unlockedLevels.length, bestBpm, bestRating };
  }
  // Rudiment-list gating, separate from the per-exercise BPM tempo ladder above: a rudiment
  // with prerequisites stays locked in the Rudiments list until every prerequisite has at
  // least 2 BPM levels unlocked (exerciseStats(...).unlocked >= 2) -- not until the prerequisite
  // itself is "fully" unlocked. Items with no prerequisites (the three always-unlocked roots)
  // are unlocked from the start.
  // Review switch: shows every rudiment unlocked so the stickings can be checked. It is only on when NEXT_PUBLIC_REVIEW_UNLOCK_ALL=1 is set
  // in the private .env.local on David's Mac (never committed). The website and the store builds do not have it, so they stay locked.
  const REVIEW_UNLOCK_ALL = process.env.NEXT_PUBLIC_REVIEW_UNLOCK_ALL === "1";
  function isRudimentUnlocked(itemEn: string) {
    if (REVIEW_UNLOCK_ALL) return true;
    const prereqs = PRACTICE_EXERCISES.find((e) => e.en === itemEn)?.prerequisites;
    if (!prereqs || prereqs.length === 0) return true;
    return prereqs.every((p) => exerciseStats(p).unlocked >= 2);
  }
  function tierProgress(itemEn: string, tier: { min: number; max: number }) {
    const levels = bpmLevelsFor(itemEn).filter((l) => l >= tier.min && l <= tier.max);
    const done = levels.filter((l) => isUnlocked(itemEn, l));
    return levels.length ? (done.length / levels.length) * 100 : 0;
  }
  async function handleReset(targetBpm: number) {
    if (!exercise) return;
    if (!(await confirm(T.practiceMode.confirmResetLevel(targetBpm)))) return;
    await onResetLevel(exercise, targetBpm);
  }
  // Remembers which tempo was just practiced so the ladder can scroll back to it and highlight
  // it -- otherwise returning from a session lands back at the top of a potentially long list,
  // and it's easy to lose track of which rung you just came from.
  const [justPracticedLevel, setJustPracticedLevel] = useState<number | null>(null);
  const rungRefs = useRef<Record<number, HTMLDivElement | null>>({});
  useEffect(() => {
    if (step !== "detail" || justPracticedLevel === null) return;
    rungRefs.current[justPracticedLevel]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [step, justPracticedLevel]);
  // Covers entry paths that land on this exercise's ladder without going through this
  // component's own openExercise (e.g. tapping a pinned exercise on Home) -- without this,
  // a stale highlight from a different exercise could wrongly appear on a matching BPM here.
  useEffect(() => { setJustPracticedLevel(null); }, [exercise]);
  // Opening an exercise's tempo list always starts at the first tempo (50): the page used to keep the scroll position of the list it came from.
  // (Returning from a practice round is the exception: that scrolls to the tempo you just practised, see above.)
  const justPracticedRef = useRef<number | null>(null);
  justPracticedRef.current = justPracticedLevel;
  useEffect(() => {
    if (step !== "detail" || !exercise) return;
    const id = requestAnimationFrame(() => { if (justPracticedRef.current === null) window.scrollTo(0, 0); });
    return () => cancelAnimationFrame(id);
  }, [step, exercise]);
  const [editingLevel, setEditingLevel] = useState<number | null>(null);
  const [editRating, setEditRating] = useState<string | null>(null);
  const [editIssues, setEditIssues] = useState<string[]>([]);
  const [editNote, setEditNote] = useState("");
  function sessionDetailsAt(itemEn: string, targetBpm: number) {
    const matches = sessions.filter((s: any) => s.item_en === itemEn && s.bpm === targetBpm);
    const last = matches[matches.length - 1];
    return { issues: last?.issues ?? [], note: last?.notes ?? "" };
  }
  function openEditRating(level: number) {
    if (!exercise) return;
    const current = bestQualifyingRating(exercise, level) ?? bestRatingAny(exercise, level);
    const details = sessionDetailsAt(exercise, level);
    setEditRating(current);
    setEditIssues(details.issues);
    setEditNote(details.note);
    setEditingLevel(level);
  }
  function toggleEditIssue(tagEn: string) {
    setEditIssues((current) => current.includes(tagEn) ? current.filter((t) => t !== tagEn) : [...current, tagEn]);
  }
  async function saveEditRating() {
    if (!exercise || editingLevel === null || !editRating) return;
    await onEditRating(exercise, editingLevel, editRating, editIssues, editNote.trim());
    setEditingLevel(null);
  }
  async function handleResetPractice() {
    if (!(await confirm(T.today.confirmResetPractice))) return;
    await onReset();
  }
  const RATING_LABEL: Record<string, string> = { not_ready: T.practiceMode.ratingNotReady, tense: T.practiceMode.ratingTense, almost: T.practiceMode.ratingAlmost, comfortable: T.practiceMode.ratingComfortable, mastered: T.practiceMode.ratingMastered };
  const TIER_LABEL: Record<string, string> = { beginner: T.practiceMode.tierBeginner, intermediate: T.practiceMode.tierIntermediate, advanced: T.practiceMode.tierAdvanced, legend: T.practiceMode.tierLegend };
  const CATEGORY_LABEL: Record<string, string> = { rudiments: T.practiceMode.categoryRudiments, exercises: T.practiceMode.categoryExercises, rhythms: T.practiceMode.categoryRhythms };
  const SUBDIVISION_LABEL: Record<string, string> = { quarter: T.practiceMode.subdivisionQuarter, eighth: T.practiceMode.subdivisionEighth, triplet: T.practiceMode.subdivisionTriplet, sixteenth: T.practiceMode.subdivisionSixteenth, sixteenthTriplet: T.practiceMode.subdivisionSixteenthTriplet };
  function openExercise(itemEn: string) {
    const match = PRACTICE_EXERCISES.find((e) => e.en === itemEn);
    if (match) { setCategory(match.category); setRudimentTier((match as any).tier ?? null); setExerciseGroup((match as any).exerciseGroup ?? null); }
    setJustPracticedLevel(null); setExercise(itemEn); setStep("detail");
  }
  function startSession(targetBpm: number) { setJustPracticedLevel(null); setBpm(targetBpm); setStep("session"); }
  async function handleSessionEnd(elapsedSeconds: number) {
    const sessionMinutes = Math.max(1, Math.round(elapsedSeconds / 60));
    // Always ask how it went, even for a tempo that was rated before: how it feels can change.
    setPendingMinutes(sessionMinutes);
    setPendingSeconds(elapsedSeconds);
    setSelectedRating(null);
    setSessionIssues([]);
    setSessionNote("");
    setStep("rate");
  }
  async function submitRating(rating: string) {
    if (!exercise) return;
    await onLogSession(exercise, bpm, rating, pendingMinutes, pendingSeconds, sessionIssues, sessionNote.trim());
    setJustPracticedLevel(bpm);
    setStep("detail"); // back to the tempo list, scrolled to the tempo just practised
  }
  function handleRatingTap(r: string) {
    // Tapping a rating only selects it; a Save button then confirms. The struggling ratings also
    // reveal the issue tags/note step first since that's when context is actually useful.
    setSelectedRating(r);
  }
  function skipRating() {
    setJustPracticedLevel(bpm);
    setStep("detail");
  }
  function ExerciseRow({ item }: { item: { en: string; es: string; nl: string } }) {
    const stats = exerciseStats(item.en);
    const full = PRACTICE_EXERCISES.find((e) => e.en === item.en);
    const locked = full?.category === "rudiments" && !isRudimentUnlocked(item.en);
    if (locked) {
      const prereqLabels = (full?.prerequisites ?? []).map((p) => PRACTICE_EXERCISES.find((e) => e.en === p)?.[language as Lang] ?? p);
      return <div className="ex-row ex-row-locked">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="lock-icon"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></svg>
        <div className="info">
          <p className="name">{item[language as Lang]}</p>
          <p className="locked-hint">{T.practiceMode.unlockFirst(prereqLabels.join(language === "es" ? " y " : language === "nl" ? " en " : " and "))}</p>
        </div>
      </div>;
    }
    return <button className="ex-row" onClick={() => openExercise(item.en)}>
      <div className="info">
        <p className="name">{item[language as Lang]}</p>
        {stats.unlocked > 0 && <div className="meta">
          <span className="best-dot" style={{ background: RATING_COLOR[stats.bestRating ?? ""] }} />
          <span>{stats.bestBpm} BPM</span>
          <div className="track"><i style={{ width: `${(stats.unlocked / bpmLevelsFor(item.en).length) * 100}%` }} /></div>
          <span className="frac">{stats.unlocked}/{bpmLevelsFor(item.en).length}</span>
        </div>}
      </div>
      <span className="chev">›</span>
    </button>;
  }

  if (step === "home") {
    const lastSession = sessions.length ? sessions.reduce((latest: any, x: any) => (x.created_at > latest.created_at ? x : latest), sessions[0]) : null;
    const lastMatch = lastSession ? PRACTICE_EXERCISES.find((e) => e.en === lastSession.item_en) : null;
    const todayTotal = (Number(minutes) || 0) + (Number(seconds) || 0) / 60;
    const goalPctHub = dailyGoal ? Math.min(100, (todayTotal / Math.max(1, dailyGoal)) * 100) : 0;
    return <section className="page">
      <header className="simple-head"><p className="eyebrow">{T.practiceMode.pageEyebrow}</p><h1>{T.practiceMode.pageTitle}</h1></header>
      <div className="hub-today">
        <div className="hub-today-top"><span>{T.today.todaySummary}</span><strong>{formatMinutes(Math.floor(todayTotal))}{dailyGoal ? ` / ${formatMinutes(dailyGoal)}` : ""}</strong></div>
        {dailyGoal ? <div className="goal-progress-track"><div className={todayTotal >= dailyGoal ? "goal-progress-bar achieved" : "goal-progress-bar"} style={{ width: `${goalPctHub}%` }} /></div> : null}
      </div>
      {lastSession && lastMatch && <button type="button" className="hub-continue" onClick={() => { setCategory(lastMatch.category); setRudimentTier((lastMatch as any).tier ?? null); setExerciseGroup((lastMatch as any).exerciseGroup ?? null); openExercise(lastSession.item_en); }}>
        <span className="hub-continue-play"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" /></svg></span>
        <span className="hub-text"><small>{T.practiceMode.continueLabel}</small><strong>{lastMatch[language as Lang]}</strong></span>
        <span className="hub-continue-bpm">{lastSession.bpm} BPM</span>
      </button>}
      {lastSession && lastMatch && <div className="hub-sep" aria-hidden="true" />}
      <div className="practice-hub">
        <button type="button" className="hub-card" onClick={() => setStep("quick")}>
          <span className="hub-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13 2.5L5.5 14H11l-1 7.5L18.5 10H13l0-7.5z" /></svg></span>
          <span className="hub-text"><strong>{T.practiceMode.quickTitle}</strong><small>{T.practiceMode.quickSub}</small></span>
          <span className="hub-chev">›</span>
        </button>
        <button type="button" className="hub-card" onClick={() => setStep("skill")}>
          <span className="hub-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.4" fill="currentColor" /></svg></span>
          <span className="hub-text"><strong>{T.practiceMode.trainTitle}</strong><small>{T.practiceMode.skillSub}</small></span>
          <span className="hub-chev">›</span>
        </button>
        <button type="button" className="hub-card" onClick={() => setStep("challenges")}>
          <span className="hub-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 4h8v5a4 4 0 01-8 0V4zM8 6H5v1a3 3 0 003 3M16 6h3v1a3 3 0 01-3 3M12 13v4M9 20h6M10 17h4" /></svg></span>
          <span className="hub-text"><strong>{T.personalChallenges.title}</strong><small>{T.practiceMode.challengesSub}</small></span>
          <span className="hub-chev">›</span>
        </button>
      </div>
    </section>;
  }
  if (step === "skill") {
    const RUDIMENT_TIERS: ("basics" | "intermediate" | "advanced")[] = ["basics", "intermediate", "advanced"];
    const RUDIMENT_TIER_LABEL: Record<string, string> = { basics: T.practiceMode.rudimentTierBasics, intermediate: T.practiceMode.rudimentTierIntermediate, advanced: T.practiceMode.rudimentTierAdvanced };
    const EXERCISE_GROUPS: ("hand" | "footwork" | "coordination")[] = ["hand", "footwork", "coordination"];
    const EXERCISE_GROUP_LABEL: Record<string, string> = { hand: T.practiceMode.exerciseGroupHand, footwork: T.practiceMode.exerciseGroupFootwork, coordination: T.practiceMode.exerciseGroupCoordination };
    const allRudiments = PRACTICE_EXERCISES.filter((e) => e.category === "rudiments" && (!kidMode || e.difficulty !== "advanced"));
    const allExercisesList = PRACTICE_EXERCISES.filter((e) => e.category === "exercises" && (!kidMode || ESSENTIAL_EXERCISES.has(e.en)));
    const query = skillSearch.trim().toLowerCase();
    const matches = query ? [...allRudiments, ...allExercisesList].filter((e) => e[language as Lang].toLowerCase().includes(query)) : [];
    function openSection(key: string) { setSkillSection(key); setStep("skillList"); }
    return <section className="page">
      <div className="back-row"><button onClick={() => setStep("home")}>‹</button><div className="title-block"><p className="eyebrow">{T.practiceMode.pageTitle}</p><h2>{T.practiceMode.trainTitle}</h2></div></div>
      <div className="admin-mini-toggle admin-mini-toggle-wide skill-tabs">
        <button type="button" className={skillTab === "rudiments" ? "selected" : ""} onClick={() => setSkillTab("rudiments")}>{CATEGORY_LABEL.rudiments}</button>
        <button type="button" className={skillTab === "exercises" ? "selected" : ""} onClick={() => setSkillTab("exercises")}>{CATEGORY_LABEL.exercises}</button>
      </div>
      <input className="rudiment-search skill-search" value={skillSearch} onChange={(e) => setSkillSearch(e.target.value)} placeholder={T.practiceMode.skillSearchPlaceholder} />
      {query ? (matches.length ? <div className="book-list">{matches.map((item) => <ExerciseRow key={item.en} item={item} />)}</div> : <p className="hint">{T.practiceMode.skillNoMatch}</p>)
        : skillTab === "rudiments" && kidMode ? <>
          {/* Essentials has so few rudiments that category cards just add a tap, so it shows one plain list (easiest tier first). */}
          <p className="category-list-intro">{T.practiceMode.rudimentListIntro}</p>
          <div className="book-list">{[...allRudiments].sort((a, b) => RUDIMENT_TIERS.indexOf(a.tier as any) - RUDIMENT_TIERS.indexOf(b.tier as any)).map((item) => <ExerciseRow key={item.en} item={item} />)}</div>
        </>
        : skillTab === "rudiments" ? <div className="tier-select-list">
          {RUDIMENT_TIERS.map((tier, idx) => {
            const tierItems = allRudiments.filter((e) => e.tier === tier);
            if (!tierItems.length) return null;
            const unlockedCount = tierItems.filter((item) => isRudimentUnlocked(item.en)).length;
            return <button key={tier} className={`tier-card tier-card-${tier}`} onClick={() => openSection(`r-${tier}`)}>
              <span className="tier-card-num">{String(idx + 1).padStart(2, "0")}</span>
              <p className="tier-card-title">{RUDIMENT_TIER_LABEL[tier]}</p>
              <div className="tier-card-progress">
                <span className="tier-card-count">{T.practiceMode.tierUnlockedCount(unlockedCount, tierItems.length)}</span>
                <div className="tier-card-bar-track"><div className="tier-card-bar" style={{ width: `${Math.max(4, (unlockedCount / tierItems.length) * 100)}%` }} /></div>
              </div>
              <span className="tier-card-chev"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg></span>
            </button>;
          })}
        </div> : kidMode ? <>
          <p className="category-list-intro">{T.practiceMode.listIntroExercises(UNLOCK_MINUTES)}</p>
          <div className="book-list">{[...allExercisesList].sort((a, b) => EXERCISE_GROUPS.indexOf(a.exerciseGroup as any) - EXERCISE_GROUPS.indexOf(b.exerciseGroup as any)).map((item) => <ExerciseRow key={item.en} item={item} />)}</div>
        </> : <div className="tier-select-list">
          {EXERCISE_GROUPS.map((group, idx) => {
            const groupItems = allExercisesList.filter((e) => e.exerciseGroup === group);
            if (!groupItems.length) return null;
            const practicedCount = groupItems.filter((item) => sessions.some((x: any) => x.item_en === item.en)).length;
            return <button key={group} className={`tier-card tier-card-${group}`} onClick={() => openSection(`e-${group}`)}>
              <span className="tier-card-num">{String(idx + 1).padStart(2, "0")}</span>
              <p className="tier-card-title">{EXERCISE_GROUP_LABEL[group]}</p>
              <div className="tier-card-progress">
                <span className="tier-card-count">{T.practiceMode.exercisesPracticedCount(practicedCount, groupItems.length)}</span>
                <div className="tier-card-bar-track"><div className="tier-card-bar" style={{ width: `${Math.max(4, (practicedCount / groupItems.length) * 100)}%` }} /></div>
              </div>
              <span className="tier-card-chev"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg></span>
            </button>;
          })}
        </div>}
    </section>;
  }
  if (step === "skillList" && skillSection) {
    const isRudiments = skillSection.startsWith("r-");
    const key = skillSection.slice(2);
    const RUDIMENT_TIER_LABEL: Record<string, string> = { basics: T.practiceMode.rudimentTierBasics, intermediate: T.practiceMode.rudimentTierIntermediate, advanced: T.practiceMode.rudimentTierAdvanced };
    const EXERCISE_GROUP_LABEL: Record<string, string> = { hand: T.practiceMode.exerciseGroupHand, footwork: T.practiceMode.exerciseGroupFootwork, coordination: T.practiceMode.exerciseGroupCoordination };
    function lastPracticedOn(itemEn: string): string {
      let latest = "";
      sessions.forEach((x: any) => { if (x.item_en === itemEn && x.practiced_on > latest) latest = x.practiced_on; });
      return latest;
    }
    const listItems = isRudiments
      ? PRACTICE_EXERCISES.filter((e) => e.category === "rudiments" && e.tier === key && (!kidMode || e.difficulty !== "advanced"))
      : PRACTICE_EXERCISES.filter((e) => e.category === "exercises" && e.exerciseGroup === key && (!kidMode || ESSENTIAL_EXERCISES.has(e.en))).sort((a, b) => lastPracticedOn(b.en).localeCompare(lastPracticedOn(a.en)));
    return <section className="page">
      <div className="back-row"><button onClick={() => setStep("skill")}>‹</button><div className="title-block"><p className="eyebrow">{T.practiceMode.trainTitle}</p><h2>{isRudiments ? RUDIMENT_TIER_LABEL[key] : EXERCISE_GROUP_LABEL[key]}</h2></div></div>
      <p className="category-list-intro">{isRudiments ? T.practiceMode.rudimentListIntro : T.practiceMode.listIntroExercises(UNLOCK_MINUTES)}</p>
      <div className="book-list">{listItems.map((item) => <ExerciseRow key={item.en} item={item} />)}</div>
    </section>;
  }
  if (step === "challenges") {
    return <section className="page">
      <div className="back-row"><button onClick={() => setStep("home")}>‹</button><div className="title-block"><p className="eyebrow">{T.practiceMode.pageTitle}</p></div></div>
      <PersonalChallenges user={user} practiceSessions={sessions} confirm={confirm} setError={setError} language={language} T={T} />
    </section>;
  }
  if (step === "quick") {
    return <section className="page">
      <div className="back-row"><button onClick={() => setStep("home")}>‹</button><div className="title-block"><p className="eyebrow">{T.practiceMode.pageTitle}</p></div></div>
      <div className="hub-today">
        <div className="hub-today-top"><span>{T.today.todaySummary}</span><strong>{formatMinutes(Math.floor((Number(minutes) || 0) + (Number(seconds) || 0) / 60))}{dailyGoal ? ` / ${formatMinutes(dailyGoal)}` : ""}</strong></div>
        {dailyGoal ? <div className="goal-progress-track"><div className={(Number(minutes) || 0) >= dailyGoal ? "goal-progress-bar achieved" : "goal-progress-bar"} style={{ width: `${Math.min(100, ((Number(minutes) || 0) / Math.max(1, dailyGoal)) * 100)}%` }} /></div> : null}
      </div>
      <div className="practice-tools">
        <button type="button" className="practice-tool" onClick={openMetronome}>
          <span className="practice-tool-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 21l1.8-16.5a.7.7 0 01.7-.5h2a.7.7 0 01.7.5L15.5 21z" /><path d="M12 17.5L15.2 8" /><circle cx="14.3" cy="11.2" r="1" fill="currentColor" /><path d="M6.5 21h11" /></svg></span>
          <span className="practice-tool-label">{T.today.metronome}</span>
        </button>
        <button type="button" className="practice-tool" onClick={openSessionTimer}>
          <span className="practice-tool-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="13.5" r="7.5" /><path d="M12 9.5v4l2.6 1.6" /><path d="M9.5 2.5h5" /><path d="M12 2.5v3.5" /></svg></span>
          <span className="practice-tool-label">{T.sessionTimer.pillLabel}</span>
        </button>
      </div>
      <div className="mode-header quick-header">
        <img src="/icons/lightning.png" alt="" className="mode-icon quick" />
        <div className="mode-copy"><h2>{T.practiceMode.quickTitle}</h2></div>
        <button type="button" className="quick-reset" onClick={handleResetPractice}>{T.today.resetPractice}</button>
      </div>
      <div className="form-card quick-start"><label className="input-label">{T.today.practiceTimeHeading}</label>
        {equipment === "both" ? (
          <p className="quick-split-summary">{equipmentSplitLabel(Number(drumsetMinutes) || 0, Number(padMinutes) || 0, T)}</p>
        ) : (
          <div className="minutes-island">
            <button className="minutes-step" onClick={() => setQuickAddMinutes(String(Math.max(0, (Number(quickAddMinutes) || 0) - 5)))}>-5</button>
            <button className="minutes-step" onClick={() => setQuickAddMinutes(String(Math.max(0, (Number(quickAddMinutes) || 0) - 1)))}>-1</button>
            <div className="minutes-value"><input inputMode="numeric" size={3} value={quickAddMinutes} onChange={(e: any) => setQuickAddMinutes(e.target.value.replace(/\D/g, ""))}/><span>min</span></div>
            <button className="minutes-step" onClick={() => setQuickAddMinutes(String((Number(quickAddMinutes) || 0) + 1))}>+1</button>
            <button className="minutes-step" onClick={() => setQuickAddMinutes(String((Number(quickAddMinutes) || 0) + 5))}>+5</button>
          </div>
        )}
        <button className={saved ? "save saved" : "save"} onClick={handleSaveClick} disabled={equipment === "both" ? (Number(drumsetMinutes) || 0) + (Number(padMinutes) || 0) <= 0 : (Number(quickAddMinutes) || 0) <= 0}>{saved ? T.today.practiceSaved : T.today.savePractice}<span>→</span></button>
      </div>

      <div className="quick-recent">
        <span className="section-label">{T.practiceMode.recentDays}</span>
        {(() => {
          const recentDays = Object.keys(logs ?? {}).filter((d) => (logs[d]?.minutes ?? 0) > 0).sort().reverse().slice(0, 5);
          if (!recentDays.length) return <p className="hint">{T.practiceMode.noRecentDays}</p>;
          return recentDays.map((d) => {
            const entry = logs[d];
            // Skill Trainer exercises practised that day are logged separately from Quick Practice's tags, so merge both.
            const skillNames = (sessions ?? []).filter((s: any) => s.practiced_on === d).map((s: any) => s.item_en as string);
            const names = Array.from(new Set([...(entry.items ?? []), ...(entry.customItems ?? []), ...skillNames])).map((n: string) => practicedItemLabel(n, language));
            return <div key={d} className="quick-recent-row">
              <span className="quick-recent-date">{new Date(d + "T12:00:00").toLocaleDateString(localeFor(language), { weekday: "short" })} {formatDMY(d).slice(0, 5)}</span>
              <span className="quick-recent-items">{names.slice(0, 3).join(", ")}{names.length > 3 ? ` +${names.length - 3}` : ""}</span>
              <span className="quick-recent-min">{formatMinutes(entry.minutes)}</span>
            </div>;
          });
        })()}
      </div>
      {showWhatModal && <div className="modal modal-center" onClick={() => setShowWhatModal(false)}><div className="day-summary" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={() => setShowWhatModal(false)}>×</button>
        <h2 className="edit-rating-title">{T.today.whatDidYouPractiseTitle}</h2>
        <p className="confirm-message">{T.today.whatDidYouPractiseSubtitle}</p>
        <div className="equipment-toggle modal-equipment">
          <button className={equipment === "drumset" || equipment === "both" ? "equipment-option selected" : "equipment-option"} onClick={() => handleEquipmentToggle("drumset")}>{T.today.drumset}</button>
          <button className={equipment === "pad" || equipment === "both" ? "equipment-option selected" : "equipment-option"} onClick={() => handleEquipmentToggle("pad")}>{T.today.pad}</button>
        </div>
        {equipment === "both" && <div className="modal-split">          <div className="split-minutes">
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
        </div>}
        <div className="chips">
          <ChipDropdown label={T.today.rudiments} selectedCount={selectedRudimentsCount} open={rudimentsOpen} onToggleOpen={() => setRudimentsOpen(!rudimentsOpen)}
            searchable searchValue={rudimentSearch} onSearchChange={setRudimentSearch} searchPlaceholder={T.today.searchRudiments}
            rows={filteredRudiments.map((r) => ({ key: r.en, label: r[language as Lang], selected: customItems.includes(r.en), onToggle: () => toggleCustomItem(r.en) }))} doneLabel={T.today.pickerDone} />
          <ChipDropdown label={T.practiceMode.categoryExercises} selectedCount={selectedExercisesCount} open={exercisesOpen} onToggleOpen={() => setExercisesOpen(!exercisesOpen)}
            searchable searchValue={exerciseSearch} onSearchChange={setExerciseSearch} searchPlaceholder={T.today.searchExercises}
            rows={filteredExercises.map((r) => ({ key: r.en, label: r[language as Lang], selected: customItems.includes(r.en), onToggle: () => toggleCustomItem(r.en) }))} doneLabel={T.today.pickerDone} />
          {QUICK_PRACTICE_ITEMS.map((item) => <button key={item.en} onClick={() => toggle(item.en)} className={selected.includes(item.en) ? "chip selected" : "chip"}>{selected.includes(item.en) && <b>✓</b>}{item[language as Lang]}</button>)}
          <ChipDropdown label={T.today.books} selectedCount={selectedBooksCount} open={booksOpen} onToggleOpen={() => setBooksOpen(!booksOpen)}
            rows={allBooks.map((name: string) => ({ key: name, label: name, selected: customItems.includes(name), onToggle: () => toggleBook(name), onDelete: PRACTICE_BOOKS.includes(name) ? undefined : () => onRemoveUserItem("book", name) }))}
            addValue={bookAddText} onAddChange={setBookAddText} onAdd={addBook} addPlaceholder={T.today.addOwnBookPlaceholder} addBtnLabel={T.today.addOwnBtn} doneLabel={T.today.pickerDone} />
          <ChipDropdown label={T.today.myItems} selectedCount={selectedMyItemsCount} open={myItemsOpen} onToggleOpen={() => setMyItemsOpen(!myItemsOpen)}
            rows={userItems.map((name: string) => ({ key: name, label: name, selected: customItems.includes(name), onToggle: () => toggleMyItem(name), onDelete: () => onRemoveUserItem("item", name) }))}
            addValue={myItemAddText} onAddChange={setMyItemAddText} onAdd={addMyItem} addPlaceholder={T.today.addOwnPlaceholder} addBtnLabel={T.today.addOwnBtn} doneLabel={T.today.pickerDone} />
        </div>
        {showNotes ? <><label className="input-label notes-label">{T.today.notes} <em>{T.today.optional}</em></label><textarea maxLength={2000} value={notes} onChange={(e: any) => setNotes(e.target.value)} placeholder={T.today.notesPlaceholder} autoFocus={notesOpen} /></> : <button className="notes-toggle" onClick={() => setNotesOpen(true)}>{T.today.addNotes}</button>}
        <button className="save" onClick={handleModalSave} disabled={selected.length === 0 && customItems.length === 0}>{T.today.savePractice}</button>
      </div></div>}
    </section>;
  }

  if (step === "detail" && exercise) {
    const stats = exerciseStats(exercise);
    const label = PRACTICE_EXERCISES.find((i) => i.en === exercise)?.[language as Lang] ?? exercise;
    const isPinned = pinnedExercises.includes(exercise);
    // The note value shown follows the arrangement actually used at the chosen difficulty (falls back to the exercise's own value).
    const arranged = effectiveRhythm(exercise, practiceDifficulty);
    const subdivision = arranged ? ({ 1: "quarter", 2: "eighth", 3: "triplet", 4: "sixteenth", 6: "sixteenthTriplet", 8: "sixteenth" } as Record<number, "quarter" | "eighth" | "triplet" | "sixteenth" | "sixteenthTriplet">)[arranged.perBeat] : PRACTICE_EXERCISES.find((e) => e.en === exercise)?.subdivision;
    return <section className="page">
      <div className="detail-sticky">
      <div className="back-row"><button onClick={() => setStep(skillSection && !skillSearch.trim() ? "skillList" : "skill")}>‹</button><div className="title-block"><p className="eyebrow">{T.practiceMode.title}</p><h2>{label}</h2></div><button className={isPinned ? "pin-toggle pinned" : "pin-toggle"} onClick={() => onTogglePin(exercise)} aria-label={isPinned ? T.practiceMode.pinned : T.practiceMode.pin} title={isPinned ? T.practiceMode.pinned : T.practiceMode.pin}><svg viewBox="0 0 24 24" fill={isPinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4a1 1 0 011-1h10a1 1 0 011 1v16l-6-4-6 4V4z" /></svg></button></div>
      <div className="level-card">
        <div className="badge">{stats.bestRating ? RATING_ICON[stats.bestRating] : "🥁"}</div>
        <div>
          <p className="lc-label">{T.practiceMode.currentLevel}</p>
          <p className="lc-value">{stats.bestBpm ? `${stats.bestBpm} BPM` : "—"}</p>
          <p className="lc-sub">{T.practiceMode.levelsUnlocked(stats.unlocked, bpmLevelsFor(exercise).length)}</p>
        </div>
        {subdivision && <div className="level-note">
          <NoteValueIcon subdivision={subdivision} />
          <strong>{SUBDIVISION_LABEL[subdivision]}</strong>
        </div>}
      </div>
      <div className="tier-strip">
        {tiersFor(exercise).map((tier) => <div key={tier.key} className="tier-seg">{renderTierSegBar(tierProgress(exercise, tier), tierIsSkipped(sessions, exercise, tier))}<span className="seg-label">{TIER_LABEL[tier.key]}</span></div>)}
      </div>
      </div>
      {tiersFor(exercise).map((tier) => {
        const levels = bpmLevelsFor(exercise).filter((l) => l >= tier.min && l <= tier.max);
        if (!levels.length) return null;
        return <div key={tier.key} className="ladder-tier-group">
          <div className="ladder-tier-divider"><span>{TIER_LABEL[tier.key]}</span></div>
          <div className="ladder">
            {levels.map((level) => {
              const qualifying = qualifyingMinutesAt(exercise, level);
              const unlocked = qualifying >= UNLOCK_MINUTES;
              const rating = bestQualifyingRating(exercise, level);
              const anyRating = bestRatingAny(exercise, level);
              const hasHistory = hasHistoryAt(exercise, level);
              const totalMinutes = totalMinutesAny(exercise, level);
              const pct = unlocked ? 100 : Math.min(100, (totalMinutes / UNLOCK_MINUTES) * 100);
              const barColor = unlocked ? RATING_COLOR[rating ?? "comfortable"] : anyRating ? RATING_COLOR[anyRating] : "#ff6b1a";
              const skipped = !unlocked && totalMinutes === 0 && bpmLevelsFor(exercise).some((l) => l > level && isUnlocked(exercise, l));
              const stateClass = unlocked ? "unlocked" : totalMinutes > 0 ? "in-progress" : skipped ? "skipped" : "not-started";
              const struggled = hasStruggledAt(exercise, level);
              return <div key={level} ref={(el) => { rungRefs.current[level] = el; }} className={`rung ${stateClass}${justPracticedLevel === level ? " just-practiced" : ""}`}>
                {struggled && <span className="rung-struggled-flag" title={T.practiceMode.struggledFlagTitle}><svg viewBox="0 0 20 20" fill="currentColor"><rect x="4" y="2" width="1.6" height="16" rx="0.8" /><path d="M6.2 3L16 6.5 6.2 10V3z" /></svg></span>}
                <button className="rung-tap" onClick={() => startSession(level)}>
                  <span className="bpm">{level}</span>
                  <span className="rung-progress-label">{unlocked ? (rating === "mastered" ? "⭐" : "✓") : `${Math.min(totalMinutes, UNLOCK_MINUTES)}/${UNLOCK_MINUTES} min`}</span>
                  <div className="rung-progress">
                    <div className="rung-progress-track"><div className="rung-progress-bar" style={{ width: `${pct}%`, background: barColor }} /></div>
                  </div>
                </button>
                {hasHistory && <button className="rung-edit" onClick={() => openEditRating(level)}>✎</button>}
                {hasHistory && <button className="rung-reset" onClick={() => handleReset(level)}>↺</button>}
              </div>;
            })}
          </div>
        </div>;
      })}
      {editingLevel !== null && <div className="modal modal-center" onClick={() => setEditingLevel(null)}><div className="day-summary" onClick={(e) => e.stopPropagation()}>
        <p className="eyebrow">{editingLevel} BPM</p>
        <h2 className="edit-rating-title">{T.practiceMode.editRatingTitle}</h2>
        <div className="rating-grid">
          {RATING_ORDER.map((r) => <button key={r} className={editRating === r ? `rating-btn ${r} selected` : `rating-btn ${r}`} onClick={() => setEditRating(r)}><span className="rating-icon">{RATING_ICON[r]}</span>{RATING_LABEL[r]}</button>)}
        </div>
        {RATINGS_NEEDING_NOTE.includes(editRating ?? "") && <>
          <label className="input-label issue-label">{T.practiceMode.issueLabel}</label>
          <div className="issue-groups">{SESSION_ISSUE_GROUPS.map((g) => <div key={g.title.en} className="issue-group"><span className="issue-group-title">{g.title[language as Lang]}</span><div className="chips">{g.tags.map((tag) => <button key={tag.en} onClick={() => toggleEditIssue(tag.en)} className={editIssues.includes(tag.en) ? "chip selected" : "chip"}>{editIssues.includes(tag.en) && <b>✓</b>}{tag[language as Lang]}</button>)}</div></div>)}</div>
          <textarea maxLength={2000} value={editNote} onChange={(e: any) => setEditNote(e.target.value)} placeholder={T.practiceMode.sessionNotePlaceholder} />
        </>}
        <button className="save" onClick={saveEditRating}>{T.practiceMode.saveRating}<span>→</span></button>
      </div></div>}
      <div className="legend">
        <span><i style={{ background: "#303531" }} />{T.practiceMode.notStarted}</span>
        <span><i className="legend-dash" />{T.practiceMode.skippedLabel}</span>
        <span><i style={{ background: "#ff6b1a" }} />{T.practiceMode.inProgress}</span>
        <span><i style={{ background: RATING_COLOR.comfortable }} />{T.practiceMode.unlockedLabel}</span>
        <span>⭐ {T.practiceMode.ratingMastered}</span>
      </div>
    </section>;
  }

  if (step === "session" && exercise) {
    const label = PRACTICE_EXERCISES.find((i) => i.en === exercise)?.[language as Lang] ?? exercise;
    return <section className="page">
      <div className="back-row"><button onClick={() => setStep("detail")}>‹</button><div className="title-block"><p className="eyebrow">{T.practiceMode.title}</p><h2>{label} · {bpm} BPM</h2></div></div>
      <Metronome open={true} initialBpm={bpm} onSessionEnd={handleSessionEnd} close={() => setStep("detail")} tone={metronomeTone} onToneChange={onMetronomeToneChange} exerciseLabel={label} exerciseEn={exercise} difficulty={practiceDifficulty} sessions={sessions} lockTempo language={language} T={T} />
    </section>;
  }

  if (step === "rate" && exercise) {
    const label = PRACTICE_EXERCISES.find((i) => i.en === exercise)?.[language as Lang] ?? exercise;
    return <section className="page">
      <header className="simple-head"><p className="eyebrow">{label} · {bpm} BPM</p><h1>{T.practiceMode.rateTitle}</h1></header>
      <div className="rating-grid">
        {RATING_ORDER.map((r) => <button key={r} className={selectedRating === r ? `rating-btn ${r} selected` : `rating-btn ${r}`} onClick={() => handleRatingTap(r)}><span className="rating-icon">{RATING_ICON[r]}</span>{RATING_LABEL[r]}</button>)}
      </div>
      {selectedRating && !RATINGS_NEEDING_NOTE.includes(selectedRating) && <button className="save" onClick={() => submitRating(selectedRating)}>{T.practiceMode.saveRating}<span>→</span></button>}
      {selectedRating && RATINGS_NEEDING_NOTE.includes(selectedRating) && <div className="form-card">
        <label className="input-label issue-label">{T.practiceMode.issueLabel}</label>
        <div className="issue-groups">{SESSION_ISSUE_GROUPS.map((g) => <div key={g.title.en} className="issue-group"><span className="issue-group-title">{g.title[language as Lang]}</span><div className="chips">{g.tags.map((tag) => <button key={tag.en} onClick={() => toggleSessionIssue(tag.en)} className={sessionIssues.includes(tag.en) ? "chip selected" : "chip"}>{sessionIssues.includes(tag.en) && <b>✓</b>}{tag[language as Lang]}</button>)}</div></div>)}</div>
        <textarea maxLength={2000} value={sessionNote} onChange={(e: any) => setSessionNote(e.target.value)} placeholder={T.practiceMode.sessionNotePlaceholder} />
        <button className="save" onClick={() => submitRating(selectedRating)}>{T.practiceMode.saveRating}<span>→</span></button>
      </div>}
      <button className="reset-practice" onClick={skipRating}>{T.practiceMode.skipRating}</button>
    </section>;
  }
  return null;
}
// Placeholder blocks shown while a screen loads, instead of a blank page with three dots.
function PageSkeleton({ bare }: { bare?: boolean }) {
  const blocks = <div className="skeleton-stack" role="status" aria-label="Loading"><i className="skel skel-card" /><i className="skel skel-card" /><i className="skel skel-card skel-tall" /></div>;
  if (bare) return blocks;
  return <section className="page"><div className="skel skel-title" />{blocks}</section>;
}
function Settings({ signOut, user, setError, profileName, onProfileNameSaved, language: currentLanguage, onLanguageSaved, dailyGoal, onGoalSaved, metronomeTone: currentMetronomeTone, onMetronomeToneSaved, showDaysThisYear: currentShowDaysThisYear, onShowDaysThisYearSaved, kidMode: currentKidMode, onKidModeSaved, ageBand: currentBand, practiceDifficulty: currentDifficulty, onAgeBandSaved, onDifficultySaved, onBack, drumState, onDrumPoints, T }: { drumState: { eligible: boolean; enabled: boolean; prompted: boolean } | null; onDrumPoints: (on: boolean) => Promise<boolean>; ageBand: AgeBand | null; practiceDifficulty: Difficulty; onAgeBandSaved: (band: AgeBand | null) => void; onDifficultySaved: (difficulty: Difficulty) => void; signOut: () => void; user: any; setError: (message: string) => void; profileName: string; onProfileNameSaved: (name: string) => void; language: Lang; onLanguageSaved: (language: Lang) => void; dailyGoal: number | null; onGoalSaved: (goal: number | null) => void; metronomeTone: string; onMetronomeToneSaved: (tone: string) => void; showDaysThisYear: boolean; onShowDaysThisYearSaved: (value: boolean) => void; kidMode: boolean; onKidModeSaved: (value: boolean) => void; onBack: () => void; T: any }) {
  const [name, setName] = useState(profileName); const [goal, setGoal] = useState(dailyGoal != null ? String(dailyGoal) : ""); const [language, setLanguage] = useState<Lang>(currentLanguage); const [color, setColor] = useState<string | null>(null); const [tone, setTone] = useState(currentMetronomeTone); const [showDaysThisYear, setShowDaysThisYear] = useState(currentShowDaysThisYear); const [kidMode, setKidMode] = useState(currentKidMode); const [difficulty, setDifficulty] = useState<Difficulty>(currentDifficulty); const [pushOn, setPushOn] = useState(() => pushSupported() && pushWanted(user.id)); const [pushMsg, setPushMsg] = useState(""); const [dobInput, setDobInput] = useState(""); const [dobBusy, setDobBusy] = useState(false); const [dobMsg, setDobMsg] = useState(""); const [saved, setSaved] = useState(false);
  const [openPanel, setOpenPanel] = useState<"email" | "password" | "delete" | null>(null);
  const [newEmail, setNewEmail] = useState(""); const [emailBusy, setEmailBusy] = useState(false); const [emailMsg, setEmailMsg] = useState("");
  const [newPassword, setNewPassword] = useState(""); const [confirmPassword, setConfirmPassword] = useState(""); const [passwordBusy, setPasswordBusy] = useState(false); const [passwordMsg, setPasswordMsg] = useState("");
  const [deleteConfirmText, setDeleteConfirmText] = useState(""); const [deleteBusy, setDeleteBusy] = useState(false);
  useEffect(() => { supabase.from("settings").select("daily_goal_minutes,language,metronome_tone,show_days_this_year,kid_mode").eq("user_id", user.id).maybeSingle().then(({ data }) => { if (data) { const row: any = data; setGoal(row.daily_goal_minutes != null ? String(row.daily_goal_minutes) : ""); setLanguage(row.language); if (row.metronome_tone) setTone(row.metronome_tone); if (row.show_days_this_year != null) setShowDaysThisYear(row.show_days_this_year); setKidMode(!!row.kid_mode); } }); supabase.from("profiles").select("color").eq("id", user.id).maybeSingle().then(({ data }) => { setColor(data?.color ?? null); }); }, [user]);
  // Goal is only included in the upsert when the field actually has a value -- leaving it
  // blank and saving other settings (name, language, etc.) shouldn't silently invent a goal.
  async function saveSettings() {
    const profile = await supabase.from("profiles").upsert({ id: user.id, name, color }, { onConflict: "id" });
    const trimmed = goal.trim();
    const parsedGoal = trimmed === "" ? null : Number(trimmed);
    // "0" is a real, explicit choice (unlike `Number(goal) || null`, which wrongly treated
    // it as falsy and silently dropped it). An empty field only counts as "clear the goal"
    // if there WAS one to begin with -- otherwise it just means the user never touched it,
    // and writing anything would fabricate a value they never chose.
    const shouldWriteGoal = (parsedGoal === null ? dailyGoal !== null : !Number.isNaN(parsedGoal));
    const settingsRow: any = { user_id: user.id, language, show_days_this_year: showDaysThisYear, kid_mode: kidMode };
    if (shouldWriteGoal) settingsRow.daily_goal_minutes = parsedGoal;
    const settings = await supabase.from("settings").upsert(settingsRow, { onConflict: "user_id" });
    // Difficulty is saved on its own (and only when it changed), so it can never block the rest of the settings.
    let ageDifficulty: { error?: { message: string } | null } = {};
    const difficultyChanged = difficulty !== currentDifficulty;
    if (difficultyChanged) ageDifficulty = await supabase.from("settings").upsert({ user_id: user.id, practice_difficulty: difficulty }, { onConflict: "user_id" });
    if (profile.error || settings.error || ageDifficulty.error) setError(profile.error?.message ?? settings.error?.message ?? ageDifficulty.error?.message ?? "Could not save settings.");
    else { if (difficultyChanged) onDifficultySaved(difficulty); onProfileNameSaved(name); onLanguageSaved(language); if (shouldWriteGoal) onGoalSaved(parsedGoal); onShowDaysThisYearSaved(showDaysThisYear); onKidModeSaved(kidMode); setSaved(true); setTimeout(() => setSaved(false), 1800); }
  }
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
    const res = await fetch(`${WEB_URL}/api/delete-account`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setDeleteBusy(false);
      setError(body.error ?? T.settings.couldNotDeleteAccount);
      return;
    }
    await supabase.auth.signOut();
  }
  const chev = <svg className="sx-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>;
  return <section className="page"><button className="page-back" onClick={onBack}>‹ {T.nav.today}</button><header className="simple-head sx-head"><h1>{T.settings.title}</h1></header>
    <p className="sx-title">{T.settings.profileSection}</p>
    <div className="sx-card">
      <label className="sx-row"><span className="sx-label sx-caps">{T.settings.displayName}</span><span className="sx-field"><input value={name} onChange={e => setName(e.target.value)} maxLength={30} /><svg className="sx-pencil" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" /></svg></span></label>
      <label className="sx-row"><span className="sx-label sx-caps">{T.settings.language}</span><select className="sx-field sx-select" value={language} onChange={e => setLanguage(e.target.value as Lang)}><option value="en">English</option><option value="es">Español</option><option value="nl">Nederlands</option></select></label>
    </div>
    <p className="sx-title">{T.settings.practiceSection}</p>
    <div className="sx-card">
      <div className="sx-row"><span className="sx-label sx-caps">{T.settings.dailyGoal}</span><span className="sx-stepper"><button type="button" aria-label="-5" onClick={() => setGoal(String(Math.max(5, (Number(goal) || 0) - 5)))}>−</button><input inputMode="numeric" placeholder="30" value={goal} onChange={e => setGoal(e.target.value.replace(/\D/g, ""))} /><button type="button" aria-label="+5" onClick={() => setGoal(String((Number(goal) || 0) + 5))}>+</button><small>{T.settings.minutes}</small></span></div>
      <div className="sx-row sx-stack">
        <span className="sx-label sx-caps">{T.settings.libraryLabel}</span>
        <div className="sx-seg"><button type="button" className={!kidMode ? "on" : ""} onClick={() => setKidMode(false)}>{T.settings.libraryFull}</button><button type="button" className={kidMode ? "on" : ""} onClick={() => setKidMode(true)}>{T.settings.libraryEssentials}</button></div>
        <span className="sx-sub">{T.settings.libraryHint}</span>
      </div>
      <div className="sx-row sx-stack">
        <span className="sx-label sx-caps">{T.settings.difficultyLabel}</span>
        <div className="sx-seg" role="radiogroup" aria-label={T.settings.difficultyLabel}>{([["beginner", T.settings.difficultyBeginner], ["developing", T.settings.difficultyDeveloping], ["standard", T.settings.difficultyStandard]] as [Difficulty, string][]).map(([key, label]) => <button type="button" role="radio" aria-checked={difficulty === key} key={key} className={difficulty === key ? "on" : ""} onClick={() => setDifficulty(key)}>{label}</button>)}</div>
        <span className="sx-sub">{T.settings.difficultyHint}</span>
      </div>
      <div className="sx-row sx-stack">
        <span className="sx-label sx-caps">{T.settings.dobLabel}</span>
        {currentBand ? <span className="sx-sub">{T.settings.dobSaved}</span> : <>
          <div className="dob-row"><input type="date" className="dob-input" aria-label={T.settings.dobLabel} value={dobInput} max={new Date().toISOString().slice(0, 10)} min={`${new Date().getFullYear() - 110}-01-01`} onChange={(e) => { setDobInput(e.target.value); setDobMsg(""); }} />
            <button type="button" className="dob-save" disabled={!dobInput || dobBusy} onClick={async () => { setDobBusy(true); setDobMsg(""); const { data, error } = await supabase.rpc("set_my_date_of_birth", { p_dob: dobInput }); setDobBusy(false); if (error) setDobMsg(T.onboarding.dobError); else onAgeBandSaved(asAgeBand(data)); }}>{T.settings.dobSave}</button></div>
          <span className="sx-sub">{dobMsg || T.settings.dobHint}</span>
        </>}
      </div>
      {drumState?.eligible && <button type="button" className="sx-row sx-switch-row" role="switch" aria-checked={drumState.enabled} onClick={() => onDrumPoints(!drumState.enabled)}><span className="sx-switch-text"><span className="sx-label">{T.drumPoints.switchLabel}</span><span className="sx-sub">{T.drumPoints.switchDesc}</span></span><i className={drumState.enabled ? "sx-switch on" : "sx-switch"}><b /></i></button>}
      {pushSupported() && <button type="button" className="sx-row sx-switch-row" role="switch" aria-checked={pushOn} onClick={async () => {
        setPushMsg("");
        if (pushOn) { setPushOn(false); await disablePush(supabase, user.id); return; }
        const res = await enablePush(supabase, user.id);
        if (res.ok) setPushOn(true); else setPushMsg(res.reason === "denied" ? T.settings.pushBlocked : T.settings.pushError);
      }}><span className="sx-switch-text"><span className="sx-label">{T.settings.pushLabel}</span><span className="sx-sub">{pushMsg || T.settings.pushDesc}</span></span><i className={pushOn ? "sx-switch on" : "sx-switch"}><b /></i></button>}
      <button type="button" className="sx-row sx-switch-row" onClick={() => setShowDaysThisYear(!showDaysThisYear)} role="switch" aria-checked={showDaysThisYear}><span className="sx-switch-text"><span className="sx-label">{T.settings.showDaysThisYear}</span><span className="sx-sub">{T.settings.showDaysThisYearDesc}</span></span><i className={showDaysThisYear ? "sx-switch on" : "sx-switch"}><b /></i></button>
    </div>
    <button className={saved ? "save saved sx-save" : "save sx-save"} onClick={saveSettings}>{saved ? T.settings.saved : T.settings.save}</button>
    <p className="sx-title">{T.settings.accountSection}</p>
    <div className="sx-card">
      <button type="button" className="sx-row sx-link" onClick={() => setOpenPanel(openPanel === "email" ? null : "email")}><span className="sx-label">{T.settings.changeEmail}</span>{chev}</button>
      {openPanel === "email" && <div className="sx-panel"><input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder={T.settings.newEmailPlaceholder} />{emailMsg && <p className="sx-msg">{emailMsg}</p>}<button className="sx-btn" disabled={emailBusy || !newEmail.trim()} onClick={changeEmail}>{emailBusy ? T.settings.pleaseWait : T.settings.updateEmail}</button></div>}
      <button type="button" className="sx-row sx-link" onClick={() => setOpenPanel(openPanel === "password" ? null : "password")}><span className="sx-label">{T.settings.changePassword}</span>{chev}</button>
      {openPanel === "password" && <div className="sx-panel"><input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder={T.settings.newPasswordPlaceholder} /><input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder={T.settings.confirmPasswordPlaceholder} />{passwordMsg && <p className="sx-msg">{passwordMsg}</p>}<button className="sx-btn" disabled={passwordBusy || !newPassword || !confirmPassword} onClick={changePassword}>{passwordBusy ? T.settings.pleaseWait : T.settings.updatePassword}</button></div>}
      <a className="sx-row sx-link" href={LEGAL_URLS.privacy} target="_blank" rel="noopener noreferrer"><span className="sx-label">{T.settings.privacyPolicy}</span>{chev}</a>
      <a className="sx-row sx-link" href={LEGAL_URLS.terms} target="_blank" rel="noopener noreferrer"><span className="sx-label">{T.settings.termsOfUse}</span>{chev}</a>
      <a className="sx-row sx-link" href={LEGAL_URLS.support} target="_blank" rel="noopener noreferrer"><span className="sx-label">{T.settings.support}</span>{chev}</a>
      <button type="button" className="sx-row sx-logout" onClick={signOut}>{T.settings.logout}</button>
    </div>
    <button type="button" className="sx-delete-toggle" onClick={() => setOpenPanel(openPanel === "delete" ? null : "delete")}>{T.settings.deleteAccount}</button>
    {openPanel === "delete" && <div className="sx-card sx-danger"><p className="sx-warn">{T.settings.deleteAccountWarning}</p><label className="sx-confirm">{T.settings.deleteAccountConfirmPrompt(user.email ?? "")}<input value={deleteConfirmText} onChange={e => setDeleteConfirmText(e.target.value)} placeholder={user.email ?? ""} /></label><button className="danger-btn" disabled={deleteBusy || deleteConfirmText.trim().toLowerCase() !== (user.email ?? "").toLowerCase()} onClick={deleteAccount}>{deleteBusy ? T.settings.deleteAccountBusy : T.settings.deleteAccountBtn}</button></div>}
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
// Small settings sheet opened by the gear button in the metronome windows: click sound and the volume of the in-between clicks.
// It changes the app-wide settings, not just the rudiment that is open.
function ClickSettingsPanel({ T, toneKey, onTone, subVolume, onSubVolume, onClose }: { T: any; toneKey: string; onTone: (key: string) => void; subVolume: number; onSubVolume: (v: number) => void; onClose: () => void }) {
  return <div className="modal modal-center picker-window" onClick={onClose}>
    <div className="day-summary picker-window-card click-settings" onClick={(e) => e.stopPropagation()}>
      <button type="button" className="close" onClick={onClose}>×</button>
      <h2 className="edit-rating-title">{T.metronome.clickSettings}</h2>
      <span className="metro-section-label">{T.settings.metronomeTone}</span>
      <div className="metro-tone" role="group" aria-label={T.settings.metronomeTone}>{TONE_KEYS.map((key) => <button type="button" key={key} className={toneKey === key ? "on" : ""} onClick={() => onTone(key)}>{T.settings.toneNames[key]}</button>)}</div>
      <span className="metro-section-label">{T.metronome.subClicks}</span>
      <input className="range" type="range" min="0" max="100" step="1" value={Math.round(subVolume * 100)} aria-label={T.metronome.subClicks} onChange={(e) => onSubVolume(Number(e.target.value) / 100)} />
      <div className="click-settings-scale"><span>{T.metronome.volOff}</span><span>{T.metronome.volFull}</span></div>
      <p className="click-settings-hint">{T.metronome.subClicksHint}</p>
      <button type="button" className="save" onClick={onClose}>{T.today.pickerDone}</button>
    </div>
  </div>;
}
const TONE_KEYS = ["click", "beep", "wood", "clave"];
const SUBDIVISION_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8];

function Metronome({ open, close, onAddPractice, sharedTimer, onUsedDuringTimer, onSessionEnd, initialBpm, tone, onToneChange, exerciseLabel, exerciseEn, lockTempo, difficulty, onOpen, onBannerChange, stacked, sessions, userItems, userBooks, onAddUserItem, onRemoveUserItem, sortedRudiments, sortedExercises, language, T }: { open: boolean; close: () => void; onAddPractice?: (seconds: number, items: string[], customItems: string[]) => void; sharedTimer?: { startedAt: number; mode: "stopwatch" | "timer"; durationMinutes: number } | null; onUsedDuringTimer?: () => void; onSessionEnd?: (seconds: number) => void; initialBpm?: number; tone?: string; onToneChange?: (key: string) => void; exerciseLabel?: string; exerciseEn?: string; lockTempo?: boolean; difficulty?: Difficulty; onOpen?: () => void; onBannerChange?: (active: boolean) => void; stacked?: boolean; sessions?: { item_en: string; bpm: number; rating: string; practiced_on: string; notes: string | null; issues: string[]; created_at: string }[]; userItems?: string[]; userBooks?: string[]; onAddUserItem?: (kind: "item" | "book", name: string) => Promise<void>; onRemoveUserItem?: (kind: "item" | "book", name: string) => Promise<void>; sortedRudiments?: { category: string; subcategory: { en: string; es: string } | null; en: string; es: string; nl: string }[]; sortedExercises?: { category: string; subcategory: { en: string; es: string } | null; en: string; es: string; nl: string }[]; language?: Lang; T: any }) {
  const [bpm, setBpm] = useState(initialBpm ?? 100);
  const [playing, setPlaying] = useState(false);
  // paused = clicks and the session clock are frozen but the session is still open (Stop ends it and asks how it went).
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  // Strokes (the boxes) or Notation (the written music); remembered on this device.
  const [view, setViewState] = useState<"strokes" | "notation">(() => { try { return localStorage.getItem("sticking_view") === "notation" ? "notation" : "strokes"; } catch { return "strokes"; } });
  function setView(next: "strokes" | "notation") { setViewState(next); try { localStorage.setItem("sticking_view", next); } catch { /* ignore */ } }
  const swipeStartRef = useRef<number | null>(null);
  const [beatsPerBar, setBeatsPerBar] = useState(4);
  const [subdivision, setSubdivision] = useState(1);
  const [activeBeat, setActiveBeat] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [showAddPrompt, setShowAddPrompt] = useState(false);
  const [addPromptSeconds, setAddPromptSeconds] = useState(0);
  const [addItems, setAddItems] = useState<string[]>([]);
  // Rudiments/Books/My Items selections for the free-play "what did you practice" prompt --
  // same picker as Quick Practice's save modal, kept local until addTime() hands it off.
  const [addCustomItems, setAddCustomItems] = useState<string[]>([]);
  const [rudimentsOpen, setRudimentsOpenRaw] = useState(false);
  const [exercisesOpen, setExercisesOpenRaw] = useState(false);
  const [booksOpen, setBooksOpenRaw] = useState(false);
  const [myItemsOpen, setMyItemsOpenRaw] = useState(false);
  function setRudimentsOpen(next: boolean) { setRudimentsOpenRaw(next); if (next) { setExercisesOpenRaw(false); setBooksOpenRaw(false); setMyItemsOpenRaw(false); } }
  function setExercisesOpen(next: boolean) { setExercisesOpenRaw(next); if (next) { setRudimentsOpenRaw(false); setBooksOpenRaw(false); setMyItemsOpenRaw(false); } }
  function setBooksOpen(next: boolean) { setBooksOpenRaw(next); if (next) { setRudimentsOpenRaw(false); setExercisesOpenRaw(false); setMyItemsOpenRaw(false); } }
  function setMyItemsOpen(next: boolean) { setMyItemsOpenRaw(next); if (next) { setRudimentsOpenRaw(false); setExercisesOpenRaw(false); setBooksOpenRaw(false); } }
  const [rudimentSearch, setRudimentSearch] = useState("");
  const rudimentExercises = sortedRudiments ?? [];
  const filteredRudiments = useMemo(() => {
    const q = rudimentSearch.trim().toLowerCase();
    if (!q) return rudimentExercises;
    return rudimentExercises.filter((r) => r[(language ?? "en") as Lang].toLowerCase().includes(q));
  }, [rudimentExercises, rudimentSearch, language]);
  const [exerciseSearch, setExerciseSearch] = useState("");
  const exerciseItems = sortedExercises ?? [];
  const filteredExercises = useMemo(() => {
    const q = exerciseSearch.trim().toLowerCase();
    if (!q) return exerciseItems;
    return exerciseItems.filter((r) => r[(language ?? "en") as Lang].toLowerCase().includes(q));
  }, [exerciseItems, exerciseSearch, language]);
  function toggleCustomItem(en: string) {
    setAddCustomItems((current) => current.includes(en) ? current.filter((v) => v !== en) : [...current, en]);
  }
  const selectedRudimentsCount = addCustomItems.filter((ci) => rudimentExercises.some((r) => r.en === ci)).length;
  const selectedExercisesCount = addCustomItems.filter((ci) => exerciseItems.some((r) => r.en === ci)).length;
  const [bookAddText, setBookAddText] = useState("");
  const allBooks = useMemo(() => [...PRACTICE_BOOKS, ...(userBooks ?? []).filter((b) => !PRACTICE_BOOKS.includes(b))], [userBooks]);
  function toggleBook(name: string) {
    setAddCustomItems((current) => current.includes(name) ? current.filter((v) => v !== name) : [...current, name]);
  }
  async function addBook() {
    const trimmed = bookAddText.trim();
    if (!trimmed) return;
    if (!allBooks.includes(trimmed)) await onAddUserItem?.("book", trimmed);
    setAddCustomItems((current) => current.includes(trimmed) ? current : [...current, trimmed]);
    setBookAddText("");
  }
  const selectedBooksCount = addCustomItems.filter((ci) => allBooks.includes(ci)).length;
  const [myItemAddText, setMyItemAddText] = useState("");
  function toggleMyItem(name: string) {
    setAddCustomItems((current) => current.includes(name) ? current.filter((v) => v !== name) : [...current, name]);
  }
  async function addMyItem() {
    const trimmed = myItemAddText.trim();
    if (!trimmed) return;
    if (!(userItems ?? []).includes(trimmed)) await onAddUserItem?.("item", trimmed);
    setAddCustomItems((current) => current.includes(trimmed) ? current : [...current, trimmed]);
    setMyItemAddText("");
  }
  const selectedMyItemsCount = addCustomItems.filter((ci) => (userItems ?? []).includes(ci)).length;
  const [historyOpen, setHistoryOpen] = useState(false);
  const bpmRef = useRef(bpm);
  const beatsPerMeasureRef = useRef(beatsPerBar);
  const subdivisionRef = useRef(subdivision);
  const [toneKey, setToneKey] = useState(tone ?? "wood");
  // Volume of the in-between clicks (16ths, triplets...) relative to the beat click: 0 = silent, 1 = as loud as the beat. One setting for every rudiment.
  const [subVolume, setSubVolumeRaw] = useState(1 / 3);
  const subVolumeRef = useRef(1 / 3);
  const [clickSettingsOpen, setClickSettingsOpen] = useState(false);
  useEffect(() => {
    try { const v = parseFloat(localStorage.getItem("sub_click_volume") ?? ""); if (Number.isFinite(v)) { const c = Math.min(1, Math.max(0, v)); setSubVolumeRaw(c); subVolumeRef.current = c; } } catch { /* storage unavailable: keep the default */ }
  }, [open]);
  function setSubVolume(v: number) {
    const c = Math.min(1, Math.max(0, v));
    setSubVolumeRaw(c); subVolumeRef.current = c;
    try { localStorage.setItem("sub_click_volume", String(c)); } catch { /* ignore */ }
  }
  useEffect(() => { setToneKey(tone ?? "wood"); }, [tone]);
  const toneRef = useRef(TONE_PRESETS[tone ?? "wood"] ?? TONE_PRESETS.wood);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<AudioNode | null>(null);
  const schedulerRef = useRef<number | null>(null);
  const nextNoteTimeRef = useRef(0);
  const beatRef = useRef(0);
  const beatTimeoutsRef = useRef<number[]>([]);
  // Stroke guide (Skill Trainer only): the scheduler below queues each stroke with its audio-clock time; a requestAnimationFrame
  // loop lights the box once the audio clock (plus the device's output latency) reaches that time. One clock, no separate timer.
  const [activeStroke, setActiveStroke] = useState(-1);
  const [activeGrace, setActiveGrace] = useState(-1);
  const [startHand, setStartHand] = useState<Hand>("R");
  const strokeQueueRef = useRef<StrokeEvent[]>([]);
  const strokeCounterRef = useRef(0);
  const strokeRafRef = useRef<number | null>(null);
  const aheadRef = useRef(SCHEDULE_AHEAD_SECONDS);
  const playingRef = useRef(false);
  // Every click that is already scheduled on the audio clock, so the ones still in the future can be cancelled and re-planned.
  const futureClicksRef = useRef<{ time: number; tick: number; counter: number; slotSeconds: number; osc: OscillatorNode }[]>([]);
  // The guide's real available width (measured, so it can never overflow its box); a sensible guess until the first measurement.
  const guideRef2 = useRef<HTMLDivElement | null>(null);
  const [guideWidth, setGuideWidth] = useState(0);
  useEffect(() => {
    const el = guideRef2.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => { const cs = getComputedStyle(el); setGuideWidth(Math.floor(el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight))); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  });
  // The exercise's rhythm (its grid) is the source of truth; the metronome's clicks only follow it. null for exercises with no
  // trustworthy grid, which keep the plain sticking display and the free clicks-per-beat menu.
  const rhythm = lockTempo && exerciseEn ? effectiveRhythm(exerciseEn, difficulty ?? "standard") : null;
  const guide = useMemo(() => (lockTempo && exerciseEn ? gridFor(exerciseEn, startHand, difficulty ?? "standard") : null), [lockTempo, exerciseEn, startHand, difficulty]);
  const clickChoices = rhythm ? allowedClicks(rhythm.perBeat) : null;
  const guideRef = useRef(guide);
  // New exercise: the clicks per beat follow its note value and the starting hand goes back to right.
  useEffect(() => { if (lockTempo) { setSubdivision(rhythm ? (rhythm.clicks ?? rhythm.perBeat) : 1); setStartHand("R"); setBeatsPerBar(rhythm?.beatsPerBar ?? 4); } }, [exerciseEn, difficulty]); // eslint-disable-line react-hooks/exhaustive-deps
  // Changed sequence (new exercise or other starting hand): restart the guide from its first slot, still on the live audio clock.
  useEffect(() => { guideRef.current = guide; stopStrokeLoop(); if (playing && !pausedRef.current && guide) startStrokeLoop(); }, [guide]); // eslint-disable-line react-hooks/exhaustive-deps
  function stopStrokeLoop() {
    if (strokeRafRef.current !== null) { cancelAnimationFrame(strokeRafRef.current); strokeRafRef.current = null; }
    strokeQueueRef.current = [];
    strokeCounterRef.current = 0;
    setActiveStroke(-1);
    setActiveGrace(-1);
  }
  function startStrokeLoop() {
    stopStrokeLoop();
    const frame = () => {
      const ctx = audioCtxRef.current;
      if (ctx) {
        const latency = (ctx as AudioContext & { outputLatency?: number }).outputLatency ?? ctx.baseLatency ?? 0;
        const hit = dueEvent(strokeQueueRef.current, ctx.currentTime, latency);
        if (hit) { setActiveStroke(hit.index); setActiveGrace(hit.grace ?? -1); }
      }
      strokeRafRef.current = requestAnimationFrame(frame);
    };
    strokeRafRef.current = requestAnimationFrame(frame);
  }
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
  useEffect(() => { toneRef.current = TONE_PRESETS[toneKey] ?? TONE_PRESETS.click; }, [toneKey]);

  useEffect(() => {
    if (!playing || paused) return;
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [playing, paused]);
  // While the Session Timer is running, the (free-play) metronome shows ITS clock instead of keeping a second one.
  const sharing = !!sharedTimer && !lockTempo && !onSessionEnd;
  const startedSharedRef = useRef(false); // was the Session Timer already running when this metronome run started?
  const [, setShareTick] = useState(0);
  useEffect(() => {
    if (!sharing || !open) return;
    const timer = window.setInterval(() => setShareTick((v) => v + 1), 1000);
    return () => window.clearInterval(timer);
  }, [sharing, open]);

  function clearBeatTimeouts() {
    beatTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
    beatTimeoutsRef.current = [];
  }

  useEffect(() => {
    return () => {
      if (schedulerRef.current !== null) window.clearInterval(schedulerRef.current);
      clearBeatTimeouts();
      if (strokeRafRef.current !== null) cancelAnimationFrame(strokeRafRef.current);
      audioCtxRef.current?.close();
      wakeLockRef.current?.release();
    };
  }, []);

  function playClick(time: number, accentLevel: "downbeat" | "beat" | "sub") {
    const ctx = audioCtxRef.current;
    if (!ctx) return null;
    const preset = toneRef.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = preset.wave;
    osc.frequency.value = preset.freq[accentLevel];
    // Lower peaks and a short soft attack (a near-instant jump makes a pop), and everything goes through a limiter so
    // overlapping clicks can't clip and crackle.
    // The in-between clicks follow the "Subdivision clicks" slider. They are never skipped (the scheduler needs them), only made silent.
    const peak = accentLevel === "downbeat" ? 0.42 : accentLevel === "beat" ? 0.28 : Math.max(0.0002, 0.28 * subVolumeRef.current);
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(peak, time + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + preset.decay + 0.004);
    osc.connect(gain);
    gain.connect(masterRef.current ?? ctx.destination);
    osc.start(time);
    osc.stop(time + preset.decay + 0.01);
    return osc;
  }

  function scheduler() {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const steps = subdivisionRef.current;
    const beatsPerMeasure = beatsPerMeasureRef.current;
    futureClicksRef.current = futureClicksRef.current.filter((c) => c.time > ctx.currentTime - 0.5);
    while (nextNoteTimeRef.current < ctx.currentTime + aheadRef.current) {
      const tick = beatRef.current;
      const isBeat = tick % steps === 0;
      const beatNumber = Math.floor(tick / steps);
      const isDownbeat = isBeat && beatNumber % beatsPerMeasure === 0;
      const accentLevel = isDownbeat ? "downbeat" : isBeat ? "beat" : "sub";
      const counterBefore = strokeCounterRef.current;
      const clickOsc = playClick(nextNoteTimeRef.current, accentLevel);
      if (clickOsc) futureClicksRef.current.push({ time: nextNoteTimeRef.current, tick, counter: counterBefore, slotSeconds: 60 / bpmRef.current / (guideRef.current?.perBeat ?? steps), osc: clickOsc });
      if (guideRef.current && guideRef.current.perBeat % steps === 0) strokeCounterRef.current = enqueueTick(strokeQueueRef.current, strokeCounterRef.current, guideRef.current, steps, nextNoteTimeRef.current, bpmRef.current);
      if (isBeat) {
        const beatIndex = beatNumber % beatsPerMeasure;
        const delayMs = Math.max(0, (nextNoteTimeRef.current - ctx.currentTime) * 1000);
        beatTimeoutsRef.current.push(window.setTimeout(() => setActiveBeat(beatIndex), delayMs));
      }
      beatRef.current += 1;
      nextNoteTimeRef.current += (60 / bpmRef.current) / steps;
    }
  }
  // Cancels every click that is still in the future and winds the scheduler back to the first of them, so it can plan them again.
  function cancelFutureClicks() {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const future = futureClicksRef.current.filter((c) => c.time > ctx.currentTime + 0.05);
    if (!future.length) return;
    future.forEach((c) => { try { c.osc.stop(); } catch { /* already stopped */ } });
    const first = future[0];
    futureClicksRef.current = futureClicksRef.current.filter((c) => c.time <= ctx.currentTime + 0.05);
    beatRef.current = first.tick;
    nextNoteTimeRef.current = first.time;
    strokeCounterRef.current = first.counter;
    strokeQueueRef.current = strokeQueueRef.current.filter((e) => e.time <= first.time - 0.8 * first.slotSeconds);
    clearBeatTimeouts();
  }
  function appHidden() {
    if (!playingRef.current || pausedRef.current) return;
    aheadRef.current = BACKGROUND_AHEAD_SECONDS;
    scheduler();
  }
  function appVisible() {
    const ctx = audioCtxRef.current;
    aheadRef.current = SCHEDULE_AHEAD_SECONDS;
    if (!playingRef.current || pausedRef.current || !ctx) return;
    cancelFutureClicks();
    if (ctx.state !== "running") ctx.resume().catch(() => {});
    scheduler();
  }
  function pausePlaying() {
    if (!playingRef.current || pausedRef.current) return;
    cancelFutureClicks();
    if (schedulerRef.current !== null) { window.clearInterval(schedulerRef.current); schedulerRef.current = null; }
    clearBeatTimeouts();
    stopStrokeLoop();
    setActiveBeat(0);
    pausedRef.current = true;
    setPaused(true);
  }
  async function resumePlaying() {
    const ctx = audioCtxRef.current;
    if (!playingRef.current || !pausedRef.current || !ctx) return;
    if (ctx.state !== "running") await ctx.resume().catch(() => {});
    // Start again from the first beat so the clicks and the stroke guide begin together.
    beatRef.current = 0;
    strokeCounterRef.current = 0;
    nextNoteTimeRef.current = ctx.currentTime + 0.05;
    aheadRef.current = SCHEDULE_AHEAD_SECONDS;
    pausedRef.current = false;
    setPaused(false);
    if (guideRef.current) startStrokeLoop();
    schedulerRef.current = window.setInterval(scheduler, 25);
  }
  // The phone's lock-screen / Dynamic Island media control: a proper title; its pause button pauses and resumes the metronome.
  const toggleRef = useRef<() => void>(() => {});
  toggleRef.current = () => { if (!playingRef.current) return; if (pausedRef.current) resumePlaying(); else pausePlaying(); };
  useEffect(() => {
    if (!playing || typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: exerciseLabel ?? T.metronome.bannerTitle, artist: `${bpm} BPM · DrumSkills` });
      navigator.mediaSession.playbackState = paused ? "paused" : "playing";
      navigator.mediaSession.setActionHandler("pause", () => toggleRef.current());
      navigator.mediaSession.setActionHandler("play", () => toggleRef.current());
      navigator.mediaSession.setActionHandler("stop", () => { if (playingRef.current) togglePlaying(); });
    } catch { /* not supported here */ }
    return () => { try { navigator.mediaSession.playbackState = "none"; navigator.mediaSession.setActionHandler("pause", null); navigator.mediaSession.setActionHandler("play", null); navigator.mediaSession.setActionHandler("stop", null); } catch { /* ignore */ } };
  }, [playing, paused, bpm, exerciseLabel]); // eslint-disable-line react-hooks/exhaustive-deps
  // Android only: while playing, a "metronome playing" notification (foreground service) stops Android from freezing the app in the background.
  useEffect(() => {
    if (!playing || paused || !IS_NATIVE_BUILD || !IS_ANDROID) return;
    let stop: (() => void) | null = null;
    let cancelled = false;
    import("@capacitor/core").then(({ registerPlugin }) => {
      const keepAlive = registerPlugin<{ start: (o: { title: string }) => Promise<void>; stop: () => Promise<void> }>("MetronomeKeepAlive");
      if (cancelled) return;
      keepAlive.start({ title: exerciseLabel ?? T.metronome.bannerTitle }).catch(() => {});
      stop = () => { keepAlive.stop().catch(() => {}); };
    });
    return () => { cancelled = true; stop?.(); };
  }, [playing]); // eslint-disable-line react-hooks/exhaustive-deps
  const lifecycleRef = useRef({ hidden: appHidden, visible: appVisible });
  lifecycleRef.current = { hidden: appHidden, visible: appVisible };
  useEffect(() => { playingRef.current = playing; if (!playing) aheadRef.current = SCHEDULE_AHEAD_SECONDS; }, [playing]);
  // Keeps the metronome going when the app is sent to the background, and tidies up when it comes back.
  useEffect(() => {
    const onVisibility = () => (document.hidden ? lifecycleRef.current.hidden() : lifecycleRef.current.visible());
    document.addEventListener("visibilitychange", onVisibility);
    let handle: { remove: () => void } | null = null;
    let cancelled = false;
    if (IS_NATIVE_BUILD) {
      import("@capacitor/app").then(({ App }) => App.addListener("appStateChange", ({ isActive }) => (isActive ? lifecycleRef.current.visible() : lifecycleRef.current.hidden()))).then((h) => { if (cancelled) h.remove(); else handle = h; });
    }
    return () => { cancelled = true; handle?.remove(); document.removeEventListener("visibilitychange", onVisibility); };
  }, []);

  function formatMMSS(totalSeconds: number) { return String(Math.floor(totalSeconds / 60)).padStart(2, "0") + ":" + String(totalSeconds % 60).padStart(2, "0"); }
  const sharedSeconds = sharedTimer ? Math.max(0, Math.floor((Date.now() - sharedTimer.startedAt) / 1000)) : 0;
  const elapsedLabel = sharing && sharedTimer ? formatMMSS(sharedTimer.mode === "timer" ? Math.max(0, sharedTimer.durationMinutes * 60 - sharedSeconds) : sharedSeconds) : formatMMSS(elapsed);
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
      startedSharedRef.current = sharing;
      setElapsed(0);
      setActiveBeat(0);
      setPlaying(true);
      const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      enablePlaybackAudio();
      enablePlaybackAudio();
      // Android's WebView needs bigger audio buffers (latencyHint "playback") and a longer look-ahead, or the clicks stutter and drift.
      const ctx = audioCtxRef.current ?? (IS_ANDROID ? new AudioContextClass({ latencyHint: "playback" }) : new AudioContextClass());
      audioCtxRef.current = ctx;
      if (ctx.state === "suspended") await ctx.resume();
      if (!masterRef.current) {
        const limiter = ctx.createDynamicsCompressor();
        limiter.threshold.value = -14; limiter.knee.value = 10; limiter.ratio.value = 8; limiter.attack.value = 0.002; limiter.release.value = 0.08;
        const out = ctx.createGain();
        out.gain.value = 0.9;
        limiter.connect(out); out.connect(ctx.destination);
        masterRef.current = limiter;
      }
      // iOS Safari needs a buffer actually played (not just resume()) within the gesture to fully unlock audio output.
      const unlockBuffer = ctx.createBuffer(1, 1, 22050);
      const unlockSource = ctx.createBufferSource();
      unlockSource.buffer = unlockBuffer;
      unlockSource.connect(ctx.destination);
      unlockSource.start(0);
      beatRef.current = 0;
      nextNoteTimeRef.current = ctx.currentTime + 0.05;
      if (guideRef.current) startStrokeLoop();
      schedulerRef.current = window.setInterval(scheduler, 25);
      return;
    }
    setPlaying(false);
    pausedRef.current = false;
    setPaused(false);
    if (schedulerRef.current !== null) { window.clearInterval(schedulerRef.current); schedulerRef.current = null; }
    clearBeatTimeouts();
    stopStrokeLoop();
    if (startedSharedRef.current) { startedSharedRef.current = false; onUsedDuringTimer?.(); return; }
    if (elapsed > 0) {
      // Pass the exact elapsed seconds rather than pre-rounding to a whole minute here -- the
      // caller needs the raw value to merge into today's practice_logs total without losing the
      // remainder (two 3:30 sessions should add up to exactly 7:00, not 6 or 8).
      if (onSessionEnd) onSessionEnd(elapsed);
      else { setAddPromptSeconds(elapsed); setAddItems([]); setAddCustomItems([]); setRudimentsOpenRaw(false); setBooksOpenRaw(false); setMyItemsOpenRaw(false); setShowAddPrompt(true); }
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
  function addTime() { if (addPromptSeconds <= 0) return; onAddPractice?.(addPromptSeconds, addItems, addCustomItems); setShowAddPrompt(false); setElapsed(0); close(); }
  function discardTime() { setShowAddPrompt(false); setElapsed(0); }
  function nudgeAddPromptSeconds(delta: number) { setAddPromptSeconds((current) => Math.max(0, current + delta)); }
  function toggleAddItem(item: string) { setAddItems((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item]); }
  // The free metronome keeps playing when its window is closed: a bar at the top (like the session timer's) shows it is still running
  // and opens it again when tapped. Not used for the Skill Trainer metronome, which stops when you leave it.
  const bannerActive = !open && playing && !lockTempo && !onSessionEnd;
  useEffect(() => { onBannerChange?.(bannerActive); }, [bannerActive]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open && bannerActive) {
    return <button type="button" className={stacked ? "session-timer-banner metro-banner stacked" : "session-timer-banner metro-banner"} onClick={onOpen}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8 21h8l-2.2-16h-3.6z" /><path d="M12 17l4-9" /></svg>
      <strong>{bpm} BPM</strong>
      <span>{T.metronome.bannerTitle} · {T.sessionTimer.tapToOpen}</span>
    </button>;
  }
  if (!open) return null;
  const beatsPerMeasure = beatsPerBar;
  const lang = language ?? "en";

  function renderStickingTokens(tokens: StickingToken[]) {
    return tokens.map((token, i) => <span key={i} className={token.grace ? `sticking-letter ${token.hand.toLowerCase()} grace` : `sticking-letter ${token.hand.toLowerCase()}`}>{token.grace ? token.hand.toLowerCase() : token.hand}{token.count && token.count > 1 ? <sup>{token.count}</sup> : null}</span>);
  }
  if (lockTempo) {
    const sticking = exerciseEn ? EXERCISE_STICKING[exerciseEn] : null;
    // Every past rated session at this exact exercise + BPM, most recent first — lets you see
    // "this used to be tense, now it's comfortable" at a glance. Collapsed by default and hidden
    // entirely when there's nothing to show yet, so a fresh tempo doesn't add clutter.
    const history = (sessions ?? []).filter((s) => s.item_en === exerciseEn && s.bpm === bpm).slice().sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8);
    const historyRatingLabel: Record<string, string> = { not_ready: T.practiceMode.ratingNotReady, tense: T.practiceMode.ratingTense, almost: T.practiceMode.ratingAlmost, comfortable: T.practiceMode.ratingComfortable, mastered: T.practiceMode.ratingMastered };
    return <div className="modal modal-center"><div className="metro metro-practice">
      <button className="close" onClick={close}>×</button>
      <button type="button" className="metro-gear" aria-label={T.metronome.clickSettings} onClick={() => setClickSettingsOpen(true)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3h6l3.5 17.5a1 1 0 01-1 1.2h-11a1 1 0 01-1-1.2z" /><path d="M12 17.5L15.5 6.5" /><circle cx="14.2" cy="10.4" r="1.3" fill="currentColor" /></svg></button>
      <div className="metro-exercise-head">
        <h2 className="metro-exercise-name">{exerciseLabel}</h2>
      </div>
      {guide && <div className="sticking-panel" onTouchStart={(e) => { swipeStartRef.current = e.touches[0].clientX; }} onTouchEnd={(e) => { const start = swipeStartRef.current; swipeStartRef.current = null; if (start === null) return; const dx = e.changedTouches[0].clientX - start; if (dx < -50) setView("notation"); else if (dx > 50) setView("strokes"); }}>
        <div className="view-switch" role="tablist" aria-label={T.metronome.stickingLabel}>
          <button type="button" role="tab" aria-selected={view === "strokes"} className={view === "strokes" ? "on" : ""} onClick={() => setView("strokes")}>{T.metronome.viewStrokes}</button>
          <button type="button" role="tab" aria-selected={view === "notation"} className={view === "notation" ? "on" : ""} onClick={() => setView("notation")}>{T.metronome.viewNotation}</button>
        </div>
        {(() => {
          const width = guideWidth > 0 ? guideWidth : Math.min(310, (typeof window !== "undefined" ? window.innerWidth : 375) - 76);
          const size = fitBox(guide, width, typeof window !== "undefined" && window.innerWidth <= 360 ? 28 : 32);
          return <div className="stroke-guide" ref={guideRef2} role="group" aria-label={T.metronome.stickingLabel} style={{ "--sb": `${size.box}px`, "--gb": `${size.grace}px` } as React.CSSProperties}>
          <div className="guide-stack">
          <div className={view === "notation" ? "guide-layer" : "guide-layer off"} aria-hidden={view !== "notation"}><NotationStaff grid={guide} activeStroke={activeStroke} activeGrace={activeGrace} width={width} beatsPerBar={beatsPerBar} /></div>
          <div className={view === "strokes" ? "guide-layer" : "guide-layer off"} aria-hidden={view !== "strokes"}><div className="stroke-grid">
          {layoutRows(guide, width, size.box, size.grace, size.wrapSides).map((row) => <div className="stroke-row" key={row.start}>{guide.slots.slice(row.start, row.end).map((slot, k) => {
            const i = row.start + k;
            const gap = k > 0 && guide.perBeat > 1 && sideIndex(guide, i) % guide.perBeat === 0;
            const here = activeStroke === i;
            const cls = `stroke-box ${slot ? (slot.plain ? "plain" : slot.hand.toLowerCase()) : "rest"}${slot?.accent ? " accent" : ""}${here && activeGrace < 0 ? " active" : ""}`;
            return <span key={i} className={`stroke-cell${gap ? " gap" : ""}`} aria-current={here ? "step" : undefined}>
              {slot && slot.graces.map((g, gi) => <span key={gi} className={`grace-box ${g.toLowerCase()}${here && activeGrace === gi ? " active" : ""}`} aria-label="grace note">{g.toLowerCase()}</span>)}
              <span className={cls}>{slot ? (slot.plain ? "•" : slot.hand) : "–"}{slot?.accent && <i className="stroke-accent" aria-label="accent">&gt;</i>}{slot?.arrow && <i className="stroke-arrow" aria-label={slot.arrow === "down" ? "down stroke" : "up stroke"}>{slot.arrow === "down" ? "↓" : "↑"}</i>}</span>
            </span>;
          })}</div>)}
          </div></div></div>
        </div>;
        })()}
        {rhythm?.reversible && <div className="metro-lead" role="group" aria-label={T.metronome.leadHand}>
          <span>{T.metronome.leadHand}</span>
          {(["R", "L"] as const).map((h) => <button type="button" key={h} className={startHand === h ? "on" : ""} aria-pressed={startHand === h} disabled={playing && !paused} onClick={() => setStartHand(h)}>{h}</button>)}
        </div>}
      </div>}
      {sticking && !guide && <div className="sticking-panel">
        <span className="sticking-label">{T.metronome.stickingLabel}</span>
        <div className="sticking-pill">
          <div className="sticking-side">{renderStickingTokens(sticking.tokens)}</div>
          {sticking.secondTokens && <div className="sticking-side">{renderStickingTokens(sticking.secondTokens)}</div>}
        </div>
      </div>}
      <div className="tempo-simple"><span className="tempo-bpm-num">{bpm}</span><span className="tempo-bpm-unit">BPM</span></div>
      <div className="beat-dots">{Array.from({ length: beatsPerMeasure }).map((_, i) => <i key={i} className={playing && activeBeat === i ? "beat-dot active" : "beat-dot"} />)}</div>
      <div className="metronome-timer">{playing ? T.metronome.practiceTimer : T.metronome.sessionTime}<strong>{elapsedLabel}</strong></div>
      {history.length > 0 && <div className="metro-history">
        <button type="button" className="collapsible-header" onClick={() => setHistoryOpen(!historyOpen)}>
          <span className="input-label checklist-label">{T.metronome.historyTitle(history.length)}</span>
          <span className={historyOpen ? "collapse-chevron open" : "collapse-chevron"}><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 7.5l5 5 5-5" /></svg></span>
        </button>
        {historyOpen && <div className="admin-log-list metro-history-list">
          {history.map((s, i) => <div key={i} className="admin-log-row">
            <div className="admin-log-head"><span>{formatDMY(s.practiced_on)}</span><span>{RATING_ICON[s.rating]} {historyRatingLabel[s.rating] ?? s.rating}</span></div>
            {s.issues && s.issues.length > 0 && <div className="detail-chips">{s.issues.map((issueEn) => <em key={issueEn}>{SESSION_ISSUE_TAGS.find((t) => t.en === issueEn)?.[language as Lang] ?? issueEn}</em>)}</div>}
            {s.notes && <p className="today-notes">{s.notes}</p>}
          </div>)}
        </div>}
      </div>}
      <div className="metro-selects"><div className="metro-select-field"><span className="metro-section-label">{T.metronome.timeSignature}</span><select className="subdivision-select" disabled={playing && !paused} value={beatsPerBar} onChange={e => setBeatsPerBar(Number(e.target.value))}>{BEATS_PER_BAR_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}</select></div><div className="metro-select-field"><span className="metro-section-label">{T.metronome.subdivisionLabel}</span>{clickChoices && clickChoices.length === 1
        ? <div className="subdivision-fixed">{T.metronome.clicksFixed(clickChoices[0])}</div>
        : <select className="subdivision-select" disabled={playing && !paused} value={subdivision} onChange={e => setSubdivision(Number(e.target.value))}>{(clickChoices ?? SUBDIVISION_OPTIONS).map(n => <option key={n} value={n}>{n}</option>)}</select>}</div></div>
      {playing ? <div className="metro-actions"><button type="button" className="pause" onClick={paused ? resumePlaying : pausePlaying}>{paused ? `▶ ${T.metronome.resume}` : `❚❚ ${T.metronome.pause}`}</button><button className="stop" onClick={togglePlaying}>{T.metronome.stop}</button></div>
        : <button className="start" onClick={togglePlaying}>{`▶ ${T.metronome.startPractice}`}</button>}
    </div>{clickSettingsOpen && <ClickSettingsPanel T={T} toneKey={toneKey} onTone={(key) => { setToneKey(key); onToneChange?.(key); }} subVolume={subVolume} onSubVolume={setSubVolume} onClose={() => setClickSettingsOpen(false)} />}</div>;
  }

  return <div className="modal modal-center"><div className="metro"><button className="close" onClick={close}>×</button>{!showAddPrompt && <button type="button" className="metro-gear" aria-label={T.metronome.clickSettings} onClick={() => setClickSettingsOpen(true)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3.2" /><path d="M19.4 15a1.7 1.7 0 00.34 1.87l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.7 1.7 0 00-1.87-.34 1.7 1.7 0 00-1.03 1.56V21a2 2 0 11-4 0v-.09A1.7 1.7 0 009 19.4a1.7 1.7 0 00-1.87.34l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.7 1.7 0 004.6 15a1.7 1.7 0 00-1.56-1.03H3a2 2 0 110-4h.09A1.7 1.7 0 004.6 9a1.7 1.7 0 00-.34-1.87l-.06-.06a2 2 0 112.83-2.83l.06.06A1.7 1.7 0 009 4.6a1.7 1.7 0 001.03-1.56V3a2 2 0 114 0v.09A1.7 1.7 0 0015 4.6a1.7 1.7 0 001.87-.34l.06-.06a2 2 0 112.83 2.83l-.06.06A1.7 1.7 0 0019.4 9c.2.62.8 1.03 1.56 1.03H21a2 2 0 110 4h-.09c-.76 0-1.36.41-1.51 1z" /></svg></button>}{!showAddPrompt && <><p className="eyebrow">{exerciseLabel ?? T.metronome.practiceTool}</p><h2>{T.metronome.title}</h2></>}
    {showAddPrompt ? <div className="add-time">
      <h3>{T.sessionTimer.logTitle}</h3>
      {addPromptSeconds <= 0 && <p>{T.metronome.addTimeTooShort}</p>}
      <p>{T.metronome.sessionLasted(elapsedLabel)}</p>
      <div className="add-time-adjust"><button onClick={() => nudgeAddPromptSeconds(-10)}>-10s</button><span className="add-time-value">{formatMMSS(addPromptSeconds)}</span><button onClick={() => nudgeAddPromptSeconds(10)}>+10s</button></div>
      <PracticedPicker title={T.sessionTimer.whatDidYouPractise} skillRows={[]} skillBadge="" moreLabel={T.sessionTimer.chooseWhat} extraCount={addItems.length + addCustomItems.length}>
        <ChipDropdown asRow label={T.today.rudiments} selectedCount={selectedRudimentsCount} open={rudimentsOpen} onToggleOpen={() => setRudimentsOpen(!rudimentsOpen)}
          searchable searchValue={rudimentSearch} onSearchChange={setRudimentSearch} searchPlaceholder={T.today.searchRudiments}
          rows={filteredRudiments.map((r) => ({ key: r.en, label: r[lang as Lang], selected: addCustomItems.includes(r.en), onToggle: () => toggleCustomItem(r.en) }))} doneLabel={T.today.pickerDone} />
        <ChipDropdown asRow label={T.practiceMode.categoryExercises} selectedCount={selectedExercisesCount} open={exercisesOpen} onToggleOpen={() => setExercisesOpen(!exercisesOpen)}
          searchable searchValue={exerciseSearch} onSearchChange={setExerciseSearch} searchPlaceholder={T.today.searchExercises}
          rows={filteredExercises.map((r) => ({ key: r.en, label: r[lang as Lang], selected: addCustomItems.includes(r.en), onToggle: () => toggleCustomItem(r.en) }))} doneLabel={T.today.pickerDone} />
        {QUICK_PRACTICE_ITEMS.map((item) => <button type="button" key={item.en} onClick={() => toggleAddItem(item.en)} className={addItems.includes(item.en) ? "pick-row on" : "pick-row"}><span className="pick-check">{addItems.includes(item.en) ? "✓" : ""}</span><span className="pick-name">{item[lang as Lang]}</span></button>)}
        <ChipDropdown asRow label={T.today.books} selectedCount={selectedBooksCount} open={booksOpen} onToggleOpen={() => setBooksOpen(!booksOpen)}
          rows={allBooks.map((name) => ({ key: name, label: name, selected: addCustomItems.includes(name), onToggle: () => toggleBook(name), onDelete: PRACTICE_BOOKS.includes(name) ? undefined : () => onRemoveUserItem?.("book", name) }))}
          addValue={bookAddText} onAddChange={setBookAddText} onAdd={addBook} addPlaceholder={T.today.addOwnBookPlaceholder} addBtnLabel={T.today.addOwnBtn} doneLabel={T.today.pickerDone} />
        <ChipDropdown asRow label={T.today.myItems} selectedCount={selectedMyItemsCount} open={myItemsOpen} onToggleOpen={() => setMyItemsOpen(!myItemsOpen)}
          rows={(userItems ?? []).map((name) => ({ key: name, label: name, selected: addCustomItems.includes(name), onToggle: () => toggleMyItem(name), onDelete: () => onRemoveUserItem?.("item", name) }))}
          addValue={myItemAddText} onAddChange={setMyItemAddText} onAdd={addMyItem} addPlaceholder={T.today.addOwnPlaceholder} addBtnLabel={T.today.addOwnBtn} doneLabel={T.today.pickerDone} />
      </PracticedPicker>
      {addPromptSeconds > 0 && addItems.length === 0 && addCustomItems.length === 0 && <p className="add-time-hint">{T.sessionTimer.pickAtLeastOne}</p>}
      <div className="add-time-buttons"><button className="discard" onClick={discardTime}>{T.metronome.notNow}</button><button className="add" onClick={addTime} disabled={addPromptSeconds <= 0 || (addItems.length === 0 && addCustomItems.length === 0)}>{T.sessionTimer.addToToday}</button>
      </div>
    </div> : <>
      <div className={playing && !paused ? "pulse playing" : "pulse"} style={{ animationDuration: `${60 / bpm}s` }}><span>{bpm}</span><small>BPM</small></div>
      <div className="beat-dots">{Array.from({ length: beatsPerMeasure }).map((_, i) => <i key={i} className={playing && activeBeat === i ? "beat-dot active" : "beat-dot"} />)}</div>
      <div className="metronome-timer">{sharing ? T.sessionTimer.metronomeShared : playing ? T.metronome.practiceTimer : T.metronome.sessionTime}<strong>{elapsedLabel}</strong></div>
      <input className="range" type="range" min="40" max={exerciseEn ? Math.max(240, ...bpmLevelsFor(exerciseEn)) : 240} value={bpm} onChange={e => setBpm(+e.target.value)}/>
      <div className="tempo-actions"><button onClick={() => setBpm(Math.max(40, bpm - 1))}>−</button><button className="tap" onClick={tapTempo}>{T.metronome.tapTempo}</button><button onClick={() => setBpm(Math.min(240, bpm + 1))}>+</button></div>
      <div className="metro-selects"><div className="metro-select-field"><span className="metro-section-label">{T.metronome.timeSignature}</span><select className="subdivision-select" disabled={playing && !paused} value={beatsPerBar} onChange={e => setBeatsPerBar(Number(e.target.value))}>{BEATS_PER_BAR_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}</select></div><div className="metro-select-field"><span className="metro-section-label">{T.metronome.subdivisionLabel}</span><select className="subdivision-select" disabled={playing && !paused} value={subdivision} onChange={e => setSubdivision(Number(e.target.value))}>{SUBDIVISION_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}</select></div></div>
      {playing ? <div className="metro-actions"><button type="button" className="pause" onClick={paused ? resumePlaying : pausePlaying}>{paused ? `▶ ${T.metronome.resume}` : `❚❚ ${T.metronome.pause}`}</button><button className="stop" onClick={togglePlaying}>{T.metronome.stop}</button></div>
        : <button className="start" onClick={togglePlaying}>{T.metronome.start}</button>}
    </>}
  </div>{clickSettingsOpen && <ClickSettingsPanel T={T} toneKey={toneKey} onTone={(key) => { setToneKey(key); onToneChange?.(key); }} subVolume={subVolume} onSubVolume={setSubVolume} onClose={() => setClickSettingsOpen(false)} />}</div>; }

// A running (or finished-but-unlogged) Session Timer is saved on the device so it survives closing
// the tab/app: only the start time is stored, and elapsed time is recomputed from it on reopen.
// Bump when the privacy policy / terms change in a way people must re-agree to; saved with each sign-up.
const LEGAL_VERSION = "2026-10-07";
// The iPhone app is the same code bundled inside a native shell (see scripts/build-ios.mjs). These two
// build-time values are how it differs: where the live website is (legal pages, account deletion,
// password-reset links all point there) and a flag that hides Google login (email + password only).
const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL ?? "";
// Public legal pages live on the Practice Masters website (WordPress), not in this app.
const LEGAL_URLS = { privacy: "https://practice-masters.com/drumskills-privacy-policy/", terms: "https://practice-masters.com/drumskills-terms-of-use/", support: "https://practice-masters.com/drumskills-support/" };
const IS_NATIVE_BUILD = process.env.NEXT_PUBLIC_NATIVE === "1";
const SESSION_TIMER_STORAGE_KEY = "session_timer_v1";
// A stopwatch left running for days shouldn't log days: capped at 12h, and anything over 3h gets
// a "did you forget to stop it?" warning on the add-time prompt.
const MAX_SESSION_SECONDS = 12 * 3600;
const LONG_SESSION_WARNING_SECONDS = 3 * 3600;
function persistSessionTimer(value: object | null) {
  try {
    if (value) localStorage.setItem(SESSION_TIMER_STORAGE_KEY, JSON.stringify(value));
    else localStorage.removeItem(SESSION_TIMER_STORAGE_KEY);
  } catch { /* storage unavailable (private mode etc.) -- the timer still works, it just won't survive closing */ }
}

// Standalone timing tool for Home (plain Stopwatch, or a countdown Timer with a settable
// duration) -- not tied to a BPM/click like Metronome, but ending a session offers to log the
// time the same way Metronome's free-play mode does, reusing the exact same "what did you
// practice" picker (duplicated here rather than extracted, since Metronome's version is tightly
// coupled to its own large block of local state).
function SessionTimer({ pinnedExercises, onFocusChoice, open, close, onOpen, onBannerChange, onRunChange, timerCredit, onCreditReset, onAddPractice, userItems, userBooks, onAddUserItem, onRemoveUserItem, sortedRudiments, sortedExercises, language, T }: { open: boolean; close: () => void; onOpen?: () => void; onBannerChange?: (active: boolean) => void; onRunChange?: (run: { startedAt: number; mode: "stopwatch" | "timer"; durationMinutes: number } | null) => void; timerCredit?: { startedAt: number; seconds: number; metronome: boolean; items?: string[] } | null; onCreditReset?: () => void; onAddPractice?: (seconds: number, items: string[], customItems: string[], usedMetronome: boolean) => void; userItems?: string[]; userBooks?: string[]; onAddUserItem?: (kind: "item" | "book", name: string) => Promise<void>; onRemoveUserItem?: (kind: "item" | "book", name: string) => Promise<void>; sortedRudiments?: { category: string; subcategory: { en: string; es: string } | null; en: string; es: string; nl: string }[]; sortedExercises?: { category: string; subcategory: { en: string; es: string } | null; en: string; es: string; nl: string }[]; language?: Lang; T: any; pinnedExercises?: string[]; onFocusChoice?: (choice: "rudiments" | "exercises" | "metronome" | "free" | { exercise: string }) => void }) {
  const [mode, setMode] = useState<"stopwatch" | "timer">("stopwatch");
  const [showAdjust, setShowAdjust] = useState(false);
  const [showFocus, setShowFocus] = useState(false); // the "What are you working on?" sheet, shown right after Start
  const [pinsOpen, setPinsOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [durationMinutes, setDurationMinutes] = useState(10);
  const [showAddPrompt, setShowAddPrompt] = useState(false);
  const [addPromptSeconds, setAddPromptSeconds] = useState(0);
  const [addItems, setAddItems] = useState<string[]>([]);
  const [addCustomItems, setAddCustomItems] = useState<string[]>([]);
  const [rudimentsOpen, setRudimentsOpenRaw] = useState(false);
  const [exercisesOpen, setExercisesOpenRaw] = useState(false);
  const [booksOpen, setBooksOpenRaw] = useState(false);
  const [myItemsOpen, setMyItemsOpenRaw] = useState(false);
  function setRudimentsOpen(next: boolean) { setRudimentsOpenRaw(next); if (next) { setExercisesOpenRaw(false); setBooksOpenRaw(false); setMyItemsOpenRaw(false); } }
  function setExercisesOpen(next: boolean) { setExercisesOpenRaw(next); if (next) { setRudimentsOpenRaw(false); setBooksOpenRaw(false); setMyItemsOpenRaw(false); } }
  function setBooksOpen(next: boolean) { setBooksOpenRaw(next); if (next) { setRudimentsOpenRaw(false); setExercisesOpenRaw(false); setMyItemsOpenRaw(false); } }
  function setMyItemsOpen(next: boolean) { setMyItemsOpenRaw(next); if (next) { setRudimentsOpenRaw(false); setExercisesOpenRaw(false); setBooksOpenRaw(false); } }
  const [rudimentSearch, setRudimentSearch] = useState("");
  const rudimentExercises = sortedRudiments ?? [];
  const filteredRudiments = useMemo(() => {
    const q = rudimentSearch.trim().toLowerCase();
    if (!q) return rudimentExercises;
    return rudimentExercises.filter((r) => r[(language ?? "en") as Lang].toLowerCase().includes(q));
  }, [rudimentExercises, rudimentSearch, language]);
  const [exerciseSearch, setExerciseSearch] = useState("");
  const exerciseItems = sortedExercises ?? [];
  const filteredExercises = useMemo(() => {
    const q = exerciseSearch.trim().toLowerCase();
    if (!q) return exerciseItems;
    return exerciseItems.filter((r) => r[(language ?? "en") as Lang].toLowerCase().includes(q));
  }, [exerciseItems, exerciseSearch, language]);
  function toggleCustomItem(en: string) {
    setAddCustomItems((current) => current.includes(en) ? current.filter((v) => v !== en) : [...current, en]);
  }
  const selectedRudimentsCount = addCustomItems.filter((ci) => rudimentExercises.some((r) => r.en === ci)).length;
  const selectedExercisesCount = addCustomItems.filter((ci) => exerciseItems.some((r) => r.en === ci)).length;
  const [bookAddText, setBookAddText] = useState("");
  const allBooks = useMemo(() => [...PRACTICE_BOOKS, ...(userBooks ?? []).filter((b) => !PRACTICE_BOOKS.includes(b))], [userBooks]);
  function toggleBook(name: string) {
    setAddCustomItems((current) => current.includes(name) ? current.filter((v) => v !== name) : [...current, name]);
  }
  async function addBook() {
    const trimmed = bookAddText.trim();
    if (!trimmed) return;
    if (!allBooks.includes(trimmed)) await onAddUserItem?.("book", trimmed);
    setAddCustomItems((current) => current.includes(trimmed) ? current : [...current, trimmed]);
    setBookAddText("");
  }
  const selectedBooksCount = addCustomItems.filter((ci) => allBooks.includes(ci)).length;
  const [myItemAddText, setMyItemAddText] = useState("");
  function toggleMyItem(name: string) {
    setAddCustomItems((current) => current.includes(name) ? current.filter((v) => v !== name) : [...current, name]);
  }
  async function addMyItem() {
    const trimmed = myItemAddText.trim();
    if (!trimmed) return;
    if (!(userItems ?? []).includes(trimmed)) await onAddUserItem?.("item", trimmed);
    setAddCustomItems((current) => current.includes(trimmed) ? current : [...current, trimmed]);
    setMyItemAddText("");
  }
  const selectedMyItemsCount = addCustomItems.filter((ci) => (userItems ?? []).includes(ci)).length;
  const audioCtxRef = useRef<AudioContext | null>(null);
  const wakeLockRef = useRef<any>(null);

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
      if (document.visibilityState === "visible" && playing && !wakeLockRef.current) acquireWakeLock();
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [playing]);
  useEffect(() => {
    return () => { audioCtxRef.current?.close(); wakeLockRef.current?.release(); };
  }, []);

  // Elapsed time is derived from a start timestamp, not by counting interval ticks: the timer now
  // keeps running behind other tabs (and a locked screen), where browsers throttle or pause
  // setInterval, so tick-counting would silently under-report. Also recomputes the moment the app
  // becomes visible again.
  const startedAtRef = useRef<number | null>(null);
  // When the current/last run started: ties Skill Trainer minutes logged during the run to this timer (see timerCredit).
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  // Restores a session saved before the app/tab was closed: a still-running one resumes from its
  // start time, and a Timer that ran out in the meantime opens straight to the log prompt (capped
  // at its set duration, no alert sound -- nothing can play while the app is closed).
  useEffect(() => {
    let saved: any = null;
    try { saved = JSON.parse(localStorage.getItem(SESSION_TIMER_STORAGE_KEY) ?? "null"); } catch { /* ignore unreadable data */ }
    if (!saved || typeof saved !== "object") return;
    const savedMode: "stopwatch" | "timer" = saved.mode === "timer" ? "timer" : "stopwatch";
    const savedDuration = Number.isFinite(saved.durationMinutes) ? Math.min(120, Math.max(1, saved.durationMinutes)) : 10;
    setMode(savedMode);
    setDurationMinutes(savedDuration);
    function restoreFinished(seconds: number, savedStart: number | null) {
      const total = Math.min(Math.floor(seconds), MAX_SESSION_SECONDS);
      if (total <= 0) { persistSessionTimer(null); return; }
      setRunStartedAt(savedStart);
      setElapsed(total);
      setAddPromptSeconds(total);
      setShowAddPrompt(true);
      persistSessionTimer({ phase: "finished", mode: savedMode, durationMinutes: savedDuration, seconds: total, startedAt: savedStart });
    }
    const savedStartedAt = Number.isFinite(saved.startedAt) ? Number(saved.startedAt) : null;
    if (saved.phase === "finished") { restoreFinished(Number(saved.seconds) || 0, savedStartedAt); return; }
    if (saved.phase === "running" && Number.isFinite(saved.startedAt)) {
      const live = Math.max(0, Math.floor((Date.now() - saved.startedAt) / 1000));
      if (savedMode === "timer" && live >= savedDuration * 60) { restoreFinished(savedDuration * 60, saved.startedAt); return; }
      startedAtRef.current = saved.startedAt;
      setRunStartedAt(saved.startedAt);
      onRunChange?.({ startedAt: saved.startedAt, mode: savedMode, durationMinutes: savedDuration });
      setElapsed(live);
      setPlaying(true);
      return;
    }
    persistSessionTimer(null);
  }, []);
  useEffect(() => {
    if (!playing) return;
    const tick = () => { if (startedAtRef.current !== null) setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000)); };
    const timer = window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, [playing]);

  function formatMMSS(totalSeconds: number) { return String(Math.floor(totalSeconds / 60)).padStart(2, "0") + ":" + String(totalSeconds % 60).padStart(2, "0"); }
  function formatMinSecLabel(totalSeconds: number) {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    const parts: string[] = [];
    if (m > 0) parts.push(`${m} ${T.metronome.minAbbr}`);
    if (s > 0 || m === 0) parts.push(`${s} ${T.metronome.secAbbr}`);
    return parts.join(" ");
  }
  const remaining = Math.max(0, durationMinutes * 60 - elapsed);
  const displaySeconds = mode === "timer" ? (playing ? remaining : durationMinutes * 60) : elapsed;

  // Plays a short alert tone when a Timer session completes on its own. The AudioContext is
  // created/unlocked inside togglePlaying()'s start branch (a real tap, same iOS-unlock trick
  // Metronome uses) and kept in a ref, so it's still usable later when this fires from a plain
  // setInterval tick rather than a fresh user gesture. A session restored after reopening the app
  // has no unlocked context yet, so one is created here as a best effort -- iOS may keep it muted
  // until the user taps something, in which case the tone is skipped but the log prompt still shows.
  function playAlertTone() {
    let existing = audioCtxRef.current;
    if (!existing) {
      try {
        const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        existing = new AudioContextClass();
        audioCtxRef.current = existing;
      } catch { return; }
    }
    const ctx = existing;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    [0, 0.26, 0.52].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + offset + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.22);
    });
  }
  function stopAndPrompt(playAlert: boolean) {
    // A Timer left running while the app was backgrounded can overshoot its target by the time
    // this runs, so its logged time is capped at the set duration.
    const live = startedAtRef.current !== null ? Math.floor((Date.now() - startedAtRef.current) / 1000) : elapsed;
    const total = Math.min(mode === "timer" ? Math.min(live, durationMinutes * 60) : live, MAX_SESSION_SECONDS);
    const runStart = startedAtRef.current ?? runStartedAt;
    startedAtRef.current = null;
    setPlaying(false);
    setShowFocus(false);
    onRunChange?.(null);
    setElapsed(total);
    if (playAlert) playAlertTone();
    persistSessionTimer(total > 0 ? { phase: "finished", mode, durationMinutes, seconds: total, startedAt: runStart } : null);
    if (total > 0) { setAddPromptSeconds(total); setAddItems([]); setAddCustomItems([]); setRudimentsOpenRaw(false); setBooksOpenRaw(false); setMyItemsOpenRaw(false); setShowAddPrompt(true); }
  }
  // A Timer counts up the same `elapsed` seconds as a Stopwatch internally (simpler than a
  // separate countdown value) -- this just watches for it reaching the target duration.
  useEffect(() => {
    if (mode === "timer" && playing && elapsed >= durationMinutes * 60) stopAndPrompt(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed]);

  async function togglePlaying() {
    if (!playing) {
      startedAtRef.current = Date.now();
      persistSessionTimer({ phase: "running", mode, durationMinutes, startedAt: startedAtRef.current });
      onCreditReset?.();
      setRunStartedAt(startedAtRef.current);
      onRunChange?.({ startedAt: startedAtRef.current, mode, durationMinutes });
      setElapsed(0);
      setPlaying(true);
      setPinsOpen(false);
      setShowFocus(true);
      const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      enablePlaybackAudio();
      const ctx = audioCtxRef.current ?? new AudioContextClass();
      audioCtxRef.current = ctx;
      if (ctx.state === "suspended") await ctx.resume();
      const unlockBuffer = ctx.createBuffer(1, 1, 22050);
      const unlockSource = ctx.createBufferSource();
      unlockSource.buffer = unlockBuffer;
      unlockSource.connect(ctx.destination);
      unlockSource.start(0);
      return;
    }
    stopAndPrompt(false);
  }
  // Minutes already added to today's total from Skill Trainer (or the metronome) WHILE this timer was running are
  // part of this session's time, so they are taken off before the timer adds its own -- otherwise they'd count twice.
  const ownCredit = timerCredit && runStartedAt !== null && timerCredit.startedAt === runStartedAt ? timerCredit : null;
  const creditApplied = Math.min(ownCredit?.seconds ?? 0, addPromptSeconds);
  const netSeconds = Math.max(0, addPromptSeconds - creditApplied);
  const metronomeUsed = !!ownCredit?.metronome;
  const creditSeconds = ownCredit?.seconds ?? 0;
  const creditItems = ownCredit?.items ?? [];
  const creditItemsKey = creditItems.join("|");
  // The amount being added is what the person adjusts (not the whole session), so the number they see is the number that is saved.
  function setNetSeconds(next: number) { setAddPromptSeconds(Math.min(MAX_SESSION_SECONDS, creditSeconds + Math.max(0, next))); }
  // Skill Trainer items from this session start ticked, so most people only press the button.
  useEffect(() => {
    if (!showAddPrompt) return;
    setShowAdjust(false);
    if (creditItemsKey) setAddCustomItems((current) => Array.from(new Set([...current, ...creditItemsKey.split("|")])));
  }, [showAddPrompt, creditItemsKey]);
  function addTime() { if (addPromptSeconds <= 0) return; onAddPractice?.(netSeconds, addItems, addCustomItems, metronomeUsed); onCreditReset?.(); persistSessionTimer(null); setShowAddPrompt(false); setElapsed(0); close(); }
  function discardTime() { onCreditReset?.(); persistSessionTimer(null); setShowAddPrompt(false); setElapsed(0); }
  function nudgeAddPromptSeconds(delta: number) { setAddPromptSeconds((current) => Math.min(MAX_SESSION_SECONDS, Math.max(0, current + delta))); }
  function toggleAddItem(item: string) { setAddItems((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item]); }
  // With the modal closed, a running session (or a finished one still waiting to be logged) shows
  // as a slim bar pinned to the top of every tab -- tapping it reopens the modal. Home gets told
  // via onBannerChange so it can make room for the bar instead of letting it cover page headers.
  const bannerActive = !open && (playing || showAddPrompt);
  useEffect(() => { onBannerChange?.(bannerActive); }, [bannerActive]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) {
    if (!bannerActive) return null;
    return <button type="button" className={showAddPrompt ? "session-timer-banner finished" : "session-timer-banner"} onClick={onOpen}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="13" r="8" /><path d="M12 9v4l3 2" /><path d="M9 2h6" /></svg>
      <strong>{showAddPrompt ? T.sessionTimer.sessionFinished : formatMMSS(displaySeconds)}</strong>
      <span>{showAddPrompt ? T.sessionTimer.tapToLog : `${mode === "timer" ? T.sessionTimer.modeTimer : T.sessionTimer.modeStopwatch} · ${T.sessionTimer.tapToOpen}`}</span>
    </button>;
  }
  const lang = (language ?? "en") as Lang;
  const skillRows = creditItems.map((en) => ({ key: en, label: PRACTICE_EXERCISES.find((e) => e.en === en)?.[lang] ?? en, selected: addCustomItems.includes(en), onToggle: () => toggleCustomItem(en) }));
  const extraPickedCount = addItems.length + addCustomItems.filter((c) => !creditItems.includes(c)).length;
  const hasPicked = addItems.length > 0 || addCustomItems.length > 0;

  return <div className="modal modal-center"><div className="metro"><button className="close" onClick={close}>×</button>{!showAddPrompt && <p className="eyebrow">{T.sessionTimer.title}</p>}
    {showAddPrompt ? <div className="add-time">
      <h3>{T.sessionTimer.logTitle}</h3>
      {netSeconds <= 0 && <p>{T.sessionTimer.allAlreadyLogged}</p>}
      <div className="add-receipt">
        <div><span>{T.sessionTimer.receiptSession}</span><b>{formatMMSS(elapsed)}</b></div>
        {creditApplied > 0 && <div><span>{T.sessionTimer.receiptLogged}</span><b>{formatMMSS(creditApplied)}</b></div>}
        {creditApplied > 0 && <div className="total"><span>{T.sessionTimer.receiptAdding}</span><b>{formatMMSS(netSeconds)}</b></div>}
      </div>
      {addPromptSeconds > LONG_SESSION_WARNING_SECONDS && <p className="add-time-warning">{T.sessionTimer.longSessionWarning}</p>}
      {netSeconds > 0 && <button type="button" className="add-time-change" onClick={() => setShowAdjust(!showAdjust)}>{showAdjust ? T.sessionTimer.hideChange : T.sessionTimer.changeAmount}</button>}
      {showAdjust && netSeconds >= 0 && <div className="add-time-minutes">
        <button type="button" onClick={() => setNetSeconds(netSeconds - 300)}>−5</button>
        <button type="button" onClick={() => setNetSeconds(netSeconds - 60)}>−1</button>
        <div className="add-time-minutes-value">
          <input inputMode="numeric" aria-label={T.metronome.minAbbr} value={Math.floor(netSeconds / 60)} onChange={(e) => setNetSeconds((parseInt(e.target.value.replace(/\D/g, ""), 10) || 0) * 60 + (netSeconds % 60))} />
          <span>{T.metronome.minAbbr}</span>
          {netSeconds % 60 > 0 && <small>+{netSeconds % 60} {T.metronome.secAbbr}</small>}
        </div>
        <button type="button" onClick={() => setNetSeconds(netSeconds + 60)}>+1</button>
        <button type="button" onClick={() => setNetSeconds(netSeconds + 300)}>+5</button>
      </div>}
      {showAdjust && addPromptSeconds !== elapsed && <button type="button" className="add-time-reset" onClick={() => setAddPromptSeconds(elapsed)}>{T.sessionTimer.resetTime(formatMMSS(Math.max(0, elapsed - creditSeconds)))}</button>}
      {netSeconds > 0 && <PracticedPicker title={T.sessionTimer.whatDidYouPractise} skillRows={skillRows} skillBadge={T.sessionTimer.skillTrainerBadge} moreLabel={skillRows.length > 0 ? T.sessionTimer.anythingElse : T.sessionTimer.chooseWhat} extraCount={extraPickedCount}>
        <ChipDropdown asRow label={T.today.rudiments} selectedCount={selectedRudimentsCount} open={rudimentsOpen} onToggleOpen={() => setRudimentsOpen(!rudimentsOpen)}
          searchable searchValue={rudimentSearch} onSearchChange={setRudimentSearch} searchPlaceholder={T.today.searchRudiments}
          rows={filteredRudiments.map((r) => ({ key: r.en, label: r[lang], selected: addCustomItems.includes(r.en), onToggle: () => toggleCustomItem(r.en) }))} doneLabel={T.today.pickerDone} />
        <ChipDropdown asRow label={T.practiceMode.categoryExercises} selectedCount={selectedExercisesCount} open={exercisesOpen} onToggleOpen={() => setExercisesOpen(!exercisesOpen)}
          searchable searchValue={exerciseSearch} onSearchChange={setExerciseSearch} searchPlaceholder={T.today.searchExercises}
          rows={filteredExercises.map((r) => ({ key: r.en, label: r[lang], selected: addCustomItems.includes(r.en), onToggle: () => toggleCustomItem(r.en) }))} doneLabel={T.today.pickerDone} />
        {QUICK_PRACTICE_ITEMS.map((item) => <button type="button" key={item.en} onClick={() => toggleAddItem(item.en)} className={addItems.includes(item.en) ? "pick-row on" : "pick-row"}><span className="pick-check">{addItems.includes(item.en) ? "✓" : ""}</span><span className="pick-name">{item[lang]}</span></button>)}
        <ChipDropdown asRow label={T.today.books} selectedCount={selectedBooksCount} open={booksOpen} onToggleOpen={() => setBooksOpen(!booksOpen)}
          rows={allBooks.map((name) => ({ key: name, label: name, selected: addCustomItems.includes(name), onToggle: () => toggleBook(name), onDelete: PRACTICE_BOOKS.includes(name) ? undefined : () => onRemoveUserItem?.("book", name) }))}
          addValue={bookAddText} onAddChange={setBookAddText} onAdd={addBook} addPlaceholder={T.today.addOwnBookPlaceholder} addBtnLabel={T.today.addOwnBtn} doneLabel={T.today.pickerDone} />
        <ChipDropdown asRow label={T.today.myItems} selectedCount={selectedMyItemsCount} open={myItemsOpen} onToggleOpen={() => setMyItemsOpen(!myItemsOpen)}
          rows={(userItems ?? []).map((name) => ({ key: name, label: name, selected: addCustomItems.includes(name), onToggle: () => toggleMyItem(name), onDelete: () => onRemoveUserItem?.("item", name) }))}
          addValue={myItemAddText} onAddChange={setMyItemAddText} onAdd={addMyItem} addPlaceholder={T.today.addOwnPlaceholder} addBtnLabel={T.today.addOwnBtn} doneLabel={T.today.pickerDone} />
      </PracticedPicker>}
      {netSeconds > 0 && !hasPicked && <p className="add-time-hint">{T.sessionTimer.pickAtLeastOne}</p>}
      <div className="add-time-buttons"><button className="discard" onClick={discardTime}>{T.metronome.notNow}</button>{netSeconds > 0
        ? <button className="add" onClick={addTime} disabled={!hasPicked}>{T.sessionTimer.addToToday}</button>
        : <button className="add" onClick={discardTime}>{T.today.pickerDone}</button>}</div>
    </div> : <>
      <div className="equipment-toggle session-timer-mode-toggle">
        <button type="button" className={mode === "stopwatch" ? "equipment-option selected" : "equipment-option"} disabled={playing} onClick={() => setMode("stopwatch")}>{T.sessionTimer.modeStopwatch}</button>
        <button type="button" className={mode === "timer" ? "equipment-option selected" : "equipment-option"} disabled={playing} onClick={() => setMode("timer")}>{T.sessionTimer.modeTimer}</button>
      </div>
      {mode === "timer" && !playing && <div className="session-timer-duration">
        <span className="metro-section-label">{T.sessionTimer.durationLabel}</span>
        <div className="add-time-adjust"><button onClick={() => setDurationMinutes((m) => Math.max(1, m - 5))}>-5</button><span className="add-time-value">{durationMinutes} {T.metronome.minAbbr}</span><button onClick={() => setDurationMinutes((m) => Math.min(120, m + 5))}>+5</button></div>
      </div>}
      <div className="session-timer-display">{formatMMSS(displaySeconds)}</div>
      <button className={playing ? "stop" : "start"} onClick={togglePlaying}>{playing ? T.metronome.stop : T.metronome.start}</button>
    </>}
  </div>
  {showFocus && playing && <div className="modal modal-center picker-window" onClick={() => setShowFocus(false)}>
    <div className="day-summary picker-window-card focus-sheet" onClick={(e) => e.stopPropagation()}>
      <button type="button" className="close" onClick={() => setShowFocus(false)} aria-label={T.sessionTimer.focusSkip}>×</button>
      <div className="focus-timer" role="timer" aria-live="off"><span className="focus-timer-dot" /><strong>{formatMMSS(displaySeconds)}</strong><small>{T.sessionTimer.focusRunning}</small></div>
      <h2 className="edit-rating-title">{T.sessionTimer.focusTitle}</h2>
      {(pinnedExercises ?? []).length > 0 && <>
        <button type="button" className={pinsOpen ? "focus-row open" : "focus-row"} style={{ "--c": "255, 196, 77" } as React.CSSProperties} aria-expanded={pinsOpen} onClick={() => setPinsOpen(!pinsOpen)}>
          <span className="focus-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3.5l2.5 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.1 2.6 1-5.8-4.2-4.1 5.8-.8z" /></svg></span>
          <span className="focus-text"><strong>{T.sessionTimer.focusPinned}</strong><small>{(pinnedExercises ?? []).length}</small></span>
          <span className="focus-caret">▾</span>
        </button>
        {pinsOpen && <div className="focus-pins">{(pinnedExercises ?? []).map((en) => <button type="button" key={en} className="focus-pin" onClick={() => { setShowFocus(false); close(); onFocusChoice?.({ exercise: en }); }}>{PRACTICE_EXERCISES.find((e) => e.en === en)?.[lang] ?? en}<span>›</span></button>)}</div>}
      </>}
      <button type="button" className="focus-row" style={{ "--c": "255, 107, 26" } as React.CSSProperties} onClick={() => { setShowFocus(false); close(); onFocusChoice?.("rudiments"); }}>
        <span className="focus-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="8" rx="8" ry="3" /><path d="M4 8v8c0 1.7 3.6 3 8 3s8-1.3 8-3V8" /><path d="M8 11.4l-1.4 6M16 11.4l1.4 6M12 11.9v7" /></svg></span>
        <span className="focus-text"><strong>{T.practiceMode.categoryRudiments}</strong><small>{T.sessionTimer.focusRudimentsSub}</small></span><span className="focus-go">›</span>
      </button>
      <button type="button" className="focus-row" style={{ "--c": "240, 112, 96" } as React.CSSProperties} onClick={() => { setShowFocus(false); close(); onFocusChoice?.("exercises"); }}>
        <span className="focus-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M6.5 6.5v11M17.5 6.5v11M3.5 9.5v5M20.5 9.5v5M6.5 12h11" /></svg></span>
        <span className="focus-text"><strong>{T.practiceMode.categoryExercises}</strong><small>{T.sessionTimer.focusExercisesSub}</small></span><span className="focus-go">›</span>
      </button>
      <button type="button" className="focus-row" style={{ "--c": "255, 160, 70" } as React.CSSProperties} onClick={() => { setShowFocus(false); close(); onFocusChoice?.("metronome"); }}>
        <span className="focus-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3h6l3.5 17.5a1 1 0 01-1 1.2h-11a1 1 0 01-1-1.2z" /><path d="M12 17.5L15.5 6.5" /><circle cx="14.2" cy="10.4" r="1.3" fill="currentColor" /></svg></span>
        <span className="focus-text"><strong>{T.today.metronome}</strong><small>{T.sessionTimer.focusMetronomeSub}</small></span><span className="focus-go">›</span>
      </button>
      <button type="button" className="focus-row" style={{ "--c": "110, 200, 170" } as React.CSSProperties} onClick={() => { setShowFocus(false); onFocusChoice?.("free"); }}>
        <span className="focus-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5.5l11-2V16" /><path d="M9 9.5l11-2" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="17.5" cy="16" r="2.5" /></svg></span>
        <span className="focus-text"><strong>{T.sessionTimer.focusFree}</strong><small>{T.sessionTimer.focusFreeSub}</small></span><span className="focus-go">›</span>
      </button>
    </div>
  </div>}
  </div>;
}

function AdminPage({ user, language, T }: { user: any; language: Lang; T: any }) {
  const [users, setUsers] = useState<{ id: string; name: string; email: string; last_active: string | null; total_logs: number; total_minutes: number }[] | null>(null);
  // A personal viewing preference for the admin, not app data -- remembered locally per
  // browser rather than in the database, so it doesn't need its own settings column.
  const [excludeSelf, setExcludeSelf] = useState(() => typeof window !== "undefined" && localStorage.getItem("admin_exclude_self") === "1");
  useEffect(() => { try { localStorage.setItem("admin_exclude_self", excludeSelf ? "1" : "0"); } catch {} }, [excludeSelf]);
  const [statsRange, setStatsRange] = useState<"all" | "month" | "lastMonth" | "year">("all");
  // Every user's raw daily logs, fetched once -- admin already has read access to everyone's
  // practice_logs (see the existing admin RLS policy), so month/year totals are just a client-side
  // sum over a date range instead of needing a second parameterized RPC.
  const [allLogs, setAllLogs] = useState<{ user_id: string; practiced_on: string; minutes: number }[] | null>(null);
  useEffect(() => {
    // Supabase caps a single request at 1000 rows -- across every user's logs combined, that
    // cap can be hit well before any one user's full history is covered, which silently
    // truncated Month/Year totals for whichever users' rows fell past row 1000 (their "All"
    // total, computed server-side by admin_list_users(), stayed correct while Month/Year,
    // computed client-side from this truncated list, came out wrong). Page through in batches
    // of 1000 until a batch comes back short, so the full table is always loaded.
    async function loadAllLogs() {
      const PAGE_SIZE = 1000;
      let all: { user_id: string; practiced_on: string; minutes: number }[] = [];
      let from = 0;
      while (true) {
        const { data } = await supabase.from("practice_logs").select("user_id,practiced_on,minutes").range(from, from + PAGE_SIZE - 1);
        all = all.concat(data ?? []);
        if (!data || data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
      setAllLogs(all);
    }
    loadAllLogs();
  }, []);
  // Cross-student speed comparison: which exercise's Skill Trainer sessions to chart, and the
  // raw sessions (every student) for that one exercise -- re-fetched only when the exercise
  // picker changes, so switching exercises doesn't require reloading everything.
  const [speedExercise, setSpeedExercise] = useState<string>(PRACTICE_EXERCISES[0].en);
  const [speedSessions, setSpeedSessions] = useState<{ user_id: string; bpm: number; rating: string; duration_minutes: number; practiced_on: string }[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function loadSpeedSessions() {
      setSpeedSessions(null);
      const { data: exerciseRow } = await supabase.from("practice_exercises").select("id").eq("name_en", speedExercise).maybeSingle();
      if (!exerciseRow) { if (!cancelled) setSpeedSessions([]); return; }
      const PAGE_SIZE = 1000;
      let all: { user_id: string; bpm: number; rating: string; duration_minutes: number; practiced_on: string }[] = [];
      let from = 0;
      while (true) {
        const { data } = await supabase.from("practice_sessions").select("user_id,bpm,rating,duration_minutes,practiced_on").eq("practice_exercise_id", exerciseRow.id).order("practiced_on").range(from, from + PAGE_SIZE - 1);
        all = all.concat(data ?? []);
        if (!data || data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
      if (!cancelled) setSpeedSessions(all);
    }
    loadSpeedSessions();
    return () => { cancelled = true; };
  }, [speedExercise]);
  // "Recent improvements" board: every student's tempo-unlock history across every exercise,
  // fetched once (not per-exercise like the speed chart above) so the board can show the most
  // recent unlock regardless of which exercise it happened on.
  const [allExerciseNames, setAllExerciseNames] = useState<Record<string, string> | null>(null);
  const [allSpeedSessions, setAllSpeedSessions] = useState<{ user_id: string; practice_exercise_id: string; bpm: number; rating: string; duration_minutes: number; practiced_on: string }[] | null>(null);
  useEffect(() => {
    async function loadAll() {
      const { data: exerciseRows } = await supabase.from("practice_exercises").select("id,name_en");
      setAllExerciseNames(Object.fromEntries((exerciseRows ?? []).map((r: any) => [r.id, r.name_en])));
      const PAGE_SIZE = 1000;
      let all: { user_id: string; practice_exercise_id: string; bpm: number; rating: string; duration_minutes: number; practiced_on: string }[] = [];
      let from = 0;
      while (true) {
        const { data } = await supabase.from("practice_sessions").select("user_id,practice_exercise_id,bpm,rating,duration_minutes,practiced_on").order("practiced_on").range(from, from + PAGE_SIZE - 1);
        all = all.concat(data ?? []);
        if (!data || data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
      setAllSpeedSessions(all);
    }
    loadAll();
  }, []);
  const [showImprovementsModal, setShowImprovementsModal] = useState(false);
  const [selected, setSelected] = useState<{ id: string; name: string; email: string } | null>(null);
  const [logs, setLogs] = useState<any[] | null>(null);
  const [sessions, setSessions] = useState<any[] | null>(null);
  const [pinned, setPinned] = useState<string[] | null>(null);
  const [points, setPoints] = useState<{ id: string; amount: number; reason: string | null; created_at: string }[] | null>(null);
  const [kidMode, setKidMode] = useState(false);
  const [pointsEnabled, setPointsEnabled] = useState(false);
  const [lbHidden, setLbHidden] = useState(false);
  const [studentDifficulty, setStudentDifficulty] = useState<Difficulty>("standard");
  const [studentAge, setStudentAge] = useState<AgeBand | null>(null);
  // Progress screens below count unlocked tempos with the OPEN student's rule (1 minute for kids), not the admin's own.
  setUnlockMinutesForAge(selected ? studentAge : null);
  // Daily Logs / Skill Trainer Sessions / Points History can each run long for an active
  // student -- same collapsed-by-default, "See more" pattern already used on the student's own
  // Progress page, rather than dumping the full history on screen at once.
  const [showAllLogs, setShowAllLogs] = useState(false);
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [showAllPoints, setShowAllPoints] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [wonChallenges, setWonChallenges] = useState<any[]>([]);
  // Every personal challenge of the opened student (own and given) with its day-by-day result, for the "Give a challenge" section.
  const [studentChallenges, setStudentChallenges] = useState<any[]>([]);
  const [giveExercise, setGiveExercise] = useState(CHALLENGE_EXERCISE_OPTIONS[0]?.en ?? "");
  const [giveMinutes, setGiveMinutes] = useState("10");
  const [giveBpm, setGiveBpm] = useState("");
  const [giveLength, setGiveLength] = useState("7");
  const [giveBusy, setGiveBusy] = useState(false);
  const [giveOpen, setGiveOpen] = useState(false);
  const [giveError, setGiveError] = useState<string | null>(null);
  const [awardAmount, setAwardAmount] = useState("1");
  const [awardReason, setAwardReason] = useState("");
  const [awarding, setAwarding] = useState(false);

  useEffect(() => {
    supabase.rpc("admin_list_users").then(({ data }) => { setUsers(data ?? []); });
  }, []);

  function fetchPoints(userId: string) {
    supabase.from("point_awards").select("id,amount,reason,created_at").eq("user_id", userId).order("created_at", { ascending: false }).then(({ data }) => {
      setPoints(data ?? []);
    });
  }

  async function openUser(u: { id: string; name: string; email: string }) {
    // Fetch everything first and only switch the screen once it's all here, instead of
    // switching immediately and filling in data as each request lands -- the in-between state
    // (a page with nothing on it yet) is exactly the flash this was designed to avoid.
    const [logsRes, sessionsRes, pinnedRes, settingsRes, pointsRes, challengesRes] = await Promise.all([
      supabase.from("practice_logs").select("practiced_on,minutes,seconds,notes,custom_items,used_metronome,practice_log_items(practice_items(name_en))").eq("user_id", u.id).order("practiced_on", { ascending: false }),
      supabase.from("practice_sessions").select("bpm,rating,duration_minutes,practiced_on,created_at,practice_exercises(name_en)").eq("user_id", u.id).order("practiced_on", { ascending: false }),
      supabase.from("pinned_exercises").select("exercise_en").eq("user_id", u.id).order("sort_order"),
      supabase.from("settings").select("kid_mode, points_enabled, leaderboard_hidden").eq("user_id", u.id).maybeSingle(),
      supabase.from("point_awards").select("id,amount,reason,created_at").eq("user_id", u.id).order("created_at", { ascending: false }),
      supabase.from("personal_challenges").select("id,exercise_en,target_minutes,target_bpm,length_days,start_date,assigned_by").eq("user_id", u.id),
    ]);
    setLogs((logsRes.data ?? []).map((row: any) => ({
      date: row.practiced_on, minutes: row.minutes, seconds: row.seconds ?? 0, notes: row.notes, usedMetronome: !!row.used_metronome,
      items: Array.from(new Set([...(row.practice_log_items ?? []).map((entry: any) => entry.practice_items?.name_en).filter(Boolean), ...(row.custom_items ?? [])])),
    })));
    setSessions((sessionsRes.data ?? []).map((row: any) => ({ created_at: row.created_at, date: row.practiced_on, practiced_on: row.practiced_on, exercise: row.practice_exercises?.name_en ?? "—", item_en: row.practice_exercises?.name_en ?? "", bpm: row.bpm, rating: row.rating, minutes: row.duration_minutes ?? 0, duration_minutes: row.duration_minutes ?? 0 })));
    setPinned((pinnedRes.data ?? []).map((row: any) => row.exercise_en));
    setKidMode(!!settingsRes.data?.kid_mode);
    setPointsEnabled(!!settingsRes.data?.points_enabled);
    setLbHidden(!!settingsRes.data?.leaderboard_hidden);
    setStudentDifficulty("standard");
    setStudentAge(null);
    supabase.from("settings").select("practice_difficulty").eq("user_id", u.id).maybeSingle().then(({ data }: any) => { if (data?.practice_difficulty === "beginner" || data?.practice_difficulty === "developing") setStudentDifficulty(data.practice_difficulty); });
    supabase.rpc("admin_age_band", { target_user_id: u.id }).then(({ data, error }: any) => { if (!error) setStudentAge(asAgeBand(data)); });
    setPoints(pointsRes.data ?? []);
    const challengesList = challengesRes.data ?? [];
    if (challengesList.length) {
      const earliestStart = challengesList.reduce((min: string, c: any) => (c.start_date < min ? c.start_date : min), challengesList[0].start_date);
      const sessionsForEval = (sessionsRes.data ?? []).map((row: any) => ({ item_en: row.practice_exercises?.name_en ?? "", bpm: row.bpm, duration_minutes: row.duration_minutes ?? 0, practiced_on: row.practiced_on, created_at: row.created_at }));
      const logsCache = await fetchChallengeLogsCache(u.id, earliestStart);
      setWonChallenges(challengesList.filter((c: any) => evaluateChallenge(c, sessionsForEval, logsCache).status === "completed"));
      setStudentChallenges(challengesList.map((c: any) => ({ ...c, ...evaluateChallenge(c, sessionsForEval, logsCache) })).sort((a: any, b: any) => (a.start_date < b.start_date ? 1 : -1)));
    } else {
      setWonChallenges([]);
      setStudentChallenges([]);
    }
    setGiveError(null);
    setShowAllLogs(false);
    setShowAllSessions(false);
    setShowAllPoints(false);
    setShowHistory(false);
    setSelected(u);
  }
  async function reloadStudentChallenges(studentId: string) {
    const [challengesRes, sessionsRes] = await Promise.all([
      supabase.from("personal_challenges").select("id,exercise_en,target_minutes,target_bpm,length_days,start_date,assigned_by").eq("user_id", studentId),
      supabase.from("practice_sessions").select("bpm,duration_minutes,practiced_on,created_at,practice_exercises(name_en)").eq("user_id", studentId),
    ]);
    const list = challengesRes.data ?? [];
    if (!list.length) { setStudentChallenges([]); setWonChallenges([]); return; }
    const earliestStart = list.reduce((min: string, c: any) => (c.start_date < min ? c.start_date : min), list[0].start_date);
    const sessionsForEval = (sessionsRes.data ?? []).map((row: any) => ({ item_en: row.practice_exercises?.name_en ?? "", bpm: row.bpm, duration_minutes: row.duration_minutes ?? 0, practiced_on: row.practiced_on, created_at: row.created_at }));
    const logsCache = await fetchChallengeLogsCache(studentId, earliestStart);
    const evaluated = list.map((c: any) => ({ ...c, ...evaluateChallenge(c, sessionsForEval, logsCache) }));
    setStudentChallenges([...evaluated].sort((a: any, b: any) => (a.start_date < b.start_date ? 1 : -1)));
    setWonChallenges(evaluated.filter((c: any) => c.status === "completed"));
  }
  async function giveChallenge() {
    if (!selected) return;
    setGiveBusy(true);
    setGiveError(null);
    const isLadderExercise = PRACTICE_EXERCISES.some((e) => e.en === giveExercise);
    const { error } = await supabase.from("personal_challenges").insert({ user_id: selected.id, assigned_by: user.id, exercise_en: giveExercise, target_minutes: Number(giveMinutes) || 1, target_bpm: isLadderExercise && giveBpm ? Number(giveBpm) : null, length_days: Math.min(90, Number(giveLength) || 1), start_date: dateKey });
    setGiveBusy(false);
    if (error) { setGiveError(error.message || T.personalChallenges.couldNotGive); return; }
    setGiveBpm("");
    reloadStudentChallenges(selected.id);
  }
  async function removeGivenChallenge(id: string) {
    if (!selected) return;
    if (!window.confirm(T.personalChallenges.confirmRemove)) return;
    const { error } = await supabase.from("personal_challenges").delete().eq("id", id);
    if (error) { setGiveError(error.message); return; }
    reloadStudentChallenges(selected.id);
  }
  async function awardPoints(amount: number, reason: string | null) {
    if (!selected || !amount) return;
    setAwarding(true);
    await supabase.rpc("admin_award_points", { target_user_id: selected.id, points_amount: amount, points_reason: reason });
    setAwardAmount("1");
    setAwardReason("");
    setAwarding(false);
    fetchPoints(selected.id);
  }
  async function setKidModeValue(enabled: boolean) {
    if (!selected || enabled === kidMode) return;
    setKidMode(enabled);
    // If the database refuses, put the switch back so the screen never shows a setting that wasn't saved.
    const { error } = await supabase.rpc("admin_set_kid_mode", { target_user_id: selected.id, enabled });
    if (error) setKidMode(!enabled);
  }
  async function setPointsEnabledValue(enabled: boolean) {
    if (!selected || enabled === pointsEnabled) return;
    setPointsEnabled(enabled);
    const { error } = await supabase.rpc("admin_set_points_enabled", { target_user_id: selected.id, enabled });
    if (error) setPointsEnabled(!enabled);
  }

  async function setStudentDifficultyValue(next: Difficulty) {
    if (!selected || next === studentDifficulty) return;
    const previous = studentDifficulty;
    setStudentDifficulty(next);
    const { error } = await supabase.rpc("admin_set_practice_difficulty", { target_user_id: selected.id, difficulty: next });
    if (error) setStudentDifficulty(previous);
  }
  async function setLbHiddenValue(hidden: boolean) {
    if (!selected || hidden === lbHidden) return;
    setLbHidden(hidden);
    const { error } = await supabase.rpc("admin_set_leaderboard_hidden", { target_user_id: selected.id, hidden });
    if (error) setLbHidden(!hidden);
  }

  const ADMIN_HISTORY_LIMIT = 5;
  if (selected) {
    // Show a lightweight loading state instead of the full stats cards while the fetches kicked
    // off by openUser() are still in flight -- otherwise this briefly renders every stat as zero
    // (via the `?? []` fallbacks below) before the real numbers pop in, which reads as a glitch.
    if (logs === null || sessions === null || points === null) {
      return <section className="page">
        <button className="page-back" onClick={() => setSelected(null)}>‹ {T.admin.title}</button>
        <header className="simple-head"><h1>{selected.name || selected.email}</h1><p className="hint">{selected.email}</p></header>
        <p className="hint">…</p>
      </section>;
    }
    const skillTrainerDates = new Set((sessions ?? []).map((s) => s.date));
    const selectedUserRow = users?.find((u) => u.id === selected.id);
    const logsByDate: Record<string, Log> = Object.fromEntries((logs ?? []).map((l) => [l.date, { minutes: l.minutes } as Log]));
    const { current: userStreak, longest: userLongestStreak } = calculateStreaks(logsByDate, dateKey);
    // "Most practiced" is by actual minutes, same approach as the student's own Progress page:
    // Skill Trainer sessions carry exact per-exercise minutes; a Quick Practice day's total (minus
    // whatever that day's Skill Trainer sessions already account for) is split evenly across
    // whichever items were tagged that day. Untagged leftover minutes are skipped rather than
    // bucketed into a generic entry, so the ranking stays focused on named things they practiced.
    const practiceMinutes: Record<string, number> = {};
    const structuredMinutesByDay: Record<string, number> = {};
    (sessions ?? []).forEach((s) => {
      practiceMinutes[s.exercise] = (practiceMinutes[s.exercise] ?? 0) + s.minutes;
      structuredMinutesByDay[s.date] = (structuredMinutesByDay[s.date] ?? 0) + s.minutes;
    });
    (logs ?? []).forEach((l) => {
      const leftover = Math.max(0, l.minutes - (structuredMinutesByDay[l.date] ?? 0));
      if (leftover <= 0 || l.items.length === 0) return;
      const share = leftover / l.items.length;
      l.items.forEach((item: string) => { practiceMinutes[item] = (practiceMinutes[item] ?? 0) + share; });
    });
    const mostPracticed = Object.entries(practiceMinutes)
      .map(([name, minutes]) => [name, Math.round(minutes)] as [string, number])
      .filter(([, minutes]) => minutes > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const maxPracticeCount = Math.max(1, ...mostPracticed.map(([, count]) => count));
    // Monthly practice graph: trailing 6 calendar months (zero-filled), summed straight from
    // the already-fetched daily logs -- no extra query needed.
    const monthlyData: { key: string; label: string; minutes: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthlyData.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: d.toLocaleDateString(localeFor(language), { month: "short" }), minutes: 0 });
    }
    const monthlyByKey: Record<string, { key: string; label: string; minutes: number }> = Object.fromEntries(monthlyData.map((m) => [m.key, m]));
    (logs ?? []).forEach((l) => { const bucket = monthlyByKey[l.date.slice(0, 7)]; if (bucket) bucket.minutes += l.minutes; });
    const maxMonthly = Math.max(1, ...monthlyData.map((m) => m.minutes));
    return <section className="page">
      <button className="page-back" onClick={() => setSelected(null)}>‹ {T.admin.title}</button>
      <header className="simple-head"><h1>{selected.name || selected.email}</h1><p className="hint">{selected.email}</p></header>

      <div className="admin-summary-card">
        <div className="admin-stats-row">
          <div className="admin-stat"><span>{T.today.currentStreak}</span><strong>{userStreak} {T.today.days}</strong></div>
          <div className="admin-stat"><span>{T.calendar.longestStreak}</span><strong>{userLongestStreak} {T.today.days}</strong></div>
          {selectedUserRow && <div className="admin-stat"><span>{T.admin.totalPracticeLabel}</span><strong>{formatMinutes(selectedUserRow.total_minutes)}</strong><em>{selectedUserRow.total_logs} {T.admin.totalLogsLabel}</em></div>}
        </div>
      </div>

      <div className="admin-summary-card">
        <span className="admin-summary-label">{T.admin.monthlyPracticeLabel}</span>
        <div className="monthly-chart">
          <div className="monthly-chart-bars">
            {monthlyData.map((m) => <div key={m.key} className="monthly-bar-col">
              <span className="monthly-bar-value">{m.minutes > 0 ? formatMinutes(m.minutes) : ""}</span>
              <div className="monthly-bar-track"><div className="monthly-bar" style={{ height: `${Math.max(m.minutes > 0 ? 4 : 0, (m.minutes / maxMonthly) * 100)}%` }} /></div>
              <span className="monthly-bar-label">{m.label}</span>
            </div>)}
          </div>
        </div>
      </div>

      {mostPracticed.length > 0 && <div className="admin-summary-card">
        <span className="admin-summary-label">{T.admin.mostPracticedLabel}</span>
        <div className="admin-rank-list">
          {mostPracticed.map(([name, count], i) => <div key={name} className="admin-rank-row">
            <span className="admin-rank-num">{i + 1}</span>
            <span className="admin-rank-name">{practiceItemLabel(name, language)}</span>
            <div className="admin-rank-bar-track"><div className="admin-rank-bar" style={{ width: `${Math.max(8, (count / maxPracticeCount) * 100)}%` }} /></div>
            <span className="admin-rank-count">{formatMinutes(count)}</span>
          </div>)}
        </div>
      </div>}

      <div className="admin-summary-card give-challenge">
        <button type="button" className="give-toggle" aria-expanded={giveOpen} onClick={() => setGiveOpen(!giveOpen)}>
          <span className="admin-summary-label">{T.personalChallenges.giveTitle}</span>
          {studentChallenges.length > 0 && <span className="give-count">{studentChallenges.length}</span>}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={giveOpen ? "give-chev open" : "give-chev"}><path d="M6 9l6 6 6-6" /></svg>
        </button>
        {giveOpen && <>
          <select className="group-input" value={giveExercise} onChange={(e) => { setGiveExercise(e.target.value); setGiveBpm(""); }}>
            {CHALLENGE_EXERCISE_OPTIONS.map((opt) => <option key={opt.en} value={opt.en}>{opt[language as Lang]}</option>)}
          </select>
          <div className="give-row">
            <div className="cf-stepper">
              <button type="button" aria-label="-" onClick={() => setGiveMinutes(String(Math.max(1, (Number(giveMinutes) || 1) - 1)))}>−</button>
              <input inputMode="numeric" value={giveMinutes} onChange={(e) => setGiveMinutes(e.target.value.replace(/\D/g, ""))} />
              <button type="button" aria-label="+" onClick={() => setGiveMinutes(String((Number(giveMinutes) || 0) + 1))}>+</button>
            </div>
            <span className="give-unit">{T.personalChallenges.perDayShort}</span>
            {PRACTICE_EXERCISES.some((e) => e.en === giveExercise) && <input className="group-input give-bpm" inputMode="numeric" value={giveBpm} onChange={(e) => setGiveBpm(e.target.value.replace(/\D/g, ""))} placeholder={T.personalChallenges.bpmShort} />}
          </div>
          <div className="admin-mini-toggle admin-mini-toggle-wide">
            {[7, 14, 30].map((n) => <button key={n} type="button" className={Number(giveLength) === n ? "selected" : ""} onClick={() => setGiveLength(String(n))}>{T.personalChallenges.lengthDaysN(n)}</button>)}
            <input className="give-length-input" inputMode="numeric" aria-label={T.personalChallenges.lengthLabel} value={![7, 14, 30].includes(Number(giveLength)) ? giveLength : ""} placeholder={T.personalChallenges.lengthCustomShort} onChange={(e) => setGiveLength(e.target.value.replace(/\D/g, "").slice(0, 2))} />
          </div>
          {giveError && <p className="give-error">{giveError}</p>}
          <button type="button" className="primary cf-create" disabled={giveBusy || !giveExercise || !Number(giveMinutes) || !Number(giveLength) || Number(giveLength) > 90} onClick={giveChallenge}>{giveBusy ? T.personalChallenges.pleaseWait : T.personalChallenges.giveBtn}</button>
          {studentChallenges.length > 0 && <div className="given-list">
            {studentChallenges.map((c) => <div key={c.id} className="given-row">
              <div className="given-head">
                <span className="given-name">{challengeExerciseLabel(c.exercise_en, language)}</span>
                {c.assigned_by === user.id && <button type="button" className="challenge-delete" onClick={() => removeGivenChallenge(c.id)}>{T.personalChallenges.remove}</button>}
              </div>
              <span className="given-meta">{T.personalChallenges.perDay(c.target_minutes)}{c.target_bpm ? ` · ${c.target_bpm}+ BPM` : ""} · {T.personalChallenges.lengthDaysN(c.length_days)} · <span className={`personal-challenge-status ${c.status}`}>{c.status === "completed" ? T.personalChallenges.statusCompletedShort : c.status === "failed" ? T.personalChallenges.failedShort : T.personalChallenges.statusActive(c.completedCount, c.length_days)}</span></span>
              <div className="personal-challenge-dots">{c.days.map((d: any) => <i key={d.date} className={`pc-dot ${d.valid === true ? "hit" : d.valid === false ? "miss" : "pending"}`} />)}</div>
            </div>)}
          </div>}
        </>}
      </div>

      {/* The student's own Progress tab, read-only: leaderboard standing, overall level and skill progress, milestones, challenges won, recent unlocks. */}
      <Progress embedded kidMode={false} user={{ id: selected.id }} language={language} T={T}
        practiceSessions={(sessions ?? []).map((x) => ({ item_en: x.item_en, bpm: x.bpm, rating: x.rating, duration_minutes: x.duration_minutes, practiced_on: x.practiced_on, created_at: x.created_at ?? `${x.practiced_on}T12:00:00Z` }))}
        logs={Object.fromEntries((logs ?? []).map((l) => [l.date, { minutes: l.minutes, seconds: l.seconds ?? 0, items: l.items ?? [], customItems: [], notes: l.notes ?? "", equipment: null, drumsetMinutes: null, padMinutes: null } as Log]))} />

      {pointsEnabled && <div className="admin-controls-card">
        <span className="admin-summary-label">{T.admin.pointsLabel}</span>
        <p className="admin-points-total">{points ? points.reduce((sum, p) => sum + p.amount, 0) : 0}</p>
        <span className="admin-controls-hint">{T.admin.awardHint}</span>
        <div className="admin-award-row">
          <button type="button" className="minutes-step" onClick={() => awardPoints(-1, null)} disabled={awarding}>−1</button>
          <button type="button" className="minutes-step" onClick={() => awardPoints(1, null)} disabled={awarding}>+1</button>
          <input className="admin-award-amount" inputMode="numeric" size={3} value={awardAmount} onChange={(e) => setAwardAmount(e.target.value.replace(/[^-\d]/g, ""))} />
          <input className="admin-award-reason" value={awardReason} onChange={(e) => setAwardReason(e.target.value)} placeholder={T.admin.reasonPlaceholder} />
          <button type="button" className="custom-item-add" onClick={() => awardPoints(Number(awardAmount), awardReason.trim() || null)} disabled={awarding || !Number(awardAmount)}>{T.admin.awardBtn}</button>
        </div>
      </div>}

      {pinned && pinned.length > 0 && <div className="admin-summary-card admin-section-gap">
        <span className="admin-summary-label admin-focus-label"><svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4a1 1 0 011-1h10a1 1 0 011 1v16l-6-4-6 4V4z" /></svg>{T.admin.focusLabel}</span>
        <div className="chips admin-focus-chips">{pinned.map((en) => <span key={en} className="chip">{PRACTICE_EXERCISES.find((e) => e.en === en)?.[language as Lang] ?? en}</span>)}</div>
      </div>}
      <div className="admin-controls-card">
        <div className="admin-settings-list">
          <div className="admin-settings-row">
            <span>{T.admin.pointGameLabel}</span>
            <div className="admin-mini-toggle">
              <button type="button" className={!pointsEnabled ? "selected" : ""} onClick={() => setPointsEnabledValue(false)}>{T.admin.pointGameOff}</button>
              <button type="button" className={pointsEnabled ? "selected" : ""} onClick={() => setPointsEnabledValue(true)}>{T.admin.pointGameOn}</button>
            </div>
          </div>
          <div className="admin-settings-row">
            <span>{T.settings.difficultyLabel}</span>
            <div className="admin-mini-toggle">
              {([["beginner", T.settings.difficultyBeginner], ["developing", T.settings.difficultyDeveloping], ["standard", T.settings.difficultyStandard]] as [Difficulty, string][]).map(([key, label]) => <button type="button" key={key} className={studentDifficulty === key ? "selected" : ""} onClick={() => setStudentDifficultyValue(key)}>{label}</button>)}
            </div>
          </div>
          <div className="admin-settings-row">
            <span>{T.admin.leaderboardLabel}</span>
            <div className="admin-mini-toggle">
              <button type="button" className={!lbHidden ? "selected" : ""} onClick={() => setLbHiddenValue(false)}>{T.admin.leaderboardShown}</button>
              <button type="button" className={lbHidden ? "selected" : ""} onClick={() => setLbHiddenValue(true)}>{T.admin.leaderboardHiddenOpt}</button>
            </div>
          </div>
          <div className="admin-settings-row">
            <span>{T.admin.modeLabel}</span>
            <div className="admin-mini-toggle">
              <button type="button" className={!kidMode ? "selected" : ""} onClick={() => setKidModeValue(false)}>{T.admin.modeStandard}</button>
              <button type="button" className={kidMode ? "selected" : ""} onClick={() => setKidModeValue(true)}>{T.admin.modeBeginner}</button>
            </div>
          </div>
        </div>
      </div>

      <button type="button" className="see-more-btn admin-history-toggle" onClick={() => setShowHistory(!showHistory)}>{showHistory ? T.admin.hideHistoryBtn : T.admin.historyBtn}</button>
      {showHistory && <>
        <span className="ladder-label">{T.admin.dailyLogs}</span>
        {logs === null ? <p className="hint">…</p> : logs.length === 0 ? <p className="hint">{T.admin.noDailyLogs}</p> : (<>
          <div className="admin-log-list">
            {(showAllLogs ? logs : logs.slice(0, ADMIN_HISTORY_LIMIT)).map((log, i) => {
              const usedSkillTrainer = skillTrainerDates.has(log.date);
              // Skill Trainer sessions save separately from a day's practice_logs tags (see
              // logPracticeSession), so a day practiced entirely through the Skill Trainer had
              // minutes and the badge above but no chips here -- merge that day's session
              // exercise names in too, same fix as the student's own Home TODAY card.
              const skillExercises = Array.from(new Set((sessions ?? []).filter((s) => s.date === log.date).map((s) => s.item_en).filter(Boolean)));
              const allItems = Array.from(new Set([...log.items, ...skillExercises]));
              return <div key={i} className="admin-log-row">
                <div className="admin-log-line">
                  <span className="admin-log-date">{formatDMY(log.date)}</span>
                  <span className="admin-log-duration">{formatMinutes(log.minutes)}</span>
                  {log.usedMetronome && <span className="admin-source-label">⌁ {T.admin.metronomeBadge}</span>}
                  {usedSkillTrainer && <span className="admin-source-label">🎯 {T.admin.skillTrainerBadge}</span>}
                  {!log.usedMetronome && !usedSkillTrainer && <span className="admin-source-label admin-source-muted">✎ {T.admin.quickEntryBadge}</span>}
                </div>
                {allItems.length === 0 && !log.notes && <p className="admin-no-elements">{T.admin.noElements}</p>}
                {allItems.length > 0 && <div className="detail-chips">{allItems.map((item: string) => <em key={item} className={skillExercises.includes(item) ? "skill-chip" : undefined}>{skillExercises.includes(item) && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></svg>}{item}</em>)}</div>}
                {log.notes && <p className="today-notes"><b>{T.admin.notesPrefix}</b> {log.notes}</p>}
              </div>;
            })}
          </div>
          {logs.length > ADMIN_HISTORY_LIMIT && <button type="button" className="see-more-btn" onClick={() => setShowAllLogs(!showAllLogs)}>{showAllLogs ? T.progressPage.seeLess : T.progressPage.seeMore}</button>}
        </>)}
        <span className="ladder-label admin-section-gap">{T.admin.practiceSessions}</span>
        {sessions === null ? <p className="hint">…</p> : sessions.length === 0 ? <p className="hint">{T.admin.noPracticeSessions}</p> : (<>
          <div className="admin-log-list">
            {(showAllSessions ? sessions : sessions.slice(0, ADMIN_HISTORY_LIMIT)).map((s, i) => <div key={i} className="admin-log-row">
              <div className="admin-log-head"><span>{s.exercise}</span><span>{s.bpm} BPM</span></div>
              <div className="admin-log-head"><span>{formatDMY(s.date)}</span><span>{formatMinutes(s.minutes)}</span></div>
            </div>)}
          </div>
          {sessions.length > ADMIN_HISTORY_LIMIT && <button type="button" className="see-more-btn" onClick={() => setShowAllSessions(!showAllSessions)}>{showAllSessions ? T.progressPage.seeLess : T.progressPage.seeMore}</button>}
        </>)}
        <span className="ladder-label admin-section-gap">{T.admin.pointsHistory}</span>
        {points === null ? <p className="hint">…</p> : points.length === 0 ? <p className="hint">{T.admin.noPoints}</p> : (<>
          <div className="admin-log-list">
            {(showAllPoints ? points : points.slice(0, ADMIN_HISTORY_LIMIT)).map((p) => <div key={p.id} className="admin-log-row">
              <div className="admin-log-head"><span>{formatDMY(localDateFromTimestamp(p.created_at))}</span><span className={p.amount > 0 ? "admin-points-positive" : "admin-points-negative"}>{p.amount > 0 ? `+${p.amount}` : p.amount}</span></div>
              {p.reason && <p className="today-notes">{p.reason}</p>}
            </div>)}
          </div>
          {points.length > ADMIN_HISTORY_LIMIT && <button type="button" className="see-more-btn" onClick={() => setShowAllPoints(!showAllPoints)}>{showAllPoints ? T.progressPage.seeLess : T.progressPage.seeMore}</button>}
        </>)}
      </>}
    </section>;
  }

  // "All time" totals come straight from admin_list_users(); month/year totals are recomputed
  // from the raw logs instead, since the RPC only ever returns lifetime figures.
  // A day's practice_logs.minutes is already the FULL total for that day, inclusive of any
  // Skill Trainer session time logged that day (see the identical "leftover = log.minutes -
  // structuredMinutesByDay" pattern used for "most practiced" both here and on the student's
  // own Progress page) -- practice_sessions rows are a structured breakdown of part of that
  // total, not additional time on top of it. admin_list_users() used to add session minutes
  // on top of log minutes, double-counting that overlap and inflating "All"; fixed there too
  // (see schema.sql), so this must stay logs-only to match.
  const rangeStartKey = statsRange === "month" ? monthStartKey : statsRange === "lastMonth" ? lastMonthStartKey : statsRange === "year" ? yearStartKey : null;
  // Last Month is the only range with an upper bound too (it must stop at the end of that
  // month, not run into the current one) -- every other range already means "...through today".
  const rangeEndKey = statsRange === "lastMonth" ? monthStartKey : null;
  const rangedUsers = rangeStartKey && allLogs
    ? (users ?? []).map((u) => {
        const inRangeLogs = allLogs.filter((l) => l.user_id === u.id && l.practiced_on >= rangeStartKey && (!rangeEndKey || l.practiced_on < rangeEndKey));
        return { ...u, total_minutes: inRangeLogs.reduce((sum, l) => sum + l.minutes, 0), total_logs: inRangeLogs.length };
      })
    : (users ?? []);
  const statsUsers = excludeSelf && user ? rangedUsers.filter((u) => u.id !== user.id) : rangedUsers;
  const totalUsers = statsUsers.length;
  const totalMinutes = statsUsers.reduce((sum, u) => sum + u.total_minutes, 0);
  const mostByMinutes = statsUsers.filter((u) => u.total_minutes > 0).slice().sort((a, b) => b.total_minutes - a.total_minutes).slice(0, 5);
  const maxMinutes = Math.max(1, ...mostByMinutes.map((u) => u.total_minutes));
  // A fixed, validated 5-hue categorical set (dark-mode step of the reference palette) --
  // one color per top user, reused identically between the donut segments and the
  // leaderboard rows below so the two visuals read as one story, not two separate lists.
  const DONUT_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181"];
  const donutOthers = Math.max(0, totalMinutes - mostByMinutes.reduce((sum, u) => sum + u.total_minutes, 0));
  const donutSlices = [
    ...mostByMinutes.map((u, i) => ({ id: u.id, value: u.total_minutes, color: DONUT_COLORS[i] })),
    ...(donutOthers > 0 ? [{ id: "__others__", value: donutOthers, color: "#3a413c" }] : []),
  ];
  const donutTotal = donutSlices.reduce((sum, d) => sum + d.value, 0) || 1;
  const RADIUS = 52, CIRCUMFERENCE = 2 * Math.PI * RADIUS, GAP = 3;
  let donutCursor = 0;
  const donutArcs = donutSlices.map((d) => {
    const length = Math.max(0, (d.value / donutTotal) * CIRCUMFERENCE - GAP);
    const arc = { ...d, dasharray: `${length} ${CIRCUMFERENCE - length}`, dashoffset: -donutCursor };
    donutCursor += (d.value / donutTotal) * CIRCUMFERENCE;
    return arc;
  });

  // Cross-student speed chart: for the selected exercise, each student's line tracks the
  // highest BPM they've logged enough comfortable/mastered minutes at (same UNLOCK_MINUTES
  // threshold used everywhere else in the app) -- as of each date they practiced, giving a
  // step line that only rises. A student with sessions but no qualifying BPM yet is listed
  // separately rather than drawn as a flat line at zero, which would misread as "the slowest".
  const SPEED_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#8b5cf6", "#4dd0c4", "#c9a24a"];
  const speedLevels = bpmLevelsFor(speedExercise);
  type SpeedPoint = { date: string; bpm: number };
  const speedLines: { id: string; email: string; name: string; points: SpeedPoint[]; currentBpm: number; totalMinutes: number }[] = [];
  const speedUnqualified: { id: string; name: string; totalMinutes: number }[] = [];
  if (speedSessions && speedSessions.length > 0) {
    const byUser: Record<string, typeof speedSessions> = {};
    speedSessions.forEach((s) => { (byUser[s.user_id] ??= []).push(s); });
    Object.entries(byUser).forEach(([uid, sess]) => {
      if (excludeSelf && user && uid === user.id) return;
      const dates = Array.from(new Set(sess.map((s) => s.practiced_on))).sort();
      const qualifyingByBpm: Record<number, number> = {};
      const points: SpeedPoint[] = [];
      let totalMinutes = 0;
      dates.forEach((date) => {
        sess.filter((s) => s.practiced_on === date).forEach((s) => {
          totalMinutes += s.duration_minutes;
          if (s.rating === "comfortable" || s.rating === "mastered") qualifyingByBpm[s.bpm] = (qualifyingByBpm[s.bpm] ?? 0) + s.duration_minutes;
        });
        const unlocked = speedLevels.filter((l) => (qualifyingByBpm[l] ?? 0) >= UNLOCK_MINUTES);
        if (unlocked.length) points.push({ date, bpm: Math.max(...unlocked) });
      });
      const meta = (users ?? []).find((u) => u.id === uid);
      const name = meta?.name || meta?.email || uid;
      if (points.length) speedLines.push({ id: uid, email: meta?.email ?? "", name, points, currentBpm: points[points.length - 1].bpm, totalMinutes });
      else speedUnqualified.push({ id: uid, name, totalMinutes });
    });
    speedLines.sort((a, b) => b.currentBpm - a.currentBpm);
  }
  const SPEED_W = 320, SPEED_H = 170, SPEED_PAD_L = 32, SPEED_PAD_R = 10, SPEED_PAD_T = 12, SPEED_PAD_B = 24;
  const speedMinBpm = speedLevels[0], speedMaxBpm = speedLevels[speedLevels.length - 1];
  const speedAllDates = speedLines.flatMap((l) => l.points.map((p) => p.date));
  const speedMinDate = speedAllDates.length ? speedAllDates.reduce((a, b) => (a < b ? a : b)) : dateKey;
  const speedMinTime = new Date(speedMinDate + "T00:00:00").getTime();
  const speedMaxTime = new Date(dateKey + "T00:00:00").getTime();
  const speedTimeSpan = Math.max(1, speedMaxTime - speedMinTime);
  function speedXFromTime(t: number) { return SPEED_PAD_L + ((t - speedMinTime) / speedTimeSpan) * (SPEED_W - SPEED_PAD_L - SPEED_PAD_R); }
  function speedX(date: string) { return speedXFromTime(new Date(date + "T00:00:00").getTime()); }
  function speedY(bpm: number) { const frac = (bpm - speedMinBpm) / Math.max(1, speedMaxBpm - speedMinBpm); return SPEED_PAD_T + (1 - frac) * (SPEED_H - SPEED_PAD_T - SPEED_PAD_B); }
  const speedLocale = localeFor(language);
  const speedXTicks = Array.from(new Set([speedMinTime, speedMinTime + Math.round(speedTimeSpan / 2), speedMaxTime]));
  function speedPath(points: SpeedPoint[]) {
    const extended = points[points.length - 1].date !== dateKey ? [...points, { date: dateKey, bpm: points[points.length - 1].bpm }] : points;
    let d = `M ${speedX(extended[0].date)} ${speedY(extended[0].bpm)}`;
    for (let i = 1; i < extended.length; i++) d += ` H ${speedX(extended[i].date)} V ${speedY(extended[i].bpm)}`;
    return d;
  }

  // Recent Improvements board: every (student, exercise) pair's tempo-unlock history, across
  // ALL exercises (not just the one picked above) -- same qualifying logic as the speed chart,
  // but flattened into a single "X unlocked Y BPM on Z" feed, most recent first. The very
  // first unlock counts as an improvement too (going from "nothing" to a qualifying speed).
  const IMPROVEMENTS_LIMIT = 5;
  type ImprovementEvent = { key: string; name: string; exerciseEn: string; bpm: number; date: string };
  const improvements: ImprovementEvent[] = [];
  if (allSpeedSessions && allExerciseNames) {
    const byUserExercise: Record<string, typeof allSpeedSessions> = {};
    allSpeedSessions.forEach((s) => {
      if (excludeSelf && user && s.user_id === user.id) return;
      const key = `${s.user_id}::${s.practice_exercise_id}`;
      (byUserExercise[key] ??= []).push(s);
    });
    Object.entries(byUserExercise).forEach(([key, sess]) => {
      const [uid, exerciseId] = key.split("::");
      const exerciseEn = allExerciseNames[exerciseId];
      if (!exerciseEn) return;
      const levels = bpmLevelsFor(exerciseEn);
      const dates = Array.from(new Set(sess.map((s) => s.practiced_on))).sort();
      const qualifyingByBpm: Record<number, number> = {};
      let previousHighest: number | null = null;
      const meta = (users ?? []).find((u) => u.id === uid);
      const name = meta?.name || meta?.email || uid;
      dates.forEach((date) => {
        sess.filter((s) => s.practiced_on === date).forEach((s) => {
          if (s.rating === "comfortable" || s.rating === "mastered") qualifyingByBpm[s.bpm] = (qualifyingByBpm[s.bpm] ?? 0) + s.duration_minutes;
        });
        const unlocked = levels.filter((l) => (qualifyingByBpm[l] ?? 0) >= UNLOCK_MINUTES);
        const highest = unlocked.length ? Math.max(...unlocked) : null;
        if (highest !== null && highest !== previousHighest) improvements.push({ key: `${key}::${date}`, name, exerciseEn, bpm: highest, date });
        previousHighest = highest;
      });
    });
    improvements.sort((a, b) => b.date.localeCompare(a.date));
  }
  const visibleImprovements = improvements.slice(0, IMPROVEMENTS_LIMIT);
  function renderImprovementRow(ev: ImprovementEvent) {
    return <div key={ev.key} className="admin-log-row improvement-row">
      <span className="improvement-chip">{ev.name}</span>
      <span className="improvement-text">{T.admin.improvedTo(PRACTICE_EXERCISES.find((e) => e.en === ev.exerciseEn)?.[language as Lang] ?? ev.exerciseEn, ev.bpm)}</span>
      <span className="improvement-date">{formatDMY(ev.date)}</span>
    </div>;
  }

  return <section className="page">
    <header className="simple-head"><p className="eyebrow">{T.admin.eyebrow}</p><h1>{T.admin.title}</h1></header>
    {users === null ? <PageSkeleton bare /> : users.length === 0 ? <p className="hint">{T.admin.noUsers}</p> : <>
      <div className="admin-settings-row admin-settings-row-stack admin-exclude-row">
        <span>{T.admin.statsRangeLabel}</span>
        <div className="admin-mini-toggle admin-mini-toggle-wide">
          <button type="button" className={statsRange === "all" ? "selected" : ""} onClick={() => setStatsRange("all")}>{T.admin.statsRangeAll}</button>
          <button type="button" className={statsRange === "month" ? "selected" : ""} onClick={() => setStatsRange("month")}>{T.admin.statsRangeMonth}</button>
          <button type="button" className={statsRange === "lastMonth" ? "selected" : ""} onClick={() => setStatsRange("lastMonth")}>{T.admin.statsRangeLastMonth}</button>
          <button type="button" className={statsRange === "year" ? "selected" : ""} onClick={() => setStatsRange("year")}>{T.admin.statsRangeYear}</button>
        </div>
      </div>
      {user && <div className="admin-settings-row admin-exclude-row">
        <span>{T.admin.excludeSelfLabel}</span>
        <div className="admin-mini-toggle">
          <button type="button" className={!excludeSelf ? "selected" : ""} onClick={() => setExcludeSelf(false)}>{T.settings.off}</button>
          <button type="button" className={excludeSelf ? "selected" : ""} onClick={() => setExcludeSelf(true)}>{T.settings.on}</button>
        </div>
      </div>}
      <div className="admin-overview-row">
        <div className="admin-donut-wrap">
          <svg viewBox="0 0 120 120" className="admin-donut">
            <circle cx="60" cy="60" r={RADIUS} fill="none" stroke="#1c211f" strokeWidth="14" />
            {donutArcs.map((a) => <circle key={a.id} cx="60" cy="60" r={RADIUS} fill="none" stroke={a.color} strokeWidth="14" strokeDasharray={a.dasharray} strokeDashoffset={a.dashoffset} transform="rotate(-90 60 60)" />)}
          </svg>
          <div className="admin-donut-center">
            <strong>{totalUsers}</strong>
            <span>{T.admin.usersLabel(totalUsers)}</span>
          </div>
        </div>
        {mostByMinutes.length > 0 && <div className="admin-overview-leaderboard">
          <span className="section-label">{T.admin.mostMinutesTitle}</span>
          <div className="leaderboard">
            {mostByMinutes.map((u, idx) => <div key={u.id} className="leaderboard-row">
              <button type="button" className="leaderboard-name admin-name-link" onClick={() => openUser({ id: u.id, name: u.name, email: u.email })}><i className="admin-legend-dot" style={{ background: DONUT_COLORS[idx] }} />{u.name || u.email}</button>
              <div className="leaderboard-bar-track"><div className="leaderboard-bar" style={{ width: `${(u.total_minutes / maxMinutes) * 100}%`, background: DONUT_COLORS[idx] }} /></div>
              <span className="leaderboard-value">{formatMinutes(u.total_minutes)}</span>
            </div>)}
          </div>
        </div>}
      </div>

      <div className="admin-summary-card admin-section-gap">
        <span className="admin-summary-label">{T.admin.improvementsLabel}</span>
        {allSpeedSessions === null ? <p className="hint">…</p> : improvements.length === 0 ? <p className="hint speed-empty">{T.admin.improvementsEmpty}</p> : <>
          <div className="admin-log-list admin-log-list-compact">
            {visibleImprovements.map((ev) => renderImprovementRow(ev))}
          </div>
          {improvements.length > IMPROVEMENTS_LIMIT && <button type="button" className="see-more-btn" onClick={() => setShowImprovementsModal(true)}>{T.progressPage.seeMore}</button>}
        </>}
      </div>
      {showImprovementsModal && <div className="modal modal-center" onClick={() => setShowImprovementsModal(false)}>
        <div className="day-summary day-editor-modal improvements-modal" onClick={(e) => e.stopPropagation()}>
          <div className="ds-head">
            <span className="eyebrow">{T.admin.improvementsLabel}</span>
            <button className="close" onClick={() => setShowImprovementsModal(false)}>×</button>
          </div>
          <div className="day-summary-body">
            <div className="admin-log-list admin-log-list-compact">
              {improvements.map((ev) => renderImprovementRow(ev))}
            </div>
          </div>
        </div>
      </div>}

      <div className="admin-summary-card admin-section-gap">
        <span className="admin-summary-label">{T.admin.speedLabel}</span>
        <p className="admin-controls-hint">{T.admin.speedHint}</p>
        <select className="subdivision-select speed-select" value={speedExercise} onChange={(e) => setSpeedExercise(e.target.value)}>
          {PRACTICE_CATEGORIES.map((cat) => <optgroup key={cat} label={cat === "rudiments" ? T.practiceMode.categoryRudiments : T.practiceMode.categoryExercises}>
            {PRACTICE_EXERCISES.filter((e) => e.category === cat).map((e) => <option key={e.en} value={e.en}>{e[language as Lang]}</option>)}
          </optgroup>)}
        </select>
        {speedSessions === null ? <p className="hint">…</p> : speedLines.length === 0 && speedUnqualified.length === 0 ? <p className="hint speed-empty">{T.admin.speedNoData}</p> : <>
          {speedLines.length > 0 && <svg viewBox={`0 0 ${SPEED_W} ${SPEED_H}`} className="speed-chart">
            {[speedMinBpm, Math.round((speedMinBpm + speedMaxBpm) / 2), speedMaxBpm].map((l) => <g key={l}>
              <line x1={SPEED_PAD_L} x2={SPEED_W - SPEED_PAD_R} y1={speedY(l)} y2={speedY(l)} className="speed-gridline" />
              <text x={SPEED_PAD_L - 6} y={speedY(l) + 3} textAnchor="end" className="speed-gridline-label">{l}</text>
            </g>)}
            <line x1={SPEED_PAD_L} x2={SPEED_W - SPEED_PAD_R} y1={SPEED_H - SPEED_PAD_B} y2={SPEED_H - SPEED_PAD_B} className="speed-axis-line" />
            {speedXTicks.map((t, i) => <text key={t} x={speedXFromTime(t)} y={SPEED_H - 6} textAnchor={i === 0 ? "start" : i === speedXTicks.length - 1 ? "end" : "middle"} className="speed-axis-label">{new Date(t).toLocaleDateString(speedLocale, { month: "short", day: "numeric" })}</text>)}
            {speedLines.map((line, idx) => {
              const color = SPEED_COLORS[idx % SPEED_COLORS.length];
              const last = line.points[line.points.length - 1];
              return <g key={line.id}>
                <path d={speedPath(line.points)} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx={speedX(dateKey)} cy={speedY(last.bpm)} r="4" fill={color} />
              </g>;
            })}
          </svg>}
          <div className="speed-legend">
            {speedLines.map((line, idx) => <div key={line.id} className="speed-legend-row">
              <button type="button" className="speed-legend-name admin-name-link" onClick={() => openUser({ id: line.id, name: line.name, email: line.email })}><i className="admin-legend-dot" style={{ background: SPEED_COLORS[idx % SPEED_COLORS.length] }} />{line.name}</button>
              <span className="speed-legend-bpm">{line.currentBpm} {T.admin.speedBpmSuffix}</span>
              <span className="speed-legend-minutes">{formatMinutes(line.totalMinutes)}</span>
            </div>)}
          </div>
          {speedUnqualified.length > 0 && <div className="speed-unqualified">
            <span className="speed-unqualified-label">{T.admin.speedNotQualified}</span>
            {speedUnqualified.map((u) => <span key={u.id} className="speed-unqualified-name">{u.name} ({formatMinutes(u.totalMinutes)})</span>)}
          </div>}
        </>}
      </div>

      <span className="section-label admin-section-gap">{T.admin.allUsersTitle}</span>
      <div className="onboard-exercise-list">
        {users.map((u) => <button key={u.id} type="button" className="onboard-row admin-user-row" onClick={() => openUser(u)}>
          <div className="admin-user-info">
            <span className="onboard-row-name">{u.name || u.email}{u.name && <span className="admin-user-email-inline"> - {u.email}</span>}</span>
          </div>
          <span className="admin-user-last">{u.last_active ? formatDMY(u.last_active) : T.admin.neverPracticed}</span>
        </button>)}
      </div>
    </>}
  </section>;
}
