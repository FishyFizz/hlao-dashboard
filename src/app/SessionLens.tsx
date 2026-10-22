import { useEffect, useRef } from "react";
import {
  ChevronLeft,
  Download,
  MoreHorizontal,
  PanelRight,
  Square,
} from "lucide-react";
import { MenuTrigger, Popover } from "react-aria-components";
import { Button, IconButton } from "../components/Button";
import { Handle, Status, Tag } from "../components/Status";
import { cn } from "../lib/cn";
import {
  attentionItems,
  store,
  type DashboardState,
} from "../store/store";
import {
  displayLabel,
  failureReason,
  formatDateTime,
  isTerminalStatus,
} from "../store/model";
import type { QueueItemView, SessionView } from "../wire/protocol";
import { exportTranscript } from "./export";
import { Composer } from "./Composer";
import { PermissionGate } from "./PermissionGate";
import { SessionActionsMenu } from "./SessionActionsMenu";
import { StateStrip } from "./StateStrip";
import { Transcript } from "./transcript/Transcript";
import { copyWithToast } from "./ui";

export function SessionLens({
  state,
  session,
  onBack,
  onSpawn,
  onSearch,
  onOpenSession,
  onRename,
  onStop,
  onClose,
  onCloseSubtree,
  onForget,
  onDrop,
  onDetails,
  onSpawnReplacement,
}: {
  state: DashboardState;
  session: SessionView;
  onBack: () => void;
  onSpawn: () => void;
  onSearch: () => void;
  onOpenSession: (sessionId: string) => void;
  onRename: () => void;
  onStop: () => void;
  onClose: () => void;
  onCloseSubtree: () => void;
  onForget: () => void;
  onDrop: (item: QueueItemView) => void;
  onDetails: () => void;
  onSpawnReplacement: () => void;
}) {
  const lensRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    lensRef.current?.scrollTo({ top: 0 });
  }, [session.id]);
  const attention = attentionItems(state).find((item) => item.session.id === session.id);
  const terminal = isTerminalStatus(session.status);
  const active = session.status === "busy" || session.status === "waiting_permission";

  return (
    <div className="session-lens" ref={lensRef}>
      <header className="session-head">
        <div className="session-head__identity">
          <IconButton
            className="session-head__back"
            aria-label="Return to fleet"
            onPress={onBack}
          >
            <ChevronLeft className="icon" />
          </IconButton>
          <div className="session-head__text">
            <div className="session-head__line">
              <Status status={session.status} />
              <h1
                className="session-head__name"
                title={state.removed ? undefined : "Double-click to rename"}
                onDoubleClick={state.removed ? undefined : onRename}
              >
                {displayLabel(session)}
              </h1>
              <Handle id={session.id} />
              <IconButton
                className="session-head__copy"
                aria-label="Copy session handle"
                title="Copy handle"
                onPress={() => void copyWithToast(`#${session.id}`, "handle")}
              >
                <span className="session-head__hash">#</span>
              </IconButton>
              {session.name && session.title ? (
                <span className="session-head__title">{session.title}</span>
              ) : null}
              <Tag className="ident">{session.backend}</Tag>
              {session.queued > 0 ? <Tag tone="warn">{session.queued} queued</Tag> : null}
              {session.pendingPermissions.length > 1 ? (
                <Tag tone="warn">
                  {session.pendingPermissions.length} permissions pending
                </Tag>
              ) : null}
              {attention ? (
                <Tag tone="warn">
                  needs you · {attention.kind === "permission" ? "permission" : attention.kind}
                </Tag>
              ) : null}
              {state.removed ? <Tag tone="danger">no longer in this instance</Tag> : null}
            </div>
          </div>
        </div>
        <div className="session-head__actions">
          {!state.removed && active ? (
            <Button size="sm" onPress={onStop}>
              <Square className="btn__icon icon" />
              Stop
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            className="session-head__details"
            onPress={onDetails}
            aria-label="Show session details"
            title="Provider, usage, plan, compaction, lineage"
          >
            <PanelRight className="btn__icon icon" />
            Details
          </Button>
          {!state.removed ? (
            <MenuTrigger>
              <IconButton aria-label="More session actions">
                <MoreHorizontal className="btn__icon icon" />
              </IconButton>
              <Popover className="popover" placement="bottom end">
                <SessionActionsMenu
                  state={state}
                  session={session}
                  onRename={onRename}
                  onClose={onClose}
                  onCloseSubtree={onCloseSubtree}
                  onForget={onForget}
                  onDetails={onDetails}
                />
              </Popover>
            </MenuTrigger>
          ) : null}
        </div>
      </header>

      {state.removed ? (
        <div className="banner banner--warn session-banner">
          <span className="banner__text">
            This session is no longer in the instance. Loaded events are a local
            snapshot and are not live. Drafts for it, if any, stay local and copyable.
          </span>
          <Button size="sm" onPress={onBack}>
            Return to fleet
          </Button>
        </div>
      ) : null}

      <StateStrip state={state} session={session} />

      {terminal ? (
        <SessionTerminal
          session={session}
          onSpawnReplacement={onSpawnReplacement}
        />
      ) : null}

      {!state.removed && session.pendingPermissions.length > 0 ? (
        <PermissionGate session={session} />
      ) : null}

      <Transcript
        state={state}
        session={session}
        onSearch={onSearch}
        onOpenSession={onOpenSession}
      />

      {!state.removed ? (
        <Composer state={state} session={session} onDrop={onDrop} />
      ) : (
        <div className="composer composer--removed">
          <span>
            Composer disabled: the target is no longer in this instance. Copy any
            loaded text or return to the fleet.
          </span>
          <Button size="sm" onPress={onSpawn}>
            Spawn a replacement
          </Button>
        </div>
      )}
    </div>
  );
}

/** The ended-session banner: one shape for failed and closed sessions. */
function SessionTerminal({
  session,
  onSpawnReplacement,
}: {
  session: SessionView;
  onSpawnReplacement: () => void;
}) {
  const failed = session.status === "failed";
  const endedAt = session.endedAt
    ? formatDateTime(session.endedAt)
    : "end time not reported";
  return (
    <div className={cn("session-terminal", failed && "session-terminal--danger")}>
      <div>
        <strong>{failed ? "Failed" : "Closed"}</strong>
        <span>
          {failed
            ? `${failureReason(session)}${session.endedAt ? ` · ${formatDateTime(session.endedAt)}` : ""}. This session cannot run another turn.`
            : `${endedAt}. Readable for the retention period; not resumable.`}
        </span>
      </div>
      <div className="session-terminal__actions">
        {failed ? (
          <Button size="sm" onPress={() => store.acknowledgeFailure(session.id)}>
            Acknowledge locally
          </Button>
        ) : null}
        <Button size="sm" onPress={() => void exportTranscript(session)}>
          <Download className="btn__icon icon" />
          Export
        </Button>
        <Button size="sm" variant="primary" onPress={onSpawnReplacement}>
          Spawn replacement
        </Button>
      </div>
    </div>
  );
}
