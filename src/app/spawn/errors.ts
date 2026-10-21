import { asWireError } from "../../wire/protocol";

export type SpawnFailure = {
  message: string;
  /** Adapter stderr or the raw error details, already stringified. */
  details: string | null;
};

/** Same extraction for every spawn surface: message plus optional stderr. */
export function spawnFailure(cause: unknown): SpawnFailure {
  const wire = asWireError(cause);
  let details: string | null = null;
  if (wire.details !== undefined) {
    const payload = wire.details;
    const stderr =
      payload && typeof payload === "object" && "stderr" in payload
        ? String((payload as { stderr: unknown }).stderr)
        : null;
    details = stderr ?? JSON.stringify(payload, null, 2) ?? String(payload);
  }
  return { message: wire.message, details };
}
