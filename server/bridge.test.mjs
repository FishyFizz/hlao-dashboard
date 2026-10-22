import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBridgeServer } from "./bridge.mjs";
import { cookieNameFor, deriveSessionSecret } from "./auth.mjs";

const HOME = "/tmp/hlao-bridge-test-home";
const TOKEN = "operator-token-for-tests";
const UI_KEY = "a".repeat(48);

function fakeSupervisor() {
  return {
    status: () => ({
      home: HOME,
      connected: true,
      pid: 4242,
      version: "0.16.0",
      startedAt: "2026-10-22T00:00:00.000Z",
    }),
    retry: async () => undefined,
    request: async (method, params) => ({ method, params }),
    addSubscriber: () => undefined,
    removeSubscriber: () => undefined,
    teardown: () => undefined,
  };
}

let server;
let options;

beforeEach(async () => {
  options = {
    home: HOME,
    host: "127.0.0.1",
    port: 0,
    vitePort: 5173,
    dist: "/tmp/hlao-bridge-test-dist",
    serve: false,
    allowRemote: false,
  };
  server = createBridgeServer({
    options,
    supervisor: fakeSupervisor(),
    uiKey: UI_KEY,
    auth: {
      token: TOKEN,
      secret: deriveSessionSecret(TOKEN, HOME),
      cookieName: cookieNameFor(HOME),
    },
    loginDelayMs: 0,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  options.port = server.address().port;
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
});

function url(path) {
  return `http://127.0.0.1:${options.port}${path}`;
}

function origin() {
  return `http://127.0.0.1:${options.port}`;
}

async function signIn() {
  const response = await fetch(url("/api/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin() },
    body: JSON.stringify({ token: TOKEN }),
  });
  expect(response.status).toBe(200);
  const cookie = response.headers.get("set-cookie");
  expect(cookie).toBeTruthy();
  return cookie.split(";")[0];
}

describe("authentication gate", () => {
  it("refuses session and health without a credential", async () => {
    expect((await fetch(url("/api/session"))).status).toBe(401);
    expect((await fetch(url("/api/health"))).status).toBe(401);
  });

  it("rejects a bad token", async () => {
    const response = await fetch(url("/api/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin() },
      body: JSON.stringify({ token: "definitely-not-the-token" }),
    });
    expect(response.status).toBe(401);
  });

  it("requires JSON for a body credential", async () => {
    const response = await fetch(url("/api/login"), {
      method: "POST",
      headers: { "Content-Type": "text/plain", Origin: origin() },
      body: JSON.stringify({ token: TOKEN }),
    });
    expect(response.status).toBe(415);
  });

  it("throttles repeated failures", async () => {
    for (let index = 0; index < 10; index += 1) {
      const response = await fetch(url("/api/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: origin() },
        body: JSON.stringify({ token: "wrong-token-value" }),
      });
      expect(response.status).toBe(401);
    }
    const blocked = await fetch(url("/api/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin() },
      body: JSON.stringify({ token: TOKEN }),
    });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();
  });

  it("sets an HttpOnly strict cookie and returns the UI key", async () => {
    const response = await fetch(url("/api/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin() },
      body: JSON.stringify({ token: TOKEN }),
    });
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Path=/api");

    const session = await fetch(url("/api/session"), {
      headers: { Cookie: cookie.split(";")[0] },
    });
    expect(session.status).toBe(200);
    const body = await session.json();
    expect(body.key).toBe(UI_KEY);
    expect(body.home).toBe(HOME);
  });

  it("accepts a bearer token without a cookie", async () => {
    const response = await fetch(url("/api/session"), {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    expect(response.status).toBe(200);
  });

  it("keeps the UI key required on rpc", async () => {
    const cookie = await signIn();
    const withoutKey = await fetch(url("/api/rpc"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
        Origin: origin(),
      },
      body: JSON.stringify({ method: "sessions.list" }),
    });
    expect(withoutKey.status).toBe(401);
  });

  it("forwards an authorized rpc call", async () => {
    const cookie = await signIn();
    const response = await fetch(url("/api/rpc"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
        Origin: origin(),
        "x-hlao-key": UI_KEY,
      },
      body: JSON.stringify({ method: "sessions.list", params: { all: true } }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.result.method).toBe("sessions.list");
  });

  it("rejects a foreign origin before authentication", async () => {
    const response = await fetch(url("/api/session"), {
      headers: { Origin: "http://evil.example" },
    });
    expect(response.status).toBe(403);
  });

  it("accepts an explicitly allowed public origin", async () => {
    options.publicOrigins = ["https://dashboard.example:8795"];
    const allowed = await fetch(url("/api/session"), {
      headers: { Origin: "https://dashboard.example:8795" },
    });
    expect(allowed.status).toBe(401);

    const rejected = await fetch(url("/api/session"), {
      headers: { Origin: "https://dashboard.example:8796" },
    });
    expect(rejected.status).toBe(403);
  });

  it("marks the cookie Secure for a proxied https public origin", async () => {
    options.publicOrigins = ["https://dashboard.example:8795"];
    const response = await fetch(url("/api/login"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://dashboard.example:8795",
        "X-Forwarded-Proto": "https",
      },
      body: JSON.stringify({ token: TOKEN }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("Secure");
  });

  it("requires an allowed origin for cookie state changes", async () => {
    const cookie = await signIn();
    const missing = await fetch(url("/api/rpc"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
        "x-hlao-key": UI_KEY,
      },
      body: JSON.stringify({ method: "sessions.list" }),
    });
    expect(missing.status).toBe(403);

    const bearer = await fetch(url("/api/rpc"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TOKEN}`,
        "x-hlao-key": UI_KEY,
      },
      body: JSON.stringify({ method: "sessions.list" }),
    });
    expect(bearer.status).toBe(200);
  });

  it("clears the cookie on logout", async () => {
    const response = await fetch(url("/api/logout"), {
      method: "POST",
      headers: { Origin: origin() },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
