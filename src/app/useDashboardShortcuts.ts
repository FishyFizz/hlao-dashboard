import { useEffect } from "react";
import { nextAttentionSession } from "../store/model";
import { attentionItems, store } from "../store/store";
import { isMod, isTypingTarget } from "./hooks";

export type ShortcutOverlays = {
  palette: boolean;
  resume: boolean;
  search: boolean;
  help: boolean;
  details: boolean;
  intro: boolean;
  action: boolean;
  rail: boolean;
  draft: boolean;
};

/**
 * Global keyboard intents. Bindings are local; every action also exists in
 * the command palette. Shortcuts never fire while typing or in a transient
 * widget, and Escape unwinds one layer at a time.
 */
export function useDashboardShortcuts({
  overlays,
  onTogglePalette,
  onSpawn,
  onSearch,
  onHelp,
  onCloseRail,
  onCloseDraft,
}: {
  overlays: ShortcutOverlays;
  onTogglePalette: () => void;
  onSpawn: () => void;
  onSearch: () => void;
  onHelp: () => void;
  onCloseRail: () => void;
  onCloseDraft: () => void;
}): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const typing = isTypingTarget(event.target);
      const inTransientWidget =
        event.target instanceof Element &&
        event.target.closest('[role="menu"], [role="listbox"], [role="dialog"]') !== null;
      const overlayOpen =
        overlays.palette ||
        overlays.resume ||
        overlays.search ||
        overlays.help ||
        overlays.details ||
        overlays.intro ||
        overlays.action;

      if (isMod(event)) {
        const key = event.key.toLowerCase();
        if (key === "k") {
          event.preventDefault();
          onTogglePalette();
          return;
        }
        if (key === "n") {
          event.preventDefault();
          onSpawn();
          return;
        }
        if (key === "f" && event.shiftKey) {
          event.preventDefault();
          onSearch();
          return;
        }
      }

      if (overlayOpen || inTransientWidget) return;

      if (event.key === "Escape" && overlays.rail) {
        event.preventDefault();
        onCloseRail();
        return;
      }

      if (event.key === "?" && !typing) {
        event.preventDefault();
        onHelp();
        return;
      }

      if (event.key === "Escape") {
        if (typing) {
          (event.target as HTMLElement).blur();
          return;
        }
        if (overlays.draft) {
          event.preventDefault();
          onCloseDraft();
          return;
        }
        if (store.getSnapshot().selection) {
          event.preventDefault();
          store.backToFleet();
        }
        return;
      }

      if (typing) return;

      if (event.key === "j" || event.key === "J") {
        event.preventDefault();
        stepAttention(1);
      } else if (event.key === "k" || event.key === "K") {
        event.preventDefault();
        stepAttention(-1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    overlays,
    onTogglePalette,
    onSpawn,
    onSearch,
    onHelp,
    onCloseRail,
    onCloseDraft,
  ]);
}

function stepAttention(direction: 1 | -1): void {
  const snapshot = store.getSnapshot();
  const next = nextAttentionSession(
    attentionItems(snapshot),
    snapshot.selection?.id ?? null,
    direction,
  );
  if (!next) {
    store.addToast({ tone: "info", title: "Nothing needs you" });
    return;
  }
  store.selectSession(next.id);
}
