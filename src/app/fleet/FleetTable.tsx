import { Button } from "../../components/Button";
import { Status, tableStatusLabel } from "../../components/Status";
import {
  displayLabel,
  formatAge,
  formatDateTime,
  lastEventLabel,
  lastEventTime,
  sessionLocalKey,
  unreadFor,
} from "../../store/model";
import {
  canUse,
  store,
  type DashboardState,
} from "../../store/store";
import type { SessionView } from "../../wire/protocol";
import { useNow } from "../hooks";
import { CAPABILITIES } from "../../wire/protocol";

export function FleetTable({
  state,
  rows,
  attentionCount,
  onSelect,
}: {
  state: DashboardState;
  rows: SessionView[];
  attentionCount: number;
  onSelect: (sessionId: string) => void;
}) {
  const now = useNow();
  const total = Object.keys(state.sessions).length;
  const capabilityLastEvent = canUse(state, CAPABILITIES.lastEvent);
  return (
    <section className="fleet-table-section" aria-label="All sessions">
      <div className="fleet-table-section__head">
        <span>
          All sessions
          {state.local.filters.query.trim() || !state.local.filters.showEnded ? (
            <span className="fleet-table-section__filter">
              {" "}
              · showing {rows.length} of {total}
            </span>
          ) : null}
        </span>
        <span className="muted">
          {state.transportKind === "poll"
            ? "polling · 2s"
            : `fleet subscription${state.selection ? " · live events follow the selected session" : ""}`}
        </span>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Status</th>
              <th scope="col">Session</th>
              <th scope="col">Last event</th>
              <th scope="col">Turn</th>
              <th scope="col">Queue</th>
              <th scope="col">Age</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((session) => {
              const key = sessionLocalKey(session);
              const lastSeen = state.local.lastSeen[key] ?? 0;
              const earliest = state.events[session.id]?.earliestRetainedSeq ?? 1;
              const unread = unreadFor(session, lastSeen, earliest);
              return (
                <tr key={session.id} onClick={() => onSelect(session.id)}>
                  <td>
                    <span title={session.status === "waiting_permission" ? "Waiting for permission" : undefined}>
                      <Status
                        status={session.status}
                        label={tableStatusLabel(session.status)}
                      />
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="table__session fleet-table__link"
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelect(session.id);
                      }}
                      aria-label={`Open ${displayLabel(session)} ${session.id}`}
                    >
                      <span className="table__name">{displayLabel(session)}</span>
                      <span className="table__id">
                        #{session.id}
                        {unread.unread ? (
                          <span className="fleet-table__unread">
                            {unread.count === null ? "new" : `${unread.count} new`}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </td>
                  <td>
                    <span className="table__last">
                      <span>{lastEventLabel(session, capabilityLastEvent)}</span>
                    </span>
                  </td>
                  <td>
                    <span className="table__num">
                      {session.turn > 0 ? String(session.turn).padStart(2, "0") : "—"}
                    </span>
                  </td>
                  <td>
                    <span className="table__num">
                      {session.queued > 0 ? String(session.queued).padStart(2, "0") : "—"}
                    </span>
                  </td>
                  <td>
                    <span className="table__age" title={formatDateTime(lastEventTime(session))}>
                      {formatAge(lastEventTime(session), now)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <div className="table-empty">
            No sessions match this filter. It is a local view; the instance still
            has {total}.
            <Button
              size="sm"
              onPress={() => store.setFilters({ query: "", showEnded: true })}
            >
              Clear filter
            </Button>
          </div>
        ) : null}
        <div className="table__footer">
          <span>
            {rows.length} of {total} shown · {attentionCount} need attention
          </span>
          <span>
            {state.instance
              ? `instance ${state.instance.pid} · started ${formatDateTime(state.instance.startedAt)}`
              : "no instance"}
          </span>
        </div>
      </div>
    </section>
  );
}
