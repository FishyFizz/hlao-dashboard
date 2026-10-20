import type { ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { Handle } from "../components/Status";
import {
  canUse,
  type DashboardState,
} from "../store/store";
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
  const settled = canUse(state, "session.settled");
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
        <Fact label="Backend" value={session.backend} mono />
        <Fact label="Cwd" value={session.cwd} mono copy />
        <Fact
          label="HLAO policy"
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
        <Fact
          label="Provider mode"
          value={
            session.modes
              ? mode?.name ?? session.modes.currentModeId
              : "not advertised"
          }
          title={mode?.description}
        />
        <Fact
          label="Turn"
          value={
            session.turn > 0
              ? `${session.turn}${runningElapsed ? ` · ${runningElapsed}` : ""}`
              : "none"
          }
          title={session.turnStartedAt ? formatDateTime(session.turnStartedAt) : undefined}
        />
        <Fact
          label="Queue"
          value={session.queued > 0 ? `${session.queued} waiting` : "empty"}
        />
        <Fact
          label="Context"
          value={
            session.usage && percent !== null
              ? `${formatTokens(session.usage.used)} / ${formatTokens(session.usage.size)} · ${percent}%`
              : "not reported"
          }
          title={
            session.usage
              ? `Latest reported snapshot at ${formatDateTime(session.usage.at)}. Not a cumulative total.`
              : undefined
          }
        />
        <Fact
          label="Reported cost"
          value={formatCost(session.usage ?? null)}
          title="Latest reported snapshot; not a bill or a session total."
        />
        <Fact
          label="Agent"
          value={
            session.agentName
              ? `${session.agentName}${session.agentVersion ? `@${session.agentVersion}` : ""}`
              : "not reported"
          }
        />
        <Fact
          label={session.endedAt ? "Ended" : "Created"}
          value={
            session.endedAt
              ? `${formatDateTime(session.endedAt)} · ${endedElapsed}`
              : formatDateTime(session.createdAt)
          }
        />
      </div>

      <div className="state-strip__line">
        <span className="state-strip__identity">
          <Handle id={session.id} />
          {session.name && session.title ? (
            <span className="state-strip__title">{session.title}</span>
          ) : null}
          {session.createdBy ? (
            <span className="state-strip__actor">created by {session.createdBy}</span>
          ) : null}
        </span>
        <span className="state-strip__signals">
          {unread > 0 ? (
            <span className="state-signal" title="Local unread marker">
              {unread} new
            </span>
          ) : null}
          {settled && session.settled ? (
            <span className="state-signal state-signal--quiet">
              no active turn · queue empty
            </span>
          ) : null}
          {!runningElapsed && session.lastStopReason ? (
            <span className="state-signal">
              last turn ended: {session.lastStopReason}
            </span>
          ) : null}
          {session.exit ? (
            <span className="state-signal state-signal--danger">
              exit {session.exit.code ?? "—"}
              {session.exit.signal ? ` · ${session.exit.signal}` : ""}
            </span>
          ) : null}
          {runningElapsed ? (
            <span className="state-signal">running {runningElapsed}</span>
          ) : null}
          <span className="state-signal state-signal--last" title={formatDateTime(session.lastEvent?.at)}>
            {lastEventLabel(session, canUse(state, "session.lastEvent"))} · {formatAge(session.lastEvent?.at ?? session.lastActivityAt, now)}
          </span>
        </span>
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
      <span className={`state-fact__value${mono ? " mono" : ""}`}>{value}</span>
      {copy && typeof value === "string" ? (
        <CopyButton text={value} label={label} className="state-fact__copy" />
      ) : null}
    </div>
  );
}
