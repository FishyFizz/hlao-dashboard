import { describe, expect, it } from "vitest";
import { parseSessionHash, sessionHash } from "./routing";

describe("session hash", () => {
  it("parses a handle with and without a creation time", () => {
    expect(parseSessionHash("#/s/4f2a9c")).toEqual({
      id: "4f2a9c",
      createdAt: null,
    });
    expect(
      parseSessionHash("#/s/4f2a9c?created=2026-10-20T10%3A00%3A00.000Z"),
    ).toEqual({
      id: "4f2a9c",
      createdAt: "2026-10-20T10:00:00.000Z",
    });
  });

  it("ignores unrelated locations", () => {
    expect(parseSessionHash("#/fleet")).toBeNull();
    expect(parseSessionHash("")).toBeNull();
    expect(parseSessionHash("#/s/")).toBeNull();
  });

  it("writes a hash that parses back to the same selection", () => {
    const selection = { id: "4f2a9c", createdAt: "2026-10-20T10:00:00.000Z" };
    expect(parseSessionHash(sessionHash(selection))).toEqual(selection);
    expect(sessionHash(null)).toBe("#/fleet");
  });
});
