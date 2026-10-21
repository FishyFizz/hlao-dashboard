import { formatDateTime, formatElapsed, isTerminalStatus } from "../../store/model";
import { canUse, type DashboardState } from "../../store/store";
import type { SessionView } from "../../wire/protocol";
import { CAPABILITIES } from "../../wire/protocol";
import { CompactionSection } from "./CompactionSection";
import { DiagnosticsSection } from "./DiagnosticsSection";
import { LineageSection } from "./LineageSection";
import { NoticeSection } from "./NoticeSection";
import { Row } from "./parts";
import { PlanSection } from "./PlanSection";
import { ProviderSection } from "./ProviderSection";
import { UsageSection } from "./UsageSection";

/**
 * The session inspector is a stack of independent sections. Each section owns
 * one provider projection and hides itself when its capability is absent.
 */
export function Inspector({
  state,
  session,
  onOpenSession,
}: {
  state: DashboardState;
  session: SessionView;
  onOpenSession: (sessionId: string) => void;
}) {
  const canMessages = canUse(state, CAPABILITIES.messages);
  const canTitle = canUse(state, CAPABILITIES.title);
  const canFirstPrompt = canUse(state, CAPABILITIES.firstPrompt);
  const canAgent = canUse(state, CAPABILITIES.agent);
  const terminal = state.removed || isTerminalStatus(session.status);
  const endedElapsed = session.endedAt
    ? formatElapsed(session.createdAt, Date.now(), session.endedAt)
    : null;

  return (
    <div className="inspector">
      <details className="inspector__header">
        <summary>
          <span>{session.backend ? `${session.backend} details` : "provider details"}</span>
        </summary>
        <div className="inspector__rows inspector__rows--tight">
          <Row label="cwd" value={session.cwd} mono copy />
          <Row
            label="agent"
            value={
              canAgent && session.agentName
                ? `${session.agentName}${session.agentVersion ? `@${session.agentVersion}` : ""}`
                : canAgent
                  ? "not reported"
                  : "not supported"
            }
            mono
          />
          <Row
            label="title"
            value={canTitle ? session.title || "not reported" : "not supported"}
          />
          {canFirstPrompt && session.firstPrompt ? (
            <Row label="first prompt" value={session.firstPrompt} />
          ) : null}
          <Row label="created by" value={session.createdBy ?? "not reported"} />
          <Row
            label="created"
            value={formatDateTime(session.createdAt)}
            mono
          />
          {session.endedAt ? (
            <Row
              label="ended"
              value={`${formatDateTime(session.endedAt)}${endedElapsed ? ` · ${endedElapsed}` : ""}`}
              mono
            />
          ) : null}
          <Row label="instance" value={state.home} mono />
        </div>
        {canMessages ? (
          <p className="inspector__note">
            Inter-session messages appear in the transcript; they are not
            operator prompts.
          </p>
        ) : null}
      </details>

      <ProviderSection state={state} session={session} terminal={terminal} />
      <UsageSection state={state} session={session} />
      <PlanSection state={state} session={session} />
      <CompactionSection state={state} session={session} />
      <NoticeSection state={state} session={session} />
      <LineageSection
        state={state}
        session={session}
        onOpenSession={onOpenSession}
      />
      <DiagnosticsSection state={state} session={session} />
    </div>
  );
}
