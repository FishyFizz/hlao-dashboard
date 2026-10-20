import type { ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { cn } from "../lib/cn";
import { canUse, type DashboardState } from "../store/store";
import {
  contextPercent,
  formatAge,
  formatCost,
  formatDateTime,
  formatElapsed,
  formatTokens,
  lastEventLabel,
  sessionLocalKey,
} from "../store/model";
import type { SessionView } from "../wire/protocol";
import { CAPABILITIES } from "../wire/protocol";
import { useNow } from "./hooks";
import { CopyButton } from "./ui";

export function StateStrip({
  state,
  session,
}: {
  state: DashboardState;
  session: SessionView;
}) {
  const now = useNow();
  const percent = contextPercent(session.usage ?? null);
  const mode =
    session.modes?.availableModes.find(
      (candidate) => candidate.id === session.modes?.currentModeId,
    ) ?? null;
  const lastSeen = state.local.lastSeen[sessionLocalKey(session)] ?? 0;
  const unread = Math.max(0, session.lastSeq - lastSeen);
  const runningElapsed =
    !state.removed &&
    (session.status === "busy" || session.status === "waiting_permission")
      ? formatElapsed(session.turnStartedAt, now)
      : null;
  const endedElapsed = session.endedAt
    ? formatElapsed(session.createdAt, now, session.endedAt)
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
        {unread > 0 ? <Fact label="New" value={String(unread)} /> : null}

        <details className="state-more">
          <summary title="Mode, cwd, agent, cost, time, instance">More</summary>
          <div className="state-more__grid">
            <Fact
              label="Mode"
              value={
                session.modes
                  ? (mode?.name ?? session.modes.currentModeId)
                  : "not advertised"
              }
              title={mode?.description}
            />
            <Fact label="Cwd" value={session.cwd} mono copy />
            <Fact
              label="Agent"
              value={
                session.agentName
                  ? `${session.agentName}${session.agentVersion ? `@${session.agentVersion}` : ""}`
                  : "not reported"
              }
              mono
            />
            <Fact label="Reported cost" value={formatCost(session.usage ?? null)} />
            <Fact label="Created" value={formatDateTime(session.createdAt)} />
            {session.endedAt ? (
              <Fact
                label="Ended"
                value={`${formatDateTime(session.endedAt)} · ${endedElapsed}`}
              />
            ) : null}
            {session.createdBy ? (
              <Fact label="Created by" value={session.createdBy} />
            ) : null}
            <Fact label="Instance" value={state.home} mono />
            {session.lastStopReason ? (
              <Fact label="Last stop" value={session.lastStopReason} mono />
            ) : null}
          </div>
        </details>
      </div>
    </div>
  );
}

function Fact({
  label,
  value,
  mono,
  copy,
  title,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  copy?: boolean;
  title?: string;
}) {
  return (
    <div className="state-fact" title={title}>
      <span className="state-fact__label">{label}</span>
      <span className={cn("state-fact__value", mono && "mono")}>{value}</span>
      {copy && typeof value === "string" ? (
        <CopyButton text={value} label={label} className="state-fact__copy" />
      ) : null}
    </div>
  );
}
