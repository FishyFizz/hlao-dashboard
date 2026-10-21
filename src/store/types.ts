import type { ConnectionStatus } from "../wire/transport";
import type {
  EventView,
  HelloResult,
  LastCrash,
  QueueResult,
  RecoveryReceiptView,
  SessionView,
  WireError,
} from "../wire/protocol";
import type { InstanceLocalState, Theme } from "./persistence";
import type { NoticeRecord } from "./model";

export type Phase = "boot" | "connecting" | "setup" | "live";
export type Mode = "bridge" | "demo";

export type Selection = { id: string; createdAt: string };

export type Gap = { from: number; to: number };

export type SessionEventsState = {
  events: EventView[];
  earliestRetainedSeq: number;
  lastSeq: number;
  nextBefore: number | null;
  hasMoreOlder: boolean;
  truncated: boolean;
  viewCapped: boolean;
  loading: boolean;
  loadingOlder: boolean;
  loaded: boolean;
  gap: Gap | null;
};

export type ToastTone = "info" | "ok" | "danger";

export type Toast = {
  id: string;
  tone: ToastTone;
  title: string;
  text?: string;
};

export type RestartNotice = {
  at: string;
  previousPid: number;
  previousStartedAt: string;
  nextPid: number;
  nextStartedAt: string;
};

export type DashboardState = {
  phase: Phase;
  mode: Mode | null;
  connection: ConnectionStatus;
  home: string;
  instance: HelloResult | null;
  connectError: WireError | null;
  lastUpdatedAt: string | null;
  fleetLoaded: boolean;
  /** Historical spawn receipts, live-joined. Empty when unsupported. */
  recovery: RecoveryReceiptView[];
  recoveryLoading: boolean;
  recoveryError: string | null;
  recoveryLoadedAt: string | null;
  sessions: Record<string, SessionView>;
  removedIds: Record<string, true>;
  events: Record<string, SessionEventsState>;
  notices: Record<string, NoticeRecord>;
  selection: Selection | null;
  removed: boolean;
  removedSession: SessionView | null;
  subscription: number | null;
  transportKind: "stream" | "poll" | null;
  queue: QueueResult | null;
  queueLoading: boolean;
  followTail: Record<string, boolean>;
  focus: { sessionId: string; seq: number } | null;
  local: InstanceLocalState;
  pending: Record<string, boolean>;
  actionError: Record<string, string>;
  toasts: Toast[];
  crashNotice: LastCrash | null;
  restartNotice: RestartNotice | null;
  theme: Theme;
  notifications: boolean;
  introSeen: boolean;
};

export type SearchScope = "session" | "instance";
export type SearchOptions = {
  query: string;
  scope: SearchScope;
  includeClosed: boolean;
  raw: boolean;
  regex?: boolean;
};
export type SearchHit = {
  session: SessionView;
  event: EventView;
  snippet: string;
};
export type SearchOutcome = {
  hits: SearchHit[];
  scannedSessions: number;
  totalSessions: number;
  capped: boolean;
  truncated: boolean;
  asOf: string;
  cancelled: boolean;
  errors: string[];
};

export type ExportResult = {
  events: EventView[];
  truncated: boolean;
  capped: boolean;
  pages: number;
};

export type DirectoryListing = {
  path: string;
  parent: string | null;
  entries: Array<{ name: string; path: string }>;
  roots: string[];
};

export const EMPTY_EVENTS: SessionEventsState = {
  events: [],
  earliestRetainedSeq: 1,
  lastSeq: 0,
  nextBefore: null,
  hasMoreOlder: false,
  truncated: false,
  viewCapped: false,
  loading: false,
  loadingOlder: false,
  loaded: false,
  gap: null,
};
