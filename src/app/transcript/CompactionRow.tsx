import type { RenderItem } from "../../store/model";
import { safeText } from "../ui";
import { EventFrame, Meta, Sep, TurnMeta } from "./eventFrame";

export function CompactionRow({
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
