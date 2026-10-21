import { describe, expect, it } from "vitest";
import type { ProviderSessionView } from "../wire/protocol";
import {
  canForkProviderRow,
  canResumeProviderRow,
  matchesProviderQuery,
} from "./providerSessions";

function row(overrides: Partial<ProviderSessionView> = {}): ProviderSessionView {
  return {
    sessionId: "provider-abc",
    cwd: "/work/hlao",
    title: "Refactor the spawn flow",
    updatedAt: "2026-10-21T10:00:00.000Z",
    attached: false,
    hlaoSessionId: null,
    hlaoName: null,
    hlaoStatus: null,
    loadable: true,
    forkable: true,
    ...overrides,
  };
}

describe("provider session search", () => {
  it("matches the id, title, cwd, and live attachment fields", () => {
    const subject = row({
      attached: true,
      hlaoSessionId: "3f2a1b",
      hlaoName: "builder",
    });
    expect(matchesProviderQuery(subject, "")).toBe(true);
    expect(matchesProviderQuery(subject, "refactor")).toBe(true);
    expect(matchesProviderQuery(subject, "PROVIDER-ABC")).toBe(true);
    expect(matchesProviderQuery(subject, "hlao")).toBe(true);
    expect(matchesProviderQuery(subject, "builder")).toBe(true);
    expect(matchesProviderQuery(subject, "3f2a")).toBe(true);
    expect(matchesProviderQuery(subject, "missing")).toBe(false);
  });

  it("ignores surrounding whitespace", () => {
    expect(matchesProviderQuery(row(), "  spawn flow  ")).toBe(true);
  });
});

describe("provider row actions", () => {
  it("derives both buttons from the adapter's own flags", () => {
    expect(canResumeProviderRow(row())).toBe(true);
    expect(canForkProviderRow(row())).toBe(true);
    expect(canResumeProviderRow(row({ loadable: false }))).toBe(false);
    expect(canForkProviderRow(row({ forkable: false }))).toBe(false);
  });
});
