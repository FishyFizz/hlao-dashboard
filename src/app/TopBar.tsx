import { Command, Moon, Plus, Search, Settings, Sun } from "lucide-react";
import { Button, IconButton } from "../components/Button";
import { Tag } from "../components/Status";
import { attentionItems } from "../store/store";
import type { DashboardState } from "../store/store";
import { useNow } from "./hooks";
import { formatAge } from "../store/model";

export function TopBar({
  state,
  onPalette,
  onSpawn,
  onSearch,
  onHelp,
  onFleet,
  onToggleRail,
  onTheme,
}: {
  state: DashboardState;
  onPalette: () => void;
  onSpawn: () => void;
  onSearch: () => void;
  onHelp: () => void;
  onFleet: () => void;
  onToggleRail: () => void;
  onTheme: () => void;
}) {
  const now = useNow();
  const attention = attentionItems(state);
  const connection =
    state.connection === "open"
      ? "live"
      : state.connection === "reconnecting"
        ? "reconnecting"
        : state.connection === "connecting"
          ? "connecting"
          : "offline";
  const connectionLabel =
    connection === "live"
      ? "Live"
      : connection === "reconnecting"
        ? "Reconnecting"
        : connection === "connecting"
          ? "Connecting"
          : "Disconnected";
  const demo = state.mode === "demo";
  const lastUpdate = state.lastUpdatedAt ? formatAge(state.lastUpdatedAt, now) : null;

  return (
    <header className="dash-top">
      <a
        className="dash-brand"
        href="#/fleet"
        onClick={(event) => {
          event.preventDefault();
          onFleet();
        }}
        aria-label="HLAO dashboard, return to fleet"
      >
        <svg className="brand__mark" viewBox="0 0 18 18" aria-hidden="true">
          <rect x="0.5" y="0.5" width="17" height="17" fill="none" stroke="currentColor" />
          <rect x="6" y="6" width="6" height="6" fill="var(--accent)" />
          <path d="M9 0v4M9 14v4M0 9h4M14 9h4" stroke="currentColor" />
        </svg>
        <span className="dash-brand__name">HLAO</span>
        <span className="dash-brand__sub">Dashboard</span>
      </a>

      <button
        type="button"
        className="dash-fleet-toggle"
        onClick={onToggleRail}
        aria-label="Toggle fleet rail"
      >
        Fleet
      </button>

      <div className="dash-instance" title={state.home}>
        <span
          className={`dash-conn__lamp dash-conn__lamp--${connection}`}
          aria-hidden="true"
        />
        <span className="dash-instance__main">
          {demo ? "Demo instance" : state.home || "No instance"}
        </span>
        <span className="dash-instance__meta">
          {state.instance ? `wire ${state.instance.protocolVersion.major}.${state.instance.protocolVersion.minor}` : "wire 2.5"}
          <span className="dash-instance__sep">/</span>
          {lastUpdate === null
            ? "not updated"
            : lastUpdate === "now"
              ? "just now"
              : `${lastUpdate} ago`}
        </span>
        {demo ? <Tag tone="warn">demo</Tag> : null}
        {state.transportKind === "poll" && !demo ? <Tag>polling</Tag> : null}
      </div>

      <div className="dash-top__spacer" />

      <button
        type="button"
        className="dash-attention"
        data-zero={attention.length === 0 ? "true" : undefined}
        onClick={onFleet}
        title={
          attention.length === 0
            ? "Nothing needs you"
            : `${attention.length} session${attention.length === 1 ? "" : "s"} need attention`
        }
      >
        <span className="dash-attention__count">{attention.length}</span>
        <span className="dash-attention__label">
          {attention.length === 0
            ? "Nothing needs you"
            : attention.length === 1
              ? "needs you"
              : "need you"}
        </span>
      </button>

      <div className="dash-top__actions">
        <Button
          size="sm"
          variant="ghost"
          className="dash-top__search"
          onPress={onSearch}
          aria-label="Search the instance"
        >
          <Search className="btn__icon icon" />
          <span className="dash-top__label">Search</span>
        </Button>
        <Button
          size="sm"
          variant="primary"
          onPress={onSpawn}
          aria-label="Spawn a session"
          isDisabled={Boolean(state.instance?.configError)}
          title={
            state.instance?.configError
              ? "New spawns are blocked until the invalid config is reloaded"
              : undefined
          }
        >
          <Plus className="btn__icon icon" />
          <span className="dash-top__label">Spawn</span>
        </Button>
        <IconButton
          aria-label="Open command palette"
          title="Command palette (Ctrl/Cmd+K)"
          onPress={onPalette}
        >
          <Command className="btn__icon icon" />
        </IconButton>
        <IconButton
          aria-label={`Switch to ${state.theme === "dark" ? "light" : "dark"} theme`}
          title={`Switch to ${state.theme === "dark" ? "light" : "dark"} theme`}
          onPress={onTheme}
        >
          {state.theme === "dark" ? (
            <Sun className="btn__icon icon" />
          ) : (
            <Moon className="btn__icon icon" />
          )}
        </IconButton>
        <IconButton aria-label="Dashboard help and settings" onPress={onHelp}>
          <Settings className="btn__icon icon" />
        </IconButton>
      </div>

      <span className={`dash-conn dash-conn--${connection}`} title={connectionLabel}>
        <span className="dash-conn__dot" aria-hidden="true" />
        <span className="dash-conn__text">{connectionLabel}</span>
      </span>
    </header>
  );
}
