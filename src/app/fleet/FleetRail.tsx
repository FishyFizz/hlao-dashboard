import { useMemo, useState } from "react";
import { Plus, RefreshCw, Search, X } from "lucide-react";
import { Button, IconButton } from "../../components/Button";
import {
  fleetCounts,
  filterFleet,
  fleetGroupFor,
  groupFleet,
  type FleetGroup,
  type FleetGroups,
} from "../../store/model";
import {
  attentionItems,
  recoverableReceipts,
  store,
  type DashboardState,
} from "../../store/store";
import type { RecoveryReceiptView, SessionView } from "../../wire/protocol";
import { useNow } from "../hooks";
import { RailRow } from "./RailRow";
import { RecoveryRow } from "./RecoveryRow";

export function FleetRail({
  state,
  onSelect,
  onSpawn,
  onRecover,
  onQuickResume,
}: {
  state: DashboardState;
  onSelect: (session: SessionView) => void;
  onSpawn: () => void;
  onRecover: (receipt: RecoveryReceiptView) => void;
  onQuickResume: (receipt: RecoveryReceiptView) => void;
}) {
  const now = useNow();
  const [orderEpoch, setOrderEpoch] = useState(0);
  const attention = attentionItems(state);
  const attentionById = new Map(attention.map((item) => [item.session.id, item]));
  const queries = state.local.filters.query;
  const showEnded = state.local.filters.showEnded;
  const sort = state.local.filters.sort;
  const sessions = Object.values(state.sessions);
  const visible = filterFleet(sessions, { query: queries, showEnded });
  const recoverable = recoverableReceipts(state.recovery, queries);

  const order = useMemo<FleetGroups>(() => {
    return groupFleet(visible, attention, sort);
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
          `${session.id}:${fleetGroupFor(session, attentionById.has(session.id) ? 1 : undefined)}`,
      )
      .sort()
      .join("|"),
  ]);

  const counts = fleetCounts(sessions);
  const shown =
    order.needs.length + order.running.length + order.quiet.length + order.ended.length;

  const group = (key: FleetGroup, title: string, rows: SessionView[]) => {
    if (rows.length === 0) {
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
          <span>{rows.length}</span>
        </div>
        {rows.map((session) => (
          <RailRow
            key={session.id}
            state={state}
            session={session}
            attentionItem={attentionById.get(session.id)}
            group={key}
            now={now}
            onSelect={onSelect}
          />
        ))}
      </section>
    );
  };

  const recoveryGroup =
    recoverable.length > 0 ||
    state.recoveryLoading ||
    state.recoveryError !== null ? (
      <section
        className="rail-group rail-group--recovery"
        aria-label="Recoverable agents"
      >
        <div className="rail-group__head">
          <span>Recoverable</span>
          <span className="rail-group__count">
            {recoverable.length}
            <IconButton
              aria-label="Refresh recoverable agents"
              title="Read the spawn receipts again"
              onPress={() => void store.refreshRecovery()}
              isDisabled={state.recoveryLoading}
            >
              <RefreshCw className="icon" />
            </IconButton>
          </span>
        </div>
        {state.recoveryError !== null ? (
          <div className="rail-recovery__error">
            <span>{state.recoveryError}</span>
            <Button size="sm" onPress={() => void store.refreshRecovery()}>
              Retry
            </Button>
          </div>
        ) : null}
        {recoverable.length === 0 && state.recoveryLoading ? (
          <p className="rail-quiet">Reading spawn receipts…</p>
        ) : null}
        {recoverable.map((receipt) => (
          <RecoveryRow
            key={`${receipt.backend}:${receipt.childProviderId}`}
            receipt={receipt}
            now={now}
            busy={Boolean(state.pending.spawn)}
            onRecover={onRecover}
            onQuickResume={onQuickResume}
          />
        ))}
      </section>
    ) : null;

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
                store.setFilters({ sort: event.target.value as typeof sort })
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
          <>
            {recoveryGroup}
            {recoverable.length === 0 &&
            !state.recoveryLoading &&
            state.recoveryError === null ? (
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
            ) : null}
          </>
        ) : shown === 0 ? (
          <>
            {recoveryGroup}
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
          </>
        ) : (
          <>
            {group("needs", "Needs you", order.needs)}
            {recoveryGroup}
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
          <span>New session</span>
        </button>
      </div>
    </aside>
  );
}
