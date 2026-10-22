import { describe, expect, it } from "vitest";
import {
  parseSessionHash,
  parseTokenFragment,
  sessionHash,
  stripTokenFragment,
} from "./routing";

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

describe("token fragment", () => {
  it("parses only a token hash and decodes it", () => {
    expect(parseTokenFragment("#token=abc%2Bdef")).toBe("abc+def");
    expect(parseTokenFragment("#token=plain")).toBe("plain");
    expect(parseTokenFragment("#/fleet")).toBeNull();
    expect(parseTokenFragment("#token=")).toBeNull();
    expect(parseTokenFragment("")).toBeNull();
  });

  it("strips the fragment before returning the token", () => {
    let replaced: string | null = null;
    const token = stripTokenFragment(
      { pathname: "/", search: "?demo=0", hash: "#token=abc" },
      {
        replaceState: (_state, _title, next) => {
          replaced = String(next);
        },
      },
    );
    expect(token).toBe("abc");
    expect(replaced).toBe("/?demo=0");
  });

  it("leaves unrelated locations alone", () => {
    let called = false;
    const token = stripTokenFragment(
      { pathname: "/", search: "", hash: "#/fleet" },
      {
        replaceState: () => {
          called = true;
        },
      },
    );
    expect(token).toBeNull();
    expect(called).toBe(false);
  });
});
