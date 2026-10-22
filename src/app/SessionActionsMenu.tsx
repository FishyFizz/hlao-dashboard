import {
  CircleAlert,
  Download,
  GitFork,
  Pencil,
  PanelRight,
  Power,
  Trash2,
} from "lucide-react";
import { Menu, MenuItem, Separator } from "react-aria-components";
import {
  attentionItems,
  canUse,
  store,
  type DashboardState,
} from "../store/store";
import { descendantsOf, isTerminalStatus } from "../store/model";
import type { SessionView } from "../wire/protocol";
import { CAPABILITIES } from "../wire/protocol";
import { cli } from "./cli";
import { exportTranscript } from "./export";
import { forkProviderSession } from "./providerActions";
import { copyWithToast } from "./ui";

/**
 * Actions that need an operator dialog. The callback receives the session the
 * menu was opened for, so a surface can target a row without selecting it.
 */
export interface SessionMenuActions {
  onRename: (session: SessionView) => void;
  onClose: (session: SessionView) => void;
  onCloseSubtree: (session: SessionView) => void;
  onForget: (session: SessionView) => void;
  onDetails: (session: SessionView) => void;
}

/**
 * The session action menu shared by the lens header and the fleet rail. The
 * caller supplies its own trigger and popover; this component owns only the
 * items and their conditions.
 */
export function SessionActionsMenu({
  state,
  session,
  onRename,
  onClose,
  onCloseSubtree,
  onForget,
  onDetails,
}: { state: DashboardState; session: SessionView } & SessionMenuActions) {
  const attention = attentionItems(state).find(
    (item) => item.session.id === session.id,
  );
  const terminal = isTerminalStatus(session.status);
  const descendants = descendantsOf(session.id, Object.values(state.sessions));
  const canForkProvider = canUse(state, CAPABILITIES.spawnFork);

  return (
    <Menu
      className="menu"
      onAction={(key) => {
        switch (String(key)) {
          case "rename":
            onRename(session);
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
            onDetails(session);
            break;
          case "fork-provider":
            forkProviderSession(session);
            break;
          case "close-subtree":
            onCloseSubtree(session);
            break;
          case "close":
            onClose(session);
            break;
          case "forget":
            onForget(session);
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
      {session.agentSessionId && canForkProvider ? (
        <MenuItem
          className="menu__item"
          id="fork-provider"
          textValue="Fork provider session"
        >
          <GitFork className="icon" />
          Fork provider session
        </MenuItem>
      ) : null}
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
  );
}
