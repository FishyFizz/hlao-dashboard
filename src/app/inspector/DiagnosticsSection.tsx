import { Button } from "../../components/Button";
import { canUse, type DashboardState } from "../../store/store";
import type { SessionView } from "../../wire/protocol";
import { CAPABILITIES } from "../../wire/protocol";
import {
  forkProviderSession,
  resumeProviderSession,
} from "../providerActions";
import { Row } from "./parts";

export function DiagnosticsSection({
  state,
  session,
}: {
  state: DashboardState;
  session: SessionView;
}) {
  return (
    <details className="inspector__section inspector__details">
      <summary>
        <span>Diagnostics</span>
        <span className="caption">local view</span>
      </summary>
      <div className="inspector__rows inspector__rows--tight">
        <Row
          label="provider"
          value={session.agentSessionId ?? "not reported"}
          mono
        />
        {session.forkedFrom ? (
          <Row label="forked from" value={session.forkedFrom} mono />
        ) : null}
        <Row
          label="process"
          value={session.processId !== null ? String(session.processId) : "not reported"}
          mono
        />
        <Row label="last seq" value={String(session.lastSeq)} mono />
        <Row label="last stop" value={session.lastStopReason ?? "not reported"} mono />
        <Row
          label="exit"
          value={
            session.exit
              ? `${session.exit.code ?? "—"}${session.exit.signal ? ` · ${session.exit.signal}` : ""}`
              : "not reported"
          }
          mono
        />
      </div>
      {session.agentSessionId ? (
        <div className="inspector__actions">
          <Button
            size="sm"
            variant="secondary"
            onPress={() => forkProviderSession(session)}
            isDisabled={!canUse(state, CAPABILITIES.spawnFork)}
            title="Copy this provider session into a new HLAO session"
          >
            Fork provider session
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onPress={() => resumeProviderSession(session)}
            isDisabled={!canUse(state, CAPABILITIES.spawnResume)}
            title="Reattach to this provider session; a live attach returns the same session"
          >
            Resume
          </Button>
        </div>
      ) : null}
      <p className="inspector__note">
        The provider id is the durable handle. Resume reopens it after a
        supervisor restart; fork copies it and leaves the source untouched.
        The HLAO id is an alias for this supervisor's lifetime.
      </p>
    </details>
  );
}
