import { describe, expect, it } from "vitest";
import type { SessionView } from "../../wire/protocol";
import { knownPermissionModes } from "./PermissionModeField";

function session(
  backend: string,
  modes: SessionView["modes"],
): SessionView {
  return { backend, modes } as SessionView;
}

describe("known permission modes", () => {
  it("dedupes mode ids across sessions of the selected backend", () => {
    const modes = knownPermissionModes(
      [
        session("claude", {
          currentModeId: "default",
          availableModes: [
            { id: "default", name: "Default" },
            { id: "plan", name: "Plan" },
          ],
        }),
        session("claude", {
          currentModeId: "plan",
          availableModes: [
            { id: "plan", name: "Plan" },
            { id: "acceptEdits", name: "Accept edits" },
          ],
        }),
        session("codex", {
          currentModeId: "agent",
          availableModes: [{ id: "agent", name: "Agent" }],
        }),
        session("claude", null),
      ],
      "claude",
    );

    expect(modes).toEqual([
      { id: "default", name: "Default" },
      { id: "plan", name: "Plan" },
      { id: "acceptEdits", name: "Accept edits" },
    ]);
  });

  it("returns no suggestions when the backend has no live modes", () => {
    expect(knownPermissionModes([session("claude", null)], "claude")).toEqual([]);
  });
});
