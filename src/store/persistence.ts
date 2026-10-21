import type { FleetSort } from "./model";

export type Theme = "dark" | "light";

export type DraftRecord = {
  text: string;
  updatedAt: number;
};

export type InstanceFilters = {
  query: string;
  sort: FleetSort;
};

export type InstanceLocalState = {
  selected: { id: string; createdAt: string } | null;
  drafts: Record<string, DraftRecord>;
  lastSeen: Record<string, number>;
  acknowledged: Record<string, string>;
  dismissedNotices: Record<string, number>;
  /** session local key → earliest retained seq whose eviction banner was dismissed */
  dismissedEvictions: Record<string, number>;
  filters: InstanceFilters;
  lastBackend: string | null;
  lastCwd: string | null;
};

export type PersistedState = {
  version: 1;
  theme: Theme;
  notifications: boolean;
  introSeen: boolean;
  instances: Record<string, InstanceLocalState>;
};

const STORAGE_KEY = "hlao-dashboard:state:v1";
const THEME_KEY = "hlao-dashboard-theme";

export function emptyInstanceState(): InstanceLocalState {
  return {
    selected: null,
    drafts: {},
    lastSeen: {},
    acknowledged: {},
    dismissedNotices: {},
    dismissedEvictions: {},
    filters: { query: "", sort: "created" },
    lastBackend: null,
    lastCwd: null,
  };
}

export function emptyPersistedState(): PersistedState {
  return {
    version: 1,
    theme: loadTheme(),
    notifications: false,
    introSeen: false,
    instances: {},
  };
}

export function loadTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    // Local storage can be unavailable in a locked-down local shell.
  }
  return "dark";
}

export function saveTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // The theme still applies for this session.
  }
}

export function loadPersistence(): PersistedState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyPersistedState();
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    if (parsed.version !== 1) return emptyPersistedState();
    return {
      version: 1,
      theme: parsed.theme === "light" ? "light" : loadTheme(),
      notifications: parsed.notifications === true,
      introSeen: parsed.introSeen === true,
      instances: sanitizeInstances(parsed.instances),
    };
  } catch {
    return emptyPersistedState();
  }
}

export function savePersistence(state: PersistedState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    window.localStorage.setItem(THEME_KEY, state.theme);
  } catch {
    // Persistence is best-effort; the live state remains correct.
  }
}

function sanitizeInstances(value: unknown): Record<string, InstanceLocalState> {
  if (!value || typeof value !== "object") return {};
  const result: Record<string, InstanceLocalState> = {};
  for (const [home, candidate] of Object.entries(value as Record<string, unknown>)) {
    if (!candidate || typeof candidate !== "object") continue;
    const source = candidate as Partial<InstanceLocalState>;
    result[home] = {
      selected:
        source.selected &&
        typeof source.selected.id === "string" &&
        typeof source.selected.createdAt === "string"
          ? { id: source.selected.id, createdAt: source.selected.createdAt }
          : null,
      drafts: sanitizeDrafts(source.drafts),
      lastSeen: sanitizeNumbers(source.lastSeen),
      acknowledged: sanitizeStrings(source.acknowledged),
      dismissedNotices: sanitizeNumbers(source.dismissedNotices),
      dismissedEvictions: sanitizeNumbers(source.dismissedEvictions),
      filters: {
        query: typeof source.filters?.query === "string" ? source.filters.query : "",
        sort: sanitizeSort(source.filters?.sort),
      },
      lastBackend:
        typeof source.lastBackend === "string" ? source.lastBackend : null,
      lastCwd: typeof source.lastCwd === "string" ? source.lastCwd : null,
    };
  }
  return result;
}

function sanitizeSort(value: unknown): FleetSort {
  return value === "activity" || value === "name" || value === "created"
    ? value
    : "created";
}

function sanitizeDrafts(value: unknown): Record<string, DraftRecord> {
  if (!value || typeof value !== "object") return {};
  const result: Record<string, DraftRecord> = {};
  for (const [key, candidate] of Object.entries(value as Record<string, unknown>)) {
    if (!candidate || typeof candidate !== "object") continue;
    const draft = candidate as Partial<DraftRecord>;
    if (typeof draft.text !== "string") continue;
    result[key] = {
      text: draft.text,
      updatedAt: typeof draft.updatedAt === "number" ? draft.updatedAt : Date.now(),
    };
  }
  return result;
}

function sanitizeNumbers(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {};
  const result: Record<string, number> = {};
  for (const [key, candidate] of Object.entries(value as Record<string, unknown>)) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) result[key] = candidate;
  }
  return result;
}

function sanitizeStrings(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  const result: Record<string, string> = {};
  for (const [key, candidate] of Object.entries(value as Record<string, unknown>)) {
    if (typeof candidate === "string") result[key] = candidate;
  }
  return result;
}
