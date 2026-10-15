// Words used by the celebrations. No em dashes. The subtitles marked "placeholder" come from the reference preview and are waiting for David's final copy.

export type Lang = "en" | "es" | "nl";

type Texts = {
  cont: string; contKids: string;
  point: string; points: string; firstPoint: string; nthPoint: (k: number) => string;
  tempoTitle: string; tempoNext: (bpm: number) => string; tempoTop: string; bpm: string;
  goalUnit: string; goalTitle: string;
  streakLabel: string; streakSub: (n: number) => string;
  masteredTitle: (level: string) => string; masteredSub: (rudiment: string, next: string) => string; masteredComplete: (rudiment: string) => string; legendBadge: string;
  challengeTitle: string; challengeSub: (days: number, exercise: string) => string;
  onboardTitle: string; onboardSub: string; onboardCont: string;
  short: { title: string; unit: string; of: (min: number) => string; lines: (sec: number, min: number) => string[] };
  ratedTitle: string; ratedTitleKids: string; ratedWords: { a: string; b: string; today: string; before: string; day: string; days: string };
  rankLabel: string; rankPassedOne: (name: string) => string; rankPassedMany: (n: number) => string; rankSub: (rank: number) => string; rankSubYear: (rank: number) => string; rankUnit: string; rankUnitPoints: string; you: string;
};

export const CEL_TEXT: Record<Lang, Texts> = {
  en: {
    cont: "Continue", contKids: "CONTINUE",
    point: "POINT", points: "POINTS", firstPoint: "YOUR FIRST POINT", nthPoint: (k) => `YOUR ${k}TH POINT`,
    tempoTitle: "Tempo unlocked", tempoNext: (bpm) => `Next up: ${bpm} BPM`, tempoTop: "Top tempo reached", bpm: "BPM",
    goalUnit: "MIN TODAY", goalTitle: "Daily goal reached",
    streakLabel: "DAY STREAK",
    // placeholder copy
    streakSub: (n) => (n >= 100 ? "One hundred days. Legendary." : n >= 30 ? "A whole month. Massive." : n >= 14 ? "Two weeks strong" : n >= 7 ? "One full week in a row" : "Three days in a row"),
    masteredTitle: (l) => `${l} mastered`, masteredSub: (r, n) => `${r} moves up to ${n}`, masteredComplete: (r) => `${r} is complete`, legendBadge: "LEGEND",
    challengeTitle: "Challenge won", challengeSub: (d, e) => `${d} days of ${e}`,
    onboardTitle: "You're ready", onboardSub: "Let's play your first rudiment", onboardCont: "Start practicing",
    short: { title: "Almost there", unit: "SEC", of: (n) => `of ${n} min`, lines: (s, n) => [`You practised ${s} sec`, `Next time hold it for ${n} min non-stop`, "to unlock this tempo"] },
    ratedTitle: "Rating improved", ratedTitleKids: "Getting better!", ratedWords: { a: "From", b: "to", today: "today", before: "in", day: "day", days: "days" },
    rankLabel: "LEADERBOARD", rankPassedOne: (name) => `You passed ${name}`, rankPassedMany: (n) => `You passed ${n} people`, rankSub: (r) => `Up to #${r} this month`, rankSubYear: (r) => `Up to #${r} this year`, rankUnit: "days", rankUnitPoints: "points", you: "You",
  },
  es: {
    cont: "Continuar", contKids: "CONTINUAR",
    point: "PUNTO", points: "PUNTOS", firstPoint: "TU PRIMER PUNTO", nthPoint: (k) => `TU PUNTO ${k}`,
    tempoTitle: "Tempo desbloqueado", tempoNext: (bpm) => `Siguiente: ${bpm} BPM`, tempoTop: "Tempo máximo alcanzado", bpm: "BPM",
    goalUnit: "MIN HOY", goalTitle: "Objetivo diario cumplido",
    streakLabel: "DÍAS SEGUIDOS",
    streakSub: (n) => (n >= 100 ? "Cien días. Legendario." : n >= 30 ? "Un mes entero. Enorme." : n >= 14 ? "Dos semanas a tope" : n >= 7 ? "Una semana completa seguida" : "Tres días seguidos"),
    masteredTitle: (l) => `${l} dominado`, masteredSub: (r, n) => `${r} sube a ${n}`, masteredComplete: (r) => `${r} está completo`, legendBadge: "LEYENDA",
    challengeTitle: "Reto superado", challengeSub: (d, e) => `${d} días de ${e}`,
    onboardTitle: "Estás listo", onboardSub: "Toquemos tu primer rudimento", onboardCont: "Empezar a practicar",
    short: { title: "Casi lo tienes", unit: "SEG", of: (n) => `de ${n} min`, lines: (s, n) => [`Practicaste ${s} s`, `La próxima vez aguanta ${n} min seguidos`, "para desbloquear este tempo"] },
    ratedTitle: "Has mejorado", ratedTitleKids: "¡Cada vez mejor!", ratedWords: { a: "De", b: "a", today: "hoy", before: "en", day: "día", days: "días" },
    rankLabel: "CLASIFICACIÓN", rankPassedOne: (name) => `Superaste a ${name}`, rankPassedMany: (n) => `Superaste a ${n} personas`, rankSub: (r) => `Subes al n.º ${r} este mes`, rankSubYear: (r) => `Subes al n.º ${r} este año`, rankUnit: "días", rankUnitPoints: "puntos", you: "Tú",
  },
  nl: {
    cont: "Verder", contKids: "VERDER",
    point: "PUNT", points: "PUNTEN", firstPoint: "JE EERSTE PUNT", nthPoint: (k) => `JE ${k}E PUNT`,
    tempoTitle: "Tempo ontgrendeld", tempoNext: (bpm) => `Volgende: ${bpm} BPM`, tempoTop: "Hoogste tempo bereikt", bpm: "BPM",
    goalUnit: "MIN VANDAAG", goalTitle: "Dagdoel bereikt",
    streakLabel: "DAGEN OP RIJ",
    streakSub: (n) => (n >= 100 ? "Honderd dagen. Legendarisch." : n >= 30 ? "Een hele maand. Enorm." : n >= 14 ? "Twee weken sterk" : n >= 7 ? "Een hele week op rij" : "Drie dagen op rij"),
    masteredTitle: (l) => `${l} beheerst`, masteredSub: (r, n) => `${r} gaat door naar ${n}`, masteredComplete: (r) => `${r} is voltooid`, legendBadge: "LEGENDE",
    challengeTitle: "Uitdaging gewonnen", challengeSub: (d, e) => `${d} dagen ${e}`,
    onboardTitle: "Je bent klaar", onboardSub: "Laten we je eerste rudiment spelen", onboardCont: "Begin met oefenen",
    short: { title: "Bijna!", unit: "SEC", of: (n) => `van ${n} min`, lines: (s, n) => [`Je oefende ${s} sec`, `Houd het ${n} min vol zonder te stoppen`, "om dit tempo te ontgrendelen"] },
    ratedTitle: "Beoordeling verbeterd", ratedTitleKids: "Je wordt steeds beter!", ratedWords: { a: "Van", b: "naar", today: "vandaag", before: "in", day: "dag", days: "dagen" },
    rankLabel: "RANGLIJST", rankPassedOne: (name) => `Je passeerde ${name}`, rankPassedMany: (n) => `Je passeerde ${n} mensen`, rankSub: (r) => `Gestegen naar #${r} deze maand`, rankSubYear: (r) => `Gestegen naar #${r} dit jaar`, rankUnit: "dagen", rankUnitPoints: "punten", you: "Jij",
  },
};

// Streak days that get a celebration.
export const STREAK_MILESTONES = [3, 7, 14, 30, 100];
