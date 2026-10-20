import { useSyncExternalStore } from "react";
import { store, type DashboardState } from "../store/store";

export function useDashboard(): DashboardState {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

let clockNow = Date.now();
let clockTimer: number | null = null;
const clockListeners = new Set<() => void>();

function startClock(): void {
  if (clockTimer !== null) return;
  clockNow = Date.now();
  clockTimer = window.setInterval(() => {
    if (document.visibilityState === "hidden") return;
    clockNow = Date.now();
    for (const listener of clockListeners) listener();
  }, 1_000);
}

function stopClock(): void {
  if (clockTimer === null) return;
  window.clearInterval(clockTimer);
  clockTimer = null;
}

function subscribeClock(listener: () => void): () => void {
  clockListeners.add(listener);
  startClock();
  return () => {
    clockListeners.delete(listener);
    if (clockListeners.size === 0) stopClock();
  };
}

function clockSnapshot(): number {
  return clockNow;
}

/**
 * One clock for every age/timer label. Eight independent one-second
 * intervals caused eight separate render passes; one shared subscription
 * lets React batch them into a single update.
 */
export function useNow(): number {
  return useSyncExternalStore(subscribeClock, clockSnapshot, clockSnapshot);
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    target.isContentEditable
  );
}

export function isMod(event: { metaKey: boolean; ctrlKey: boolean }): boolean {
  return event.metaKey || event.ctrlKey;
}
