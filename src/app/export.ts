import { store } from "../store/store";
import type { SessionView } from "../wire/protocol";
import { asWireError } from "../wire/protocol";
import { downloadText } from "./ui";

export async function exportTranscript(session: SessionView): Promise<void> {
  const state = store.getSnapshot();
  try {
    const result = await store.collectTranscript(session.id);
    const payload = {
      instance: state.home,
      exportedAt: new Date().toISOString(),
      session,
      events: result.events,
      count: result.events.length,
      truncated: result.truncated,
      capped: result.capped,
      pages: result.pages,
      replayedEvents: result.events.filter((event) => event.replay === true)
        .length,
      note: result.truncated
        ? "The supervisor reported evicted history; this export is not complete."
        : result.capped
          ? "The export was bounded by the dashboard page cap; this is not complete."
          : result.events.some((event) => event.replay === true)
            ? "Exported from the supervisor's retained event log, including history restored by the provider."
            : "Exported from the supervisor's retained event log.",
    };
    downloadText(
      `${session.id}-transcript.json`,
      JSON.stringify(payload, null, 2),
      "application/json",
    );
    store.addToast({
      tone: result.truncated || result.capped ? "danger" : "ok",
      title: result.truncated || result.capped ? "Partial transcript exported" : "Transcript exported",
      text: `${result.events.length} events${result.truncated ? " · history was already truncated" : ""}${result.capped ? " · page cap reached" : ""}.`,
    });
  } catch (error) {
    store.addToast({
      tone: "danger",
      title: "Export failed",
      text: asWireError(error).message,
    });
  }
}
