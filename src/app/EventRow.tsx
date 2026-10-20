import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Check,
  CircleAlert,
  Info,
  ListTree,
  MessageSquare,
  Shield,
  Terminal,
  TriangleAlert,
} from "lucide-react";
import { Button } from "../components/Button";
import { Handle } from "../components/Status";
import { cn } from "../lib/cn";
import {
  eventActor,
  eventText,
  formatClock,
  formatDateTime,
  formatTokens,
  numberField,
  stringField,
  type RenderItem,
  type ToolPayload,
} from "../store/model";
import { store } from "../store/store";
import { asWireError, type EventView, type SessionView } from "../wire/protocol";
import { CopyButton, safeText } from "./ui";
import { MarkdownText } from "./MarkdownText";

export function EventRow({
  item,
  session,
  focused,
  onOpenSession,
}: {
  item: RenderItem;
  session: SessionView;
  focused: boolean;
  onOpenSession?: (sessionId: string) => void;
}) {
  if (item.kind === "message") {
    return (
      <MessageRow
        item={item}
        session={session}
        focused={focused}
        onOpenSession={onOpenSession}
      />
    );
  }
  if (item.kind === "tool") {
    return <ToolRow item={item} sessionId={session.id} focused={focused} />;
  }
  if (item.kind === "compaction") {
    return <CompactionRow item={item} focused={focused} />;
  }
  if (item.kind === "permission") {
    return <PermissionRow item={item} session={session} />;
  }
  return (
    <SingleEventRow event={item.event} focused={focused} />
  );
}

function Gutter({ seq, at }: { seq: number; at: string }) {
  return (
    <div className="event__gutter">
      <span className="event__seq">{String(seq).padStart(4, "0")}</span>
      <span className="event__time" title={formatDateTime(at)}>
        {formatClock(at)}
      </span>
    </div>
  );
}

/** The shared row shell: anchor, gutter, and body. */
function EventFrame({
  seq,
  at,
  className,
  bodyClassName,
  children,
}: {
  seq: number;
  at: string;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("event", className)} id={`event-${seq}`} data-seq={seq}>
      <Gutter seq={seq} at={at} />
      <div className={cn("event__body", bodyClassName)}>{children}</div>
    </div>
  );
}

function Meta({ children }: { children: ReactNode }) {
  return <div className="event__meta">{children}</div>;
}

function Sep() {
  return <span className="event__sep">/</span>;
}

function TurnMeta({ turn }: { turn: number | null }) {
  if (turn === null) return null;
  return (
    <>
      <Sep />
      <span>turn {turn}</span>
    </>
  );
}

function MessageIdMeta({ data }: { data: Record<string, unknown> }) {
  const messageId = stringField(data, ["messageId"]);
  if (!messageId) return null;
  return (
    <>
      <Sep />
      <span className="ident">{messageId}</span>
    </>
  );
}

function MessageRow({
  item,
  session,
  focused,
  onOpenSession,
}: {
  item: Extract<RenderItem, { kind: "message" }>;
  session: SessionView;
  focused: boolean;
  onOpenSession?: (sessionId: string) => void;
}) {
  const event = item.events[0]!;
  const isThought = item.type === "agent.thought";
  const isUser = item.type === "user.message";
  const isSessionMessage = item.type === "session.message";
  const senderId = stringField(event.data, ["senderSessionId"]);
  const actor = isUser
    ? "provider user message"
    : eventActor(event) ??
      (item.type === "agent.message"
        ? session.agentName ?? session.backend
        : session.backend);
  const text = safeText(item.text);
  return (
    <EventFrame
      seq={item.seq}
      at={item.at}
      className={cn(
        isThought && "event--thought",
        isUser && "event--user",
        isSessionMessage && "event--message",
        focused && "event--focus",
      )}
    >
      <Meta>
        <span className="event__type">{item.type}</span>
        <Sep />
        {isSessionMessage ? (
          <span className="event__role">
            <Handle id={senderId ?? "?"} />
            <span className="event__sep">→</span>
            <Handle id={stringField(event.data, ["recipientSessionId"]) ?? "?"} />
          </span>
        ) : (
          <span className="event__role ident">{actor}</span>
        )}
        <TurnMeta turn={item.turn} />
        <MessageIdMeta data={event.data} />
        <span className="event__meta-spacer" />
        <CopyButton text={text} label="message" className="event__copy" />
      </Meta>
      {isThought ? (
        <details className="event__thought">
          <summary>
            Thought · {text.length.toLocaleString()} characters · secondary
          </summary>
          <MarkdownText
            text={text}
            className="event__text event__text--muted event__markdown"
          />
        </details>
      ) : text ? (
        <MarkdownText text={text} className="event__text event__markdown" />
      ) : (
        <p className="event__text event__text--muted">(empty message)</p>
      )}
      {isSessionMessage && senderId && onOpenSession ? (
        <Button
          size="sm"
          variant="ghost"
          onPress={() => onOpenSession(senderId)}
        >
          <MessageSquare className="btn__icon icon" />
          Open sender
        </Button>
      ) : null}
      {event.data.injected ? (
        <span className="event__injected">
          <Check className="icon" /> Skill pointer injected by the supervisor
        </span>
      ) : null}
    </EventFrame>
  );
}

function PermissionRow({
  item,
  session,
}: {
  item: Extract<RenderItem, { kind: "permission" }>;
  session: SessionView;
}) {
  const resolution = item.resolution;
  const pending =
    !resolution &&
    item.requestId !== null &&
    session.pendingPermission?.requestId === item.requestId;
  const optionId = resolution
    ? stringField(resolution.data, ["optionId"])
    : null;
  const reason = resolution ? stringField(resolution.data, ["reason"]) : null;
  const actor = resolution ? eventActor(resolution) : null;
  const text = resolution
    ? `${item.title} · ${optionId ? `Option ${optionId}` : "Cancelled"}${
        reason ? ` · ${reason}` : ""
      }${actor ? ` · by ${actor}` : ""}`
    : pending
      ? `Waiting in the gate above · ${item.title}`
      : `History · ${item.title}`;
  return (
    <StructuralRow
      seq={item.seq}
      at={item.at}
      type="permission"
      text={text}
      icon={
        resolution ? (
          <Check className="icon" />
        ) : (
          <Shield className="icon" />
        )
      }
    />
  );
}

function ToolRow({
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
            <span className="tool__toggle" aria-hidden="true">
              {open ? "-" : "+"}
            </span>
          </button>
          {payload ? (
            <CopyButton text={payload} label="tool payload" className="event__copy" />
          ) : null}
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

function CompactionRow({
  item,
  focused,
}: {
  item: Extract<RenderItem, { kind: "compaction" }>;
  focused: boolean;
}) {
  const summary = safeText(item.summary);
  return (
    <EventFrame
      seq={item.seq}
      at={item.at}
      className={focused ? "event--focus" : undefined}
    >
      <Meta>
        <span className="event__type">compaction</span>
        <Sep />
        <span>{item.status}</span>
        <TurnMeta turn={item.turn} />
      </Meta>
      <div className="compaction">
        <span className="compaction__label">Provider context compaction · {item.status}</span>
      </div>
      {summary ? (
        <details className="event__inspect" open={item.status !== "completed"}>
          <summary>Provider summary</summary>
          <pre className="event__pre">{summary}</pre>
        </details>
      ) : null}
      {item.error ? <p className="event__text event__text--danger">{item.error}</p> : null}
    </EventFrame>
  );
}

const STRUCTURAL_EVENT_TYPES = new Set([
  "turn.ended",
  "cancel.requested",
  "policy.changed",
  "mode",
  "config",
  "session.renamed",
  "session.info",
  "session.initialized",
]);

function structuralDetail(
  event: EventView,
  text: string,
  actor: string | null,
): string {
  switch (event.type) {
    case "turn.ended":
      return `Turn ended: ${String(event.data.reason ?? "unknown")}`;
    case "policy.changed":
      return `Policy changed to ${String(event.data.permissionPolicy ?? "?")} by ${actor ?? "unknown"}`;
    case "session.renamed":
      return `Renamed to ${String(event.data.name ?? "—")} by ${actor ?? "unknown"}`;
    case "session.info":
      return `Provider title · ${text || "not reported"}`;
    default:
      return text || `${event.type} by ${actor ?? "unknown"}`;
  }
}

function SingleEventRow({
  event,
  focused,
}: {
  event: EventView;
  focused: boolean;
}) {
  const text = safeText(eventText(event));
  const actor = eventActor(event);

  // turn.started is a structural marker; the transcript draws the turn divider.
  if (event.type === "turn.started") return null;

  if (event.type === "prompt.sent" || event.type === "prompt.queued") {
    return (
      <EventFrame
        seq={event.seq}
        at={event.at}
        className={cn("event--user", focused && "event--focus")}
      >
        <Meta>
          <span className="event__type">{event.type}</span>
          <Sep />
          <span className="event__role ident">{actor ?? "operator"}</span>
          {event.type === "prompt.queued" ? (
            <>
              <Sep />
              <span>queued behind the active turn</span>
            </>
          ) : null}
          <MessageIdMeta data={event.data} />
          <span className="event__meta-spacer" />
          <CopyButton text={text} label="prompt" className="event__copy" />
        </Meta>
        <MarkdownText text={text} className="event__text event__markdown" />
        {event.data.injected ? (
          <span className="event__injected">
            <Check className="icon" /> Skill pointer injected by the supervisor
          </span>
        ) : null}
      </EventFrame>
    );
  }

  if (event.type === "prompt.discarded") {
    return (
      <EventFrame
        seq={event.seq}
        at={event.at}
        className={cn("event--error", focused && "event--focus")}
      >
        <Meta>
          <span className="event__type">prompt.discarded</span>
          <Sep />
          <span className="event__role">{actor ?? "unknown"}</span>
          <Sep />
          <span>{String(event.data.reason ?? "discarded")}</span>
        </Meta>
        <MarkdownText
          text={text || "A queued prompt was discarded."}
          className="event__text event__text--muted event__markdown"
        />
      </EventFrame>
    );
  }

  if (event.type === "notice") {
    const severity = event.data.severity === "error" ? "danger" : "warn";
    return (
      <EventFrame
        seq={event.seq}
        at={event.at}
        className={cn("event--notice", focused && "event--focus")}
      >
        <Meta>
          <span className="event__type">notice</span>
          <Sep />
          <span>{String(event.data.severity ?? "info")}</span>
          <TurnMeta turn={event.turn} />
        </Meta>
        <div className={`notice notice--${severity}`}>
          {severity === "danger" ? (
            <TriangleAlert className="icon" />
          ) : (
            <Info className="icon" />
          )}
          <span className="notice__body">
            <span className="notice__title">{text || "Notice"}</span>
          </span>
        </div>
      </EventFrame>
    );
  }

  if (event.type === "error") {
    return (
      <EventFrame
        seq={event.seq}
        at={event.at}
        className={cn("event--error", focused && "event--focus")}
      >
        <Meta>
          <span className="event__type">error</span>
          <Sep />
          <span>diagnostic · does not by itself mark the session failed</span>
        </Meta>
        <p className="event__text event__text--danger">{text || "No message reported"}</p>
      </EventFrame>
    );
  }

  if (event.type === "plan" || event.type === "plan.update") {
    const entries = Array.isArray(event.data.entries) ? event.data.entries.length : null;
    const removed = event.data.removed === true;
    return (
      <StructuralRow
        seq={event.seq}
        at={event.at}
        type={event.type}
        text={
          removed
            ? "Plan removed."
            : entries !== null
              ? `Plan updated · ${entries} entr${entries === 1 ? "y" : "ies"}.`
              : text || "Plan updated."
        }
        icon={<ListTree className="icon" />}
      />
    );
  }

  if (event.type === "usage") {
    const used = numberField(event.data, ["used"]);
    const size = numberField(event.data, ["size"]);
    const cost = event.data.cost as { amount?: number; currency?: string } | null | undefined;
    return (
      <StructuralRow
        seq={event.seq}
        at={event.at}
        type="usage"
        text={`${
          used !== null && size !== null
            ? `Context ${formatTokens(used)} / ${formatTokens(size)}`
            : "Usage reported"
        } · ${
          cost?.amount !== undefined
            ? `${(cost.amount / 100).toFixed(2)} ${cost.currency ?? "USD"} reported`
            : "cost not reported"
        }`}
        icon={<Info className="icon" />}
      />
    );
  }

  if (event.type === "session.created") {
    return (
      <StructuralRow
        seq={event.seq}
        at={event.at}
        type="session.created"
        text={`created by ${actor ?? "unknown"}`}
        icon={<Check className="icon" />}
      />
    );
  }

  if (event.type === "session.failed") {
    const reason = stringField(event.data, ["reason"]) ?? text;
    return (
      <StructuralRow
        seq={event.seq}
        at={event.at}
        type="session.failed"
        text={reason || "Session failed"}
        tone="danger"
        icon={<CircleAlert className="icon" />}
      />
    );
  }

  if (event.type === "session.closed") {
    return (
      <StructuralRow
        seq={event.seq}
        at={event.at}
        type="session.closed"
        text={`by ${actor ?? "unknown"}`}
        icon={<Check className="icon" />}
      />
    );
  }

  if (STRUCTURAL_EVENT_TYPES.has(event.type)) {
    return (
      <StructuralRow
        seq={event.seq}
        at={event.at}
        type={event.type}
        text={structuralDetail(event, text, actor)}
        icon={<Info className="icon" />}
      />
    );
  }

  return (
    <EventFrame
      seq={event.seq}
      at={event.at}
      className={focused ? "event--focus" : undefined}
    >
      <Meta>
        <span className="event__type">{event.type}</span>
        <Sep />
        <span>generic event</span>
        <TurnMeta turn={event.turn} />
        <span className="event__meta-spacer" />
        <CopyButton text={text} label="event text" className="event__copy" />
      </Meta>
      <p className="event__text event__text--pre">{text || `${event.type} (no preview)`}</p>
      <details className="event__inspect">
        <summary>Inspect event data</summary>
        <pre className="event__pre">{JSON.stringify(event.data, null, 2)}</pre>
      </details>
    </EventFrame>
  );
}

function StructuralRow({
  seq,
  at,
  type,
  text,
  icon,
  tone,
}: {
  seq: number;
  at: string;
  type: string;
  text: string;
  icon: ReactNode;
  tone?: "danger";
}) {
  return (
    <EventFrame
      seq={seq}
      at={at}
      className={cn("event--structural", tone === "danger" && "event--error")}
      bodyClassName="event__body--structural"
    >
      <span className="event__structural-icon">{icon}</span>
      <span className="event__type">{type}</span>
      <Sep />
      <span className="event__text event__text--muted">{text}</span>
    </EventFrame>
  );
}
