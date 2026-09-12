import type { Section } from "./types";

/**
 * The media's own metadata is the authority on duration; the payload's number
 * is an estimate until the video loads.
 *
 * WordPress stores `duration` as meta, and sections are authored against that
 * number. Neither is re-derived from the file, so a re-encode, a trimmed
 * upload or a hand-edited meta leaves them describing a video that no longer
 * exists. Everything that reads sections — the rail's geometry, the heatmap's
 * cuts, section attribution in analytics — then computes against a timeline
 * the player will never reach, and does it silently.
 *
 * So `loadedmetadata` reconciles: the real duration wins and the sections are
 * cut down to fit it. Nothing is invented to fill what is left over; see
 * `sectionCoverage`.
 */

export interface SectionFit {
  sections: Section[];
  /** What was cut, for the console. Empty when the payload already fitted. */
  adjustments: SectionAdjustment[];
}

export interface SectionAdjustment {
  id: string;
  name: string;
  kind: "dropped" | "truncated";
  /** What the payload asked for. */
  was: { start: number; end: number };
  /** What it became; absent when dropped. */
  now?: { start: number; end: number };
}

/**
 * Cuts sections down to `duration`: the ones starting at or past the end are
 * dropped, the ones overrunning it are truncated. Steps ride along, since a
 * step outside its own section is the same lie one level down.
 *
 * Returns the original array when nothing changed, so callers can skip the
 * state write on the common path.
 */
export function fitSections(
  sections: readonly Section[],
  duration: number,
): SectionFit {
  if (!Number.isFinite(duration) || duration <= 0) {
    return { sections: sections as Section[], adjustments: [] };
  }

  const adjustments: SectionAdjustment[] = [];
  const fitted: Section[] = [];

  for (const section of sections) {
    if (section.start >= duration) {
      adjustments.push({
        id: section.id,
        name: section.name,
        kind: "dropped",
        was: { start: section.start, end: section.end },
      });
      continue;
    }
    if (section.end <= duration) {
      fitted.push(section);
      continue;
    }
    const cut: Section = { ...section, end: duration };
    if (section.steps) cut.steps = fitSteps(section.steps, duration);
    fitted.push(cut);
    adjustments.push({
      id: section.id,
      name: section.name,
      kind: "truncated",
      was: { start: section.start, end: section.end },
      now: { start: cut.start, end: cut.end },
    });
  }

  return {
    sections: adjustments.length === 0 ? (sections as Section[]) : fitted,
    adjustments,
  };
}

function fitSteps(
  steps: NonNullable<Section["steps"]>,
  duration: number,
): NonNullable<Section["steps"]> {
  return steps
    .filter((step) => step.start < duration)
    .map((step) => (step.end > duration ? { ...step, end: duration } : step));
}

/**
 * Cuts a range to `duration`, or drops it when nothing usable is left.
 *
 * Used for both the live loop and one restored from localStorage: a loop saved
 * against a 40-minute cut of a video that was later replaced by a 20-minute one
 * points at time that no longer exists, and `setLoop` would reject it outright.
 */
export function fitRange(
  range: { start: number; end: number } | null,
  duration: number,
  minLength = 0.5,
): { start: number; end: number } | null {
  if (!range) return null;
  if (!Number.isFinite(duration) || duration <= 0) return range;
  if (range.start >= duration) return null;
  if (range.end <= duration) return range;
  const cut = { start: range.start, end: duration };
  return cut.end - cut.start >= minLength ? cut : null;
}

/** Fraction of `duration` covered by sections, 0..1. */
export function sectionCoverage(
  sections: readonly { start: number; end: number }[],
  duration: number,
): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  // merged, so overlapping sections cannot report more than 100% covered
  const ordered = [...sections]
    .map((s) => ({
      start: Math.max(0, Math.min(s.start, duration)),
      end: Math.max(0, Math.min(s.end, duration)),
    }))
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start);

  let covered = 0;
  let cursor = 0;
  for (const s of ordered) {
    const start = Math.max(s.start, cursor);
    if (s.end > start) {
      covered += s.end - start;
      cursor = s.end;
    }
  }
  return Math.min(1, covered / duration);
}

/** The uncovered stretches, for the console and (later) the admin warning. */
export function coverageGaps(
  sections: readonly { start: number; end: number }[],
  duration: number,
  minGap = 0.5,
): { start: number; end: number }[] {
  if (!Number.isFinite(duration) || duration <= 0) return [];
  const ordered = [...sections]
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start);

  const gaps: { start: number; end: number }[] = [];
  let cursor = 0;
  for (const s of ordered) {
    if (s.start - cursor >= minGap) gaps.push({ start: cursor, end: s.start });
    cursor = Math.max(cursor, s.end);
  }
  if (duration - cursor >= minGap) gaps.push({ start: cursor, end: duration });
  return gaps;
}

const t = (n: number) => `${n.toFixed(2)}s`;

/**
 * Reports what was reconciled.
 *
 * Loud on purpose, and `warn` rather than `debug`: nobody watching the video
 * can act on this, but whoever loaded the data can — it means the sections in
 * the admin describe a video that is not the one being served. A silent trim
 * would leave the rail subtly wrong with nothing to explain it.
 */
export function reportSectionFit(
  videoId: number,
  adjustments: readonly SectionAdjustment[],
  payloadDuration: number,
  realDuration: number,
): void {
  if (adjustments.length === 0) return;
  console.warn(
    `[aivp] video ${videoId}: las secciones exceden la duración real del medio ` +
      `(payload ${t(payloadDuration)}, real ${t(realDuration)}). ` +
      `Corrige las secciones en el admin.`,
  );
  for (const a of adjustments) {
    if (a.kind === "dropped") {
      console.warn(
        `[aivp]   descartada "${a.name}" (${a.id}): empieza en ${t(a.was.start)}, ` +
          `después del final ${t(realDuration)}`,
      );
      continue;
    }
    console.warn(
      `[aivp]   recortada "${a.name}" (${a.id}): ${t(a.was.start)}–${t(a.was.end)} ` +
        `→ ${t(a.now!.start)}–${t(a.now!.end)}`,
    );
  }
}

/** Reports uncovered stretches, which break per-section retention. */
export function reportCoverage(
  videoId: number,
  sections: readonly { start: number; end: number }[],
  duration: number,
): void {
  const gaps = coverageGaps(sections, duration);
  if (gaps.length === 0) return;
  const pct = Math.round(sectionCoverage(sections, duration) * 100);
  console.warn(
    `[aivp] video ${videoId}: las secciones cubren ${pct}% de ${t(duration)}. ` +
      `Los heartbeats que caigan en un hueco no se atribuyen a ninguna sección, ` +
      `y la retención por secciones mostrará caídas que son vacíos del modelo.`,
  );
  for (const gap of gaps) {
    console.warn(`[aivp]   hueco ${t(gap.start)}–${t(gap.end)}`);
  }
}
