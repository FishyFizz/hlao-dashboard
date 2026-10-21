import { useRef, type MutableRefObject } from "react";
import { newId } from "../../lib/id";

export type SpawnAttempt = { signature: string; key: string };

/**
 * Reuse one idempotency key while the submitted parameters are unchanged, so a
 * retry after a transport failure cannot spawn twice. Any edit to the form
 * starts a new attempt.
 */
export function spawnIdempotencyKey(
  attempt: MutableRefObject<SpawnAttempt | null>,
  signature: string,
  supported: boolean,
): string | undefined {
  if (attempt.current?.signature !== signature) {
    attempt.current = { signature, key: newId("spawn") };
  }
  return supported ? attempt.current.key : undefined;
}

export function useSpawnAttempt(): MutableRefObject<SpawnAttempt | null> {
  return useRef<SpawnAttempt | null>(null);
}
