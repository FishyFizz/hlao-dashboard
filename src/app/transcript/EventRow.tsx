import { useEffect, useState, type ReactNode } from "react";
import { cn } from "../../lib/cn";
import {
  mcpToolLabel,
  renderItemSeq,
  type ActivityGroupRow as ActivityGroupRowData,
  type RenderItem,
} from "../../store/model";
import type { SessionView } from "../../wire/protocol";
import { CompactionRow } from "./CompactionRow";
import { Gutter, ReplayContext } from "./eventFrame";
import { MessageRow } from "./MessageRow";
import { PermissionRow } from "./PermissionRow";
import { SingleEventRow } from "./SingleEventRow";
import { ToolRow } from "./ToolRow";

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
  let row: ReactNode;
  if (item.kind === "message") {
    row = (
      <MessageRow
        item={item}
        session={session}
        focused={focused}
        onOpenSession={onOpenSession}
      />
    );
  } else if (item.kind === "tool") {
    row = <ToolRow item={item} sessionId={session.id} focused={focused} />;
  } else if (item.kind === "compaction") {
    row = <CompactionRow item={item} focused={focused} />;
  } else if (item.kind === "permission") {
    row = <PermissionRow item={item} session={session} />;
  } else {
    row = <SingleEventRow event={item.event} focused={focused} />;
  }
  const replay =
    item.kind === "event"
      ? item.event.replay === true
      : item.kind === "permission"
        ? item.request?.replay === true || item.resolution?.replay === true
        : item.events.some((event) => event.replay === true);
  return <ReplayContext.Provider value={replay}>{row}</ReplayContext.Provider>;
}

/**
 * Minimal mode's collapsed run of work. The summary names what happened and
 * shows the latest activity; opening it restores the individual rows.
 */
export function ActivityGroupRow({
  row,
  session,
  focusSeq,
  onOpenSession,
}: {
  row: ActivityGroupRowData;
  session: SessionView;
  focusSeq: number | null;
  onOpenSession?: (sessionId: string) => void;
}) {
  const containsFocus =
    focusSeq !== null && row.items.some((item) => renderItemSeq(item) === focusSeq);
  const [open, setOpen] = useState(containsFocus);
  useEffect(() => {
    if (containsFocus) setOpen(true);
  }, [containsFocus]);

  const counts: string[] = [];
  if (row.tools > 0) counts.push(`${row.tools} tool call${row.tools === 1 ? "" : "s"}`);
  if (row.mcp > 0) counts.push(`${row.mcp} MCP call${row.mcp === 1 ? "" : "s"}`);
  if (row.thoughts > 0) {
    counts.push(`${row.thoughts} thought${row.thoughts === 1 ? "" : "s"}`);
  }

  let lastLabel = "last";
  let lastText = "";
  if (row.last?.kind === "tool") {
    lastLabel = row.last.mcp ? "last MCP" : "last";
    lastText = [
      row.last.mcp ? mcpToolLabel(row.last.name) : row.last.name,
      row.last.title,
    ]
      .filter(Boolean)
      .join(" · ");
  } else if (row.last?.kind === "thought") {
    lastLabel = "thinking";
    lastText = row.last.text;
  }

  const expanded = open || containsFocus;
  return (
    <details
      className="activity-group"
      open={expanded}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary
        className={cn(
          "event",
          "activity-group__summary",
          containsFocus && "event--focus",
        )}
      >
        <Gutter seq={row.seq} at={row.at} />
        <span className="event__body activity-group__summary-body">
          <span
            className="activity-group__counts"
            title={
              row.mcp > 0
                ? "MCP calls are inferred from adapter tool names or markers; the wire has no MCP event type."
                : undefined
            }
          >
            {counts.join(" · ")}
          </span>
          {lastText ? (
            <span className="activity-group__last" title={lastText}>
              <span className="activity-group__last-label">{lastLabel}</span>{" "}
              {lastText}
            </span>
          ) : null}
          <span className="activity-group__toggle" aria-hidden="true">
            {expanded ? "-" : "+"}
          </span>
        </span>
      </summary>
      {expanded ? (
        <div className="activity-group__items">
          {row.items.map((item) => (
            <EventRow
              key={item.id}
              item={item}
              session={session}
              focused={focusSeq !== null && renderItemSeq(item) === focusSeq}
              onOpenSession={onOpenSession}
            />
          ))}
        </div>
      ) : null}
    </details>
  );
}
