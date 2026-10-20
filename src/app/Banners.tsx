import {
  CircleAlert,
  Info,
  RefreshCw,
  TriangleAlert,
  WifiOff,
  X,
} from "lucide-react";
import { Button, IconButton } from "../components/Button";
import { store, type DashboardState } from "../store/store";
import { formatDateTime } from "../store/model";

export function Banners({
  state,
  onRetry,
  onExitDemo,
}: {
  state: DashboardState;
  onRetry: () => void;
  onExitDemo: () => void;
}) {
  const items: Array<{
    tone: "warn" | "danger" | "info";
    icon: typeof Info;
    title: string;
    text: string;
    action?: { label: string; onPress: () => void };
    dismiss?: () => void;
  }> = [];

  if (state.mode === "demo") {
    items.push({
      tone: "warn",
      icon: TriangleAlert,
      title: "Demo instance — simulated supervisor",
      text: "This is not a real HLAO process. Every session below is a fixture for exercising the interaction model. No work is executed.",
      action: { label: "Exit demo", onPress: onExitDemo },
    });
  }

  if (state.connection === "reconnecting") {
    items.push({
      tone: "warn",
      icon: RefreshCw,
      title: "Reconnecting to the supervisor",
      text: `Live updates are paused. The page last confirmed state at ${
        state.lastUpdatedAt ? formatDateTime(state.lastUpdatedAt) : "an unknown time"
      }. Reconnect resumes from the last cursor.`,
      action: { label: "Retry now", onPress: onRetry },
    });
  } else if (state.connection === "offline" && state.instance) {
    items.push({
      tone: "danger",
      icon: WifiOff,
      title: "Disconnected — displayed state is stale",
      text: `No live updates, notifications, or claims of “now”. Last update: ${
        state.lastUpdatedAt ? formatDateTime(state.lastUpdatedAt) : "unknown"
      }. ${state.connectError?.message ?? ""}`,
      action: { label: "Retry", onPress: onRetry },
    });
  }

  if (state.restartNotice) {
    items.push({
      tone: "danger",
      icon: CircleAlert,
      title: "Supervisor restarted — the previous live world is gone",
      text: `pid ${state.restartNotice.previousPid} (${state.restartNotice.previousStartedAt}) → pid ${state.restartNotice.nextPid} (${state.restartNotice.nextStartedAt}). Prior live sessions are not presented as live. Local drafts are kept as orphaned.`,
      dismiss: () => store.dismissRestartNotice(),
    });
  }

  if (state.crashNotice) {
    items.push({
      tone: "warn",
      icon: CircleAlert,
      title: "Previous supervisor did not stop cleanly",
      text: `pid ${state.crashNotice.pid} · version ${state.crashNotice.version} · detected ${formatDateTime(state.crashNotice.detectedAt)}. The current supervisor replaced it.`,
      dismiss: () => store.dismissCrashNotice(),
    });
  }

  if (state.instance?.configError) {
    items.push({
      tone: "danger",
      icon: CircleAlert,
      title: "Config error — new spawns are blocked",
      text: `${state.instance.configError} Live sessions keep the config they started with. Fix the file, then reload; editing alone does not affect a running supervisor.`,
      action: {
        label: state.pending.reload ? "Reloading…" : "Reload config",
        onPress: () => void store.reloadConfig(),
      },
    });
  }

  if (items.length === 0) return null;

  return (
    <div className="dash-banners">
      {items.map((item) => (
        <div
          className={`banner banner--${item.tone}`}
          key={item.title}
          role={item.tone === "danger" ? "alert" : "status"}
        >
          <item.icon className="banner__icon" />
          <div className="banner__body">
            <span className="banner__title">{item.title}</span>
            <span className="banner__text">{item.text}</span>
          </div>
          {item.action ? (
            <Button
              size="sm"
              className="banner__action"
              onPress={item.action.onPress}
            >
              {item.action.label}
            </Button>
          ) : null}
          {item.dismiss ? (
            <IconButton
              aria-label={`Dismiss ${item.title}`}
              onPress={item.dismiss}
            >
              <X className="icon" />
            </IconButton>
          ) : null}
        </div>
      ))}
    </div>
  );
}
