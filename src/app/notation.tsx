"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Grid } from "./rudiment-grid";
import { buildNotation, type NoteEvent, type NotationSide } from "./notation-model";

// Draws a rudiment as real notation on a one-line percussion staff, from the same grid the stroke guide uses.
// The note being played (and the grace note being played) lights up in orange.

const STEM = 30;
const PAD = 16;
const GRACE_W = 13;
const BAR_GAP = 16; // extra room reserved before the first note of a new measure, so the bar line has space on both sides
const RX = 6.4;
const RY = 4.7;
const COLOR = "#d8dcd8";
const MUTED = "#4a504b";
const ACTIVE = "#ff6b1a";
const ACCENT = "#ff9b50";

// useLayoutEffect on the phone / browser (no flicker), plain useEffect while rendering on the server.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

type Chunk = { events: number[]; startSlot: number };

// Is this note the first of a new measure (a new bar starts every `bpb` beats)?
function isBarStart(side: NotationSide, ei: number, bpb: number): boolean {
  const e = side.events[ei], prev = ei > 0 ? side.events[ei - 1] : null;
  return !!prev && prev.beat < e.beat && e.beat > 0 && e.beat % bpb === 0;
}
function extraBefore(side: NotationSide, indices: number[], bpb: number): number[] {
  let total = 0;
  return indices.map((i, k) => { total += side.events[i].graces.length * GRACE_W + (k > 0 && isBarStart(side, i, bpb) ? BAR_GAP : 0); return total; });
}
function chunkWidth(side: NotationSide, indices: number[], startSlot: number, unit: number, bpb: number): number {
  const last = side.events[indices[indices.length - 1]];
  const extra = extraBefore(side, indices, bpb);
  return PAD * 2 + 12 + (last.start + last.dur - startSlot) * unit + extra[extra.length - 1];
}
// Rows are cut only between beats, as evenly as possible, using the fewest rows that fit at a readable spacing.
function chunksFor(side: NotationSide, maxWidth: number, minUnit: number, bpb: number): Chunk[] {
  const beats = Array.from(new Set(side.events.map((e) => e.beat))).sort((a, b) => a - b);
  for (let rows = 1; rows <= beats.length; rows++) {
    const base = Math.floor(beats.length / rows), extra = beats.length % rows;
    const chunks: Chunk[] = [];
    let at = 0;
    for (let k = 0; k < rows; k++) {
      const take = base + (k < extra ? 1 : 0);
      const set = new Set(beats.slice(at, at + take));
      const indices = side.events.map((e, i) => (set.has(e.beat) ? i : -1)).filter((i) => i >= 0);
      if (indices.length) chunks.push({ events: indices, startSlot: side.events[indices[0]].start });
      at += take;
    }
    if (rows === beats.length || chunks.every((c) => chunkWidth(side, c.events, c.startSlot, minUnit, bpb) <= maxWidth)) return chunks;
  }
  return [{ events: side.events.map((_, i) => i), startSlot: side.events[0]?.start ?? 0 }];
}

function Head({ x, y, hollow, color, rx = RX, ry = RY }: { x: number; y: number; hollow: boolean; color: string; rx?: number; ry?: number }) {
  return <ellipse cx={x} cy={y} rx={rx} ry={ry} transform={`rotate(-18 ${x} ${y})`} fill={hollow ? "#0b0d0c" : color} stroke={color} strokeWidth={1.6} />;
}

// Everything drawn on the staff (notes, grace notes, stems, brackets, letters) is measured and moved sideways so the drawing sits exactly
// in the middle between the two ends of the staff: the same empty space on the left and on the right, whatever the rudiment.
function CenteredShapes({ width, sig, children }: { width: number; sig: string; children: React.ReactNode }) {
  const ref = useRef<SVGGElement>(null);
  const [dx, setDx] = useState(0);
  useIsoLayoutEffect(() => {
    const g = ref.current;
    if (!g) return;
    try {
      const b = g.getBBox();
      if (b.width <= 0) return;
      const next = width / 2 - (b.x + b.width / 2);
      setDx((cur) => (Math.abs(cur - next) > 0.2 ? next : cur));
    } catch { /* getBBox is unavailable (not rendered yet): keep the layout as drawn */ }
  }, [width, sig]);
  return <g ref={ref} data-dx={dx} transform={`translate(${dx} 0)`}>{children}</g>;
}

function ChunkSvg({ side, chunk, unit, width, scale, beatsPerBar, activeStroke, activeGrace }: { side: NotationSide; chunk: Chunk; unit: number; width: number; scale: number; beatsPerBar: number; activeStroke: number; activeGrace: number }) {
  const idx = chunk.events;
  const extra = extraBefore(side, idx, beatsPerBar);
  // Only leave room above the staff for what is actually drawn there (accents, triplet brackets), so short rows stay compact.
  const hasAccent = idx.some((i) => side.events[i].accent);
  const hasTuplet = side.tuplets.some((t) => t.every((i) => idx.includes(i)));
  const STAFF_Y = STEM + 8 + (hasAccent ? 10 : 0) + (hasTuplet ? 16 : 0);
  const hasArrow = idx.some((i) => side.events[i].arrow);
  const HEIGHT = STAFF_Y + 34 + (hasArrow ? 18 : 0);
  const xOf = (k: number) => PAD + 12 + (side.events[idx[k]].start - chunk.startSlot) * unit + extra[k];
  const pos = new Map<number, number>(); // event index -> x
  idx.forEach((ei, k) => pos.set(ei, xOf(k)));
  const inChunk = (i: number) => pos.has(i);
  const stemX = (i: number) => pos.get(i)! + RX - 0.8;
  const top = STAFF_Y - STEM;
  const isActive = (e: NoteEvent) => activeStroke >= e.start && activeStroke < e.start + e.dur && activeGrace < 0;
  const beamed = new Set<number>();
  side.beamGroups.forEach((g) => { if (g.length > 1 && g.every(inChunk)) g.forEach((i) => beamed.add(i)); });
  const shapes: React.ReactNode[] = [];
  // Bar lines: a new measure starts every `beatsPerBar` beats (the metronome's Beats / bar), counted from the start of the rudiment.
  idx.forEach((ei, k) => {
    const e = side.events[ei];
    if (k > 0 && isBarStart(side, ei, beatsPerBar)) {
      // exactly halfway between the right edge of the last note of the old bar and the left edge (grace notes included) of the first of the new one
      const prevRight = pos.get(ei - 1)! + RX + 3;
      const nextLeft = pos.get(ei)! - e.graces.length * GRACE_W - RX - 2;
      const bx = (prevRight + nextLeft) / 2;
      shapes.push(<line key={`bar${ei}`} x1={bx} y1={STAFF_Y - 13} x2={bx} y2={STAFF_Y + 13} stroke={COLOR} strokeWidth={1.6} />);
    }
  });

  // beams: level k joins every run of notes that have at least k beams; a lone note gets a short stub
  side.beamGroups.filter((g) => g.length > 1 && g.every(inChunk)).forEach((g, gi) => {
    for (let level = 1; level <= 3; level++) {
      let r = 0;
      while (r < g.length) {
        if (side.events[g[r]].beams < level) { r++; continue; }
        let q = r;
        while (q + 1 < g.length && side.events[g[q + 1]].beams >= level) q++;
        const y = top + (level - 1) * 6;
        let x1 = stemX(g[r]), x2 = stemX(g[q]);
        if (q === r) { if (r > 0) x1 -= 9; else x2 += 9; }
        shapes.push(<rect key={`b${gi}-${level}-${r}`} x={x1} y={y} width={x2 - x1 + 1.6} height={3.6} fill={COLOR} />);
        r = q + 1;
      }
    }
  });

  idx.forEach((ei) => {
    const e = side.events[ei];
    const x = pos.get(ei)!;
    const active = isActive(e);
    const c = active ? ACTIVE : COLOR;
    if (e.rest) {
      const y = STAFF_Y;
      const stroke = { stroke: c, fill: "none", strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
      if (e.base === "whole") shapes.push(<rect key={`r${ei}`} x={x - 7} y={y} width={14} height={5} fill={c} />);
      else if (e.base === "half") shapes.push(<rect key={`r${ei}`} x={x - 7} y={y - 5} width={14} height={5} fill={c} />);
      else if (e.base === "quarter") shapes.push(<path key={`r${ei}`} d={`M ${x - 2} ${y - 13} L ${x + 3} ${y - 7} L ${x - 2} ${y - 1} L ${x + 3} ${y + 6} Q ${x - 4} ${y + 4} ${x - 1} ${y + 12}`} {...stroke} />);
      else {
        const flags = e.base === "eighth" ? 1 : e.base === "sixteenth" ? 2 : 3;
        for (let f = 0; f < flags; f++) {
          const fy = y - 8 + f * 6;
          shapes.push(<circle key={`rc${ei}-${f}`} cx={x - 3 + f * -1} cy={fy} r={2.3} fill={c} />);
        }
        shapes.push(<line key={`rl${ei}`} x1={x + 3} y1={y - 10} x2={x - 3 - flags} y2={y - 8 + (flags - 1) * 6 + 10} {...stroke} />);
      }
      if (e.dots) shapes.push(<circle key={`rd${ei}`} cx={x + 9} cy={y - 5} r={1.9} fill={c} />);
      return;
    }
    const hollow = e.base === "half" || e.base === "whole";
    shapes.push(<Head key={`h${ei}`} x={x} y={STAFF_Y} hollow={hollow} color={c} />);
    if (e.base !== "whole") shapes.push(<line key={`s${ei}`} x1={stemX(ei)} y1={STAFF_Y - 1} x2={stemX(ei)} y2={top} stroke={c} strokeWidth={1.7} />);
    if (e.beams > 0 && !beamed.has(ei)) {
      for (let level = 0; level < e.beams; level++) shapes.push(<path key={`f${ei}-${level}`} d={`M ${stemX(ei)} ${top + level * 6} c 1 6 10 8 8 18`} fill="none" stroke={c} strokeWidth={2.2} strokeLinecap="round" />);
    }
    if (e.dots) shapes.push(<circle key={`d${ei}`} cx={x + 11} cy={STAFF_Y - 5} r={1.9} fill={c} />);
    if (e.accent) shapes.push(<text key={`a${ei}`} x={x + 1} y={top - 8} textAnchor="middle" fontSize={15} fontWeight={800} fill={active ? ACTIVE : ACCENT} fontFamily="DM Sans, sans-serif">&gt;</text>);
    if (!e.plain) shapes.push(<text key={`t${ei}`} x={x} y={STAFF_Y + 28} textAnchor="middle" fontSize={15} fontWeight={700} fill={active ? ACTIVE : COLOR} fontFamily="DM Sans, sans-serif">{e.hand}</text>);
    if (e.arrow) {
      // down / up stroke arrow under the note (Push Pull)
      const ay = STAFF_Y + (e.plain ? 24 : 36), down = e.arrow === "down";
      shapes.push(<path key={`ar${ei}`} d={down ? `M ${x} ${ay} V ${ay + 13} M ${x - 4} ${ay + 8.5} L ${x} ${ay + 13.5} L ${x + 4} ${ay + 8.5}` : `M ${x} ${ay + 13} V ${ay} M ${x - 4} ${ay + 4.5} L ${x} ${ay - 0.5} L ${x + 4} ${ay + 4.5}`} fill="none" stroke={active ? ACTIVE : ACCENT} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />);
    }
    // grace notes sit just before the main note: one slashed note for a flam, a beamed pair for a drag
    const n = e.graces.length;
    e.graces.forEach((g, j) => {
      const gx = x - 9 - (n - 1 - j) * GRACE_W - 4;
      const on = activeGrace === j && activeStroke === e.start;
      const gc = on ? ACTIVE : COLOR;
      const gTop = STAFF_Y - 22;
      shapes.push(<ellipse key={`gh${ei}-${j}`} cx={gx} cy={STAFF_Y} rx={3.8} ry={2.9} transform={`rotate(-18 ${gx} ${STAFF_Y})`} fill={gc} stroke={gc} strokeWidth={1} />);
      shapes.push(<line key={`gs${ei}-${j}`} x1={gx + 3} y1={STAFF_Y - 1} x2={gx + 3} y2={gTop} stroke={gc} strokeWidth={1.4} />);
      if (n === 1) shapes.push(<line key={`gl${ei}-${j}`} x1={gx - 3} y1={STAFF_Y - 9} x2={gx + 9} y2={STAFF_Y - 17} stroke={gc} strokeWidth={1.3} />);
    });
    if (n >= 2) {
      const first = x - 9 - (n - 1) * GRACE_W - 4 + 3, last = x - 9 - 4 + 3;
      shapes.push(<rect key={`gb1-${ei}`} x={first} y={STAFF_Y - 22} width={last - first + 1.4} height={2.6} fill={COLOR} />);
      shapes.push(<rect key={`gb2-${ei}`} x={first} y={STAFF_Y - 22 + 5} width={last - first + 1.4} height={2.6} fill={COLOR} />);
    }
  });

  // triplet brackets
  side.tuplets.filter((t) => t.every(inChunk)).forEach((t, ti) => {
    const x1 = pos.get(t[0])! - RX, x2 = stemX(t[t.length - 1]) + 2, mid = (x1 + x2) / 2, y = top - (hasAccent ? 20 : 11);
    shapes.push(<path key={`tb${ti}`} d={`M ${x1} ${y + 5} V ${y} H ${mid - 8} M ${mid + 8} ${y} H ${x2} V ${y + 5}`} fill="none" stroke={COLOR} strokeWidth={1.4} />);
    shapes.push(<text key={`tn${ti}`} x={mid} y={y + 5} textAnchor="middle" fontSize={14} fontStyle="italic" fontWeight={700} fill={COLOR} fontFamily="DM Sans, sans-serif">3</text>);
  });

  return <svg className="notation-row" viewBox={`0 0 ${width} ${HEIGHT}`} width={width * scale} height={HEIGHT * scale} role="img" aria-label="Rudiment notation">
    <line x1={PAD / 2} y1={STAFF_Y} x2={width - PAD / 2} y2={STAFF_Y} stroke={MUTED} strokeWidth={1.4} />
    <line x1={PAD / 2} y1={STAFF_Y - 13} x2={PAD / 2} y2={STAFF_Y + 13} stroke={MUTED} strokeWidth={1.6} />
    <line x1={width - PAD / 2} y1={STAFF_Y - 13} x2={width - PAD / 2} y2={STAFF_Y + 13} stroke={MUTED} strokeWidth={1.6} />
    <CenteredShapes width={width} sig={`${idx.join(",")}|${unit}|${width}|${beatsPerBar}`}>{shapes}</CenteredShapes>
  </svg>;
}

export function NotationStaff({ grid, activeStroke, activeGrace, width, beatsPerBar = 4, zoom = 1 }: { grid: Grid; activeStroke: number; activeGrace: number; width: number; beatsPerBar?: number; zoom?: number }) {
  const sides = useMemo(() => buildNotation(grid), [grid]);
  // zoom > 1 (iPad): the drawing is laid out for a narrower width and then shown bigger.
  const maxWidth = Math.max(220, width / zoom);
  const bpb = Math.max(1, beatsPerBar);
  const layout = (availWidth: number) => sides.map((side) => {
    const chunks = chunksFor(side, availWidth, 18, bpb);
    // one common spacing for every row of a side: as wide as the tightest row allows (up to 40 px per slot)
    let unit = 40;
    chunks.forEach((c) => {
      const last = side.events[c.events[c.events.length - 1]];
      const extra = extraBefore(side, c.events, bpb);
      const slots = last.start + last.dur - c.startSlot;
      unit = Math.min(unit, (availWidth - PAD * 2 - 12 - extra[extra.length - 1]) / slots);
    });
    return { side, chunks, unit: Math.max(14, unit) };
  });
  // Patterns that need several rows are drawn a little smaller overall, so the window stays short; the drawing then has more room per row.
  let scale = 1;
  let rows = layout(maxWidth);
  if (rows.reduce((n, r) => n + r.chunks.length, 0) > 1) { scale = rows.length > 1 ? 0.72 : 0.8; rows = layout(maxWidth / scale); }
  // A single line with triplet brackets (e.g. Paradiddle-Diddle) is the tallest single-line drawing: draw it a little smaller.
  else if (rows.length === 1 && rows[0].side.tuplets.length > 0) { scale = 0.85; rows = layout(maxWidth / scale); }
  // Every row (and both sides) is drawn on a staff of the same width, with its notes centred, so rows of different length stay neat.
  const commonWidth = Math.min(maxWidth / scale, Math.ceil(Math.max(...rows.flatMap((r) => r.chunks.map((c) => chunkWidth(r.side, c.events, c.startSlot, r.unit, bpb))))));
  return <div className="notation">
    {rows.map(({ side, chunks, unit }, si) => <div className="notation-side" key={si}>
      {chunks.map((c, ci) => <ChunkSvg key={ci} side={side} chunk={c} unit={unit} scale={scale * zoom} beatsPerBar={bpb} width={commonWidth} activeStroke={activeStroke} activeGrace={activeGrace} />)}
    </div>)}
  </div>;
}
