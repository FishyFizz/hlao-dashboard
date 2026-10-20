import { attentionItems, store, type DashboardState } from "../store/store";
import { formatAge, formatDateTime } from "../store/model";
import { useNow } from "./hooks";

export function StatusBar({ state }: { state: DashboardState }) {
  const now = useNow();
  const sessions = Object.values(state.sessions);
  const attention = attentionItems(state);
  const live = sessions.filter(
    (session) => session.status !== "closed" && session.status !== "failed",
  ).length;
  const ended = sessions.length - live;
  const selected = state.selection?.id;
  return (
    <footer className="dash-status">
      <span className="dash-status__group">
        <span>{live} live</span>
        <span>{ended} retained</span>
        <span data-tone={attention.length > 0 ? "warn" : undefined}>
          {attention.length} need attention
        </span>
        <button
          type="button"
          className="dash-status__link"
          onClick={() => store.setFilters({ query: "", showEnded: true })}
          title="Clear fleet filters"
        >
          {state.local.filters.query ? "filtered" : "all sessions"}
        </button>
      </span>
      <span className="dash-status__group dash-status__middle">
        <span>
          {state.transportKind === "poll"
            ? "polling · 2s (stream unavailable)"
            : selected
              ? `fleet subscription · events #${selected}`
              : "fleet subscription · no event scope"}
        </span>
        <span>wire {state.instance ? `${state.instance.protocolVersion.major}.${state.instance.protocolVersion.minor}` : "2.5"}</span>
        {state.lastUpdatedAt ? (
          <span title={formatDateTime(state.lastUpdatedAt)}>
            updated {formatAge(state.lastUpdatedAt, now)} ago
          </span>
        ) : null}
      </span>
      <span className="dash-status__group dash-status__right">
        <span className="dash-status__keys">
          <span className="mono">Ctrl/Cmd K</span> commands
          <span className="mono">?</span> help
        </span>
        <span
          className="dash-status__connection"
          data-status={state.connection}
          title={`Connection: ${state.connection}`}
        >
          <span className="dash-status__dot" aria-hidden="true" />
          {state.connection}
        </span>
      </span>
    </footer>
  );
}
