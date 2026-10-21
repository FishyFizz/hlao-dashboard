import { useEffect, useRef, useState } from "react";
import { Copy, Terminal } from "lucide-react";
import { IconButton } from "../../components/Button";
import type { RenderItem, ToolPayload } from "../../store/model";
import { store } from "../../store/store";
import { asWireError } from "../../wire/protocol";
import { copyWithToast, safeText } from "../ui";
import { EventFrame } from "./eventFrame";

export function ToolRow({
  item,
  sessionId,
  focused,
}: {
  item: Extract<RenderItem, { kind: "tool" }>;
  sessionId: string;
  focused: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [peek, setPeek] = useState<ToolPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attemptedThrough = useRef(-1);
  const tone =
    item.status === "completed" || item.status === "ok"
      ? "ok"
      : item.status === "failed" || item.status === "error"
        ? "danger"
        : "warn";
  const firstSeq = item.events[0]?.seq ?? item.seq;
  const lastSeq = item.events[item.events.length - 1]?.seq ?? item.seq;
  // Live events and ordinary pages redact `rawInput`/`rawOutput`/`content`.
  // Inspect the call with `raw: true` only after the operator opens the row.
  const input = peek ? peek.input : item.input;
  const output = peek ? peek.output : item.output;
  const title = peek?.title || item.title;
  const payload = [input, output].filter(Boolean).join("\n\n");

  useEffect(() => {
    if (!open || attemptedThrough.current >= lastSeq) return;
    attemptedThrough.current = lastSeq;
    let cancelled = false;
    setLoading(true);
    setError(null);
    store
      .loadToolPayload(sessionId, item.id, firstSeq, lastSeq)
      .then((result) => {
        if (!cancelled) setPeek(result);
      })
      .catch((cause) => {
        if (!cancelled) setError(asWireError(cause).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, sessionId, item.id, firstSeq, lastSeq]);

  // The copy control is always present. A collapsed row may not have the
  // provider payload yet (live pages redact it), so fetch it on demand rather
  // than hiding the action until the row is opened.
  const copyPayload = async () => {
    let text = payload;
    if (!text) {
      attemptedThrough.current = lastSeq;
      setLoading(true);
      setError(null);
      try {
        const result = await store.loadToolPayload(
          sessionId,
          item.id,
          firstSeq,
          lastSeq,
        );
        setPeek(result);
        text = [result.input, result.output].filter(Boolean).join("\n\n");
      } catch (cause) {
        attemptedThrough.current = -1;
        const message = asWireError(cause).message;
        setError(message);
        store.addToast({
          tone: "danger",
          title: "Could not read the provider payload",
          text: message,
        });
        return;
      } finally {
        setLoading(false);
      }
    }
    if (!text) {
      store.addToast({
        tone: "info",
        title: "No provider payload",
        text: "This call reported no input or output to copy.",
      });
      return;
    }
    await copyWithToast(text, "tool payload");
  };

  return (
    <EventFrame
      seq={item.seq}
      at={item.at}
      className={focused ? "event--focus" : undefined}
    >
      <div className="tool">
        <div className="tool__head-wrap">
          <button
            type="button"
            className="tool__head"
            aria-expanded={open}
            title={open ? "Hide provider payload" : "Show provider payload"}
            onClick={() => {
              const next = !open;
              setOpen(next);
              // A closed row retries on the next open, e.g. after a failed read.
              if (!next) attemptedThrough.current = -1;
            }}
          >
            <Terminal className="icon" />
            <span className="tool__name">{item.name}</span>
            <span className="tool__title">{title || item.id}</span>
            {item.turn !== null ? (
              <span className="tool__turn">turn {item.turn}</span>
            ) : null}
            <span className={`tool__status tool__status--${tone}`}>{item.status}</span>
          </button>
          <IconButton
            className="tool__copy"
            aria-label="Copy tool payload"
            title="Copy provider payload"
            onPress={() => void copyPayload()}
          >
            <Copy className="icon" />
          </IconButton>
        </div>
        {open ? (
          <div className="tool__body">
            {loading && !payload ? (
              <p className="event__text event__text--muted">Reading provider payload…</p>
            ) : null}
            {error ? (
              <p className="event__text event__text--danger">{error}</p>
            ) : null}
            {input ? (
              <>
                <span className="tool__prompt">input · raw provider data</span>
                <pre className="event__pre">{safeText(input)}</pre>
              </>
            ) : null}
            {output ? (
              <>
                <span className="tool__prompt">output · raw provider data</span>
                <pre className="event__pre">{safeText(output)}</pre>
              </>
            ) : null}
            {!loading && !error && !input && !output ? (
              <p className="event__text event__text--muted">No provider payload reported.</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </EventFrame>
  );
}
