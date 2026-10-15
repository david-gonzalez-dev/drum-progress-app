// Turns a rudiment grid into engraved music: note values, held notes, beam groups and triplet brackets.
// Pure and testable; notation.tsx only draws what this returns. A stroke followed by rests becomes ONE longer note (a held note),
// exactly how it would be written on paper (e.g. the 5 stroke roll's last stroke is a quarter note).
import type { Grid, Hand } from "./rudiment-grid";

export type NoteBase = "whole" | "half" | "quarter" | "eighth" | "sixteenth" | "thirtysecond";
export type NoteEvent = {
  start: number; // global slot index where the note starts
  dur: number; // length in slots (the stroke plus the rests it holds through)
  hand: Hand;
  voice?: "kick" | "hat"; // bass drum or hi-hat pedal instead of the snare line
  label?: string; // letter shown instead of the hand ("K")
  rest?: boolean; // a written rest (no stroke, no sticking letter)
  arrow?: "down" | "up"; // down / up stroke marker (Push Pull)
  plain?: boolean; // a stroke with no sticking given: no R / L letter
  accent: boolean;
  graces: Hand[];
  base: NoteBase;
  dots: number;
  triplet: boolean;
  beams: number; // 0 for quarter and longer, 1 eighth, 2 sixteenth, 3 thirty-second
  beat: number; // which beat of its side it starts in (counted from the side start)
};
export type NotationSide = { start: number; end: number; events: NoteEvent[]; beamGroups: number[][]; tuplets: number[][] };

const BEAMS: Record<NoteBase, number> = { whole: 0, half: 0, quarter: 0, eighth: 1, sixteenth: 2, thirtysecond: 3 };
const DUPLE: [number, NoteBase, number][] = [[4, "whole", 0], [3, "half", 1], [2, "half", 0], [1.5, "quarter", 1], [1, "quarter", 0], [0.75, "eighth", 1], [0.5, "eighth", 0], [0.375, "sixteenth", 1], [0.25, "sixteenth", 0], [0.125, "thirtysecond", 0]];
const TRIPLET: [number, NoteBase][] = [[2 / 3, "quarter"], [1 / 3, "eighth"], [1 / 6, "sixteenth"], [1 / 12, "thirtysecond"]];

// The written note value for a note lasting `dur` slots on a grid with `perBeat` slots per quarter-note beat. null = cannot be written as one note.
export function noteValue(dur: number, perBeat: number): { base: NoteBase; dots: number; triplet: boolean } | null {
  const f = dur / perBeat;
  for (const [v, base, dots] of DUPLE) if (Math.abs(f - v) < 1e-9) return { base, dots, triplet: false };
  if (perBeat % 3 === 0) for (const [v, base] of TRIPLET) if (Math.abs(f - v) < 1e-9) return { base, dots: 0, triplet: true };
  return null;
}

export function buildNotation(grid: Grid): NotationSide[] {
  return grid.rowStarts.map((a, r) => {
    const b = grid.rowStarts[r + 1] ?? grid.slots.length;
    const events: NoteEvent[] = [];
    for (let i = a; i < b; i++) {
      const slot = grid.slots[i];
      const beat = Math.floor((i - a) / grid.perBeat);
      if (slot) {
        events.push({ start: i, dur: 1, hand: slot.hand, voice: slot.voice, label: slot.label, accent: slot.accent, graces: slot.graces, arrow: slot.arrow, plain: slot.plain, base: "quarter", dots: 0, triplet: false, beams: 0, beat });
      } else if (grid.rests?.[i]) {
        const last = events[events.length - 1];
        if (last && last.rest) last.dur += 1; // neighbouring rest slots are one rest
        else events.push({ start: i, dur: 1, hand: "R", rest: true, accent: false, graces: [], base: "quarter", dots: 0, triplet: false, beams: 0, beat });
      } else if (events.length) {
        events[events.length - 1].dur += 1; // empty slots after a stroke are that stroke being held
      }
    }
    for (const e of events) {
      const v = noteValue(e.dur, grid.perBeat);
      if (v) { e.base = v.base; e.dots = v.dots; e.triplet = v.triplet; }
      else { const one = noteValue(1, grid.perBeat); if (one) { e.base = one.base; e.triplet = one.triplet; } }
      e.beams = e.rest ? 0 : BEAMS[e.base];
    }
    // Beam groups: neighbouring eighth-or-shorter notes inside the same beat.
    const beamGroups: number[][] = [];
    let current: number[] = [];
    events.forEach((e, i) => {
      if (e.beams > 0 && (!current.length || events[current[current.length - 1]].beat === e.beat)) current.push(i);
      else { if (current.length) beamGroups.push(current); current = e.beams > 0 ? [i] : []; }
    });
    if (current.length) beamGroups.push(current);
    // Triplet brackets: a run of triplet notes is bracketed in groups of three "units". A note's weight is its length in triplet units
    // (a quarter triplet 2, an eighth triplet 1, a sixteenth triplet 1/2); a group is closed when its weights add up to three of the run's
    // biggest note (so three eighth triplets, three quarter triplets, three sixteenth triplets, or an eighth + two sixteenths + an eighth).
    const tuplets: number[][] = [];
    let run: number[] = [];
    const weight = (e: NoteEvent) => (3 * e.dur) / grid.perBeat;
    const flush = () => {
      const unit = Math.max(...run.map((i) => weight(events[i])), 0);
      let group: number[] = [], sum = 0;
      for (const i of run) {
        group.push(i); sum += weight(events[i]);
        if (sum >= 3 * unit - 1e-9) { tuplets.push(group); group = []; sum = 0; }
      }
      if (group.length) tuplets.push(group);
      run = [];
    };
    events.forEach((e, i) => { if (e.triplet) run.push(i); else flush(); });
    flush();
    return { start: a, end: b, events, beamGroups, tuplets };
  });
}
