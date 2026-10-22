import { describe, expect, it } from "vitest";
import { signInToBridge } from "./transport";

function fetcherReturning(status: number): typeof fetch {
  return (async () => new Response("{}", { status })) as unknown as typeof fetch;
}

describe("signInToBridge", () => {
  it("posts the token once and returns null on success", async () => {
    let seen: RequestInit | undefined;
    const fetcher = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      seen = init;
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    await expect(signInToBridge("super-secret-token", fetcher)).resolves.toBeNull();
    expect(String(seen?.body)).toContain("super-secret-token");
    expect(seen?.credentials).toBe("same-origin");
  });

  it("maps a rejected token to bridge_unauthorized", async () => {
    const error = await signInToBridge("super-secret-token", fetcherReturning(401));
    expect(error?.code).toBe("bridge_unauthorized");
  });

  it("maps throttling to too_many_requests", async () => {
    const error = await signInToBridge("super-secret-token", fetcherReturning(429));
    expect(error?.code).toBe("too_many_requests");
  });

  it("maps an unreachable bridge", async () => {
    const fetcher = (async () => {
      throw new Error("connection refused");
    }) as unknown as typeof fetch;
    const error = await signInToBridge("super-secret-token", fetcher);
    expect(error?.code).toBe("bridge_unavailable");
  });

  it("never echoes the token in an error", async () => {
    const error = await signInToBridge("super-secret-token", fetcherReturning(401));
    expect(JSON.stringify(error)).not.toContain("super-secret-token");
  });
});
