import type { Selection } from "../store/store";

export type SessionHash = { id: string; createdAt: string | null };

/** `#/s/<handle>?created=<iso>`; the creation time disambiguates a reused handle. */
export function parseSessionHash(hash: string): SessionHash | null {
  const match = /^#\/s\/([a-z0-9]+)(?:\?created=([^&]+))?$/i.exec(hash);
  if (!match) return null;
  try {
    return {
      id: match[1]!,
      createdAt: match[2] ? decodeURIComponent(match[2]) : null,
    };
  } catch {
    return { id: match[1]!, createdAt: null };
  }
}

export function sessionHash(selection: Selection | null): string {
  return selection
    ? `#/s/${selection.id}?created=${encodeURIComponent(selection.createdAt)}`
    : "#/fleet";
}

/** Replace the address bar without adding a history entry, only when it changed. */
export function replaceLocation(search: string, hash: string): void {
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const next = `${window.location.pathname}${search}${hash}`;
  if (current !== next) window.history.replaceState(null, "", next);
}
