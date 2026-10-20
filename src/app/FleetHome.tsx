import {
  Check,
  ChevronRight,
  CircleAlert,
  Copy,
  Plus,
  Search,
  Shield,
  TriangleAlert,
} from "lucide-react";
import { Button } from "../components/Button";
import { Handle, Status, Tag } from "../components/Status";
import {
  attentionItems,
  canUse,
  store,
  type DashboardState,
} from "../store/store";
import {
  displayLabel,
  failureReason,
  formatAge,
  formatDateTime,
  lastEventLabel,
  lastEventTime,
  matchesQuery,
  sessionLocalKey,
  sortSessions,
  unreadFor,
  type AttentionItem,
} from "../store/model";
import { useNow } from "./hooks";
import { copyWithToast } from "./ui";

export function FleetHome({
  state,
  onSelect,
  onSpawn,
  onSearch,
}: {
  state: DashboardState;
  onSelect: (sessionId: string) => void;
  onSpawn: () => void;
  onSearch: () => void;
}) {
  const now = useNow();
  const attention = attentionItems(state);
  const sessions = Object.values(state.sessions);
  const attentionRank = new Set(attention.map((item) => item.session.id));
  const filtered = [
    ...attention
      .map((item) => item.session)
      .filter((session) => matchesQuery(session, state.local.filters.query)),
    ...sortSessions(
      sessions.filter((session) => {
        if (attentionRank.has(session.id)) return false;
        if (!matchesQuery(session, state.local.filters.query)) return false;
        if (
          !state.local.filters.showEnded &&
          (session.status === "closed" || session.status === "failed")
        ) {
          return false;
        }
        return true;
      }),
      state.local.filters.sort,
    ),
  ];
  const live = sessions.filter(
    (session) => session.status !== "closed" && session.status !== "failed",
  );
  const running = sessions.filter(
    (session) => session.status === "busy" || session.status === "starting",
  );
  const quiet = sessions.filter((session) => session.status === "idle");
  const ended = sessions.filter(
    (session) => session.status === "closed" || session.status === "failed",
  );
  const capabilityLastEvent = canUse(state, "session.lastEvent");
  const orphans = orphanedDrafts(state);
  const hasFilter =
    state.local.filters.query.trim().length > 0 ||
    !state.local.filters.showEnded;

  if (sessions.length === 0) {
    return (
      <div className="fleet-home">
        <div className="fleet-empty">
          <span className="fleet-empty__mark" aria-hidden="true">
            <span />
          </span>
          <h1 className="fleet-empty__title">No sessions in this instance.</h1>
          <p className="fleet-empty__text">
            The supervisor is reachable at <span className="mono">{state.home}</span>.
            Spawn a session, or start one from the CLI and it will appear here.
          </p>
          <div className="fleet-empty__actions">
            <Button variant="primary" onPress={onSpawn}>
              <Plus className="btn__icon icon" />
              Spawn a session
            </Button>
            <Button onPress={onSearch}>
              <Search className="btn__icon icon" />
              Search retained history
            </Button>
          </div>
        </div>
        <OrphanDrafts orphans={orphans} />
      </div>
    );
  }

  return (
    <div className="fleet-home">
      <header className="fleet-home__head">
        <div>
          <span className="fleet-home__kicker">Fleet / home</span>
          <h1 className="fleet-home__title">
            {attention.length === 0
              ? "Nothing needs you."
              : `${attention.length} session${attention.length === 1 ? "" : "s"} need${attention.length === 1 ? "s" : ""} you.`}
          </h1>
          <p className="fleet-home__sub">
            {attention.length === 0
              ? "The fleet is quiet. Attention is derived from reported state, not from elapsed time or content."
              : "These are structural blockers. Everything else stays quiet until you open it."}
          </p>
        </div>
        <div className="fleet-home__actions">
          <Button size="sm" onPress={onSearch}>
            <Search className="btn__icon icon" />
            Search
          </Button>
          <Button size="sm" variant="primary" onPress={onSpawn}>
            <Plus className="btn__icon icon" />
            Spawn
          </Button>
        </div>
      </header>

      {attention.length > 0 ? (
        <section className="attention-block" aria-label="Needs you">
          <div className="attention-block__head">
            <span>Needs you</span>
            <span>{attention.length}</span>
          </div>
          <div className="attention-grid">
            {attention.map((item) => (
              <AttentionCard
                key={`${item.session.id}:${item.kind}:${item.noticeSeq ?? item.permission?.requestId ?? ""}`}
                item={item}
                state={state}
                now={now}
                onSelect={onSelect}
              />
            ))}
          </div>
        </section>
      ) : (
        <section className="attention-empty" aria-label="Needs you">
          <span className="attention-empty__mark">
            <Check className="icon" />
          </span>
          <div>
            <div className="attention-empty__title">Nothing needs you</div>
            <div className="attention-empty__text">
              No permission is parked, no failure is unacknowledged, and no error
              notice is open. Sessions below are still live.
            </div>
          </div>
        </section>
      )}

      <div className="fleet-stats" aria-label="Fleet counts">
        <Stat label="Live" value={live.length} />
        <Stat label="Running" value={running.length} />
        <Stat label="Quiet" value={quiet.length} />
        <Stat label="Ended" value={ended.length} />
        <Stat label="Needs you" value={attention.length} tone={attention.length > 0 ? "warn" : undefined} />
      </div>

      <section className="fleet-table-section" aria-label="All sessions">
        <div className="fleet-table-section__head">
          <span>
            All sessions
            {hasFilter ? (
              <span className="fleet-table-section__filter">
                {" "}
                · showing {filtered.length} of {sessions.length}
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
              {filtered.map((session) => {
                const key = sessionLocalKey(session);
                const lastSeen = state.local.lastSeen[key] ?? 0;
                const earliest = state.events[session.id]?.earliestRetainedSeq ?? 1;
                const unread = unreadFor(session, lastSeen, earliest);
                return (
                  <tr key={session.id} onClick={() => onSelect(session.id)}>
                    <td>
                      <Status status={session.status} />
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
          {filtered.length === 0 ? (
            <div className="table-empty">
              No sessions match this filter. It is a local view; the instance still
              has {sessions.length}.
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
              {filtered.length} of {sessions.length} shown · {attention.length} need attention
            </span>
            <span>
              {state.instance
                ? `instance ${state.instance.pid} · started ${formatDateTime(state.instance.startedAt)}`
                : "no instance"}
            </span>
          </div>
        </div>
      </section>

      <OrphanDrafts orphans={orphans} />

      <footer className="fleet-home__foot">
        <span>
          Attention is structural: waiting permission, unacknowledged failure, then
          error notice.
        </span>
        <span>
          <Tag>wire 2.5</Tag>
          <Tag>{state.mode === "demo" ? "demo" : "local IPC"}</Tag>
        </span>
      </footer>
    </div>
  );
}

function OrphanDrafts({
  orphans,
}: {
  orphans: { key: string; text: string; updatedAt: number }[];
}) {
  if (orphans.length === 0) return null;
  return (
    <section className="orphan-block" aria-label="Orphaned drafts">
      <div className="orphan-block__head">
        <span>Orphaned drafts</span>
        <span>{orphans.length}</span>
      </div>
      <p className="orphan-block__text">
        These drafts belonged to sessions that are no longer in this instance. They
        stay local and copyable; the dashboard never retargets them.
      </p>
      {orphans.map((draft) => (
        <div className="orphan-row" key={draft.key}>
          <span className="orphan-row__key">{draft.key}</span>
          <span className="orphan-row__text">{draft.text}</span>
          <Button size="sm" onPress={() => void copyWithToast(draft.text, "draft")}>
            <Copy className="btn__icon icon" />
            Copy
          </Button>
        </div>
      ))}
    </section>
  );
}

function AttentionCard({
  item,
  state,
  now,
  onSelect,
}: {
  item: AttentionItem;
  state: DashboardState;
  now: number;
  onSelect: (sessionId: string) => void;
}) {
  const session = item.session;
  const key = sessionLocalKey(session);
  const notice = state.notices[key];
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
            : notice?.text ?? item.reason}
      </div>
      <div className="attention-card__meta">
        {isPermission
          ? `${item.permission?.kind ?? "permission"} · ${item.permission?.options.length ?? 0} options · policy ${session.permissionPolicy}`
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

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "warn";
}) {
  return (
    <div className="fleet-stat" data-tone={tone}>
      <span className="fleet-stat__value">{value}</span>
      <span className="fleet-stat__label">{label}</span>
    </div>
  );
}

function orphanedDrafts(state: DashboardState): {
  key: string;
  text: string;
  updatedAt: number;
}[] {
  const liveKeys = new Set(
    Object.values(state.sessions).map((session) => sessionLocalKey(session)),
  );
  return Object.entries(state.local.drafts)
    .filter(([key]) => !liveKeys.has(key))
    .map(([key, draft]) => ({ key, text: draft.text, updatedAt: draft.updatedAt }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
