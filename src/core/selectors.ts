import type { PlayerState, Section } from "./types";

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
