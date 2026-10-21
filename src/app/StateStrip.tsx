import type { ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { canUse, type DashboardState } from "../store/store";
import {
  contextPercent,
  countNewAgentMessages,
  formatAge,
  formatDateTime,
  formatElapsed,
  formatTokens,
  lastEventLabel,
  sessionLocalKey,
} from "../store/model";
import type { SessionView } from "../wire/protocol";
import { CAPABILITIES } from "../wire/protocol";
import { useNow } from "./hooks";

export function StateStrip({
  state,
  session,
}: {
  state: DashboardState;
  session: SessionView;
}) {
  const now = useNow();
  const percent = contextPercent(session.usage ?? null);
  const lastSeen = state.local.lastSeen[sessionLocalKey(session)] ?? 0;
  const newMessages = countNewAgentMessages(
    state.events[session.id]?.events ?? [],
    lastSeen,
  );
  const runningElapsed =
    !state.removed &&
    (session.status === "busy" || session.status === "waiting_permission")
      ? formatElapsed(session.turnStartedAt, now)
      : null;

  return (
    <div className="state-strip" aria-label="Session state">
      <div className="state-facts">
        <Fact
          label="Policy"
          value={
            <span className="state-policy" data-policy={session.permissionPolicy}>
              {session.permissionPolicy}
              {session.permissionPolicy === "ask" ? (
                <TriangleAlert className="icon state-policy__warn" aria-hidden="true" />
              ) : null}
            </span>
          }
          title={
            session.permissionPolicy === "ask"
              ? "An unattended session can wait indefinitely; a client must answer."
              : session.permissionPolicy === "deny"
                ? "Requests are denied without asking."
                : "Requests are allowed without asking."
          }
        />
        {session.turn > 0 ? (
          <Fact
            label="Turn"
            value={`${session.turn}${runningElapsed ? ` · ${runningElapsed}` : ""}`}
            title={
              session.turnStartedAt
                ? formatDateTime(session.turnStartedAt)
                : undefined
            }
          />
        ) : null}
        {session.queued > 0 ? (
          <Fact label="Queue" value={`${session.queued} waiting`} />
        ) : null}
        {session.usage && percent !== null ? (
          <Fact
            label="Context"
            value={`${formatTokens(session.usage.used)} / ${formatTokens(session.usage.size)} · ${percent}%`}
            title="Latest reported snapshot. Not a cumulative total."
          />
        ) : null}
        {session.exit ? (
          <Fact
            label="Exit"
            value={`${session.exit.code ?? "?"}${session.exit.signal ? ` · ${session.exit.signal}` : ""}`}
          />
        ) : null}
        <Fact
          label="Last event"
          value={`${lastEventLabel(session, canUse(state, CAPABILITIES.lastEvent))} · ${formatAge(session.lastEvent?.at ?? session.lastActivityAt, now)}`}
          title={formatDateTime(session.lastEvent?.at)}
        />
        {newMessages > 0 ? (
          <Fact
            label="New messages"
            value={String(newMessages)}
            title="Agent messages since the local read cursor"
          />
        ) : null}
      </div>
    </div>
  );
}

function Fact({
  label,
  value,
  title,
}: {
  label: string;
  value: ReactNode;
  title?: string;
}) {
  return (
    <div className="state-fact" title={title}>
      <span className="state-fact__label">{label}</span>
      <span className="state-fact__value">{value}</span>
    </div>
  );
}
