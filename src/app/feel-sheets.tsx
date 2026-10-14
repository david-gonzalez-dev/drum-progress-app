"use client";
import { useEffect, useRef, useState } from "react";

// The two sheets after a Skill Trainer session: "How did that feel?" (rating) and "What held you back?" (shown after Not ready, Tense, Almost there).
// What is stored is unchanged: the rating, a list of tag names (English, as before) and a note. New choices (Dragging, Pain, locations, feet) are new tag names;
// old tags keep their old names, so older history and stats keep working.

type Lang = "en" | "es" | "nl";
type L3 = { en: string; es: string; nl: string };
const L = (en: string, es: string, nl: string): L3 => ({ en, es, nl });

const LOCATIONS: { key: string; label: L3 }[] = [
  { key: "Wrist", label: L("Wrist", "Muñeca", "Pols") }, { key: "Thumb", label: L("Thumb", "Pulgar", "Duim") }, { key: "Fingers", label: L("Fingers", "Dedos", "Vingers") },
  { key: "Arm", label: L("Arm", "Brazo", "Arm") }, { key: "Shoulder", label: L("Shoulder", "Hombro", "Schouder") }, { key: "Back", label: L("Back", "Espalda", "Rug") },
  { key: "Foot", label: L("Foot", "Pie", "Voet") }, { key: "Leg", label: L("Leg", "Pierna", "Been") },
];
// Tension keeps the three old tag names where they existed.
const TENSION_TAG: Record<string, string> = { Wrist: "Wrist tension", Thumb: "Thumb tension", Fingers: "Index finger issue", Arm: "Arm tension", Shoulder: "Shoulder tension", Back: "Back tension", Foot: "Foot tension", Leg: "Leg tension" };
const PAIN_TAG = (k: string) => `${k} pain`;

type Sub = { q: L3; options: { tag: string; label: L3 }[]; warn?: boolean };
type Tile = { tag: string; label: L3; sub?: Sub };
const TILES: Tile[] = [
  { tag: "Tension", label: L("Tension", "Tensión", "Spanning"), sub: { q: L("Where?", "¿Dónde?", "Waar?"), options: LOCATIONS.map((l) => ({ tag: TENSION_TAG[l.key], label: l.label })) } },
  { tag: "Pain", label: L("Pain", "Dolor", "Pijn"), sub: { q: L("Where did it hurt?", "¿Dónde te dolió?", "Waar deed het pijn?"), warn: true, options: LOCATIONS.map((l) => ({ tag: PAIN_TAG(l.key), label: l.label })) } },
  { tag: "Rushing", label: L("Rushing", "Me aceleré", "Te snel") },
  { tag: "Dragging", label: L("Dragging", "Me atrasé", "Te langzaam") },
  { tag: "Uneven timing", label: L("Uneven timing", "Tiempo irregular", "Ongelijke timing") },
  { tag: "Weaker side", label: L("Weaker side", "Lado más débil", "Zwakkere kant"), sub: { q: L("Which side?", "¿Qué lado?", "Welke kant?"), options: [
    { tag: "Left hand", label: L("Left hand", "Mano izquierda", "Linkerhand") }, { tag: "Right hand", label: L("Right hand", "Mano derecha", "Rechterhand") },
    { tag: "Left foot", label: L("Left foot", "Pie izquierdo", "Linkervoet") }, { tag: "Right foot", label: L("Right foot", "Pie derecho", "Rechtervoet") },
  ] } },
  { tag: "Lost control of the stick", label: L("Lost control", "Perdí el control", "Controle kwijt") },
  { tag: "Getting tired", label: L("Getting tired", "Me cansé", "Moe worden") },
];
const MORE: { tag: string; label: L3 }[] = [
  { tag: "Stick slides", label: L("Stick slides", "La baqueta se resbala", "Stick glijdt") }, { tag: "Messy dynamics", label: L("Messy dynamics", "Dinámica desordenada", "Rommelige dynamiek") },
  { tag: "Feels shaky", label: L("Feels shaky", "Se siente inestable", "Voelt wiebelig") }, { tag: "Lost focus", label: L("Lost focus", "Perdí la concentración", "Focus kwijt") },
  { tag: "Got stuck", label: L("Got stuck", "Me atasqué", "Liep vast") },
];
// Names the history screens need to translate the new tags (older tags are already known there).
export const FEEL_EXTRA_TAGS: L3[] = [
  { en: "Tension", es: "Tensión", nl: "Spanning" }, { en: "Pain", es: "Dolor", nl: "Pijn" }, { en: "Dragging", es: "Me atrasé", nl: "Te langzaam" }, { en: "Weaker side", es: "Lado más débil", nl: "Zwakkere kant" },
  { en: "Left foot", es: "Pie izquierdo", nl: "Linkervoet" }, { en: "Right foot", es: "Pie derecho", nl: "Rechtervoet" },
  ...["Arm", "Shoulder", "Back", "Foot", "Leg"].map((k) => { const l = LOCATIONS.find((x) => x.key === k)!.label; return { en: TENSION_TAG[k], es: `Tensión: ${l.es.toLowerCase()}`, nl: `Spanning: ${l.nl.toLowerCase()}` }; }),
  ...LOCATIONS.map((l) => ({ en: PAIN_TAG(l.key), es: `Dolor: ${l.label.es.toLowerCase()}`, nl: `Pijn: ${l.label.nl.toLowerCase()}` })),
];

const TEXT: Record<Lang, { title1: string; title2: string; skip1: string; skip2: string; save: string; next: string; back: string; more: string; fewer: string; note: string; moreLabel: string; warn: string; notePlaceholder: string }> = {
  en: { title1: "How did that feel?", title2: "What held you back?", skip1: "Skip, don't log this", skip2: "Skip and save", save: "Save", next: "Next", back: "Back", more: "More options", fewer: "Fewer options", note: "+ Add note", moreLabel: "MORE", warn: "Sharp or lasting pain? Stop and rest. Tell your teacher.", notePlaceholder: "Add a note (optional)" },
  es: { title1: "¿Cómo te sentiste?", title2: "¿Qué te frenó?", skip1: "Omitir, no guardar esto", skip2: "Omitir y guardar", save: "Guardar", next: "Siguiente", back: "Atrás", more: "Más opciones", fewer: "Menos opciones", note: "+ Añadir nota", moreLabel: "MÁS", warn: "¿Dolor agudo o que no pasa? Para y descansa. Díselo a tu profesor.", notePlaceholder: "Añade una nota (opcional)" },
  nl: { title1: "Hoe voelde dat?", title2: "Wat hield je tegen?", skip1: "Overslaan, niet loggen", skip2: "Overslaan en opslaan", save: "Opslaan", next: "Volgende", back: "Terug", more: "Meer opties", fewer: "Minder opties", note: "+ Notitie toevoegen", moreLabel: "MEER", warn: "Scherpe of aanhoudende pijn? Stop en rust uit. Vertel het je leraar.", notePlaceholder: "Voeg een notitie toe (optioneel)" },
};

// One colour per rating (a flat dot, never an emoji); the selected row and the pill on the second sheet use it.
const RATING_COLOR: Record<string, { c: string; bg: string }> = {
  not_ready: { c: "#E5484D", bg: "#2a1718" }, tense: { c: "#F0883E", bg: "#2a1f15" }, almost: { c: "#F2D24B", bg: "#28251a" }, comfortable: { c: "#46C37B", bg: "#1a2a20" }, mastered: { c: "#F5C542", bg: "#2a2618" },
};
const RATING_KEYS = ["not_ready", "tense", "almost", "comfortable", "mastered"];

function Check({ color }: { color: string }) { return <svg className="feel-check" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>; }
function Star() { return <svg className="feel-star" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="#F5C542" d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" /></svg>; }

/* Sheet 1 */
export function RatingSheet({ language, subtitle, labels, selected, goesOn, onSelect, onSave, onSkip }: { language: Lang; subtitle: string; goesOn: boolean; labels: Record<string, string>; selected: string | null; onSelect: (r: string) => void; onSave: () => void; onSkip: () => void }) {
  const t = TEXT[language];
  return <div className="feel-sheet">
    <h2 className="feel-title">{t.title1}</h2>
    <p className="feel-sub">{subtitle}</p>
    <div className="feel-rows">
      {RATING_KEYS.map((r) => {
        const col = RATING_COLOR[r], on = selected === r;
        return <button key={r} type="button" className={on ? "feel-row on" : "feel-row"} style={on ? { borderColor: col.c, background: col.bg } : undefined} onClick={() => onSelect(r)}>
          {r === "mastered" ? <Star /> : <span className="feel-dot" style={{ background: col.c }} />}
          <span>{labels[r]}</span>
          {on && <Check color={col.c} />}
        </button>;
      })}
    </div>
    <div className="feel-foot">
      <button type="button" className="feel-save" disabled={!selected} onClick={onSave}>{selected && goesOn ? t.next : t.save}<span>→</span></button>
      <button type="button" className="feel-skip" onClick={onSkip}>{t.skip1}</button>
    </div>
  </div>;
}

/* Sheet 2 */
export function HoldBackSheet({ language, rating, ratingLabel, issues, setIssues, note, setNote, onSave, onSkip, onBack }: { onBack: () => void; language: Lang; rating: string; ratingLabel: string; issues: string[]; setIssues: (next: string[]) => void; note: string; setNote: (v: string) => void; onSave: () => void; onSkip: () => void }) {
  const t = TEXT[language];
  const col = RATING_COLOR[rating] ?? RATING_COLOR.almost;
  const has = (tag: string) => issues.includes(tag);
  const tileOn = (tile: Tile) => has(tile.tag) || !!tile.sub?.options.some((o) => has(o.tag));
  const moreSelected = MORE.some((m) => has(m.tag));
  const [moreOpen, setMoreOpen] = useState(moreSelected);
  const [noteOpen, setNoteOpen] = useState(note.trim().length > 0);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (noteOpen && !note) noteRef.current?.focus(); }, [noteOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  function toggleTile(tile: Tile) {
    const own = [tile.tag, ...(tile.sub?.options.map((o) => o.tag) ?? [])];
    if (tileOn(tile)) setIssues(issues.filter((x) => !own.includes(x))); // deselecting also clears its choices
    else setIssues([...issues, tile.tag]);
  }
  // A choice inside a follow-up replaces the plain tile tag; if the last choice is switched off the plain tag comes back, so the tile stays selected.
  function toggleSub(tile: Tile, tag: string) {
    const subTags = tile.sub!.options.map((o) => o.tag);
    let next = has(tag) ? issues.filter((x) => x !== tag) : [...issues.filter((x) => x !== tile.tag), tag];
    if (!next.some((x) => subTags.includes(x)) && !next.includes(tile.tag)) next = [...next, tile.tag];
    setIssues(next);
  }
  function toggleMore(tag: string) { setIssues(has(tag) ? issues.filter((x) => x !== tag) : [...issues, tag]); }
  const rows: Tile[][] = []; for (let i = 0; i < TILES.length; i += 2) rows.push(TILES.slice(i, i + 2));
  return <div className="feel-sheet">
    <button type="button" className="feel-back" onClick={onBack}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>{t.back}</button>
    <h2 className="feel-title">{t.title2}</h2>
    <span className="feel-pill" style={{ color: col.c, background: col.bg }}><i style={{ background: col.c }} />{ratingLabel}</span>
    <div className="feel-grid">
      {rows.map((row, ri) => <div key={ri} className="feel-grid-row">
        {row.map((tile) => <button key={tile.tag} type="button" className={tileOn(tile) ? "feel-tile on" : "feel-tile"} onClick={() => toggleTile(tile)}>{tile.label[language]}</button>)}
        {row.filter((tile) => tile.sub && tileOn(tile)).map((tile) => <div key={tile.tag + "-sub"} className="feel-subq">
          <span className="feel-q">{tile.sub!.q[language]}</span>
          <div className="feel-chips">{tile.sub!.options.map((o) => <button key={o.tag} type="button" className={has(o.tag) ? "feel-chip on" : "feel-chip"} onClick={() => toggleSub(tile, o.tag)}>{o.label[language]}</button>)}</div>
          {tile.sub!.warn && <p className="feel-warn"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#e99a9a" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></svg><span>{t.warn}</span></p>}
        </div>)}
      </div>)}
    </div>
    {moreOpen && <div className="feel-more"><span className="feel-more-label">{t.moreLabel}</span><div className="feel-chips">{MORE.map((m) => <button key={m.tag} type="button" className={has(m.tag) ? "feel-chip on" : "feel-chip"} onClick={() => toggleMore(m.tag)}>{m.label[language]}</button>)}</div></div>}
    <div className="feel-links"><button type="button" onClick={() => setMoreOpen(!moreOpen)}>{moreOpen ? t.fewer : t.more}</button>{!noteOpen && <button type="button" onClick={() => setNoteOpen(true)}>{t.note}</button>}</div>
    {noteOpen && <textarea ref={noteRef} className="feel-note" maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t.notePlaceholder} />}
    <div className="feel-foot">
      <button type="button" className="feel-save" onClick={onSave}>{t.save}<span>→</span></button>
      <button type="button" className="feel-skip" onClick={onSkip}>{t.skip2}</button>
    </div>
  </div>;
}
