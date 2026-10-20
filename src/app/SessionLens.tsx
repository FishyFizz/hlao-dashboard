import { useEffect, useRef } from "react";
import {
  ChevronLeft,
  CircleAlert,
  Download,
  MoreHorizontal,
  PanelRight,
  Pencil,
  Power,
  Square,
  Trash2,
} from "lucide-react";
import {
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
  Separator,
} from "react-aria-components";
import { Button, IconButton } from "../components/Button";
import { Handle, Status, Tag } from "../components/Status";
import { cn } from "../lib/cn";
import {
  attentionItems,
  store,
  type DashboardState,
} from "../store/store";
import {
  descendantsOf,
  displayLabel,
  failureReason,
  formatDateTime,
  isTerminalStatus,
} from "../store/model";
import type { QueueItemView, SessionView } from "../wire/protocol";
import { cli } from "./cli";
import { exportTranscript } from "./export";
import { Composer } from "./Composer";
import { PermissionGate } from "./PermissionGate";
import { StateStrip } from "./StateStrip";
import { Transcript } from "./Transcript";
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
  onAlways,
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
  onAlways: () => void;
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
  const descendants = descendantsOf(session.id, Object.values(state.sessions));
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
              <h1 className="session-head__name">{displayLabel(session)}</h1>
              <Handle id={session.id} />
              <IconButton
                className="session-head__copy"
                aria-label="Copy session handle"
                title="Copy handle"
                onPress={() => void copyWithToast(`#${session.id}`, "handle")}
              >
                <span className="session-head__hash">#</span>
              </IconButton>
            </div>
            <div className="session-head__meta">
              {session.name && session.title ? (
                <span className="session-head__title">{session.title}</span>
              ) : null}
              <Tag className="ident">{session.backend}</Tag>
              {session.queued > 0 ? <Tag tone="warn">{session.queued} queued</Tag> : null}
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
                <Menu
                  className="menu"
                  onAction={(key) => {
                    switch (String(key)) {
                      case "rename":
                        onRename();
                        break;
                      case "copy-handle":
                        void copyWithToast(`#${session.id}`, "handle");
                        break;
                      case "copy-cli":
                        void copyWithToast(cli.read(session), "CLI command");
                        break;
                      case "export":
                        void exportTranscript(session);
                        break;
                      case "details":
                        onDetails();
                        break;
                      case "close-subtree":
                        onCloseSubtree();
                        break;
                      case "close":
                        onClose();
                        break;
                      case "forget":
                        onForget();
                        break;
                      case "ack":
                        store.acknowledgeFailure(session.id);
                        break;
                      case "dismiss-notice":
                        store.dismissNotice(session.id);
                        break;
                    }
                  }}
                >
                  <MenuItem className="menu__item" id="rename" textValue="Rename">
                    <Pencil className="icon" />
                    Rename…
                  </MenuItem>
                  <MenuItem className="menu__item" id="copy-handle" textValue="Copy handle">
                    Copy handle
                  </MenuItem>
                  <MenuItem className="menu__item" id="copy-cli" textValue="Copy as CLI">
                    Copy as CLI
                  </MenuItem>
                  <MenuItem className="menu__item" id="export" textValue="Export transcript">
                    <Download className="icon" />
                    Export transcript (JSON)
                  </MenuItem>
                  <MenuItem className="menu__item" id="details" textValue="Session details">
                    <PanelRight className="icon" />
                    Session details
                  </MenuItem>
                  <Separator className="menu__sep" />
                  {session.status === "failed" ? (
                    <MenuItem className="menu__item" id="ack" textValue="Acknowledge failure">
                      <CircleAlert className="icon" />
                      Acknowledge failure locally
                    </MenuItem>
                  ) : null}
                  {attention?.kind === "notice" ? (
                    <MenuItem className="menu__item" id="dismiss-notice" textValue="Dismiss notice">
                      Dismiss notice locally
                    </MenuItem>
                  ) : null}
                  {descendants.length > 0 && !terminal ? (
                    <MenuItem
                      className="menu__item menu__item--danger"
                      id="close-subtree"
                      textValue="Close subtree"
                    >
                      <Power className="icon" />
                      Close subtree ({descendants.length + 1})
                    </MenuItem>
                  ) : null}
                  {!terminal ? (
                    <MenuItem
                      className="menu__item menu__item--danger"
                      id="close"
                      textValue="Close session"
                    >
                      <Power className="icon" />
                      Close session…
                    </MenuItem>
                  ) : (
                    <MenuItem
                      className="menu__item menu__item--danger"
                      id="forget"
                      textValue="Forget session"
                    >
                      <Trash2 className="icon" />
                      Forget session…
                    </MenuItem>
                  )}
                </Menu>
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

      {!state.removed && session.pendingPermission ? (
        <PermissionGate session={session} onAlways={onAlways} />
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
