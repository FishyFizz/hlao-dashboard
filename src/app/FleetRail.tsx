import { useMemo, useState } from "react";
import { Plus, RefreshCw, Search, X } from "lucide-react";
import { Button, IconButton } from "../components/Button";
import { shortStatusLabel, statusLampClass } from "../components/Status";
import {
  attentionItems,
  canUse,
  selectedSession,
  store,
  type DashboardState,
} from "../store/store";
import {
  fleetGroupFor,
  formatAge,
  formatDateTime,
  isTerminalStatus,
  lastEventLabel,
  lastEventTime,
  matchesQuery,
  sessionLocalKey,
  sortSessions,
  unreadFor,
  type FleetGroup,
} from "../store/model";
import type { SessionView } from "../wire/protocol";
import { CAPABILITIES } from "../wire/protocol";
import { useNow } from "./hooks";

type GroupOrder = Record<FleetGroup, string[]>;

export function FleetRail({
  state,
  onSelect,
  onSpawn,
}: {
  state: DashboardState;
  onSelect: (session: SessionView) => void;
  onSpawn: () => void;
}) {
  const now = useNow();
  const [orderEpoch, setOrderEpoch] = useState(0);
  const attention = attentionItems(state);
  const rank = new Map(attention.map((item, index) => [item.session.id, index + 1]));
  const queries = state.local.filters.query;
  const showEnded = state.local.filters.showEnded;
  const sort = state.local.filters.sort;
  const sessions = Object.values(state.sessions);

  const visible = sessions.filter((session) => {
    if (!matchesQuery(session, queries)) return false;
    if (!showEnded && isTerminalStatus(session.status)) return false;
    return true;
  });

  const order = useMemo<GroupOrder>(() => {
    const needs = attention.map((item) => item.session.id);
    const groups: GroupOrder = { needs, running: [], quiet: [], ended: [] };
    for (const session of visible) {
      if (rank.has(session.id)) continue;
      const group = fleetGroupFor(session, undefined);
      groups[group].push(session.id);
    }
    const byId = new Map(visible.map((session) => [session.id, session]));
    for (const key of ["running", "quiet", "ended"] as const) {
      const views = groups[key]
        .map((id) => byId.get(id))
        .filter((view): view is SessionView => Boolean(view));
      groups[key] = sortSessions(views, sort).map((session) => session.id);
    }
    return groups;
    // The signature keeps the rendered order stable while activity updates
    // arrive. Re-sorting happens on a group/rank transition, a filter change,
    // or the explicit re-sort control.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    orderEpoch,
    queries,
    showEnded,
    sort,
    attention.map((item) => `${item.session.id}:${item.rank}`).join("|"),
    visible
      .map(
        (session) =>
          `${session.id}:${fleetGroupFor(session, rank.get(session.id))}`,
      )
      .sort()
      .join("|"),
  ]);

  const selected = selectedSession(state);
  const capabilityLastEvent = canUse(state, CAPABILITIES.lastEvent);
  const counts = {
    live: sessions.filter((session) => !isTerminalStatus(session.status)).length,
    ended: sessions.filter((session) => isTerminalStatus(session.status)).length,
  };
  const shown = order.needs.length + order.running.length + order.quiet.length + order.ended.length;

  const renderRow = (session: SessionView, group: FleetGroup) => {
    const attentionIndex = rank.get(session.id);
    const attentionItem =
      attentionIndex !== undefined ? attention[attentionIndex - 1] : undefined;
    const key = sessionLocalKey(session);
    const lastSeen = state.local.lastSeen[key] ?? 0;
    const earliest = state.events[session.id]?.earliestRetainedSeq ?? 1;
    const unread = unreadFor(session, lastSeen, earliest);
    const isSelected =
      selected?.id === session.id && selected.createdAt === session.createdAt;
    const last = lastEventLabel(session, capabilityLastEvent);
    const reasonAt =
      attentionItem?.kind === "permission"
        ? attentionItem.permission?.requestedAt
        : attentionItem?.sortAt;
    const secondLine =
      group === "needs" && attentionItem
        ? attentionItem.reason
        : last;
    const metaAge = formatAge(
      group === "needs" && reasonAt ? reasonAt : lastEventTime(session),
      now,
    );
    const absolute = formatDateTime(
      group === "needs" && reasonAt ? reasonAt : lastEventTime(session),
    );
    return (
      <button
        type="button"
        className="rail-row"
        key={session.id}
        data-selected={isSelected ? "true" : undefined}
        data-status={session.status}
        aria-current={isSelected ? "page" : undefined}
        aria-label={`${session.id} ${session.name ?? session.title ?? ""} ${shortStatusLabel(session.status)}`}
        title={`${session.id} · ${absolute}`}
        onClick={() => onSelect(session)}
      >
        <span className="rail-row__top">
          <span className={statusLampClass(session.status)} aria-hidden="true" />
          <span className="rail-row__label">{session.name ?? session.title ?? `#${session.id}`}</span>
          {session.name && session.title ? (
            <span className="rail-row__title">{session.title}</span>
          ) : null}
          {unread.unread ? (
            <span
              className="rail-row__unread"
              title={
                unread.count === null
                  ? "New activity; part of the range was evicted"
                  : `${unread.count} new event${unread.count === 1 ? "" : "s"}`
              }
            >
              {unread.count === null ? "new" : unread.count}
            </span>
          ) : null}
        </span>
        <span className="rail-row__bottom">
          <span className="rail-row__status">{shortStatusLabel(session.status)}</span>
          <span className="rail-row__handle">#{session.id}</span>
          <span className="rail-row__meta">
            {session.turn > 0 ? `T${session.turn}` : "—"}
            {session.queued > 0 ? ` · Q${session.queued}` : ""}
          </span>
          <span className="rail-row__age">{metaAge}</span>
        </span>
        <span className="rail-row__second" title={secondLine}>
          {secondLine}
        </span>
      </button>
    );
  };

  const group = (key: FleetGroup, title: string, ids: string[]) => {
    if (ids.length === 0) {
      if (key === "needs") {
        return (
          <div className="rail-group rail-group--quiet" key={key}>
            <div className="rail-group__head">
              <span>{title}</span>
              <span>0</span>
            </div>
            <p className="rail-quiet">Nothing needs you.</p>
          </div>
        );
      }
      return null;
    }
    return (
      <section className="rail-group" key={key} aria-label={title}>
        <div className="rail-group__head">
          <span>{title}</span>
          <span>{ids.length}</span>
        </div>
        {ids.map((id) => {
          const session = state.sessions[id];
          return session ? renderRow(session, key) : null;
        })}
      </section>
    );
  };

  return (
    <aside className="dash-rail" aria-label="Fleet">
      <div className="rail-head">
        <div className="rail-head__title">
          <span>Fleet</span>
          <span className="rail-head__count">
            {sessions.length} {sessions.length === 1 ? "session" : "sessions"}
          </span>
        </div>
        <div className="rail-head__filter">
          <div className="field__search">
            <Search className="field__search-icon icon" />
            <input
              className="field__input"
              type="search"
              value={queries}
              placeholder="Filter by name, handle, cwd"
              aria-label="Filter the fleet"
              onChange={(event) => store.setFilters({ query: event.target.value })}
            />
            {queries ? (
              <span className="field__suffix">
                <IconButton
                  aria-label="Clear fleet filter"
                  onPress={() => store.setFilters({ query: "" })}
                >
                  <X className="icon" />
                </IconButton>
              </span>
            ) : null}
          </div>
        </div>
        <div className="rail-head__controls">
          <label className="rail-sort">
            <span>Sort</span>
            <select
              className="rail-sort__select"
              value={sort}
              onChange={(event) =>
                store.setFilters({
                  sort: event.target.value as "created" | "activity" | "name",
                })
              }
            >
              <option value="created">Created</option>
              <option value="activity">Activity</option>
              <option value="name">Name</option>
            </select>
          </label>
          <button
            type="button"
            className="rail-control"
            data-active={showEnded ? "true" : undefined}
            aria-pressed={showEnded}
            onClick={() => store.setFilters({ showEnded: !showEnded })}
            title="Show retained closed and failed sessions"
          >
            Ended
          </button>
          <IconButton
            aria-label="Re-sort the fleet from current state"
            title="Re-sort now"
            onPress={() => setOrderEpoch((value) => value + 1)}
          >
            <RefreshCw className="icon" />
          </IconButton>
        </div>
      </div>

      <div className="rail-scroll">
        {sessions.length === 0 ? (
          <div className="rail-empty">
            <span className="rail-empty__title">No sessions</span>
            <span className="rail-empty__text">
              This instance has no live or retained sessions.
            </span>
            <Button size="sm" variant="primary" onPress={onSpawn}>
              <Plus className="btn__icon icon" />
              Spawn
            </Button>
          </div>
        ) : shown === 0 ? (
          <div className="rail-empty">
            <span className="rail-empty__title">No matches</span>
            <span className="rail-empty__text">
              The filter hides every session. It is a view, not a scope.
            </span>
            <Button
              size="sm"
              onPress={() => {
                store.setFilters({ query: "", showEnded: true });
              }}
            >
              Clear filter
            </Button>
          </div>
        ) : (
          <>
            {group("needs", "Needs you", order.needs)}
            {group("running", "Running", order.running)}
            {group("quiet", "Quiet", order.quiet)}
            {group("ended", "Ended", order.ended)}
          </>
        )}
      </div>

      <div className="rail-foot">
        <div className="rail-foot__counts">
          <span>
            showing {shown} of {sessions.length}
          </span>
          <span>
            {counts.live} live · {counts.ended} retained
          </span>
        </div>
        <button
          type="button"
          className="rail-foot__spawn"
          onClick={onSpawn}
        >
          <Plus className="icon" />
          <span>Spawn session</span>
        </button>
      </div>
    </aside>
  );
}
