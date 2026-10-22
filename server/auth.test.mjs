import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  authenticate,
  bearerToken,
  clearCookie,
  cookieNameFor,
  createLoginThrottle,
  deriveSessionSecret,
  isSecureRequest,
  MAX_TOKEN_LENGTH,
  MIN_TOKEN_LENGTH,
  normalizeToken,
  parseCookies,
  resolveOperatorToken,
  sessionCookie,
  signSession,
  SESSION_TTL_MS,
  tokenFilePath,
  tokensMatch,
  verifySession,
} from "./auth.mjs";

const cleanup = [];
const generatedFiles = [];

function tempHome() {
  const root = mkdtempSync(join(tmpdir(), "hlao-auth-test-"));
  cleanup.push(root);
  return join(root, "home");
}

afterEach(() => {
  while (cleanup.length > 0) {
    rmSync(cleanup.pop(), { recursive: true, force: true });
  }
  while (generatedFiles.length > 0) {
    rmSync(generatedFiles.pop(), { force: true });
  }
});

describe("normalizeToken", () => {
  it("accepts printable tokens and trims one trailing newline", () => {
    const token = "a".repeat(MIN_TOKEN_LENGTH);
    expect(normalizeToken(`${token}\n`)).toBe(token);
    expect(normalizeToken("a".repeat(MAX_TOKEN_LENGTH))).toHaveLength(MAX_TOKEN_LENGTH);
  });

  it("rejects short, long, whitespace, and non-string values", () => {
    expect(normalizeToken("a".repeat(MIN_TOKEN_LENGTH - 1))).toBeNull();
    expect(normalizeToken("a".repeat(MAX_TOKEN_LENGTH + 1))).toBeNull();
    expect(normalizeToken("has space inside")).toBeNull();
    expect(normalizeToken("has\ttab")).toBeNull();
    expect(normalizeToken(42)).toBeNull();
    expect(normalizeToken("")).toBeNull();
  });
});

describe("tokensMatch", () => {
  it("compares values without leaking length", () => {
    expect(tokensMatch("secret-token-value", "secret-token-value")).toBe(true);
    expect(tokensMatch("secret-token-value", "secret-token-valuX")).toBe(false);
    expect(tokensMatch("short", "a much longer candidate")).toBe(false);
    expect(tokensMatch("", "")).toBe(true);
    expect(tokensMatch("token", null)).toBe(false);
  });
});

describe("session secret and cookie name", () => {
  it("is deterministic per token and home", () => {
    const a = deriveSessionSecret("token-a", "home-a");
    const b = deriveSessionSecret("token-a", "home-a");
    expect(a.equals(b)).toBe(true);
    expect(deriveSessionSecret("token-b", "home-a").equals(a)).toBe(false);
    expect(deriveSessionSecret("token-a", "home-b").equals(a)).toBe(false);
  });

  it("derives distinct cookie names per home", () => {
    expect(cookieNameFor("home-a")).not.toBe(cookieNameFor("home-b"));
    expect(cookieNameFor("home-a")).toMatch(/^hlao_dash_[a-f0-9]{16}$/);
  });
});

describe("session cookies", () => {
  const secret = deriveSessionSecret("token-a", "home-a");

  it("round-trips a signed expiry", () => {
    const now = 1_700_000_000_000;
    const value = signSession(secret, now + 1000);
    expect(verifySession(secret, value, { now })).toBe(true);
  });

  it("rejects tampered signatures and expiries", () => {
    const now = 1_700_000_000_000;
    const value = signSession(secret, now + 1000);
    const [version, expires, signature] = value.split(".");
    expect(verifySession(secret, `${version}.${expires}.${"0".repeat(64)}`, { now })).toBe(false);
    expect(verifySession(secret, `${version}.${Number(expires) + 1}.${signature}`, { now })).toBe(false);
    expect(verifySession(deriveSessionSecret("other", "home-a"), value, { now })).toBe(false);
  });

  it("rejects expired, malformed, and over-long sessions", () => {
    const now = 1_700_000_000_000;
    expect(verifySession(secret, signSession(secret, now), { now })).toBe(false);
    expect(verifySession(secret, signSession(secret, now - 1), { now })).toBe(false);
    expect(
      verifySession(secret, signSession(secret, now + SESSION_TTL_MS + 120_000), { now }),
    ).toBe(false);
    expect(verifySession(secret, "", { now })).toBe(false);
    expect(verifySession(secret, "v1", { now })).toBe(false);
    expect(verifySession(secret, "v1.x.y", { now })).toBe(false);
    expect(verifySession(secret, "v2.1.aa", { now })).toBe(false);
    expect(verifySession(secret, "v1.1.aa.bb", { now })).toBe(false);
  });

  it("serializes the expected attributes", () => {
    const cookie = sessionCookie("hlao", "value", { maxAgeSeconds: 60 });
    expect(cookie).toContain("hlao=value");
    expect(cookie).toContain("Path=/api");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Max-Age=60");
    expect(cookie).not.toContain("Secure");
    expect(sessionCookie("hlao", "v", { maxAgeSeconds: 1, secure: true })).toContain("Secure");
    expect(clearCookie("hlao")).toContain("Max-Age=0");
  });
});

describe("cookie parsing", () => {
  it("handles duplicates, values with equals, and missing input", () => {
    expect(parseCookies(undefined).size).toBe(0);
    const cookies = parseCookies("a=1; b=x=y; a=2 ; empty=");
    expect(cookies.get("a")).toEqual(["1", "2"]);
    expect(cookies.get("b")).toEqual(["x=y"]);
    expect(cookies.get("empty")).toEqual([""]);
  });
});

describe("request credentials", () => {
  const secret = deriveSessionSecret("token-a", "home-a");
  const name = cookieNameFor("home-a");
  const now = 1_700_000_000_000;
  const cookie = sessionCookie(name, signSession(secret, now + 60_000), { maxAgeSeconds: 60 });

  it("reads bearer tokens", () => {
    expect(bearerToken({ headers: { authorization: "Bearer abc" } })).toBe("abc");
    expect(bearerToken({ headers: { authorization: "basic abc" } })).toBeNull();
    expect(bearerToken({ headers: {} })).toBeNull();
  });

  it("accepts bearer and cookie credentials", () => {
    const base = { secret, cookieName: name, token: "token-a", now };
    expect(authenticate({ headers: { authorization: "Bearer token-a" } }, base)).toBe("bearer");
    expect(authenticate({ headers: { cookie } }, base)).toBe("cookie");
    expect(authenticate({ headers: { cookie: `${name}=bogus` } }, base)).toBeNull();
    expect(authenticate({ headers: {} }, base)).toBeNull();
  });

  it("accepts one of several same-named cookies", () => {
    const headers = { cookie: `${name}=bogus; ${name}=${cookie.split("=")[1]}` };
    expect(authenticate({ headers }, { secret, cookieName: name, token: "token-a", now })).toBe("cookie");
  });

  it("detects forwarded TLS", () => {
    expect(isSecureRequest({ headers: { "x-forwarded-proto": "https" } })).toBe(true);
    expect(isSecureRequest({ headers: { "x-forwarded-proto": "https,http" } })).toBe(true);
    expect(isSecureRequest({ headers: {} })).toBe(false);
  });
});

describe("resolveOperatorToken", () => {
  it("prefers an explicit token file over the environment", () => {
    const root = mkdtempSync(join(tmpdir(), "hlao-token-file-"));
    cleanup.push(root);
    const path = join(root, "token");
    writeFileSync(path, "file-token-value-1234\n");
    const resolved = resolveOperatorToken({
      home: tempHome(),
      env: { HLAO_DASHBOARD_TOKEN: "env-token-value-12345" },
      tokenFile: path,
    });
    expect(resolved).toEqual({
      token: "file-token-value-1234",
      source: "file",
      path,
    });
  });

  it("uses the environment when no file is supplied", () => {
    const resolved = resolveOperatorToken({
      home: tempHome(),
      env: { HLAO_DASHBOARD_TOKEN: "env-token-value-12345" },
    });
    expect(resolved.source).toBe("env");
    expect(resolved.token).toBe("env-token-value-12345");
  });

  it("fails rather than falling back when an explicit value is invalid", () => {
    expect(() =>
      resolveOperatorToken({
        home: tempHome(),
        env: { HLAO_DASHBOARD_TOKEN: "short" },
      }),
    ).toThrow(/HLAO_DASHBOARD_TOKEN/);
    expect(() =>
      resolveOperatorToken({ home: tempHome(), env: {}, tokenFile: join(tmpdir(), "nope") }),
    ).toThrow(/cannot read token file/);
  });

  it("generates and reuses a per-home token file", () => {
    const home = tempHome();
    const path = tokenFilePath(home);
    generatedFiles.push(path);

    const first = resolveOperatorToken({ home, env: {} });
    expect(first.source).toBe("generated");
    expect(first.path).toBe(path);
    expect(first.token).toMatch(/^[a-f0-9]{48}$/);
    expect(readFileSync(path, "utf8").trim()).toBe(first.token);

    const second = resolveOperatorToken({ home, env: {} });
    expect(second.token).toBe(first.token);
  });
});

describe("login throttle", () => {
  it("blocks after the failure limit and recovers after the cooldown", () => {
    let clock = 1_000;
    const throttle = createLoginThrottle({
      maxFailures: 3,
      windowMs: 1000,
      cooldownMs: 500,
      now: () => clock,
    });

    expect(throttle.check("peer").allowed).toBe(true);
    throttle.fail("peer");
    throttle.fail("peer");
    expect(throttle.check("peer").allowed).toBe(true);
    throttle.fail("peer");
    const blocked = throttle.check("peer");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBe(500);

    clock += 600;
    expect(throttle.check("peer").allowed).toBe(true);
  });

  it("keeps peers independent and resets on success", () => {
    let clock = 1_000;
    const throttle = createLoginThrottle({ maxFailures: 2, now: () => clock });
    throttle.fail("a");
    throttle.fail("b");
    expect(throttle.check("a").allowed).toBe(true);
    throttle.fail("a");
    expect(throttle.check("a").allowed).toBe(false);
    expect(throttle.check("b").allowed).toBe(true);
    throttle.succeed("a");
    expect(throttle.check("a").allowed).toBe(true);
  });

  it("prunes stale entries", () => {
    let clock = 0;
    const throttle = createLoginThrottle({ maxEntries: 2, now: () => clock });
    throttle.fail("a");
    throttle.fail("b");
    throttle.fail("c");
    clock += 120_000;
    expect(throttle.check("missing").allowed).toBe(true);
  });
});
