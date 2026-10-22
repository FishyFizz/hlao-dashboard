/**
 * Dashboard operator authentication.
 *
 * The operator token is a dashboard credential, separate from the supervisor
 * token. The browser exchanges it once for a signed, HttpOnly session cookie;
 * Node callers may present it as a bearer token. Session cookies are stateless
 * and signed with a key derived from the operator token, so rotating the token
 * invalidates every outstanding cookie.
 */

import {
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const MIN_TOKEN_LENGTH = 16;
export const MAX_TOKEN_LENGTH = 512;
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const SESSION_VERSION = "v1";
const SESSION_SKEW_MS = 60_000;
const HKDF_INFO = "hlao-dashboard-session-v1";
const GENERATED_TOKEN_PATTERN = /^[a-f0-9]{48}$/;

function homeDigest(home) {
  return createHash("sha256").update(home).digest("hex").slice(0, 16);
}

export function tokenFilePath(home) {
  return join(tmpdir(), `hlao-dashboard-${homeDigest(home)}.token`);
}

/**
 * Trim one trailing newline and validate. Tokens are printable ASCII without
 * whitespace so they survive a shell paste and a cookie round trip unchanged.
 */
export function normalizeToken(raw) {
  if (typeof raw !== "string") return null;
  const token = raw.replace(/\r?\n$/, "").trim();
  if (token.length < MIN_TOKEN_LENGTH || token.length > MAX_TOKEN_LENGTH) {
    return null;
  }
  return /^[\x21-\x7e]+$/.test(token) ? token : null;
}

function readTokenFile(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function tokenFromFile(path) {
  const raw = readTokenFile(path);
  if (raw === null) {
    throw new Error(`cannot read token file ${path}`);
  }
  const token = normalizeToken(raw);
  if (!token) {
    throw new Error(
      `token in ${path} must be ${MIN_TOKEN_LENGTH}-${MAX_TOKEN_LENGTH} printable ASCII characters without whitespace`,
    );
  }
  return token;
}

/**
 * Resolve the operator token. An explicit token file wins over the environment,
 * which wins over a per-home generated file. A supplied value that is missing or
 * invalid is fatal: silently generating another token would lock the operator
 * out of the value they thought they had configured.
 */
export function resolveOperatorToken({
  home,
  env = process.env,
  tokenFile = null,
}) {
  const explicitFile = tokenFile || env.HLAO_DASHBOARD_TOKEN_FILE || null;
  if (explicitFile) {
    return { token: tokenFromFile(explicitFile), source: "file", path: explicitFile };
  }
  if (env.HLAO_DASHBOARD_TOKEN !== undefined) {
    const token = normalizeToken(env.HLAO_DASHBOARD_TOKEN);
    if (!token) {
      throw new Error(
        `HLAO_DASHBOARD_TOKEN must be ${MIN_TOKEN_LENGTH}-${MAX_TOKEN_LENGTH} printable ASCII characters without whitespace`,
      );
    }
    return { token, source: "env", path: null };
  }

  const path = tokenFilePath(home);
  const existing = readTokenFile(path);
  if (existing !== null) {
    const token = normalizeToken(existing);
    if (!token) {
      throw new Error(
        `generated token file ${path} is invalid; delete it and restart the bridge`,
      );
    }
    return { token, source: "generated", path };
  }

  const token = randomBytes(24).toString("hex");
  try {
    writeFileSync(path, `${token}\n`, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (error.code === "EEXIST") {
      const raced = readTokenFile(path);
      if (raced !== null && GENERATED_TOKEN_PATTERN.test(raced.trim())) {
        return { token: raced.trim(), source: "generated", path };
      }
    }
    throw new Error(`cannot create token file ${path}: ${error.message}`);
  }
  return { token, source: "generated", path };
}

/** Constant-time comparison; hashing first normalizes unequal lengths. */
export function tokensMatch(expected, candidate) {
  if (typeof expected !== "string" || typeof candidate !== "string") {
    return false;
  }
  const left = createHash("sha256").update(expected).digest();
  const right = createHash("sha256").update(candidate).digest();
  return timingSafeEqual(left, right);
}

/** Cookie signing key. Rotating the operator token rotates this key. */
export function deriveSessionSecret(token, home) {
  const secret = hkdfSync(
    "sha256",
    Buffer.from(token, "utf8"),
    Buffer.from(home, "utf8"),
    Buffer.from(HKDF_INFO, "utf8"),
    32,
  );
  return Buffer.from(secret);
}

/** Per-home cookie name: two homes on different ports must not clobber. */
export function cookieNameFor(home) {
  return `hlao_dash_${homeDigest(home)}`;
}

export function parseCookies(header) {
  const cookies = new Map();
  if (typeof header !== "string" || header.length === 0) return cookies;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    const name = part.slice(0, index).trim();
    if (!name) continue;
    const value = part.slice(index + 1).trim();
    const values = cookies.get(name);
    if (values) values.push(value);
    else cookies.set(name, [value]);
  }
  return cookies;
}

export function signSession(secret, expiresAt) {
  const payload = `${SESSION_VERSION}.${expiresAt}`;
  const signature = createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

export function verifySession(
  secret,
  value,
  { now = Date.now(), ttlMs = SESSION_TTL_MS } = {},
) {
  if (typeof value !== "string") return false;
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  const [version, expiresRaw, signature] = parts;
  if (version !== SESSION_VERSION || !/^\d{1,16}$/.test(expiresRaw)) return false;
  const expires = Number(expiresRaw);
  if (!Number.isSafeInteger(expires)) return false;
  if (expires <= now || expires > now + ttlMs + SESSION_SKEW_MS) return false;
  const expected = createHmac("sha256", secret)
    .update(`${version}.${expiresRaw}`)
    .digest();
  const provided = Buffer.from(signature, "hex");
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(expected, provided);
}

export function sessionCookie(name, value, { maxAgeSeconds, secure = false } = {}) {
  const maxAge = Math.max(0, Math.floor(maxAgeSeconds));
  return `${name}=${value}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

export function clearCookie(name, { secure = false } = {}) {
  return `${name}=; Path=/api; HttpOnly; SameSite=Strict; Max-Age=0${secure ? "; Secure" : ""}`;
}

export function bearerToken(req) {
  const header = req.headers?.authorization;
  if (typeof header !== "string") return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

export function isSecureRequest(req) {
  const proto = req.headers?.["x-forwarded-proto"];
  return typeof proto === "string" && proto.split(",")[0].trim().toLowerCase() === "https";
}

/** Returns how the request proved the operator token, or null. */
export function authenticate(req, { secret, cookieName, token, now = Date.now() }) {
  const bearer = bearerToken(req);
  if (bearer && tokensMatch(token, bearer)) return "bearer";
  const values = parseCookies(req.headers?.cookie).get(cookieName) ?? [];
  for (const value of values) {
    if (verifySession(secret, value, { now })) return "cookie";
  }
  return null;
}

/** Failure-only throttle for the login endpoint, keyed by peer address. */
export function createLoginThrottle({
  maxFailures = 10,
  windowMs = 60_000,
  cooldownMs = 60_000,
  maxEntries = 1000,
  now = Date.now,
} = {}) {
  const records = new Map();

  function prune(time) {
    for (const [key, record] of records) {
      if (record.blockedUntil <= time && time - record.firstAt >= windowMs) {
        records.delete(key);
      }
    }
    while (records.size > maxEntries) {
      const oldest = records.keys().next().value;
      records.delete(oldest);
    }
  }

  function check(key) {
    const time = now();
    prune(time);
    const record = records.get(key);
    if (record && record.blockedUntil > time) {
      return { allowed: false, retryAfterMs: record.blockedUntil - time };
    }
    return { allowed: true, retryAfterMs: 0 };
  }

  function fail(key) {
    const time = now();
    let record = records.get(key);
    if (!record || time - record.firstAt >= windowMs) {
      record = { firstAt: time, failures: 0, blockedUntil: 0 };
      records.set(key, record);
      prune(time);
    }
    record.failures += 1;
    if (record.failures >= maxFailures) {
      record.blockedUntil = time + cooldownMs;
      record.failures = 0;
      record.firstAt = time;
    }
  }

  function succeed(key) {
    records.delete(key);
  }

  return { check, fail, succeed };
}
