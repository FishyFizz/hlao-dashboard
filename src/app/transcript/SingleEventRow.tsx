import {
  Check,
  CircleAlert,
  Info,
  ListTree,
  TriangleAlert,
} from "lucide-react";
import { cn } from "../../lib/cn";
import {
  eventActor,
  eventText,
  formatTokens,
  numberField,
  stringField,
} from "../../store/model";
import type { EventView } from "../../wire/protocol";
import { MarkdownText } from "../MarkdownText";
import { CopyButton, safeText } from "../ui";
import {
  EventFrame,
  MessageIdMeta,
  Meta,
  Sep,
  StructuralRow,
  TurnMeta,
} from "./eventFrame";

const STRUCTURAL_EVENT_TYPES = new Set([
  "turn.ended",
  "cancel.requested",
  "mode",
  "config",
  "session.renamed",
  "session.info",
  "session.initialized",
  "session.resumed",
  "session.forked",
]);

function structuralDetail(
  event: EventView,
  text: string,
  actor: string | null,
): string {
  switch (event.type) {
    case "turn.ended":
      return `Turn ended: ${String(event.data.reason ?? "unknown")}`;
    case "session.renamed":
      return `Renamed to ${String(event.data.name ?? "—")} by ${actor ?? "unknown"}`;
    case "session.info":
      return `Provider title · ${text || "not reported"}`;
    case "session.resumed": {
      const id = stringField(event.data, ["agentSessionId"]) ?? "provider session";
      const count = numberField(event.data, ["historyEvents"]);
      return `Resumed ${id}${count !== null ? ` · ${count} events replayed` : ""}`;
    }
    case "session.forked": {
      const from = stringField(event.data, ["forkedFrom"]) ?? "provider session";
      if (event.data.historyLoaded === false) {
        return `Forked from ${from} · history not replayed`;
      }
      const count = numberField(event.data, ["historyEvents"]);
      return `Forked from ${from}${count !== null ? ` · ${count} events replayed` : ""}`;
    }
    default:
      return text || `${event.type} by ${actor ?? "unknown"}`;
  }
}

export function SingleEventRow({
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

  if (
    event.type === "prompt.sent" ||
    event.type === "prompt.queued" ||
    event.type === "prompt.steered"
  ) {
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
          ) : event.type === "prompt.steered" ? (
            <>
              <Sep />
              <span>steered into the running turn</span>
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
