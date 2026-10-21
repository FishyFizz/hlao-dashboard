import { createContext, useContext, type ReactNode } from "react";
import { formatClock, formatDateTime, stringField } from "../../store/model";
import { cn } from "../../lib/cn";

/** True while rendering events restored by ACP session/load. */
export const ReplayContext = createContext(false);

export function useReplay(): boolean {
  return useContext(ReplayContext);
}

export function Gutter({ seq, at }: { seq: number; at: string }) {
  const replay = useReplay();
  return (
    <div className="event__gutter">
      <span className="event__seq">{String(seq).padStart(4, "0")}</span>
      <span className="event__time" title={formatDateTime(at)}>
        {formatClock(at)}
      </span>
      {replay ? (
        <span
          className="event__replay"
          title="Restored from the provider transcript by session/load"
        >
          history
        </span>
      ) : null}
    </div>
  );
}

/** The shared row shell: anchor, gutter, and body. */
export function EventFrame({
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
  const replay = useReplay();
  return (
    <div
      className={cn("event", replay && "event--replay", className)}
      id={`event-${seq}`}
      data-seq={seq}
    >
      <Gutter seq={seq} at={at} />
      <div className={cn("event__body", bodyClassName)}>{children}</div>
    </div>
  );
}

export function Meta({ children }: { children: ReactNode }) {
  return <div className="event__meta">{children}</div>;
}

export function Sep() {
  return <span className="event__sep">/</span>;
}

export function TurnMeta({ turn }: { turn: number | null }) {
  if (turn === null) return null;
  return (
    <>
      <Sep />
      <span>turn {turn}</span>
    </>
  );
}

export function MessageIdMeta({ data }: { data: Record<string, unknown> }) {
  const messageId = stringField(data, ["messageId"]);
  if (!messageId) return null;
  return (
    <>
      <Sep />
      <span className="ident">{messageId}</span>
    </>
  );
}

export function StructuralRow({
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
