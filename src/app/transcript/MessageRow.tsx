import { Check, MessageSquare } from "lucide-react";
import { Button } from "../../components/Button";
import { Handle } from "../../components/Status";
import { cn } from "../../lib/cn";
import {
  eventActor,
  lastThoughtLine,
  stringField,
  type RenderItem,
} from "../../store/model";
import type { SessionView } from "../../wire/protocol";
import { MarkdownText } from "../MarkdownText";
import { CopyButton, safeText } from "../ui";
import {
  EventFrame,
  MessageIdMeta,
  Meta,
  Sep,
  TurnMeta,
} from "./eventFrame";

export function MessageRow({
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
          <summary
            title={`${text.length.toLocaleString()} characters · the latest streamed line`}
          >
            <span className="event__thought-label">Thought</span>{" "}
            <span className="event__thought-preview">
              {lastThoughtLine(text) || (text ? "(no readable line)" : "no text yet")}
            </span>
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
