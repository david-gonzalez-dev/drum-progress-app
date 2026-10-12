"use client";
import { useEffect, useState } from "react";

// Universal (worldwide) leaderboard: the entry card shown at the top of the Progress tab, and the full screen it opens.
// All scores are computed on the server (see supabase/leaderboard.sql); this file only displays them and flips the opt-in switch.

type Lang = "en" | "es" | "nl";
export type BoardFilter = { category: "consistency" | "skill" | "points"; period: "month" | "year"; level: string };
type Summary = { opted_in: boolean; eligible: boolean; pos: number | null; total: number; prev_pos: number | null; level: string };
type Row = { pos: number; display_name: string; score: number; detail: number; level: string; is_me: boolean };

const TEXT = {
  en: {
    eyebrow: "PRACTICE SUMMARY", title: "UNIVERSAL LEADERBOARD", subtitle: "Compete with drummers worldwide", back: "Progress",
    rankMonth: "Your rank (this month)", notRanked: "Not ranked yet", notRankedHint: "Practice 5+ minutes today to enter.", join: "Join the leaderboard", joinHint: "Opt in to see where you stand.",
    unavailable: "Not available for this account", positionsUp: (n: number) => `${n} position${n === 1 ? "" : "s"}`, positionsDown: (n: number) => `${n} position${n === 1 ? "" : "s"}`,
    monthly: "Monthly ranking", points: "Practice points", levelRow: (l: string) => `${l} level`,
    cats: { consistency: "Consistency", skill: "Skill progress", points: "Points" }, periods: { month: "This month", year: "This year" }, allLevels: "All levels",
    tiers: { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced", legend: "Legend" } as Record<string, string>,
    unitDays: "days", unitTempos: "tempos", unitPoints: "points", you: "You", empty: "No one here yet. Be the first!", loadError: "The leaderboard isn't available right now.", loading: "Loading…",
    howConsistency: "Counts days with 5+ minutes of practice. Total minutes are never ranked.", howSkill: "Counts tempos you newly unlocked in the Skill Trainer.", howPoints: "Points awarded by teachers.", resets: "Resets automatically each month and year. Your history is never deleted.",
    gateTitle: "Join the worldwide leaderboard", gate1: "Your display name and scores will be visible to other players who join.", gate2: "Nothing else is shared: no email, notes or practice details.", gate3: "You can leave at any time. Your practice history stays yours.",
    joinBtn: "Join", leaveBtn: "Leave the leaderboard", leaveConfirm: "Tap again to leave", hiddenNote: "You're not shown on the leaderboard right now (hidden by an admin or Kid Mode).", kidNote: "The worldwide leaderboard isn't available for Kid Mode accounts.", error: "Something went wrong. Please try again.",
  },
  es: {
    eyebrow: "RESUMEN DE PRÁCTICA", title: "TABLA UNIVERSAL", subtitle: "Compite con bateristas de todo el mundo", back: "Progreso",
    rankMonth: "Tu posición (este mes)", notRanked: "Aún sin posición", notRankedHint: "Practica 5+ minutos hoy para entrar.", join: "Unirme a la tabla", joinHint: "Actívala para ver dónde estás.",
    unavailable: "No disponible para esta cuenta", positionsUp: (n: number) => `${n} posición${n === 1 ? "" : "es"}`, positionsDown: (n: number) => `${n} posición${n === 1 ? "" : "es"}`,
    monthly: "Ranking mensual", points: "Puntos de práctica", levelRow: (l: string) => `Nivel ${l}`,
    cats: { consistency: "Constancia", skill: "Progreso técnico", points: "Puntos" }, periods: { month: "Este mes", year: "Este año" }, allLevels: "Todos los niveles",
    tiers: { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced", legend: "Legend" } as Record<string, string>,
    unitDays: "días", unitTempos: "tempos", unitPoints: "puntos", you: "Tú", empty: "Aún no hay nadie. ¡Sé el primero!", loadError: "La tabla no está disponible ahora mismo.", loading: "Cargando…",
    howConsistency: "Cuenta los días con 5+ minutos de práctica. Los minutos totales nunca se clasifican.", howSkill: "Cuenta los tempos que desbloqueaste de nuevo en el Skill Trainer.", howPoints: "Puntos concedidos por profesores.", resets: "Se reinicia sola cada mes y cada año. Tu historial nunca se borra.",
    gateTitle: "Únete a la tabla mundial", gate1: "Tu nombre y tus puntuaciones serán visibles para otros jugadores que se unan.", gate2: "No se comparte nada más: ni email, ni notas, ni detalles de práctica.", gate3: "Puedes salir cuando quieras. Tu historial sigue siendo tuyo.",
    joinBtn: "Unirme", leaveBtn: "Salir de la tabla", leaveConfirm: "Toca otra vez para salir", hiddenNote: "Ahora mismo no apareces en la tabla (oculto por un administrador o Modo Niño).", kidNote: "La tabla mundial no está disponible para cuentas en Modo Niño.", error: "Algo salió mal. Inténtalo de nuevo.",
  },
  nl: {
    eyebrow: "OEFENOVERZICHT", title: "UNIVERSELE RANGLIJST", subtitle: "Meet je met drummers wereldwijd", back: "Voortgang",
    rankMonth: "Jouw positie (deze maand)", notRanked: "Nog geen positie", notRankedHint: "Oefen vandaag 5+ minuten om mee te doen.", join: "Doe mee aan de ranglijst", joinHint: "Zet hem aan om te zien waar je staat.",
    unavailable: "Niet beschikbaar voor dit account", positionsUp: (n: number) => `${n} ${n === 1 ? "plaats" : "plaatsen"}`, positionsDown: (n: number) => `${n} ${n === 1 ? "plaats" : "plaatsen"}`,
    monthly: "Maandranglijst", points: "Oefenpunten", levelRow: (l: string) => `Niveau ${l}`,
    cats: { consistency: "Regelmaat", skill: "Vaardigheid", points: "Punten" }, periods: { month: "Deze maand", year: "Dit jaar" }, allLevels: "Alle niveaus",
    tiers: { beginner: "Beginner", intermediate: "Gemiddeld", advanced: "Gevorderd", legend: "Legende" } as Record<string, string>,
    unitDays: "dagen", unitTempos: "tempo's", unitPoints: "punten", you: "Jij", empty: "Nog niemand hier. Wees de eerste!", loadError: "De ranglijst is nu niet beschikbaar.", loading: "Laden…",
    howConsistency: "Telt dagen met 5+ minuten oefenen. Totale minuten tellen nooit mee.", howSkill: "Telt tempo's die je nieuw hebt ontgrendeld in de Skill Trainer.", howPoints: "Punten toegekend door leraren.", resets: "Begint automatisch opnieuw elke maand en elk jaar. Je geschiedenis wordt nooit verwijderd.",
    gateTitle: "Doe mee aan de wereldwijde ranglijst", gate1: "Je weergavenaam en scores zijn zichtbaar voor andere spelers die meedoen.", gate2: "Er wordt niets anders gedeeld: geen e-mail, notities of oefendetails.", gate3: "Je kunt op elk moment stoppen. Je oefengeschiedenis blijft van jou.",
    joinBtn: "Meedoen", leaveBtn: "Stop met de ranglijst", leaveConfirm: "Tik nogmaals om te stoppen", hiddenNote: "Je wordt nu niet getoond op de ranglijst (verborgen door een beheerder of Kindmodus).", kidNote: "De wereldwijde ranglijst is niet beschikbaar voor accounts in Kindmodus.", error: "Er ging iets mis. Probeer het opnieuw.",
  },
};

const AVATAR_COLORS = ["#ff7a3c", "#f4a259", "#c4561f", "#ffb27a", "#8f5a34", "#e8c39a", "#b9794a", "#d98b5f"];
function colorFor(name: string) { let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0; return AVATAR_COLORS[h % AVATAR_COLORS.length]; }
function Chevron() { return <svg className="lb-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>; }

function Trophy() {
  return <svg className="lb-trophy" viewBox="0 0 120 130" aria-hidden="true">
    <defs>
      <linearGradient id="lbTrophyGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ff9b50" /><stop offset="1" stopColor="#d9501a" /></linearGradient>
    </defs>
    <path d="M30 24H14c0 22 8 34 26 38" fill="none" stroke="url(#lbTrophyGrad)" strokeWidth="9" strokeLinecap="round" />
    <path d="M90 24h16c0 22-8 34-26 38" fill="none" stroke="url(#lbTrophyGrad)" strokeWidth="9" strokeLinecap="round" />
    <path d="M30 14h60v38c0 18-13 31-30 31S30 70 30 52z" fill="url(#lbTrophyGrad)" />
    <path d="M60 30l5.4 11 12 1.7-8.7 8.5 2 12-10.7-5.7-10.7 5.7 2-12-8.7-8.5 12-1.7z" fill="#2a1208" opacity=".85" />
    <rect x="53" y="82" width="14" height="22" rx="3" fill="url(#lbTrophyGrad)" />
    <rect x="36" y="104" width="48" height="14" rx="5" fill="url(#lbTrophyGrad)" />
  </svg>;
}

// The card at the top of the Progress tab.
export function LeaderboardCard({ db: supabase, language, kidMode, refreshKey, onOpen }: { db: any; language: Lang; kidMode: boolean; refreshKey: number; onOpen: (f?: Partial<BoardFilter>) => void }) {
  const t = TEXT[language];
  const [summary, setSummary] = useState<Summary | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    supabase.rpc("leaderboard_summary").then(({ data, error }: any) => {
      if (cancelled) return;
      if (error || !data) { setFailed(true); return; }
      const row: any = Array.isArray(data) ? data[0] : data;
      setSummary(row ? { opted_in: !!row.opted_in, eligible: !!row.eligible, pos: row.pos == null ? null : Number(row.pos), total: Number(row.total ?? 0), prev_pos: row.prev_pos == null ? null : Number(row.prev_pos), level: row.level ?? "beginner" } : null);
    });
    return () => { cancelled = true; };
  }, [refreshKey]);
  // If the database part isn't installed yet (or it fails), the card stays hidden rather than showing an error on Progress.
  if (failed || !summary) return null;
  const moved = summary.pos != null && summary.prev_pos != null ? summary.prev_pos - summary.pos : 0;
  const levelWord = t.tiers[summary.level] ?? summary.level;
  return <div className="lb-card">
    <button type="button" className="lb-card-head" onClick={() => onOpen()}>
      <span className="lb-card-titles"><span className="lb-card-title">{t.title}</span><span className="lb-card-sub">{t.subtitle}</span></span>
      <Chevron />
    </button>
    <Trophy />
    {kidMode || (!summary.eligible && summary.opted_in) ? <div className="lb-panel lb-panel-note"><span>{kidMode ? t.unavailable : t.unavailable}</span></div>
      : !summary.opted_in ? <button type="button" className="lb-panel lb-panel-join" onClick={() => onOpen()}><span className="lb-join-title">{t.join}</span><span className="lb-join-sub">{t.joinHint}</span></button>
      : <div className="lb-panel">
        <div className="lb-rank-col">
          <span className="lb-rank-label">{t.rankMonth}</span>
          {summary.pos != null ? <><span className="lb-rank-num">#{summary.pos}</span>
            {moved !== 0 && <span className={moved > 0 ? "lb-moved up" : "lb-moved down"}>{moved > 0 ? "▲" : "▼"} {moved > 0 ? t.positionsUp(moved) : t.positionsDown(-moved)}</span>}</>
            : <><span className="lb-rank-none">{t.notRanked}</span><span className="lb-rank-hint">{t.notRankedHint}</span></>}
        </div>
        <div className="lb-links">
          <button type="button" onClick={() => onOpen({ category: "consistency", period: "month", level: "all" })}><span>{t.monthly}</span><Chevron /></button>
          <button type="button" onClick={() => onOpen({ category: "points", period: "month", level: "all" })}><span>{t.points}</span><Chevron /></button>
          <button type="button" onClick={() => onOpen({ category: "skill", period: "month", level: summary.level })}><span>{t.levelRow(levelWord)}</span><Chevron /></button>
        </div>
      </div>}
  </div>;
}

// The full leaderboard screen.
export function LeaderboardScreen({ db: supabase, user, language, kidMode, initial, onBack }: { db: any; user: any; language: Lang; kidMode: boolean; initial?: Partial<BoardFilter>; onBack: () => void }) {
  const t = TEXT[language];
  const [filter, setFilter] = useState<BoardFilter>({ category: initial?.category ?? "consistency", period: initial?.period ?? "month", level: initial?.level ?? "all" });
  const [summary, setSummary] = useState<Summary | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    supabase.rpc("leaderboard_summary").then(({ data, error: err }: any) => {
      if (cancelled) return;
      if (err || !data) { setError(t.loadError); return; }
      const row: any = Array.isArray(data) ? data[0] : data;
      if (row) setSummary({ opted_in: !!row.opted_in, eligible: !!row.eligible, pos: row.pos == null ? null : Number(row.pos), total: Number(row.total ?? 0), prev_pos: row.prev_pos == null ? null : Number(row.prev_pos), level: row.level ?? "beginner" });
    });
    return () => { cancelled = true; };
  }, [version]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!summary?.opted_in) return;
    let cancelled = false;
    setRows(null);
    supabase.rpc("leaderboard", { p_category: filter.category, p_period: filter.period, p_level: filter.level, p_limit: 20 }).then(({ data, error: err }: any) => {
      if (cancelled) return;
      if (err) { setError(t.loadError); setRows([]); return; }
      setError("");
      setRows((data ?? []).map((r: any) => ({ pos: Number(r.pos), display_name: r.display_name, score: Number(r.score), detail: Number(r.detail ?? 0), level: r.level, is_me: !!r.is_me })));
    });
    return () => { cancelled = true; };
  }, [summary?.opted_in, filter.category, filter.period, filter.level, version]); // eslint-disable-line react-hooks/exhaustive-deps

  async function setOptIn(value: boolean) {
    setBusy(true);
    const { error: err } = await supabase.from("settings").upsert({ user_id: user.id, leaderboard_opt_in: value }, { onConflict: "user_id" });
    setBusy(false); setConfirmLeave(false);
    if (err) { setError(t.error); return; }
    setError(""); setSummary(null); setRows(null); setVersion((v) => v + 1);
  }

  const unit = filter.category === "consistency" ? t.unitDays : filter.category === "skill" ? t.unitTempos : t.unitPoints;
  const how = filter.category === "consistency" ? t.howConsistency : filter.category === "skill" ? t.howSkill : t.howPoints;
  const optedIn = !!summary?.opted_in;

  return <section className="page lb-page">
    <button className="page-back" onClick={onBack}>‹ {t.back}</button>
    <header className="simple-head"><p className="eyebrow">{t.eyebrow}</p><h1>{t.title}</h1></header>
    {kidMode ? <p className="lb-note">{t.kidNote}</p>
      : !summary ? <p className="hint">{error || t.loading}</p>
      : !optedIn ? <div className="lb-gate">
        <h2>{t.gateTitle}</h2>
        <ul><li>{t.gate1}</li><li>{t.gate2}</li><li>{t.gate3}</li></ul>
        {error && <p className="lb-note">{error}</p>}
        <button className="save" disabled={busy} onClick={() => setOptIn(true)}>{t.joinBtn}</button>
      </div>
      : <>
        {!summary.eligible && <p className="lb-note">{t.hiddenNote}</p>}
        <div className="lb-seg">{(["consistency", "skill", "points"] as const).map((c) => <button key={c} type="button" className={filter.category === c ? "on" : ""} onClick={() => setFilter({ ...filter, category: c })}>{t.cats[c]}</button>)}</div>
        <div className="lb-seg lb-seg-small">{(["month", "year"] as const).map((p) => <button key={p} type="button" className={filter.period === p ? "on" : ""} onClick={() => setFilter({ ...filter, period: p })}>{t.periods[p]}</button>)}</div>
        <div className="lb-levels">{["all", "beginner", "intermediate", "advanced", "legend"].map((l) => <button key={l} type="button" className={filter.level === l ? "on" : ""} onClick={() => setFilter({ ...filter, level: l })}>{l === "all" ? t.allLevels : t.tiers[l]}</button>)}</div>
        {rows === null ? <div className="skeleton-stack" role="status"><i className="skel skel-card" /><i className="skel skel-card" /></div>
          : error ? <p className="lb-note">{error}</p>
          : !rows.length ? <p className="hint lb-empty">{t.empty}</p>
          : <div className="lb-list">{rows.map((r, i) => <div key={`${r.pos}-${r.display_name}-${i}`}>
            {r.is_me && i > 0 && r.pos > rows[i - 1].pos + 1 && <div className="lb-gap">···</div>}
            <div className={`lb-row${r.is_me ? " me" : ""}${r.pos <= 3 ? " top" : ""}`}>
              <span className="lb-pos">{r.pos}</span>
              <span className="lb-avatar" style={{ background: colorFor(r.display_name) }}>{r.display_name.charAt(0).toUpperCase()}</span>
              <span className="lb-name"><b>{r.display_name}{r.is_me && <em>{t.you}</em>}</b><small>{t.tiers[r.level] ?? r.level}</small></span>
              <span className="lb-score">{r.score}<small>{unit}</small></span>
            </div>
          </div>)}</div>}
        <p className="lb-how">{how} {t.resets}</p>
        <button type="button" className="lb-leave" disabled={busy} onClick={() => (confirmLeave ? setOptIn(false) : setConfirmLeave(true))}>{confirmLeave ? t.leaveConfirm : t.leaveBtn}</button>
      </>}
  </section>;
}
