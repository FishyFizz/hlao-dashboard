import {
  ChevronRight,
  CircleAlert,
  Shield,
  TriangleAlert,
} from "lucide-react";
import { Button } from "../../components/Button";
import { Handle } from "../../components/Status";
import {
  displayLabel,
  failureReason,
  formatAge,
  formatDateTime,
  type AttentionItem,
} from "../../store/model";
import { store } from "../../store/store";

/** One fleet-level pointer into an attention episode. */
export function AttentionCard({
  item,
  now,
  onSelect,
}: {
  item: AttentionItem;
  now: number;
  onSelect: (sessionId: string) => void;
}) {
  const session = item.session;
  const isPermission = item.kind === "permission";
  const at =
    item.kind === "permission"
      ? item.permission?.requestedAt
      : item.kind === "failure"
        ? session.endedAt ?? session.lastActivityAt
        : item.sortAt;
  const Icon = isPermission ? Shield : item.kind === "failure" ? CircleAlert : TriangleAlert;
  return (
    <article className={`attention-card attention-card--${item.kind}`}>
      <div className="attention-card__head">
        <span className="attention-card__rank">
          <Icon className="icon" />
          {isPermission ? "Permission" : item.kind === "failure" ? "Failure" : "Notice"}
        </span>
        <span className="attention-card__age" title={formatDateTime(at)}>
          {formatAge(at, now)}
        </span>
      </div>
      <button
        type="button"
        className="attention-card__session"
        onClick={() => onSelect(session.id)}
      >
        <span className="attention-card__label">{displayLabel(session)}</span>
        <Handle id={session.id} />
        <ChevronRight className="icon" />
      </button>
      <div className="attention-card__reason">
        {isPermission
          ? item.permission?.title
          : item.kind === "failure"
            ? failureReason(session)
            : item.reason}
      </div>
      <div className="attention-card__meta">
        {isPermission
          ? `${item.permission?.kind ?? "permission"} · ${item.permission?.options.length ?? 0} options · ${session.pendingPermissions.length} pending`
          : item.kind === "failure"
            ? `exit ${session.exit?.code ?? "—"}${session.exit?.signal ? ` · ${session.exit.signal}` : ""} · ${session.backend}`
            : `${session.status} · ${session.turn > 0 ? `turn ${session.turn}` : "no turn"} · ${session.backend}`}
      </div>
      <div className="attention-card__actions">
        <Button size="sm" variant="primary" onPress={() => onSelect(session.id)}>
          {isPermission ? "Answer" : "Inspect"}
        </Button>
        {item.kind === "failure" ? (
          <Button
            size="sm"
            onPress={() => store.acknowledgeFailure(session.id)}
            title="Removes this failure from the attention list locally"
          >
            Acknowledge
          </Button>
        ) : null}
        {item.kind === "notice" ? (
          <Button size="sm" onPress={() => store.dismissNotice(session.id)}>
            Dismiss
          </Button>
        ) : null}
      </div>
    </article>
  );
}
