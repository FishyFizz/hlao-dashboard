import type { SessionView } from "../wire/protocol";
import { asWireError } from "../wire/protocol";
import { store } from "../store/store";

/**
 * The two complete provider-session actions. Resume reattaches to the same
 * provider conversation; fork copies it and leaves the source untouched.
 * Every entry point (lens menu, transcript banner, inspector) uses these so
 * the failure copy and toasts stay identical.
 */
function spawnFromProvider(
  session: SessionView,
  action: "resume" | "fork",
): void {
  const providerId = session.agentSessionId;
  if (providerId === null) return;
  void store
    .spawnSession({
      backend: session.backend,
      cwd: session.cwd,
      ...(action === "resume"
        ? { resumeSessionId: providerId }
        : { forkSessionId: providerId }),
    })
    .catch((cause: unknown) => {
      store.addToast({
        tone: "danger",
        title: action === "resume" ? "Resume failed" : "Fork failed",
        text: asWireError(cause).message,
      });
    });
}

export function resumeProviderSession(session: SessionView): void {
  spawnFromProvider(session, "resume");
}

export function forkProviderSession(session: SessionView): void {
  spawnFromProvider(session, "fork");
}
