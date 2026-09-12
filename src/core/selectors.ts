import type { PlayerState, Section } from "./types";
import { coverageGaps, sectionCoverage } from "./duration";

export function selectActiveSection(state: PlayerState): Section | null {
  if (!state.video || !state.activeSectionId) return null;
  return (
    state.video.sections.find((s) => s.id === state.activeSectionId) ?? null
  );
}

export function selectActiveSectionIndex(state: PlayerState): number {
  if (!state.video || !state.activeSectionId) return -1;
  return state.video.sections.findIndex((s) => s.id === state.activeSectionId);
}

export function selectCanGoNext(state: PlayerState): boolean {
  const index = selectActiveSectionIndex(state);
  if (!state.video || index < 0) return false;
  return index < state.video.sections.length - 1;
}

export function selectCanGoPrevious(state: PlayerState): boolean {
  return selectActiveSectionIndex(state) > 0;
}

export function selectHasLoop(state: PlayerState): boolean {
  return state.loop !== null;
}

/**
 * How much of the duration the sections actually describe, 0..1.
 *
 * Nothing guarantees they tile the video, and a hole is not a cosmetic
 * problem: a heartbeat landing in one is attributed to no section at all, so
 * per-section retention reads it as a drop in interest rather than as a gap in
 * the model. Derived, never stored — the sections are the data, this is a
 * measurement of them.
 */
export function selectSectionCoverage(state: PlayerState): number {
  if (!state.video) return 0;
  return sectionCoverage(state.video.sections, state.duration);
}

/** The uncovered stretches behind `selectSectionCoverage`. */
export function selectCoverageGaps(
  state: PlayerState,
): { start: number; end: number }[] {
  if (!state.video) return [];
  return coverageGaps(state.video.sections, state.duration);
}
