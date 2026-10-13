// @ts-nocheck
// Run: node scripts/test-stroke-guide.ts   (Node 23.6+ strips the types itself)
import { parseGrid, reverseGrid, allowedClicks, gridFor, effectiveRhythm, NOT_SIMPLIFIED, RUDIMENT_RHYTHMS } from "../src/app/rudiment-grid.ts";
import { AGE_CONFIG, asAgeBand } from "../src/app/age-config.ts";
import { enqueueTick, dueEvent } from "../src/app/stroke-guide.ts";
let fails = 0;
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const hands = (g) => g.slots.map((s) => (s ? s.hand : "-")).join("");

// Grid parsing
ok(hands(parseGrid(4, "R R L L R - - -")) === "RRLLR---", "Rests take a slot: R R L L R - - - -> 8 slots");
const flam = parseGrid(1, "l R");
ok(flam.slots.length === 1 && flam.slots[0].graces[0] === "L", "Flam: 1 slot, grace L attached, no slot of its own");
const dd = parseGrid(2, "l l R L R R — r r L R L L");
ok(dd.slots.length === 8 && dd.rowStarts.join() === "0,4" && dd.slots[0].graces.length === 2, "Two-sided rudiment: 8 slots, rows at 0 and 4, 2 graces on first");
ok(parseGrid(4, "R2 L2").slots.length === 4 && parseGrid(4, ">R L").slots[0].accent === true, "R2 = two strokes; > marks an accent");

// Reversal keeps the rhythm
{
  const g = parseGrid(4, "R L R R L R L L"), r = reverseGrid(g);
  ok(hands(r) === "LRLLRLRR", "Single Paradiddle reversed: L R L L R L R R");
  const rr = reverseGrid(parseGrid(4, "R L - R")); ok(hands(rr) === "LR-L", "Rests stay rests when reversed");
  ok(reverseGrid(flam).slots[0].hand === "L" && reverseGrid(flam).slots[0].graces[0] === "R", "Flam reversed: grace r, main L");
  ok(gridFor("Single Paradiddle", "L").perBeat === 4 && hands(gridFor("Single Paradiddle", "L")) === "LRLLRLRR", "gridFor applies the starting hand to reversible rudiments");
  ok(hands(gridFor("Flam Accent", "L")) === hands(gridFor("Flam Accent", "R")), "Fixed-sticking rudiment ignores the starting hand");
}

{
  const fa = gridFor("Flam Accent"), five = gridFor("5 Stroke Roll");
  ok(fa && fa.perBeat === 3 && fa.slots.length === 6 && hands(fa) === "RLRLRL" && fa.slots[0].graces[0] === "L" && fa.slots[3].graces[0] === "R", "Flam Accent: 6 triplet slots, grace on slot 1 (l) and slot 4 (r)");
  ok(five.perBeat === 4 && hands(five) === "RRLLR---", "5 Stroke Roll: R R L L R then 3 rest slots (last stroke is a quarter note)");
  ok(hands(gridFor("5 Stroke Roll", "L")) === "LLRRL---", "5 Stroke Roll reversed keeps the rests");
  const q = []; let c = 0; for (let i = 0; i < 8; i++) c = enqueueTick(q, c, five, 4, i * 0.25, 60);
  ok(q[4].index === 4 && q[7].index === 7 && Math.abs(q[7].time - 1.75) < 1e-12 && q.length === 8, "5 Stroke Roll at 60 BPM: final R on beat 2, rests fill the rest of that beat");
}
{
  const f = gridFor("Flamacue");
  ok(f.slots.map((x, i) => (x && x.accent ? i : -1)).filter((i) => i >= 0).join() === "1,4" && f.slots[1].hand === "L" && f.slots[4].hand === "R", "Flamacue accents: the first L (2nd stroke) and the final R");
  const fl = gridFor("Flamacue", "L"); ok(fl.slots[1].accent && fl.slots[4].accent, "Accents stay on the same positions when the starting hand is reversed");
}
ok(hands(gridFor("Ratamacue", "L")) === "LRLR--" && hands(gridFor("Single Ratamacue", "L")) === "LRLR--" && gridFor("Ratamacue", "L").slots[0].graces.join() === "R,R", "Ratamacue and Single Ratamacue reverse: drag rr then L R L R");
{
  const d = gridFor("Single Dragadiddle");
  ok(d.perBeat === 8 && hands(d) === "RRL-R-R-LLR-L-L-" && d.slots.every((x) => !x || x.graces.length === 0), "Single Dragadiddle: RR (32nds) L R R (16ths) / LL (32nds) R L L (16ths), real strokes not graces");
  ok(RUDIMENT_RHYTHMS["Single Dragadiddle"].clicks === 4 && allowedClicks(8).join() === "8,4,2,1", "Single Dragadiddle clicks default to 16ths (4 per beat)");
}
{
  const g17 = gridFor("17 Stroke Roll");
  ok(g17.slots.length === 24 && g17.slots.slice(17).every((x) => x === null) && RUDIMENT_RHYTHMS["17 Stroke Roll"].beatsPerBar === 6, "17 Stroke Roll: 24 slots (final R + 7 dashes) = 6 beats, opens at 6 beats per bar");
  ok(hands(gridFor("11 Stroke Roll")) === "RRLLRRLLRRL-----" && hands(gridFor("13 Stroke Roll")) === "RRLLRRLLRRLLR---" && hands(gridFor("15 Stroke Roll")) === "RRLLRRLLRRLLRRL-", "11, 13 and 15 stroke rolls: roll, final note, rests, 16 slots each");
  ok(hands(gridFor("Inverted Flam Tap")) === "RLLR" && hands(gridFor("Flam Drag")) === "R-LLR-R-RLL-L-".slice(0, 0) + "R-LLR-" + "L-RRL-", "Inverted Flam Tap R L L R; Flam Drag R - L L R - / L - R R L -");
  const dr = gridFor("Double Ratamacue"), tr = gridFor("Triple Ratamacue");
  ok(dr.perBeat === 6 && dr.rowStarts.join() === "0,9" && tr.perBeat === 3 && tr.rowStarts.join() === "0,12" && tr.slots.filter(Boolean).length === 12, "Double Ratamacue on 16th triplets, Triple Ratamacue on eighth triplets (half speed), both leads on two lines");
}
{
  const d = gridFor("Drag Paradiddle #1");
  ok(d.rowStarts.join() === "0,8" && hands(d) === "R---RLRRL---LRLL", "Drag Paradiddle #1: R as a quarter, then drag R L R R; second side L as a quarter, then drag L R L L");
  ok(d.slots[4].graces.join() === "L,L" && d.slots[12].graces.join() === "R,R", "Each side's drag (two grace notes) leads into the 5th slot");
}
ok(RUDIMENT_RHYTHMS["Double Drag Tap"].perBeat === 3 && gridFor("Double Drag Tap").slots.length === 6 && gridFor("Double Drag Tap").rowStarts.join() === "0,3", "Double Drag Tap: triplets, 3 clicks per beat, three strokes per side");
ok(RUDIMENT_RHYTHMS["Flam Paradiddle-diddle"].perBeat === 3 && gridFor("Flam Paradiddle-diddle").slots.length === 12 && gridFor("Flam Paradiddle-diddle").rowStarts.join() === "0,6", "Flam Paradiddle-diddle: triplets, 6 strokes per side");
{
  const odd = Object.keys(RUDIMENT_RHYTHMS).filter((n) => { const g = gridFor(n), b = g.slots.length / g.perBeat; return Number.isInteger(b) && ![1, 2, 4, 8].includes(b); });
  ok(odd.every((n) => RUDIMENT_RHYTHMS[n].beatsPerBar === gridFor(n).slots.length / gridFor(n).perBeat), "Rudiments whose cycle is 3 or 6 beats open at that many beats per bar: " + odd.join(", "));
}
ok(RUDIMENT_RHYTHMS["Inverted Flam Tap"].perBeat === 2 && hands(gridFor("Inverted Flam Tap")) === "RLLR", "Inverted Flam Tap: eighth notes (half speed), 2 clicks per beat");
// Practice difficulty
{
  const per = (n, d) => effectiveRhythm(n, d).perBeat;
  ok(AGE_CONFIG.under_10.difficulty === "beginner" && AGE_CONFIG["10_13"].difficulty === "developing" && AGE_CONFIG["14_17"].difficulty === "standard" && AGE_CONFIG["18_plus"].difficulty === "standard", "Age defaults: under 10 -> beginner, 10-13 -> developing, 14+ -> standard");
ok(AGE_CONFIG.under_10.essentials && AGE_CONFIG["10_13"].essentials && !AGE_CONFIG["14_17"].essentials && !AGE_CONFIG["18_plus"].essentials, "Essentials library by default for under 14 only");
ok(AGE_CONFIG.under_10.unlockMinutes === 1 && AGE_CONFIG["10_13"].unlockMinutes === 1 && AGE_CONFIG["14_17"].unlockMinutes === 2 && AGE_CONFIG["18_plus"].unlockMinutes === 2, "Unlock minutes: 1 under 14, 2 from 14");
ok(asAgeBand("14_17") === "14_17" && asAgeBand("14_plus") === null && asAgeBand(null) === null && asAgeBand("x") === null, "Unknown or old age values are treated as no age (nothing is guessed)");
  ok(per("Single Strokes", "beginner") === 1 && per("Single Strokes", "developing") === 2 && per("Single Strokes", "standard") === 4, "Single Strokes: quarter / eighth / sixteenth");
  ok(hands(gridFor("Single Strokes", "R", "beginner")) === "RLRL" && hands(gridFor("Single Paradiddle", "L", "developing")) === "LRLLRLRR", "Same sticking at every difficulty; starting hand still reverses");
  ok(per("Single Paradiddle", "beginner") === 1 && per("Triple Paradiddle", "beginner") === 1 && per("Triple Paradiddle", "developing") === 2, "Paradiddles simplify; an eighth-note rudiment stays eighths on Developing");
  ok(per("Flam", "beginner") === 1 && per("Drag", "developing") === 1, "Quarter-note flam and drag are already the simplest (unchanged)");
  const dp = gridFor("Drag Paradiddle #1", "R", "beginner"), dps = gridFor("Drag Paradiddle #1");
  ok(dp.perBeat === 1 && hands(dp) === hands(dps) && dp.slots.every((x, i) => (x ? x.graces.join() : "") === (dps.slots[i] ? dps.slots[i].graces.join() : "") && (x ? x.accent : false) === (dps.slots[i] ? dps.slots[i].accent : false)), "Simplifying keeps strokes, rests, grace notes and accents exactly; only the note value changes");
  const stay = ["Double Paradiddle", "Paradiddle-Diddle", "Flam Accent", "Single Strokes Four", "Single Strokes Seven", "Swiss Army Triplet", "Triple Stroke Roll", "Ratamacue", "Double Ratamacue", "Triple Ratamacue", "Double Drag Tap", "Flam Paradiddle-diddle", "5 Stroke Roll", "9 Stroke Roll", "17 Stroke Roll", "Single Dragadiddle"];
  ok(stay.every((n) => per(n, "beginner") === RUDIMENT_RHYTHMS[n].perBeat && per(n, "developing") === RUDIMENT_RHYTHMS[n].perBeat && !effectiveRhythm(n, "beginner").simplified), "Triplet-based rudiments, rolls and Single Dragadiddle keep their standard arrangement on every difficulty");
  ok(Object.keys(RUDIMENT_RHYTHMS).every((n) => hands(gridFor(n, "R", "standard")) === hands(parseGrid(RUDIMENT_RHYTHMS[n].perBeat, RUDIMENT_RHYTHMS[n].pattern)) || !gridFor(n)), "Standard difficulty returns the original arrangement unchanged");
  ok(Object.keys(RUDIMENT_RHYTHMS).every((n) => ["beginner", "developing"].every((d) => { const e = effectiveRhythm(n, d); return e.perBeat <= RUDIMENT_RHYTHMS[n].perBeat && allowedClicks(e.perBeat).includes(e.perBeat); })), "Easier difficulties never raise the subdivision, and the click choices always match the arrangement");
  console.log("Simplified on Beginner:", Object.keys(RUDIMENT_RHYTHMS).filter((n) => effectiveRhythm(n, "beginner").simplified).length, "| on Developing:", Object.keys(RUDIMENT_RHYTHMS).filter((n) => effectiveRhythm(n, "developing").simplified).length, "| deliberately not simplified:", Object.keys(RUDIMENT_RHYTHMS).filter((n) => !effectiveRhythm(n, "beginner").simplified && RUDIMENT_RHYTHMS[n].perBeat > 1).join(", "));
}
ok(["Ratamacue", "Single Ratamacue"].every((n) => gridFor(n).perBeat === 3 && hands(gridFor(n)) === "RLRL--"), "Ratamacue and Single Ratamacue: half time, eighth-note triplets then a held quarter");
// Clicks per beat: defaults and compatible choices
ok(allowedClicks(4).join() === "4,2,1", "16th grid offers 4, 2, 1 clicks per beat (never 3)");
ok(allowedClicks(3).join() === "3,1", "Triplet grid offers 3, 1 (never 2 or 4)");
ok(allowedClicks(2).join() === "2,1" && allowedClicks(1).join() === "1", "8th offers 2, 1; quarter is fixed at 1");
ok(allowedClicks(6).join() === "6,3,2,1", "Finer grid (sextuplet) offers only its divisions");
const dflt = (n) => RUDIMENT_RHYTHMS[n].perBeat;
ok(dflt("Flam") === 1 && dflt("Drag") === 1, "Quarter-note rudiments default to 1 click per beat");
ok(dflt("Triple Paradiddle") === 2 && dflt("Flam Tap") === 2, "Eighth-note rudiments default to 2");
ok(dflt("Double Paradiddle") === 3 && dflt("Paradiddle-Diddle") === 3, "Triplet rudiments default to 3");
ok(["Single Strokes Seven", "Swiss Army Triplet", "Triple Stroke Roll"].every((n) => dflt(n) === 6 && RUDIMENT_RHYTHMS[n].clicks === undefined), "Sixteenth-triplet rudiments default to 6 clicks per beat");
ok(RUDIMENT_RHYTHMS["Lesson 25"].perBeat === 2 && RUDIMENT_RHYTHMS["Lesson 25"].clicks === undefined, "Lesson 25 is an eighth-note grid: 2 clicks per beat by default");
ok(dflt("Single Strokes") === 4 && dflt("Single Paradiddle") === 4, "Sixteenth-note rudiments default to 4");
ok(Object.keys(RUDIMENT_RHYTHMS).every((n) => gridFor(n) !== null), "Every rudiment now has a guide");
{
  const strokes = (n) => gridFor(n).slots.filter(Boolean).length, show = (n) => hands(gridFor(n));
  ok(show("Single Strokes Four") === "RLRL--" && gridFor("Single Strokes Four").perBeat === 3, "Single Stroke Four (half time): triplet R L R, then L as a quarter (6 slots at 3 per beat = 2 beats)");
  ok(show("Single Strokes Seven") === "RLRLRLR-----" && gridFor("Single Strokes Seven").perBeat === 6, "Single Stroke Seven: six sixteenth-triplets then R as a quarter (12 slots = 2 beats)");
  ok(show("6 Stroke Roll") === "R-LLRRL-" && gridFor("6 Stroke Roll").perBeat === 4, "6 Stroke Roll: eighth, four sixteenths, eighth");
  ok(show("Lesson 25") === "RLR-" && gridFor("Lesson 25").slots[0].graces.join() === "L,L" && gridFor("Lesson 25").perBeat === 2, "Lesson 25: drag, R L R, then an eighth rest (4 slots = 2 beats)");
  ok([["5 Stroke Roll", 5], ["6 Stroke Roll", 6], ["7 Stroke Roll", 7], ["9 Stroke Roll", 9], ["10 Stroke Roll", 10], ["11 Stroke Roll", 11], ["13 Stroke Roll", 13], ["15 Stroke Roll", 15], ["17 Stroke Roll", 17]].every(([n, c]) => strokes(n) === c), "Roll stroke counts match their names (5, 6, 7, 9, 10, 11, 13, 15, 17)");
  ok(strokes("Flamacue") === 5 && show("Flamacue") === "RLRLR---", "Flamacue: 4 sixteenths + flammed quarter, ends on R (old data ended on L)");
  ok(gridFor("Single Dragadiddle").rowStarts.join() === "0,8" && gridFor("Drag Paradiddle #1").rowStarts.length === 2, "Two-sided rudiments keep both rows");
  const allBeatsWhole = Object.keys(RUDIMENT_RHYTHMS).filter((n) => gridFor(n)).filter((n) => gridFor(n).rowStarts.length === 1 && gridFor(n).slots.length % gridFor(n).perBeat !== 0);
  console.log("Cycles that do not fill whole beats:", allBeatsWhole.join(", ") || "none");
}
ok(Object.keys(RUDIMENT_RHYTHMS).length === 40, "All 40 rudiments have a rhythm entry");
ok(Object.entries(RUDIMENT_RHYTHMS).filter(([, r]) => r.status !== "blocked").every(([n]) => gridFor(n).slots.length > 0), "Every non-blocked rudiment parses to a grid");

// Timing
const times = (g, clicks, bpm, ticks) => { const q = []; let c = 0; const tick = 60 / bpm / clicks; for (let i = 0; i < ticks; i++) c = enqueueTick(q, c, g, clicks, i * tick, bpm); return q; };
{
  const g = parseGrid(4, "R R L L R - - -");
  for (const clicks of [1, 2, 4]) {
    const q = times(g, clicks, 60, 4 / (4 / clicks)); // one beat's worth of ticks... 
    ok(q.length === 4 && q.every((e, i) => Math.abs(e.time - i * 0.25) < 1e-12), `16th grid at 60 BPM, ${clicks} click(s)/beat: slots 250 ms apart`);
  }
  const q2 = times(g, 4, 60, 10);
  ok(q2[5].index === 5 && !g.slots[5] && Math.abs(q2[5].time - 1.25) < 1e-12 && q2[8].index === 0 && Math.abs(q2[8].time - 2) < 1e-12, "Rest slot keeps its time; loop returns to slot 0 exactly 2 beats later");
  const t = times(parseGrid(3, "R L R"), 3, 90, 3), gap = 60 / 90 / 3;
  ok(t.every((e, i) => Math.abs(e.time - i * gap) < 1e-12), "Triplet grid: three evenly spaced strokes per beat");
  const mixed = times(parseGrid(4, "R - L R"), 2, 120, 2);
  ok(mixed.map((e) => e.index).join() === "0,1,2,3", "Mixed values on a finer grid: every slot scheduled in order, 2 slots per click");
}
// Grace notes: each one is its own event, timed backwards from the main stroke
{
  for (const bpm of [60, 120, 200, 240]) {
    const slot = 60 / bpm;
    const f = times(parseGrid(1, "l R"), 1, bpm, 1);
    ok(f.length === 2 && f[0].grace === 0 && f[1].grace === undefined && Math.abs(f[1].time - f[0].time - 0.045) < 1e-9, `Flam at ${bpm} BPM: grace 45 ms before the main stroke`);
    const d = times(parseGrid(1, "l l R"), 1, bpm, 1);
    ok(d.length === 3 && d[0].grace === 0 && d[1].grace === 1 && d[2].grace === undefined && Math.abs(d[1].time - d[0].time - 0.045) < 1e-9 && Math.abs(d[2].time - d[1].time - 0.045) < 1e-9 && d[0].time < 0, `Drag at ${bpm} BPM: two separate graces 45 ms apart, then the main stroke`);
  }
  const tight = times(parseGrid(4, "l l R L"), 4, 240, 2), slot16 = 60 / 240 / 4;
  ok(tight[0].grace === 0 && tight[1].grace === 1 && (tight[2].time - tight[0].time) <= slot16 * 0.6 + 1e-9, "Drag on fast 16ths: the whole grace group fits inside 60% of a slot");
  const mirrored = reverseGrid(parseGrid(1, "l l R"));
  ok(mirrored.slots[0].hand === "L" && mirrored.slots[0].graces.join() === "R,R", "Mirrored drag: r r L");
  const q = times(parseGrid(2, "l l R L"), 2, 90, 2);
  ok(q.every((e, i) => i === 0 || e.time >= q[i - 1].time), "Grace and main events stay in time order across slots");
  // The highlight walks grace 0 -> grace 1 -> main, never skipping the order
  const w = times(parseGrid(1, "l l R"), 1, 60, 1); w.forEach((e) => (e.time += 1));
  const seen = []; for (let t = 0.9; t < 1.2; t += 0.005) { const h = dueEvent(w, t, 0); if (h) seen.push(h.grace ?? "main"); }
  ok(seen.join() === "0,1,main", "Highlight sequence for a drag: grace 0, grace 1, main");
}
// Long run, BPM changes
{
  const g = parseGrid(3, "R L R L R L R"); const q = []; let c = 0, t = 0, bad = 0;
  for (const [bpm, secs] of [[144, 3600], [200, 600]]) { const end = t + secs; while (t < end) { c = enqueueTick(q, c, g, 3, t, bpm); t += 60 / bpm / 3; } }
  q.forEach((e, i) => { if (e.index !== i % 7 || (i && e.time < q[i - 1].time)) bad++; });
  ok(bad === 0, `70 min, BPM 144 -> 200, 7-slot triplet loop: ${q.length} slots, always in order, index = counter mod 7`);
}
// Highlight clock
{
  const q = times(parseGrid(4, "R L R L"), 4, 60, 4);
  ok(dueEvent(q, -0.01, 0) === null && q.length === 4, "Nothing lit before the first stroke is due");
  ok(dueEvent(q, 0.26, 0).index === 1 && q.length === 2, "At 0.26 s slot 1 is lit");
  ok(dueEvent(q, 0.51, 0.02) === null && dueEvent(q, 0.53, 0.02).index === 2, "Output latency delays the highlight to match what you hear");
  q.length = 0; ok(dueEvent(q, 9, 0) === null, "Cleared queue leaves no stale highlight");
  const q2 = times(parseGrid(4, "R L R L"), 4, 60, 4); ok(dueEvent(q2, 9, 0).index === 3, "After a long pause it jumps to the right slot, no replay");
}
// Layout: rows cut on beat boundaries, balanced, nothing orphaned, every slot shown once and in order
{
  const { layoutRows, fitBox, sideIndex } = await import("../src/app/rudiment-grid.ts");
  let bad = 0; const summary = [];
  for (const width of [310, 250]) for (const name of Object.keys(RUDIMENT_RHYTHMS)) {
    const g = gridFor(name); if (!g) continue;
    const fit = fitBox(g, width, width < 260 ? 28 : 32); const rows = layoutRows(g, width, fit.box, fit.grace, fit.wrapSides);
    if (g.rowStarts.length > 1 && !fit.wrapSides && rows.length !== g.rowStarts.length) { bad++; console.log("side split", name, width); }
    const widest = Math.max(...rows.map((r) => { let w = 0; for (let i = r.start; i < r.end; i++) { w += fit.box + (g.slots[i]?.graces.length ?? 0) * (fit.grace + 2); if (i > r.start) w += sideIndex(g, i) % g.perBeat === 0 ? 6 : 5; } return w; }));
    if (widest > width) { bad++; console.log("overflow", name, width, widest); }
    if (fit.box < 24) { bad++; console.log("tiny", name, width, fit.box); }
    if (fit.wrapSides) console.log("wraps sides:", name, width, rows.map((r) => r.end - r.start).join("+"));
    
    const covered = rows.flatMap((r) => Array.from({ length: r.end - r.start }, (_, k) => r.start + k));
    if (covered.join() !== g.slots.map((_, i) => i).join()) { bad++; console.log("coverage", name); }
    rows.forEach((r) => { if (sideIndex(g, r.start) % g.perBeat !== 0) { bad++; console.log("mid-beat cut", name, width); } });
    const sizes = rows.map((r) => r.end - r.start);
    if (g.rowStarts.length === 1 && rows.length > 1 && Math.max(...sizes) - Math.min(...sizes) > g.perBeat) { bad++; console.log("unbalanced", name, width, sizes.join("/")); }
    if (width === 310) summary.push(`${name}: ${sizes.join("+")}`);
  }
  ok(bad === 0, "Layout: whole beats per row, balanced, complete, in order (310 px and 250 px wide)");
  console.log(summary.filter((x) => x.includes("+")).join(" | "));
}
console.log(fails ? `${fails} FAILED` : "ALL PASSED"); process.exit(fails ? 1 : 0);
