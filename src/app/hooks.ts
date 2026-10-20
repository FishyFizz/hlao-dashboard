import { useEffect, useState, useSyncExternalStore } from "react";
import { store, type DashboardState } from "../store/store";

export function useDashboard(): DashboardState {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

export function useNow(intervalMs = 1_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
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
