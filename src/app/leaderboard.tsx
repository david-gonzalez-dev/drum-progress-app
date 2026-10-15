"use client";
import { useEffect, useState } from "react";

// Leaderboard (worldwide): the entry card shown at the top of the Progress tab, and the full screen it opens.
// All scores are computed on the server (see supabase/leaderboard.sql); this file only displays them and flips the opt-in switch.

type Lang = "en" | "es" | "nl";
export type BoardFilter = { category: "consistency" | "skill" | "points"; period: "month" | "year"; level: string };
type Summary = { opted_in: boolean; eligible: boolean; pos: number | null; total: number; prev_pos: number | null; level: string; board: "under_10" | "10_17" | "18_plus" | null };
type Row = { pos: number; display_name: string; score: number; detail: number; level: string; is_me: boolean };
// What the "Overtake" celebration needs when your monthly rank improved: ranks, your score before and after, and the rows around you.
// `rows` is the picture BEFORE the move, top to bottom: up to 3 players just above you, the last `passed` (at most 3) being the ones you passed.
export type RankUp = { oldRank: number; newRank: number; passed: number; rows: { rank: number; name: string; score: number }[]; scoreBefore: number; scoreAfter: number; passedNames: string[] };

const TEXT = {
  en: {
    eyebrow: "PRACTICE SUMMARY", title: "LEADERBOARD", subtitle: "Compete with drummers worldwide", back: "Progress",
    rankMonth: "Your rank (this month)", notRanked: "Not ranked yet", notRankedHint: "Practice 5+ minutes today to enter.", join: "Join the leaderboard", joinHint: "Opt in to see where you stand.",
    unavailable: "Not available for this account", positionsUp: (n: number) => `${n} position${n === 1 ? "" : "s"}`, positionsDown: (n: number) => `${n} position${n === 1 ? "" : "s"}`,
    monthly: "Monthly ranking", points: "Practice points", levelRow: (l: string) => `${l} level`,
    cats: { consistency: "Consistency", skill: "Skill progress", points: "Points" }, periods: { month: "This month", year: "This year" }, allLevels: "All levels",
    tiers: { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced", legend: "Legend" } as Record<string, string>,
    openSpot: "Open spot", ofPlayers: (n: number) => `of ${n} ${n === 1 ? "drummer" : "drummers"}`, thisMonth: "this month", pointsRanking: "Points ranking", unitDays: "days", unitTempos: "tempos", unitPoints: "points", you: "You", empty: "No one here yet. Be the first!", loadError: "The leaderboard isn't available right now.", loading: "Loading…",
    howConsistency: "Counts days with 5+ minutes of practice. Total minutes are never ranked.", howSkill: "Counts tempos you newly unlocked in the Skill Trainer.", howPoints: "Drum Points: 1 point per minute of Skill Trainer practice, plus points from your teacher.", resets: "Resets automatically each month and year. Your history is never deleted.",
    gateTitle: "Join the worldwide leaderboard", gate1: "Your first name, last initial and scores will be visible to other players who join.", gate2: "Nothing else is shared: no email, notes or practice details.", gate3: "You can leave at any time. Your practice history stays yours.",
    joinBtn: "Join", leaveBtn: "Leave the leaderboard", leaveConfirm: "Tap again to leave", hiddenNote: "You're not shown on the leaderboard right now (hidden by an administrator).", goSettings: "Go to Settings", needAgeTitle: "Add your date of birth to join", needAge: "Add your date of birth in Settings to join the leaderboard. It stays private.", boards: { under_10: "Up to 10", "10_17": "11–17", "18_plus": "18+" }, gates: { under_10: "You are on the Up to 10 board: you only see and are seen by other players aged 10 and under, with first names only.", "10_17": "You are on the 11–17 board: you only see and are seen by other players aged 11 to 17, with first names only.", "18_plus": "You are on the 18+ board: you only see and are seen by other players aged 18 and older." }, error: "Something went wrong. Please try again.",
  },
  es: {
    eyebrow: "RESUMEN DE PRÁCTICA", title: "CLASIFICACIÓN", subtitle: "Compite con bateristas de todo el mundo", back: "Progreso",
    rankMonth: "Tu posición (este mes)", notRanked: "Aún sin posición", notRankedHint: "Practica 5+ minutos hoy para entrar.", join: "Unirme a la tabla", joinHint: "Actívala para ver dónde estás.",
    unavailable: "No disponible para esta cuenta", positionsUp: (n: number) => `${n} posición${n === 1 ? "" : "es"}`, positionsDown: (n: number) => `${n} posición${n === 1 ? "" : "es"}`,
    monthly: "Ranking mensual", points: "Puntos de práctica", levelRow: (l: string) => `Nivel ${l}`,
    cats: { consistency: "Constancia", skill: "Progreso técnico", points: "Puntos" }, periods: { month: "Este mes", year: "Este año" }, allLevels: "Todos los niveles",
    tiers: { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced", legend: "Legend" } as Record<string, string>,
    openSpot: "Lugar libre", ofPlayers: (n: number) => `de ${n} ${n === 1 ? "baterista" : "bateristas"}`, thisMonth: "este mes", pointsRanking: "Ranking de puntos", unitDays: "días", unitTempos: "tempos", unitPoints: "puntos", you: "Tú", empty: "Aún no hay nadie. ¡Sé el primero!", loadError: "La tabla no está disponible ahora mismo.", loading: "Cargando…",
    howConsistency: "Cuenta los días con 5+ minutos de práctica. Los minutos totales nunca se clasifican.", howSkill: "Cuenta los tempos que desbloqueaste de nuevo en el Skill Trainer.", howPoints: "Drum Points: 1 punto por minuto de práctica en el Skill Trainer, más puntos de tu profesor.", resets: "Se reinicia sola cada mes y cada año. Tu historial nunca se borra.",
    gateTitle: "Únete a la tabla mundial", gate1: "Tu nombre, la inicial de tu apellido y tus puntuaciones serán visibles para otros jugadores que se unan.", gate2: "No se comparte nada más: ni email, ni notas, ni detalles de práctica.", gate3: "Puedes salir cuando quieras. Tu historial sigue siendo tuyo.",
    joinBtn: "Unirme", leaveBtn: "Salir de la tabla", leaveConfirm: "Toca otra vez para salir", hiddenNote: "Ahora mismo no apareces en la tabla (oculto por un administrador).", goSettings: "Ir a Ajustes", needAgeTitle: "Añade tu fecha de nacimiento para unirte", needAge: "Añade tu fecha de nacimiento en Ajustes para unirte a la tabla. Se mantiene privada.", boards: { under_10: "Hasta 10", "10_17": "11–17", "18_plus": "18+" }, gates: { under_10: "Estás en la tabla de hasta 10 años: solo ves y te ven otros jugadores de hasta 10 años, solo con el nombre.", "10_17": "Estás en la tabla de 11–17: solo ves y te ven jugadores de 11 a 17 años, solo con el nombre.", "18_plus": "Estás en la tabla de 18+: solo ves y te ven jugadores de 18 años o más." }, error: "Algo salió mal. Inténtalo de nuevo.",
  },
  nl: {
    eyebrow: "OEFENOVERZICHT", title: "RANGLIJST", subtitle: "Meet je met drummers wereldwijd", back: "Voortgang",
    rankMonth: "Jouw positie (deze maand)", notRanked: "Nog geen positie", notRankedHint: "Oefen vandaag 5+ minuten om mee te doen.", join: "Doe mee aan de ranglijst", joinHint: "Zet hem aan om te zien waar je staat.",
    unavailable: "Niet beschikbaar voor dit account", positionsUp: (n: number) => `${n} ${n === 1 ? "plaats" : "plaatsen"}`, positionsDown: (n: number) => `${n} ${n === 1 ? "plaats" : "plaatsen"}`,
    monthly: "Maandranglijst", points: "Oefenpunten", levelRow: (l: string) => `Niveau ${l}`,
    cats: { consistency: "Regelmaat", skill: "Vaardigheid", points: "Punten" }, periods: { month: "Deze maand", year: "Dit jaar" }, allLevels: "Alle niveaus",
    tiers: { beginner: "Beginner", intermediate: "Gemiddeld", advanced: "Gevorderd", legend: "Legende" } as Record<string, string>,
    openSpot: "Vrije plek", ofPlayers: (n: number) => `van ${n} ${n === 1 ? "drummer" : "drummers"}`, thisMonth: "deze maand", pointsRanking: "Puntenranglijst", unitDays: "dagen", unitTempos: "tempo's", unitPoints: "punten", you: "Jij", empty: "Nog niemand hier. Wees de eerste!", loadError: "De ranglijst is nu niet beschikbaar.", loading: "Laden…",
    howConsistency: "Telt dagen met 5+ minuten oefenen. Totale minuten tellen nooit mee.", howSkill: "Telt tempo's die je nieuw hebt ontgrendeld in de Skill Trainer.", howPoints: "Drum Points: 1 punt per minuut oefenen in de Skill Trainer, plus punten van je leraar.", resets: "Begint automatisch opnieuw elke maand en elk jaar. Je geschiedenis wordt nooit verwijderd.",
    gateTitle: "Doe mee aan de wereldwijde ranglijst", gate1: "Je voornaam, de initiaal van je achternaam en je scores zijn zichtbaar voor andere spelers die meedoen.", gate2: "Er wordt niets anders gedeeld: geen e-mail, notities of oefendetails.", gate3: "Je kunt op elk moment stoppen. Je oefengeschiedenis blijft van jou.",
    joinBtn: "Meedoen", leaveBtn: "Stop met de ranglijst", leaveConfirm: "Tik nogmaals om te stoppen", hiddenNote: "Je wordt nu niet getoond op de ranglijst (verborgen door een beheerder).", goSettings: "Naar Instellingen", needAgeTitle: "Voeg je geboortedatum toe om mee te doen", needAge: "Voeg je geboortedatum toe in Instellingen om mee te doen aan de ranglijst. Het blijft privé.", boards: { under_10: "Tot 10", "10_17": "11–17", "18_plus": "18+" }, gates: { under_10: "Je staat op de ranglijst tot 10 jaar: je ziet en wordt gezien door andere spelers tot 10 jaar, alleen met voornaam.", "10_17": "Je staat op de ranglijst 11–17: je ziet en wordt gezien door spelers van 11 tot 17, alleen met voornaam.", "18_plus": "Je staat op de ranglijst 18+: je ziet en wordt gezien door spelers van 18 en ouder." }, error: "Er ging iets mis. Probeer het opnieuw.",
  },
};

const AVATAR_COLORS = ["#ff7a3c", "#f4a259", "#c4561f", "#ffb27a", "#8f5a34", "#e8c39a", "#b9794a", "#d98b5f"];
function colorFor(name: string) { let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0; return AVATAR_COLORS[h % AVATAR_COLORS.length]; }
function Chevron() { return <svg className="lb-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>; }

function Trophy() {
  return <svg className="lb-trophy" viewBox="0 0 120 130" aria-hidden="true">
    <defs>
      <linearGradient id="lbTrophyGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFD86B" /><stop offset="1" stopColor="#C98A12" /></linearGradient>
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
export function LeaderboardCard({ db: supabase, language, refreshKey, onOpen, userId, onRankUp, pointsOnly }: { db: any; language: Lang; refreshKey: number; onOpen: (f?: Partial<BoardFilter>) => void; userId?: string; onRankUp?: (info: RankUp) => void; pointsOnly?: boolean }) {
  const t = TEXT[language];
  const [summary, setSummary] = useState<Summary | null>(null);
  const [failed, setFailed] = useState(false);
  // Adults only: when the monthly rank is better than the last time it was seen, the "Overtake" celebration plays once (with the final rank, however many players were passed).
  useEffect(() => {
    if (!onRankUp || !userId || !summary || summary.board !== "18_plus" || !summary.opted_in || summary.pos == null) return;
    let cancelled = false;
    const d = new Date();
    const key = `ds_lb_rank_${userId}_${d.getFullYear()}-${d.getMonth() + 1}`;
    let stored: { pos: number; score: number } | null = null;
    try { const raw = localStorage.getItem(key); stored = raw ? JSON.parse(raw) : null; } catch { stored = null; }
    supabase.rpc("leaderboard", { p_category: "consistency", p_period: "month", p_level: "all", p_limit: 50 }).then(({ data, error }: any) => {
      if (cancelled || error || !Array.isArray(data)) return;
      const rows: Row[] = data.map((r: any) => ({ pos: Number(r.pos), display_name: r.display_name, score: Number(r.score), detail: Number(r.detail ?? 0), level: r.level, is_me: !!r.is_me }));
      const idx = rows.findIndex((r) => r.is_me);
      if (idx < 0) return;
      const me = rows[idx];
      try { localStorage.setItem(key, JSON.stringify({ pos: me.pos, score: me.score })); } catch { /* the celebration may play again next time */ }
      if (!stored || me.pos >= stored.pos) return;
      const n = stored.pos - me.pos;
      const passedRows = rows.slice(idx + 1, idx + 1 + Math.min(3, n));
      if (!passedRows.length) return;
      const keepAbove = 3 - passedRows.length;
      const above = rows.slice(Math.max(0, idx - keepAbove), idx);
      onRankUp({
        oldRank: stored.pos, newRank: me.pos, passed: n,
        rows: [...above.map((r) => ({ rank: r.pos, name: r.display_name, score: r.score })), ...passedRows.map((r) => ({ rank: r.pos - 1, name: r.display_name, score: r.score }))],
        scoreBefore: stored.score, scoreAfter: me.score, passedNames: passedRows.map((r) => r.display_name),
      });
    });
    return () => { cancelled = true; };
  }, [summary, userId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let cancelled = false;
    supabase.rpc("leaderboard_summary").then(({ data, error }: any) => {
      if (cancelled) return;
      if (error || !data) { setFailed(true); return; }
      const row: any = Array.isArray(data) ? data[0] : data;
      setSummary(row ? { opted_in: !!row.opted_in, eligible: !!row.eligible, pos: row.pos == null ? null : Number(row.pos), total: Number(row.total ?? 0), prev_pos: row.prev_pos == null ? null : Number(row.prev_pos), level: row.level ?? "beginner", board: row.board === "under_10" || row.board === "10_17" || row.board === "18_plus" ? row.board : null } : null);
    });
    return () => { cancelled = true; };
  }, [refreshKey]);
  // If the database part isn't installed yet (or it fails), the card stays hidden rather than showing an error on Progress.
  if (failed) return null;
  if (!summary) return <div className="lb-card lb-card-skel" aria-hidden="true" />;
  const moved = summary.pos != null && summary.prev_pos != null ? summary.prev_pos - summary.pos : 0;
  const levelWord = t.tiers[summary.level] ?? summary.level;
  return <div className="lb-card">
    <button type="button" className="lb-card-head" onClick={() => onOpen()}>
      <span className="lb-card-titles"><span className="lb-card-title">{t.title}</span><span className="lb-card-sub">{t.subtitle}</span></span>
      <Chevron />
    </button>
    <Trophy />
    {!summary.board ? <button type="button" className="lb-panel lb-panel-join" onClick={() => onOpen()}><span className="lb-join-title">{t.needAgeTitle}</span><span className="lb-join-sub">{t.needAge}</span></button>
      : summary.opted_in && !summary.eligible ? <div className="lb-panel lb-panel-note"><span>{t.unavailable}</span></div>
      : !summary.opted_in ? <button type="button" className="lb-panel lb-panel-join" onClick={() => onOpen()}><span className="lb-join-title">{t.join}</span><span className="lb-join-sub">{t.joinHint}</span></button>
      : <div className="lb-panel">
        <div className="lb-rank-col">
          <span className="lb-rank-label">{t.rankMonth}</span>
          {summary.pos != null ? <><span className="lb-rank-line"><span className="lb-rank-num">#{summary.pos}</span>{summary.total > 0 && <span className="lb-rank-of">{t.ofPlayers(summary.total)}</span>}</span>
            {moved !== 0 && <span className={moved > 0 ? "lb-moved up" : "lb-moved down"}>{moved > 0 ? "▲" : "▼"} {moved > 0 ? t.positionsUp(moved) : t.positionsDown(-moved)}</span>}</>
            : <><span className="lb-rank-none">{t.notRanked}</span><span className="lb-rank-hint">{t.notRankedHint}</span></>}
        </div>
        {summary.board !== "18_plus" && <div className="lb-links">
          <button type="button" onClick={() => onOpen({ category: "points", period: "month", level: "all" })}><span>{t.points}</span><Chevron /></button>
        </div>}
      </div>}
  </div>;
}

// The full leaderboard screen.
export function LeaderboardScreen({ db: supabase, user, language, initial, onBack, onOpenSettings, pointsOnly }: { db: any; user: any; language: Lang; onOpenSettings?: () => void; initial?: Partial<BoardFilter>; onBack: () => void; pointsOnly?: boolean }) {
  const t = TEXT[language];
  const [filter, setFilter] = useState<BoardFilter>({ category: pointsOnly ? "points" : initial?.category ?? "consistency", period: initial?.period ?? "month", level: initial?.level ?? "all" });
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
      if (row) setSummary({ opted_in: !!row.opted_in, eligible: !!row.eligible, pos: row.pos == null ? null : Number(row.pos), total: Number(row.total ?? 0), prev_pos: row.prev_pos == null ? null : Number(row.prev_pos), level: row.level ?? "beginner", board: row.board === "under_10" || row.board === "10_17" || row.board === "18_plus" ? row.board : null });
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
    <header className="simple-head lb-head"><h1>{t.title}</h1>{summary?.board && <span className="lb-board">{t.boards[summary.board]}</span>}</header>
    {!summary ? <p className="hint">{error || t.loading}</p>
      : !summary.board ? <div className="lb-gate"><h2>{t.needAgeTitle}</h2><p className="lb-note">{t.needAge}</p>{onOpenSettings && <button className="save" onClick={onOpenSettings}>{t.goSettings}</button>}</div>
      : !optedIn ? <div className="lb-gate">
        <h2>{t.gateTitle}</h2>
        <ul><li>{t.gate1}</li><li>{t.gate2}</li><li>{t.gate3}</li><li>{t.gates[summary.board]}</li></ul>
        {error && <p className="lb-note">{error}</p>}
        <button className="save" disabled={busy} onClick={() => setOptIn(true)}>{t.joinBtn}</button>
      </div>
      : <>
        {!summary.eligible && <p className="lb-note">{t.hiddenNote}</p>}
        {!pointsOnly && <div className="lb-seg">{(summary.board === "18_plus" ? (["consistency", "skill"] as const) : (["consistency", "skill", "points"] as const)).map((c) => <button key={c} type="button" className={filter.category === c ? "on" : ""} onClick={() => setFilter({ ...filter, category: c })}>{t.cats[c]}</button>)}</div>}
        <div className="lb-filters">
          <select className="lb-select" aria-label={t.periods.month + " / " + t.periods.year} value={filter.period} onChange={(e) => setFilter({ ...filter, period: e.target.value as BoardFilter["period"] })}>{(["month", "year"] as const).map((p) => <option key={p} value={p}>{t.periods[p]}</option>)}</select>
          <select className="lb-select" aria-label={t.allLevels} value={filter.level} onChange={(e) => setFilter({ ...filter, level: e.target.value })}>{["all", "beginner", "intermediate", "advanced", "legend"].map((l) => <option key={l} value={l}>{l === "all" ? t.allLevels : t.tiers[l]}</option>)}</select>
        </div>
        {rows === null ? <div className="skeleton-stack" role="status"><i className="skel skel-card" /><i className="skel skel-card" /></div>
          : error ? <p className="lb-note">{error}</p>
          : !rows.length ? <div className="lb-empty-card">
            <span className="lb-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 4h8v5a4 4 0 01-8 0z" /><path d="M8 6H5a2 2 0 002 4M16 6h3a2 2 0 01-2 4" /><path d="M12 13v4M9 20h6M10 17h4" /></svg></span>
            <strong>{t.empty.split(/(?<=[.!?])\s+/)[0]}</strong>
            {t.empty.split(/(?<=[.!?])\s+/)[1] && <span>{t.empty.split(/(?<=[.!?])\s+/).slice(1).join(" ")}</span>}
          </div>
          : <div className="lb-list">{rows.map((r, i) => <div key={`${r.pos}-${r.display_name}-${i}`}>
            {r.is_me && i > 0 && r.pos > rows[i - 1].pos + 1 && <div className="lb-gap">···</div>}
            <div className={`lb-row${r.is_me ? " me" : ""}${r.pos <= 3 ? " top" : ""}`}>
              <span className="lb-pos">{r.pos}</span>
              <span className="lb-avatar" style={{ background: colorFor(r.display_name) }}>{r.display_name.charAt(0).toUpperCase()}</span>
              <span className="lb-name"><b>{r.display_name}{r.is_me && <em>{t.you}</em>}</b><small>{t.tiers[r.level] ?? r.level}</small></span>
              <span className="lb-score">{r.score}<small>{unit}</small></span>
            </div>
          </div>)}
            {/* the ranking always shows at least 5 places, so a board with one player still looks like a race */}
            {Array.from({ length: Math.max(0, 5 - rows.length) }, (_, k) => <div key={`open-${k}`} className="lb-row open"><span className="lb-pos">{rows.length + k + 1}</span><span className="lb-avatar lb-avatar-open" aria-hidden="true">?</span><span className="lb-name"><b>{t.openSpot}</b></span></div>)}
          </div>}
        <div className="lb-info"><span className="lb-info-icon" aria-hidden="true">i</span><div><p>{how}</p><small>{t.resets}</small></div></div>
        <button type="button" className="lb-leave" disabled={busy} onClick={() => (confirmLeave ? setOptIn(false) : setConfirmLeave(true))}>{confirmLeave ? t.leaveConfirm : t.leaveBtn}</button>
      </>}
  </section>;
}

// Admin view: a student's own leaderboard standing (read-only), same look as the card on the student's Progress tab.
export function StudentLeaderboardCard({ db: supabase, language, studentId }: { db: any; language: Lang; studentId: string }) {
  const t = TEXT[language];
  const [info, setInfo] = useState<{ opted_in: boolean; hidden: boolean; pos: number | null; total: number; level: string; board: "under_10" | "10_17" | "18_plus" | null } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setInfo(null); setFailed(false);
    supabase.rpc("admin_leaderboard_summary", { target_user_id: studentId }).then(({ data, error }: any) => {
      if (cancelled) return;
      const row: any = Array.isArray(data) ? data[0] : data;
      if (error || !row) { setFailed(true); return; }
      setInfo({ opted_in: !!row.opted_in, hidden: !!row.hidden, pos: row.pos == null ? null : Number(row.pos), total: Number(row.total ?? 0), level: row.level ?? "beginner", board: row.board === "under_10" || row.board === "10_17" || row.board === "18_plus" ? row.board : null });
    });
    return () => { cancelled = true; };
  }, [studentId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (failed) return null;
  if (!info) return <div className="lb-card lb-card-skel" aria-hidden="true" />;
  const A = ADMIN_TEXT[language];
  const status = !info.board ? A.noDob : !info.opted_in ? A.notJoined : info.hidden ? A.hidden : info.pos != null ? A.rank(info.pos, info.total) : A.noScore;
  return <div className="lb-card">
    <div className="lb-card-head lb-static-head">
      <span className="lb-card-titles"><span className="lb-card-title">{t.title}</span><span className="lb-card-sub">{info.board ? t.boards[info.board] : t.subtitle}</span></span>
    </div>
    <Trophy />
    <div className="lb-panel lb-panel-note lb-student"><span className="lb-student-status">{status}</span>{info.board && info.opted_in && <small>{A.level(t.tiers[info.level] ?? info.level)}</small>}</div>
  </div>;
}
const ADMIN_TEXT = {
  en: { noDob: "No date of birth yet, so no leaderboard group", notJoined: "Has not joined the leaderboard", hidden: "Hidden from the leaderboard by you", noScore: "Joined, no ranking yet this month", rank: (pos: number, total: number) => `#${pos} of ${total} this month`, level: (l: string) => `${l} level` },
  es: { noDob: "Aún sin fecha de nacimiento, sin grupo de tabla", notJoined: "No se ha unido a la tabla", hidden: "Oculto de la tabla por ti", noScore: "Unido, sin posición este mes", rank: (pos: number, total: number) => `#${pos} de ${total} este mes`, level: (l: string) => `Nivel ${l}` },
  nl: { noDob: "Nog geen geboortedatum, dus geen ranglijstgroep", notJoined: "Doet niet mee aan de ranglijst", hidden: "Door jou verborgen van de ranglijst", noScore: "Doet mee, nog geen positie deze maand", rank: (pos: number, total: number) => `#${pos} van ${total} deze maand`, level: (l: string) => `Niveau ${l}` },
};
