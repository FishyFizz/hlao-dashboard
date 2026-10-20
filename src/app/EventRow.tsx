import type { ReactNode } from "react";
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
import {
  eventActor,
  eventText,
  formatTokens,
  numberField,
  stringField,
  type RenderItem,
} from "../store/model";
import type { EventView, SessionView } from "../wire/protocol";
import { formatClock, formatDateTime } from "../store/model";
import { CopyButton, safeText } from "./ui";

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
    return <ToolRow item={item} focused={focused} />;
  }
  if (item.kind === "compaction") {
    return <CompactionRow item={item} focused={focused} />;
  }
  return (
    <SingleEventRow
      event={item.event}
      session={session}
      focused={focused}
      onOpenSession={onOpenSession}
    />
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
  const actor =
    item.type === "user.message"
      ? "provider user message"
      : eventActor(event) ??
        (item.type === "agent.message"
          ? session.agentName ?? session.backend
          : session.backend);
  const text = safeText(item.text);
  const classes = [
    "event",
    isThought ? "event--thought" : "",
    isUser ? "event--user" : "",
    item.type === "session.message" ? "event--message" : "",
    focused ? "event--focus" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={classes} id={`event-${item.seq}`} data-seq={item.seq}>
      <Gutter seq={item.seq} at={item.at} />
      <div className="event__body">
        <div className="event__meta">
          <span className="event__type">{item.type}</span>
          <span className="event__sep">/</span>
          {item.type === "session.message" ? (
            <span className="event__role">
              <Handle id={stringField(event.data, ["senderSessionId"]) ?? "?"} />
              <span className="event__sep">→</span>
              <Handle id={stringField(event.data, ["recipientSessionId"]) ?? "?"} />
            </span>
          ) : (
            <span className="event__role ident">{actor}</span>
          )}
          {item.turn !== null ? (
            <>
              <span className="event__sep">/</span>
              <span>turn {item.turn}</span>
            </>
          ) : null}
          {stringField(event.data, ["messageId"]) ? (
            <>
              <span className="event__sep">/</span>
              <span className="ident">{stringField(event.data, ["messageId"])}</span>
            </>
          ) : null}
          <span className="event__meta-spacer" />
          <CopyButton text={text} label="message" className="event__copy" />
        </div>
        {isThought ? (
          <details className="event__thought">
            <summary>
              Thought · {text.length.toLocaleString()} characters · secondary
            </summary>
            <p className="event__text event__text--pre event__text--muted">{text}</p>
          </details>
        ) : (
          <p className="event__text event__text--pre">{text || "(empty message)"}</p>
        )}
        {item.type === "session.message" &&
        stringField(event.data, ["senderSessionId"]) &&
        onOpenSession ? (
          <Button
            size="sm"
            variant="ghost"
            onPress={() => onOpenSession(stringField(event.data, ["senderSessionId"])!)}
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
      </div>
    </div>
  );
}

function ToolRow({
  item,
  focused,
}: {
  item: Extract<RenderItem, { kind: "tool" }>;
  focused: boolean;
}) {
  const tone =
    item.status === "completed" || item.status === "ok"
      ? "ok"
      : item.status === "failed" || item.status === "error"
        ? "danger"
        : "warn";
  const payload = [item.input, item.output].filter(Boolean).join("\n\n");
  return (
    <div
      className={`event${focused ? " event--focus" : ""}`}
      id={`event-${item.seq}`}
      data-seq={item.seq}
    >
      <Gutter seq={item.seq} at={item.at} />
      <div className="event__body">
        <div className="tool">
          <div className="tool__head">
            <Terminal className="icon" />
            <span className="tool__name">{item.name}</span>
            <span className="tool__title">{item.title || item.id}</span>
            {item.turn !== null ? (
              <span className="tool__turn">turn {item.turn}</span>
            ) : null}
            <span className={`tool__status tool__status--${tone}`}>{item.status}</span>
            {payload ? <CopyButton text={payload} label="tool payload" /> : null}
          </div>
          <details className="tool__details">
            <summary>Inspect payload</summary>
            <div className="tool__body">
              {item.input ? (
                <>
                  <span className="tool__prompt">input</span>
                  <pre className="event__pre">{safeText(item.input)}</pre>
                </>
              ) : null}
              {item.output ? (
                <>
                  <span className="tool__prompt">output</span>
                  <pre className="event__pre">{safeText(item.output)}</pre>
                </>
              ) : null}
              {!item.input && !item.output ? (
                <span className="tool__prompt">No payload reported.</span>
              ) : null}
            </div>
          </details>
        </div>
      </div>
    </div>
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
    <div
      className={`event${focused ? " event--focus" : ""}`}
      id={`event-${item.seq}`}
      data-seq={item.seq}
    >
      <Gutter seq={item.seq} at={item.at} />
      <div className="event__body">
        <div className="event__meta">
          <span className="event__type">compaction</span>
          <span className="event__sep">/</span>
          <span>{item.status}</span>
          {item.turn !== null ? (
            <>
              <span className="event__sep">/</span>
              <span>turn {item.turn}</span>
            </>
          ) : null}
        </div>
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
      </div>
    </div>
  );
}

function SingleEventRow({
  event,
  session,
  focused,
  onOpenSession,
}: {
  event: EventView;
  session: SessionView;
  focused: boolean;
  onOpenSession?: (sessionId: string) => void;
}) {
  const text = safeText(eventText(event));
  const actor = eventActor(event);
  const base = `event${focused ? " event--focus" : ""}`;
  const id = `event-${event.seq}`;

  if (event.type === "turn.started") {
    return null;
  }

  if (event.type === "prompt.sent" || event.type === "prompt.queued") {
    return (
      <div className={`${base} event--user`} id={id} data-seq={event.seq}>
        <Gutter seq={event.seq} at={event.at} />
        <div className="event__body">
          <div className="event__meta">
            <span className="event__type">{event.type}</span>
            <span className="event__sep">/</span>
            <span className="event__role ident">{actor ?? "operator"}</span>
            {event.type === "prompt.queued" ? (
              <>
                <span className="event__sep">/</span>
                <span>queued behind the active turn</span>
              </>
            ) : null}
            {stringField(event.data, ["messageId"]) ? (
              <>
                <span className="event__sep">/</span>
                <span className="ident">{stringField(event.data, ["messageId"])}</span>
              </>
            ) : null}
            <span className="event__meta-spacer" />
            <CopyButton text={text} label="prompt" />
          </div>
          <p className="event__text event__text--pre">{text}</p>
          {event.data.injected ? (
            <span className="event__injected">
              <Check className="icon" /> Skill pointer injected by the supervisor
            </span>
          ) : null}
        </div>
      </div>
    );
  }

  if (event.type === "prompt.discarded") {
    return (
      <div className={`${base} event--error`} id={id} data-seq={event.seq}>
        <Gutter seq={event.seq} at={event.at} />
        <div className="event__body">
          <div className="event__meta">
            <span className="event__type">prompt.discarded</span>
            <span className="event__sep">/</span>
            <span className="event__role">{actor ?? "unknown"}</span>
            <span className="event__sep">/</span>
            <span>{String(event.data.reason ?? "discarded")}</span>
          </div>
          <p className="event__text event__text--muted event__text--pre">
            {text || "A queued prompt was discarded."}
          </p>
        </div>
      </div>
    );
  }

  if (event.type === "notice") {
    const severity = event.data.severity === "error" ? "danger" : "warn";
    return (
      <div className={`${base} event--notice`} id={id} data-seq={event.seq}>
        <Gutter seq={event.seq} at={event.at} />
        <div className="event__body">
          <div className="event__meta">
            <span className="event__type">notice</span>
            <span className="event__sep">/</span>
            <span>{String(event.data.severity ?? "info")}</span>
            {event.turn !== null ? (
              <>
                <span className="event__sep">/</span>
                <span>turn {event.turn}</span>
              </>
            ) : null}
          </div>
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
        </div>
      </div>
    );
  }

  if (event.type === "error") {
    return (
      <div className={`${base} event--error`} id={id} data-seq={event.seq}>
        <Gutter seq={event.seq} at={event.at} />
        <div className="event__body">
          <div className="event__meta">
            <span className="event__type">error</span>
            <span className="event__sep">/</span>
            <span>diagnostic · does not by itself mark the session failed</span>
          </div>
          <p className="event__text event__text--danger">{text || "No message reported"}</p>
        </div>
      </div>
    );
  }

  if (event.type === "permission.requested") {
    const requestId = stringField(event.data, ["requestId"]);
    const isCurrent = session.pendingPermission?.requestId === requestId;
    const detail = text || "Permission";
    return (
      <StructuralRow
        id={id}
        seq={event.seq}
        at={event.at}
        type="permission.requested"
        text={
          isCurrent
            ? `Waiting in the gate above · ${detail}`
            : `History · ${detail}`
        }
        icon={<Shield className="icon" />}
      />
    );
  }

  if (event.type === "permission.resolved") {
    const optionId = stringField(event.data, ["optionId"]);
    const reason = stringField(event.data, ["reason"]);
    return (
      <StructuralRow
        id={id}
        seq={event.seq}
        at={event.at}
        type="permission.resolved"
        text={`${optionId ? `Option ${optionId}` : "Cancelled"}${
          reason ? ` · ${reason}` : ""
        } · by ${actor ?? "unknown actor"}`}
        icon={<Check className="icon" />}
      />
    );
  }

  if (event.type === "session.message") {
    const sender = stringField(event.data, ["senderSessionId"]);
    const recipient = stringField(event.data, ["recipientSessionId"]);
    return (
      <div className={`${base} event--message`} id={id} data-seq={event.seq}>
        <Gutter seq={event.seq} at={event.at} />
        <div className="event__body">
          <div className="event__meta">
            <span className="event__type">session.message</span>
            <span className="event__sep">/</span>
            <span className="event__role">
              <Handle id={sender ?? "?"} /> → <Handle id={recipient ?? "?"} />
            </span>
          </div>
          <p className="event__text event__text--pre">{text}</p>
          {sender && onOpenSession ? (
            <Button size="sm" variant="ghost" onPress={() => onOpenSession(sender)}>
              <MessageSquare className="btn__icon icon" />
              Open sender
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  if (event.type === "plan" || event.type === "plan.update") {
    const entries = Array.isArray(event.data.entries) ? event.data.entries.length : null;
    const removed = event.data.removed === true;
    return (
      <StructuralRow
        id={id}
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
        id={id}
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
        id={id}
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
        id={id}
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
        id={id}
        seq={event.seq}
        at={event.at}
        type="session.closed"
        text={`by ${actor ?? "unknown"}`}
        icon={<Check className="icon" />}
      />
    );
  }

  if (
    event.type === "turn.ended" ||
    event.type === "cancel.requested" ||
    event.type === "policy.changed" ||
    event.type === "mode" ||
    event.type === "config" ||
    event.type === "session.renamed" ||
    event.type === "session.info" ||
    event.type === "session.initialized"
  ) {
    const detail =
      event.type === "turn.ended"
        ? `Turn ended: ${String(event.data.reason ?? "unknown")}`
        : event.type === "policy.changed"
          ? `Policy changed to ${String(event.data.permissionPolicy ?? "?")} by ${actor ?? "unknown"}`
          : event.type === "session.renamed"
            ? `Renamed to ${String(event.data.name ?? "—")} by ${actor ?? "unknown"}`
            : event.type === "session.info"
              ? `Provider title · ${text || "not reported"}`
              : text || `${event.type} by ${actor ?? "unknown"}`;
    return (
      <StructuralRow
        id={id}
        seq={event.seq}
        at={event.at}
        type={event.type}
        text={detail}
        icon={<Info className="icon" />}
      />
    );
  }

  if (event.type === "agent.thought") {
    return null;
  }

  return (
    <div className={base} id={id} data-seq={event.seq}>
      <Gutter seq={event.seq} at={event.at} />
      <div className="event__body">
        <div className="event__meta">
          <span className="event__type">{event.type}</span>
          <span className="event__sep">/</span>
          <span>generic event</span>
          {event.turn !== null ? (
            <>
              <span className="event__sep">/</span>
              <span>turn {event.turn}</span>
            </>
          ) : null}
          <span className="event__meta-spacer" />
          <CopyButton text={text} label="event text" />
        </div>
        <p className="event__text event__text--pre">{text || `${event.type} (no preview)`}</p>
        <details className="event__inspect">
          <summary>Inspect event data</summary>
          <pre className="event__pre">{JSON.stringify(event.data, null, 2)}</pre>
        </details>
      </div>
    </div>
  );
}

function StructuralRow({
  id,
  seq,
  at,
  type,
  text,
  icon,
  tone,
}: {
  id: string;
  seq: number;
  at: string;
  type: string;
  text: string;
  icon: ReactNode;
  tone?: "danger";
}) {
  return (
    <div
      className={`event event--structural${tone === "danger" ? " event--error" : ""}`}
      id={id}
      data-seq={seq}
    >
      <Gutter seq={seq} at={at} />
      <div className="event__body event__body--structural">
        <span className="event__structural-icon">{icon}</span>
        <span className="event__type">{type}</span>
        <span className="event__sep">/</span>
        <span className="event__text event__text--muted">{text}</span>
      </div>
    </div>
  );
}
