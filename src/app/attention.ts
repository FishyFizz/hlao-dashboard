import { useEffect, useRef, useState } from "react";
import {
  attentionKey,
  displayLabel,
  type AttentionItem,
} from "../store/model";
import { store, type DashboardState } from "../store/store";

function attentionTitle(kind: AttentionItem["kind"]): string {
  if (kind === "permission") return "Permission requested";
  if (kind === "failure") return "Session failed";
  return "Error notice";
}

/**
 * One OS notification per attention episode, only while the tab is hidden and
 * the operator has opted in. A resolved episode closes its notification.
 */
export function useAttentionNotifications(
  state: DashboardState,
  attention: AttentionItem[],
): void {
  const previousKeys = useRef<Set<string> | null>(null);
  const liveNotifications = useRef<Map<string, Notification>>(new Map());

  useEffect(() => {
    const keys = new Set(attention.map((item) => attentionKey(item)));
    if (previousKeys.current === null) {
      previousKeys.current = keys;
      return;
    }
    const previous = previousKeys.current;
    for (const [key, notification] of liveNotifications.current) {
      if (!state.notifications || !keys.has(key)) {
        notification.close();
        liveNotifications.current.delete(key);
      }
    }
    previousKeys.current = keys;

    if (
      !state.notifications ||
      !document.hidden ||
      typeof Notification === "undefined" ||
      Notification.permission !== "granted"
    ) {
      return;
    }
    for (const item of attention) {
      const key = attentionKey(item);
      if (previous.has(key) || liveNotifications.current.has(key)) continue;
      try {
        const notification = new Notification(
          `${attentionTitle(item.kind)} · #${item.session.id}`,
          {
            body: `${displayLabel(item.session)} · ${item.reason}`,
            tag: key,
            silent: false,
          },
        );
        notification.onclick = () => {
          window.focus();
          store.selectSession(item.session.id);
          notification.close();
          liveNotifications.current.delete(key);
        };
        liveNotifications.current.set(key, notification);
      } catch {
        // The OS may refuse a notification even after permission was granted.
      }
    }
  }, [attention, state.notifications]);

  useEffect(
    () => () => {
      for (const notification of liveNotifications.current.values()) {
        notification.close();
      }
      liveNotifications.current.clear();
    },
    [],
  );
}

/**
 * The assertive live-region text for newly arrived attention. The initial set
 * is adopted silently so a reload does not read the whole queue aloud.
 */
export function useAttentionAnnouncement(attention: AttentionItem[]): string {
  const [announcement, setAnnouncement] = useState("");
  const announcedKeys = useRef<Set<string> | null>(null);

  useEffect(() => {
    const keys = new Set(attention.map((item) => attentionKey(item)));
    if (announcedKeys.current === null) {
      announcedKeys.current = keys;
      return;
    }
    const fresh = attention.filter(
      (item) => !announcedKeys.current?.has(attentionKey(item)),
    );
    announcedKeys.current = keys;
    if (fresh.length === 0) return;
    const first = fresh[0]!;
    setAnnouncement(
      `${attentionTitle(first.kind)} for ${displayLabel(first.session)}, handle ${first.session.id}. ${first.reason}`,
    );
  }, [attention]);

  return announcement;
}
