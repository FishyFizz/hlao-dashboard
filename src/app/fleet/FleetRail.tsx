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

type SectionKey = FleetGroup | "recoverable";

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
  const [collapsed, setCollapsed] = useState<Record<SectionKey, boolean>>({
    needs: false,
    running: false,
    quiet: false,
    recoverable: false,
    ended: false,
  });
  const toggleSection = (key: SectionKey) => {
    setCollapsed((current) => ({ ...current, [key]: !current[key] }));
  };
  const attention = attentionItems(state);
  const attentionById = new Map(attention.map((item) => [item.session.id, item]));
  const queries = state.local.filters.query;
  const sort = state.local.filters.sort;
  const sessions = Object.values(state.sessions);
  // The rail always includes retained sessions; the collapsible Closed section
  // replaces the old "Ended" filter toggle.
  const visible = filterFleet(sessions, queries);
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

  const header = (key: SectionKey, title: string, count: number) => {
    const expanded = !collapsed[key];
    return (
      <button
        type="button"
        className="rail-group__head rail-group__head--toggle"
        aria-expanded={expanded}
        title={expanded ? "Collapse section" : "Expand section"}
        onClick={() => toggleSection(key)}
      >
        <span className="rail-group__title">
          <span className="rail-group__caret" aria-hidden="true">
            {expanded ? "-" : "+"}
          </span>
          <span>{title}</span>
        </span>
        <span className="rail-group__count">{count}</span>
      </button>
    );
  };

  const group = (key: FleetGroup, title: string, rows: SessionView[]) => {
    if (rows.length === 0 && key !== "needs") return null;
    const expanded = !collapsed[key];
    const empty = rows.length === 0;
    return (
      <section
        className={empty ? "rail-group rail-group--quiet" : "rail-group"}
        key={key}
        aria-label={title}
      >
        {header(key, title, rows.length)}
        {expanded ? (
          empty ? (
            <p className="rail-quiet">Nothing needs you.</p>
          ) : (
            rows.map((session) => (
              <RailRow
                key={session.id}
                state={state}
                session={session}
                attentionItem={attentionById.get(session.id)}
                group={key}
                now={now}
                onSelect={onSelect}
              />
            ))
          )
        ) : null}
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
        {header("recoverable", "Recoverable", recoverable.length)}
        {!collapsed.recoverable ? (
          <>
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
          </>
        ) : null}
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
                onPress={() => store.setFilters({ query: "" })}
              >
                Clear filter
              </Button>
            </div>
          </>
        ) : (
          <>
            {group("needs", "Needs you", order.needs)}
            {group("running", "Running", order.running)}
            {group("quiet", "Quiet", order.quiet)}
            {recoveryGroup}
            {group("ended", "Closed", order.ended)}
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
