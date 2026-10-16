// Rhythmic grids for the rudiments: the rhythm is authored here, separately from the sticking shown elsewhere.
// A grid is a list of slots at a fixed resolution (perBeat slots per quarter-note beat: 1 = quarter, 2 = eighth, 3 = triplet,
// 4 = sixteenth, 6 and up work too). Each slot is a rest or one stroke (hand, optional accent, optional grace notes that lead
// into it and take no slot of their own). A trailing digit means that many strokes of the hand in consecutive slots.
// Pattern shorthand: "-" holds the previous stroke longer, "." is a written rest. "R" stroke, "l" grace note before the next stroke, "-" rest slot, ">R" accented stroke, "R2" two strokes,
// "—" starts a second row (second side of a two-sided rudiment). Feet: "K" = kick drum, "FR" / "FL" = right / left foot on the bass drum, "HL" / "HR" = foot on the hi-hat pedal.
export type Hand = "R" | "L";
// arrow = a down or up stroke marker (Push Pull); plain = a stroke with no sticking given (the Three-Note Patterns): drawn without an R or L.
// voice: a stroke that is not a hand on the snare: "kick" = bass drum (K, or a foot R / L), "hat" = hi-hat pedal (foot). label overrides the letter shown ("K" for the kick).
export type GridSlot = { hand: Hand; graces: Hand[]; accent: boolean; arrow?: "down" | "up"; plain?: boolean; voice?: "kick" | "hat"; label?: string } | null;
// rests[i] is true where slot i is a written REST (drawn as a rest symbol); a slot that is null but not a rest is the previous stroke being held.
export type Grid = { perBeat: number; slots: GridSlot[]; rowStarts: number[]; rests?: boolean[] };
// status: "stated" = given or confirmed by the teacher; "chart" = read from the official PAS International Drum Rudiments chart;
// "derived" = PAS chart notation (buzz rolls) converted to sixteenth-note strokes, needs the teacher's confirmation;
// "blocked" = pattern unknown or unreadable, so no stroke guide is shown (the metronome still follows the note value).
// clicks = default metronome clicks per beat when it should differ from the grid resolution (e.g. sixteenth-triplet grids).
export type RudimentRhythm = { perBeat: number; pattern: string; status: "stated" | "chart" | "derived" | "blocked"; reversible?: boolean; clicks?: number; beatsPerBar?: number; note?: string };

export function parseGrid(perBeat: number, pattern: string): Grid {
  const slots: GridSlot[] = [];
  const rests: boolean[] = [];
  const rowStarts = [0];
  let graces: Hand[] = [];
  for (const raw of pattern.trim().split(/\s+/)) {
    if (raw === "—") { rowStarts.push(slots.length); continue; }
    if (raw === "-") { slots.push(null); rests.push(false); continue; }
    if (raw === ".") { slots.push(null); rests.push(true); continue; } // a written rest, not a held note
    const accent = raw[0] === ">";
    const body = accent ? raw.slice(1) : raw;
    // letter (R L, lowercase = grace note, * = a stroke with no sticking), optional repeat count, optional d / u = down / up stroke arrow
    const m = /^(K|F[RL]|H[RL]|[RLrl*])(\d*)([du])?$/.exec(body);
    if (!m) throw new Error(`Bad grid token: ${raw}`);
    const letter = m[1], plain = letter === "*";
    const foot = letter === "K" ? { voice: "kick" as const, label: "K", hand: "R" as Hand } : letter[0] === "F" ? { voice: "kick" as const, hand: letter[1] as Hand } : letter[0] === "H" ? { voice: "hat" as const, hand: letter[1] as Hand } : null;
    const hand = foot ? foot.hand : ((plain ? "R" : letter.toUpperCase()) as Hand);
    if (!foot && !plain && letter !== letter.toUpperCase()) { graces.push(hand); continue; }
    const count = m[2] ? Number(m[2]) : 1;
    const arrow = m[3] === "d" ? "down" : m[3] === "u" ? "up" : undefined;
    for (let i = 0; i < count; i++) { slots.push({ hand, graces: i === 0 ? graces : [], accent, ...(arrow ? { arrow } : {}), ...(plain ? { plain: true } : {}), ...(foot ? { voice: foot.voice, ...(foot.label ? { label: foot.label } : {}) } : {}) }); rests.push(false); }
    graces = [];
  }
  return { perBeat, slots, rowStarts, rests };
}

const flip = (h: Hand): Hand => (h === "R" ? "L" : "R");
// Starting with the other hand: every R and L (including grace notes) swaps; the rhythm (slots, rests, accents) is untouched.
export function reverseGrid(grid: Grid): Grid {
  return { ...grid, slots: grid.slots.map((s) => s && { ...s, hand: flip(s.hand), graces: s.graces.map(flip) }) };
}

// Metronome clicks per beat that line up with the grid: only whole divisions of the grid resolution (a sixteenth grid can be
// clicked on every beat, every eighth or every sixteenth, but never in triplets). The first value is the default (the grid itself).
export function allowedClicks(perBeat: number): number[] {
  // Quarter, eighth and sixteenth based exercises may also be clicked in any binary subdivision (1, 2 or 4 clicks per beat).
  if (perBeat === 1 || perBeat === 2 || perBeat === 4) return [4, 2, 1];
  const out: number[] = [];
  for (let c = 1; c <= perBeat; c++) if (perBeat % c === 0) out.push(c);
  return out.reverse();
}

export const RUDIMENT_RHYTHMS: Record<string, RudimentRhythm> = {
  "Single Strokes": { perBeat: 4, pattern: "R L R L", status: "stated", reversible: true },
  "Double Strokes": { perBeat: 4, pattern: "R R L L", status: "stated", reversible: true },
  "Single Paradiddle": { perBeat: 4, pattern: ">R L R R >L R L L", status: "stated", reversible: true },
  "Double Paradiddle": { perBeat: 3, pattern: ">R L R L R R >L R L R L L", status: "stated", reversible: true, note: "Chart shows 16ths; kept as triplets as you stated" },
  "Triple Paradiddle": { perBeat: 2, pattern: ">R L R L R L R R >L R L R L R L L", status: "stated", reversible: true, note: "Chart shows 16ths; kept as eighths as you stated" },
  "Paradiddle-Diddle": { perBeat: 3, pattern: ">R L R R L L", status: "stated", reversible: true, note: "Chart shows 16ths; kept as triplets as you stated" },
  "Flam": { perBeat: 1, pattern: "l R", status: "stated", reversible: true },
  "Flam Accent": { perBeat: 3, pattern: "l >R L R — r >L R L", status: "stated", note: "PAS: eighths in groups of 3 (triplet feel), 6 strokes" },
  "Flam Tap": { perBeat: 2, pattern: "l >R R r >L L", status: "stated", reversible: true, note: "Chart shows 16ths; kept as eighths as you stated" },
  "Drag": { perBeat: 1, pattern: "l l R", status: "stated", reversible: true },
  "Ratamacue": { perBeat: 3, pattern: "l l R L R >L - -", status: "chart", reversible: true, note: "Half time: triplet of eighth notes then a held quarter (PAS Single Ratamacue)" },
  "Single Strokes Four": { perBeat: 3, pattern: "R L R L - -", status: "stated", reversible: true, note: "Half time: a triplet (eighth-note triplets) then a quarter note, two beats" },
  "Single Strokes Seven": { perBeat: 6, pattern: "R L R L R L R - - - - -", status: "stated", reversible: true, note: "Six sixteenth-note triplets then a quarter note (matches the PAS chart)" },
  "5 Stroke Roll": { perBeat: 4, pattern: "R R L L >R - - -", status: "stated", reversible: true, note: "Four sixteenths then a quarter" },
  "6 Stroke Roll": { perBeat: 4, pattern: ">R - L L R R >L -", status: "stated", reversible: true, note: "Eighth, four sixteenths, eighth" },
  "7 Stroke Roll": { perBeat: 4, pattern: "R R L L R R >L -", status: "derived", reversible: true, note: "PAS chart: dotted-eighth roll then a short final note, scaled like your 5 and 6 stroke rolls. Please confirm" },
  "9 Stroke Roll": { perBeat: 4, pattern: "R R L L R R L L >R - - - - - - -", status: "derived", reversible: true, note: "PAS chart: roll then a final note of equal length, scaled like your 5 stroke roll. Please confirm" },
  "10 Stroke Roll": { perBeat: 4, pattern: "R R L L R R L L >R - >L - . . . .", status: "derived", reversible: true, note: "PAS chart: roll, two accented eighth notes, then a quarter rest, scaled like your 5 stroke roll. Please confirm" },
  "11 Stroke Roll": { perBeat: 4, pattern: "R R L L R R L L R R >L - . . . .", status: "derived", reversible: true, note: "PAS chart: roll tied into a double-stroke 16th, then L, then an eighth rest (10 roll strokes + L), scaled like the other rolls. Please confirm" },
  "13 Stroke Roll": { perBeat: 4, pattern: "R R L L R R L L R R L L >R - - -", status: "derived", reversible: true, note: "PAS chart: roll tied through an eighth (12 strokes) then a final eighth R, scaled like the other rolls. Please confirm" },
  "15 Stroke Roll": { perBeat: 4, pattern: "R R L L R R L L R R L L R R >L -", status: "derived", reversible: true, note: "PAS chart: roll tied through a dotted eighth (14 strokes) then a final 16th L, scaled like the other rolls. Please confirm" },
  "17 Stroke Roll": { perBeat: 4, pattern: "R R L L R R L L R R L L R R L L >R - - - - - - -", status: "derived", beatsPerBar: 6, reversible: true, note: "Half-note roll then a final quarter, scaled like the other rolls (24 slots = 6 beats = one bar of 6). Please confirm" },
  "Lesson 25": { perBeat: 2, pattern: "l l R L >R -", status: "stated", reversible: true, note: "Eighth notes: drag, R L R, then an eighth rest (2 beats)" },
  "Single Drag Tap": { perBeat: 2, pattern: "l l R >L — r r L >R", status: "chart", note: "PAS: two eighths per side, both leads" },
  "Single Dragadiddle": { perBeat: 8, pattern: ">R R L - R - R - — >L L R - L - L -", status: "stated", clicks: 4, note: "Per side: two 32nd notes then three 16th notes (one beat); both sides in one cycle" },
  "Drag Paradiddle #1": { perBeat: 4, pattern: ">R - - - l l R L R R — >L - - - r r L R L L", status: "stated", note: "Quarter note, then drag + three sixteenths, per side (2 beats each)" },
  "Drag Paradiddle #2": { perBeat: 4, pattern: ">R - l l R - l l R L R R — >L - r r L - r r L R L L", status: "chart", note: "PAS: two eighths then four sixteenths, drags" },
  "Flammed Mill": { perBeat: 4, pattern: "l >R R L R — r >L L R L", status: "chart", note: "PAS: sixteenths, both leads in one cycle" },
  "Swiss Army Triplet": { perBeat: 3, pattern: "l >R R L", status: "chart", reversible: true, note: "Half time: eighth-note triplets, one group per beat (PAS shows sixteenth-note triplets)" },
  "Flamacue": { perBeat: 4, pattern: "l R >L R L l >R - - -", status: "chart", reversible: true, note: "PAS: four sixteenths then a flammed quarter; the old data ended on the wrong hand" },
  "Triple Stroke Roll": { perBeat: 3, pattern: "R R R L L L", status: "chart", reversible: true, note: "Half time: eighth-note triplets (PAS shows sixteenth-note triplets)" },
  "Flam Paradiddle": { perBeat: 4, pattern: "l >R L R R — r >L R L L", status: "chart", note: "PAS: 8 sixteenths, both leads in one cycle" },
  "Patafla-fla": { perBeat: 2, pattern: "l >R L R r >L", status: "chart", reversible: true, note: "Half time: eighth notes (PAS shows sixteenth notes)" },
  "Double Drag Tap": { perBeat: 3, pattern: "l l R - l l R - >L - — r r L - r r L - >R -", status: "stated", note: "Half time: quarter-note triplets (each stroke lasts two thirds of a beat), both leads" },
  "Flam Paradiddle-diddle": { perBeat: 3, pattern: "l >R L R R L L — r >L R L L R R", status: "stated", note: "Triplets (like Paradiddle-Diddle): six strokes per side, 2 beats each, both leads" },
  "Single Ratamacue": { perBeat: 3, pattern: "l l R L R >L - -", status: "chart", reversible: true, note: "Half time: triplet of eighth notes then a held quarter (PAS Single Ratamacue)" },
  "Double Ratamacue": { perBeat: 3, pattern: "l l R - - l l R L R >L - - — r r L - - r r L R L >R - -", status: "chart", beatsPerBar: 3, note: "Half time: quarter, three eighth triplets, quarter; both leads" },
  "Triple Ratamacue": { perBeat: 3, pattern: "l l R - - l l R - - l l R L R >L - - — r r L - - r r L - - r r L R L >R - -", status: "chart", note: "Half the PAS speed: eighth-note triplets instead of sixteenth-note triplets; both leads" },
  "Inverted Flam Tap": { perBeat: 2, pattern: "l >R L r >L R", status: "chart", reversible: true, note: "Half the PAS speed: eighth notes instead of sixteenths, flam on the 1st and 3rd stroke" },
  "Flam Drag": { perBeat: 6, pattern: "l >R - L L R - — r >L - R R L -", status: "chart", clicks: 3, note: "Triplet: eighth-triplet R, two sixteenths in the middle (L L), eighth-triplet R; one beat per side, both leads" },
  // Skill Trainer exercises that are written out the same way as the rudiments.
  "Push Pull - Right Hand": { perBeat: 2, pattern: "Rd Ru Rd Ru Rd Ru Rd Ru", status: "stated", note: "One bar of eight eighth notes; down stroke, up stroke, alternating" },
  "Push Pull - Left Hand": { perBeat: 2, pattern: "Ld Lu Ld Lu Ld Lu Ld Lu", status: "stated", note: "One bar of eight eighth notes; down stroke, up stroke, alternating" },
  // Footwork: one foot, continuous eighth notes (one bar). The three bass drum techniques look the same on paper; only how the foot moves differs.
  "Bass Drum - Heel Down": { perBeat: 2, pattern: "FR FR FR FR FR FR FR FR", status: "stated", note: "One bar of eight eighth notes, right foot on the bass drum" },
  "Bass Drum - Heel Up": { perBeat: 2, pattern: "FR FR FR FR FR FR FR FR", status: "stated", note: "One bar of eight eighth notes, right foot on the bass drum" },
  "Bass Drum - Slide Technique": { perBeat: 2, pattern: "FR FR FR FR FR FR FR FR", status: "stated", note: "One bar of eight eighth notes, right foot on the bass drum" },
  "Hi-hat Pedal - Heel Up": { perBeat: 2, pattern: "HL HL HL HL HL HL HL HL", status: "stated", note: "One bar of eight eighth notes, left foot on the hi-hat pedal" },
  "Hi-hat Pedal - Heel Down": { perBeat: 2, pattern: "HL HL HL HL HL HL HL HL", status: "stated", note: "One bar of eight eighth notes, left foot on the hi-hat pedal" },
  "Double Bass Drum": { perBeat: 4, pattern: "FR FL FR FL", status: "stated", reversible: true, note: "Alternating right and left foot on the bass drum, sixteenth notes (starts with R or L)" },
  // Coordination: hands (R, L) and kick (K) in sixteenth notes, one pattern per beat.
  "RLKK": { perBeat: 4, pattern: "R L K K", status: "stated", note: "Sixteenth notes: right hand, left hand, kick, kick" },
  "RKKL": { perBeat: 4, pattern: "R K K L", status: "stated", note: "Sixteenth notes: right hand, kick, kick, left hand" },
  "KKRL": { perBeat: 4, pattern: "K K R L", status: "stated", note: "Sixteenth notes: kick, kick, right hand, left hand" },
  "KRLK": { perBeat: 4, pattern: "K R L K", status: "stated", note: "Sixteenth notes: kick, right hand, left hand, kick" },
  "RLLK": { perBeat: 4, pattern: "R L L K", status: "stated", note: "Sixteenth notes: right hand, left hand, left hand, kick" },
  // Single-line strokes.
  "Flow, 16th Notes": { perBeat: 4, pattern: "R L R L", status: "stated", reversible: true, note: "Alternating hands, sixteenth notes" },
  "16th Note Single Strokes Around the Set": { perBeat: 4, pattern: "R L R L", status: "stated", reversible: true, note: "Alternating hands, sixteenth notes; moving around the drums is not written" },
  "Finger Technique (Single-Handed)": { perBeat: 2, pattern: "R R R R", status: "stated", reversible: true, note: "One hand, continuous eighth notes (starts with R or L)" },
  "R L L (Triplets)": { perBeat: 3, pattern: "R L L", status: "stated", reversible: true, note: "One eighth-note triplet per beat: R L L, or L R R when starting with the left hand" },
  "Three-Note Pattern #1": { perBeat: 4, pattern: "R - R R", status: "stated", reversible: true, note: "One eighth note and two sixteenth notes, one hand (starts with R or L)" },
  "Three-Note Pattern #2": { perBeat: 4, pattern: "R R R -", status: "stated", reversible: true, note: "Two sixteenth notes and one eighth note, one hand (starts with R or L)" },
  "Three-Note Pattern #3": { perBeat: 4, pattern: "R R - R", status: "stated", reversible: true, note: "One sixteenth, one eighth and one sixteenth note, one hand (starts with R or L)" },
};

export function rhythmFor(name: string): RudimentRhythm | null { return RUDIMENT_RHYTHMS[name] ?? null; }

// ---- Practice difficulty -------------------------------------------------------------------------------------------------------------
// beginner = quarter notes (1 stroke per click), developing = eighth notes (2 per click), standard = the rudiment as written.
// A simplified arrangement is the standard grid with every slot stretched to the easier note value: the strokes, rests, grace notes,
// accents and their relative lengths are untouched, only the note value (and so the metronome subdivision) changes. The BPM never changes.
export type Difficulty = "beginner" | "developing" | "standard";
const DIFFICULTY_PER_BEAT: Record<Exclude<Difficulty, "standard">, number> = { beginner: 1, developing: 2 };

// Rudiments that are NOT simplified (they keep their standard arrangement on every difficulty) because slowing the note value would
// change what the rudiment is. Triplet-based rudiments (3 or 6 per beat) are excluded automatically; these are the others.
export const NOT_SIMPLIFIED: Record<string, string> = {
  "5 Stroke Roll": "A roll is defined by close, even double strokes", "6 Stroke Roll": "A roll is defined by close, even double strokes", "7 Stroke Roll": "A roll is defined by close, even double strokes",
  "9 Stroke Roll": "A roll is defined by close, even double strokes", "10 Stroke Roll": "A roll is defined by close, even double strokes", "11 Stroke Roll": "A roll is defined by close, even double strokes",
  "13 Stroke Roll": "A roll is defined by close, even double strokes", "15 Stroke Roll": "A roll is defined by close, even double strokes", "17 Stroke Roll": "A roll is defined by close, even double strokes",
  "Single Dragadiddle": "Contains 32nd-note double strokes; needs a teacher-written arrangement",
  "Push Pull - Right Hand": "The exercise is the eight-note down/up pattern", "Push Pull - Left Hand": "The exercise is the eight-note down/up pattern",
  "RLKK": "The exercise is this sixteenth-note pattern", "RKKL": "The exercise is this sixteenth-note pattern", "KKRL": "The exercise is this sixteenth-note pattern", "KRLK": "The exercise is this sixteenth-note pattern", "RLLK": "The exercise is this sixteenth-note pattern",
  "Double Bass Drum": "The exercise is sixteenth-note double bass",
  "Three-Note Pattern #1": "The exercise is this rhythm", "Three-Note Pattern #2": "The exercise is this rhythm", "Three-Note Pattern #3": "The exercise is this rhythm",
};

export type EffectiveRhythm = RudimentRhythm & { simplified: boolean };
export function effectiveRhythm(name: string, difficulty: Difficulty = "standard"): EffectiveRhythm | null {
  const base = rhythmFor(name);
  if (!base) return null;
  if (difficulty === "standard" || base.status === "blocked" || NOT_SIMPLIFIED[name]) return { ...base, simplified: false };
  const target = DIFFICULTY_PER_BEAT[difficulty];
  // Already as simple as asked (e.g. a quarter-note flam), or triplet-based (3 or 6 per beat): keep the standard arrangement.
  if (base.perBeat <= target || ![2, 4, 8].includes(base.perBeat)) return { ...base, simplified: false };
  return { ...base, perBeat: target, clicks: undefined, simplified: true };
}
// The grid to show and play. null = no trustworthy grid (blocked or unknown), so callers fall back to the plain display.
export function gridFor(name: string, startHand: Hand = "R", difficulty: Difficulty = "standard"): Grid | null {
  const r = effectiveRhythm(name, difficulty);
  if (!r || r.status === "blocked") return null;
  const grid = parseGrid(r.perBeat, r.pattern);
  return r.reversible && startHand === "L" ? reverseGrid(grid) : grid;
}

// Layout for the stroke guide: rows are cut only on beat boundaries and share the beats as evenly as possible, so no row ends up
// with a lone stroke. Widths are in px: a stroke box, a grace-note box (each), the gap between boxes, and the wider gap between beats.
export type GuideRow = { start: number; end: number };
// Position of a slot inside its own side (line), so beat groups count from the start of each side.
export function sideIndex(grid: Grid, i: number): number {
  let start = 0;
  for (const r of grid.rowStarts) if (r <= i) start = r;
  return i - start;
}
export function layoutRows(grid: Grid, maxWidth: number, box = 32, grace = 17, wrapSides = false, gap = 5, beatGap = 6): GuideRow[] {
  const cell = (i: number) => box + (grid.slots[i]?.graces.length ?? 0) * (grace + 2);
  const rowWidth = (a: number, b: number) => {
    let w = 0;
    for (let i = a; i < b; i++) { w += cell(i); if (i > a) w += sideIndex(grid, i) % grid.perBeat === 0 ? beatGap : gap; }
    return w;
  };
  const out: GuideRow[] = [];
  grid.rowStarts.forEach((a, r) => {
    const b = grid.rowStarts[r + 1] ?? grid.slots.length;
    // Two-sided rudiments: each side always sits on its own single line (see fitBox, which shrinks the boxes until it fits).
    if (grid.rowStarts.length > 1 && !wrapSides) { out.push({ start: a, end: b }); return; }
    const beats = Math.ceil((b - a) / grid.perBeat);
    for (let rows = 1; rows <= beats; rows++) {
      const base = Math.floor(beats / rows), extra = beats % rows;
      const cuts: GuideRow[] = [];
      let at = a;
      for (let k = 0; k < rows; k++) { const end = Math.min(b, at + (base + (k < extra ? 1 : 0)) * grid.perBeat); cuts.push({ start: at, end }); at = end; }
      if (rows === beats || cuts.every((c) => rowWidth(c.start, c.end) <= maxWidth)) { out.push(...cuts); break; }
    }
  });
  return out;
}

// Box size (px) for the guide. It is as big as fits (up to maxBox) without needing any extra row, so short patterns get big, easy-to-follow boxes.
// A two-sided rudiment keeps each side on one line, shrinking (never below `smallest`) when needed; if a side still does not fit at the
// smallest size the sides are allowed to wrap onto two lines at beat boundaries instead.
export function fitBox(grid: Grid, maxWidth: number, normal = 32, smallest = 20, maxBox = 52, gap = 5, beatGap = 6, twoSidedMax = 38): { box: number; grace: number; wrapSides: boolean } {
  const graceFor = (box: number) => Math.max(13, Math.round(box * 0.55));
  const widest = (rows: GuideRow[], box: number, grace: number) => Math.max(...rows.map((r) => {
    let w = 0;
    for (let i = r.start; i < r.end; i++) { w += box + (grid.slots[i]?.graces.length ?? 0) * (grace + 2); if (i > r.start) w += sideIndex(grid, i) % grid.perBeat === 0 ? beatGap : gap; }
    return w;
  }));
  if (grid.rowStarts.length < 2) {
    const baseRows = layoutRows(grid, maxWidth, normal, graceFor(normal), false, gap, beatGap).length;
    // A pattern that already needs several rows stays at the normal size: bigger boxes would only make the window taller.
    if (baseRows >= 2) return { box: normal, grace: graceFor(normal), wrapSides: false };
    // 5 to 6 strokes on one line (e.g. Paradiddle-Diddle) would otherwise grow to ~48 px and make the window tall: cap them.
    const growTo = grid.slots.length >= 5 && grid.slots.length <= 6 ? Math.min(maxBox, 38) : maxBox;
    for (let box = growTo; box > normal; box--) {
      const grace = graceFor(box);
      const rows = layoutRows(grid, maxWidth, box, grace, false, gap, beatGap);
      if (rows.length === baseRows && widest(rows, box, grace) <= maxWidth) return { box, grace, wrapSides: false };
    }
    return { box: normal, grace: graceFor(normal), wrapSides: false };
  }
  // Two-sided rudiments stack two lines, so their boxes are capped to keep the window short.
  for (let box = Math.min(maxBox, twoSidedMax); box >= smallest; box--) {
    const grace = graceFor(box);
    const rows = layoutRows(grid, maxWidth, box, grace, false, gap, beatGap);
    if (widest(rows, box, grace) <= maxWidth) return { box, grace, wrapSides: false };
  }
  return { box: smallest, grace: graceFor(smallest), wrapSides: true };
}
