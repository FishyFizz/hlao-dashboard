import type { SessionStatus } from "../components/Status";

export type FleetRow = {
  id: string;
  name: string;
  backend: string;
  status: SessionStatus;
  turn: number;
  queue: number;
  context: number;
  cost: string;
  lastType: string;
  lastTitle: string;
  age: string;
  selected?: boolean;
};

export const fleet: FleetRow[] = [
  {
    id: "9c1e07",
    name: "codex-probe",
    backend: "codex",
    status: "waiting_permission",
    turn: 2,
    queue: 0,
    context: 38,
    cost: "$0.41",
    lastType: "permission.requested",
    lastTitle: "Run shell command",
    age: "18s",
  },
  {
    id: "2d9f6a",
    name: "flaky-test-triage",
    backend: "claude",
    status: "failed",
    turn: 4,
    queue: 0,
    context: 93,
    cost: "$2.07",
    lastType: "session.failed",
    lastTitle: "Adapter exited with code 1",
    age: "9m",
  },
  {
    id: "4f2a9c",
    name: "refactor-auth",
    backend: "claude",
    status: "busy",
    turn: 7,
    queue: 2,
    context: 62,
    cost: "$1.84",
    lastType: "tool.call",
    lastTitle: "Bash · npm test -- auth/refresh",
    age: "2s",
    selected: true,
  },
  {
    id: "b73d11",
    name: "fleet-observer",
    backend: "claude",
    status: "idle",
    turn: 12,
    queue: 0,
    context: 41,
    cost: "$3.12",
    lastType: "agent.message",
    lastTitle: "Fleet is stable; two sessions idle.",
    age: "1m",
  },
  {
    id: "e0a4b8",
    name: "docs-audit",
    backend: "gemini",
    status: "idle",
    turn: 5,
    queue: 1,
    context: 77,
    cost: "$0.96",
    lastType: "plan",
    lastTitle: "Audit the protocol notes",
    age: "4m",
  },
  {
    id: "7c3e52",
    name: "old-runner",
    backend: "codex",
    status: "closed",
    turn: 3,
    queue: 0,
    context: 55,
    cost: "$0.72",
    lastType: "session.closed",
    lastTitle: "Closed by operator",
    age: "14m",
  },
];

export const navGroups = [
  {
    title: "Foundations",
    items: [
      { id: "color", index: "01", label: "Color" },
      { id: "type", index: "02", label: "Typography" },
      { id: "geometry", index: "03", label: "Space & line" },
      { id: "motion", index: "04", label: "Motion" },
    ],
  },
  {
    title: "Primitives",
    items: [
      { id: "buttons", index: "05", label: "Buttons" },
      { id: "fields", index: "06", label: "Fields" },
      { id: "selection", index: "07", label: "Selection" },
      { id: "navigation", index: "08", label: "Navigation" },
      { id: "status", index: "09", label: "Status & tags" },
    ],
  },
  {
    title: "Data",
    items: [
      { id: "table", index: "10", label: "Fleet table" },
      { id: "transcript", index: "11", label: "Transcript" },
      { id: "meters", index: "12", label: "Meters" },
      { id: "lineage", index: "13", label: "Lineage" },
    ],
  },
  {
    title: "Surfaces",
    items: [
      { id: "overlays", index: "14", label: "Overlays" },
      { id: "feedback", index: "15", label: "Feedback" },
      { id: "palette", index: "16", label: "Command palette" },
    ],
  },
  {
    title: "Composition",
    items: [{ id: "console", index: "17", label: "Session console" }],
  },
];
