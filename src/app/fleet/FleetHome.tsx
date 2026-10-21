import { Check, History, Plus, Search } from "lucide-react";
import { Button } from "../../components/Button";
import { Tag } from "../../components/Status";
import {
  attentionKey,
  fleetCounts,
  orderedFleet,
} from "../../store/model";
import {
  attentionItems,
  orphanedDrafts,
  type DashboardState,
} from "../../store/store";
import { WIRE_MAJOR, WIRE_MINOR } from "../../wire/protocol";
import { useNow } from "../hooks";
import { AttentionCard } from "./AttentionCard";
import { FleetTable } from "./FleetTable";
import { OrphanDrafts } from "./OrphanDrafts";

export function FleetHome({
  state,
  onSelect,
  onSpawn,
  onResume,
  onSearch,
}: {
  state: DashboardState;
  onSelect: (sessionId: string) => void;
  onSpawn: () => void;
  onResume: () => void;
  onSearch: () => void;
}) {
  const now = useNow();
  const attention = attentionItems(state);
  const sessions = Object.values(state.sessions);
  const filters = state.local.filters;
  const rows = orderedFleet(sessions, attention, filters.query, filters.sort);
  const counts = fleetCounts(sessions);
  const orphans = orphanedDrafts(state);

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
              Start a session
            </Button>
            <Button onPress={onResume}>
              <History className="btn__icon icon" />
              Resume a provider session
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
          <Button size="sm" onPress={onResume}>
            <History className="btn__icon icon" />
            Resume
          </Button>
          <Button size="sm" variant="primary" onPress={onSpawn}>
            <Plus className="btn__icon icon" />
            New session
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
                key={attentionKey(item)}
                item={item}
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
        <Stat label="Live" value={counts.live} />
        <Stat label="Running" value={counts.running} />
        <Stat label="Quiet" value={counts.quiet} />
        <Stat label="Ended" value={counts.ended} />
        <Stat label="Needs you" value={attention.length} tone={attention.length > 0 ? "warn" : undefined} />
      </div>

      <FleetTable
        state={state}
        rows={rows}
        attentionCount={attention.length}
        onSelect={onSelect}
      />

      <OrphanDrafts orphans={orphans} />

      <footer className="fleet-home__foot">
        <span>
          Attention is structural: waiting permission, unacknowledged failure, then
          error notice.
        </span>
        <span>
          <Tag>wire {WIRE_MAJOR}.{WIRE_MINOR}</Tag>
          <Tag>{state.mode === "demo" ? "demo" : "local IPC"}</Tag>
        </span>
      </footer>
    </div>
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
