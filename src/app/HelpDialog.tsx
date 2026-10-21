import {
  Bell,
  Database,
  ExternalLink,
  Shield,
  Terminal,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { Button } from "../components/Button";
import { Kbd, Tag } from "../components/Status";
import { cn } from "../lib/cn";
import { store, type DashboardState } from "../store/store";
import { formatDateTime } from "../store/model";
import { wireVersionLabel } from "../wire/protocol";
import { DialogShell } from "./DialogShell";
import { ToggleRow, copyWithToast } from "./ui";

export function HelpDialog({
  open,
  state,
  onClose,
  onClearLocal,
  onShutdown,
}: {
  open: boolean;
  state: DashboardState;
  onClose: () => void;
  onClearLocal: () => void;
  onShutdown: () => void;
}) {
  const instance = state.instance;
  const enableNotifications = async (value: boolean) => {
    if (!value) {
      store.setNotifications(false);
      return;
    }
    if (typeof Notification === "undefined") {
      store.addToast({
        tone: "danger",
        title: "Desktop notifications are not available",
        text: "This browser does not expose the Notification API.",
      });
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      store.addToast({
        tone: "danger",
        title: "Desktop notification permission was not granted",
        text: "In-app attention still works; OS notifications stay off.",
      });
      return;
    }
    store.setNotifications(true);
  };

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      kicker="Dashboard"
      title="Help, shortcuts, and local state"
      wide
      footer={<Button variant="primary" onPress={onClose}>Close</Button>}
    >
      <section className="help-section">
        <div className="help-section__head">
          <Terminal className="icon" />
          <span>This instance</span>
          <Tag>{state.mode === "demo" ? "demo" : "local IPC"}</Tag>
        </div>
        <div className="help-facts">
          <Fact label="home" value={state.home || "not connected"} mono copy />
          <Fact label="pid" value={instance ? String(instance.pid) : "not connected"} mono />
          <Fact label="version" value={instance?.version ?? "not connected"} mono />
          <Fact
            label="protocol"
            value={wireVersionLabel(instance?.protocolVersion)}
            mono
          />
          <Fact
            label="started"
            value={instance ? formatDateTime(instance.startedAt) : "not connected"}
            mono
          />
          <Fact label="config hash" value={instance?.configHash ?? "not reported"} mono />
        </div>
        <details className="help-details">
          <summary>Capabilities reported by this supervisor</summary>
          <div className="help-capabilities">
            {instance?.capabilities.length ? (
              instance.capabilities.map((capability) => (
                <span className="tag" key={capability}>
                  {capability}
                </span>
              ))
            ) : (
              <span className="dim">none reported</span>
            )}
          </div>
        </details>
      </section>

      <section className="help-section">
        <div className="help-section__head">
          <Shield className="icon" />
          <span>The boundary</span>
        </div>
        <p className="help-text">
          This dashboard is a client for one HLAO instance: one home, supervisor,
          socket, and token. It reads the supervisor’s live table and forwards what
          the wire reports. Local state is only the operator’s view: drafts, read
          markers, acknowledgements, filters, and selection. There is no scheduler,
          task board, durable transcript, or background monitor. Closing this app
          ends live observation and notifications.
        </p>
        <p className="help-text">
          Attention is derived from reported state only: waiting permission first,
          unacknowledged failure second, error notice third. Idle and settled are not
          completion. The dashboard is an operator client: it relays the provider’s
          asks, never answers one on your behalf, and never sends an agent identity.
        </p>
      </section>

      <section className="help-section">
        <div className="help-section__head">
          <span>Keyboard</span>
          <span className="caption">the intent set is fixed; the bindings are local</span>
        </div>
        <div className="shortcut-table">
          <Shortcut keys={["Ctrl", "K"]} label="Command palette" />
          <Shortcut keys={["Ctrl", "N"]} label="Spawn a session" />
          <Shortcut keys={["Ctrl", "Shift", "F"]} label="Find in retained history" />
          <Shortcut keys={["J"]} label="Next attention item" />
          <Shortcut keys={["K"]} label="Previous attention item" />
          <Shortcut keys={["Esc"]} label="Leave the current transient state / return to fleet" />
          <Shortcut keys={["Ctrl", "Enter"]} label="Send or queue the prompt" />
          <Shortcut keys={["?"]} label="This help" />
        </div>
        <p className="help-text dim">
          Shortcuts do not fire while typing. Every action is also in the command
          palette, and every session is reachable by handle.
        </p>
      </section>

      <section className="help-section">
        <div className="help-section__head">
          <span>Terms</span>
          <span className="caption">same words as the CLI</span>
        </div>
        <dl className="glossary">
          <dt>idle</dt>
          <dd>No active turn. The queue may still hold prompts.</dd>
          <dt>settled</dt>
          <dd>No active turn and an empty queue. Not completion.</dd>
          <dt>provider mode</dt>
          <dd>
            The provider’s native mode and the coarse permission policy. It is
            operator-only: the dashboard sets it with sessions.set_mode, and an
            agent cannot choose one. A backend manifest may set a default mode.
          </dd>
          <dt>pending permission</dt>
          <dd>
            A provider ask parked for the operator. Every ask is relayed; parallel
            asks queue FIFO and each is answered with the provider’s own options.
            The supervisor bounds the wait and fails closed at its deadline.
          </dd>
          <dt>plan</dt>
          <dd>Provider-reported state. Read-only here; never a task board or rollup.</dd>
          <dt>compaction</dt>
          <dd>Provider context compaction state. The dashboard cannot trigger it.</dd>
          <dt>notice</dt>
          <dd>
            A reported signal with severity and time. An error notice may join
            attention; warnings stay in the session.
          </dd>
          <dt>truncated</dt>
          <dd>
            The supervisor's bounded live buffer evicted history before the page.
            The transcript marks the exact boundary and never claims completeness.
            The provider's transcript is a separate, durable record: fork the
            provider session to open its history, or resume it after a restart.
          </dd>
          <dt>provider session</dt>
          <dd>
            The durable id the provider assigns and its own resume command accepts.
            The HLAO handle is an alias for this supervisor's lifetime; the
            provider id survives a restart.
          </dd>
          <dt>replay / history</dt>
          <dd>
            Events rebuilt by ACP session/load when a session is resumed or forked.
            They are marked in the transcript gutter and are not new activity.
          </dd>
          <dt>resume vs fork</dt>
          <dd>
            Resume reattaches to the same provider session and replays its history.
            Fork copies it into a new provider session and leaves the source
            untouched. Neither replays the interrupted turn.
          </dd>
        </dl>
      </section>

      <section className="help-section">
        <div className="help-section__head">
          <Bell className="icon" />
          <span>Notifications</span>
        </div>
        <ToggleRow
          label="Desktop notifications"
          description="Only while this window is open. Waiting permission and unacknowledged failure by default; never ordinary output and never “done”."
          checked={state.notifications}
          onChange={(value) => void enableNotifications(value)}
        />
        <p className="help-text dim">
          Notifications are cleared when the underlying state resolves. Closing the
          app stops them; there is no daemon.
        </p>
      </section>

      <section className="help-section">
        <div className="help-section__head">
          <Database className="icon" />
          <span>Local state</span>
          <Tag>{state.local.drafts ? Object.keys(state.local.drafts).length : 0} drafts</Tag>
        </div>
        <p className="help-text">
          Drafts, read markers, locally acknowledged failures, dismissed notices,
          filters, and selection are stored in this browser only, keyed by instance
          and session creation time. They are never uploaded.
        </p>
        <Button onPress={onClearLocal}>
          <Trash2 className="btn__icon icon" />
          Clear local dashboard state…
        </Button>
      </section>

      <section className="help-section help-danger">
        <div className="help-section__head">
          <TriangleAlert className="icon" />
          <span>Danger zone</span>
        </div>
        <p className="help-text">
          Shutting down the supervisor closes every live session and discards retained
          histories. It is not a cleanup action. Export anything you need first.
        </p>
        <Button
          variant="danger"
          onPress={onShutdown}
          isDisabled={state.mode === "demo"}
          title={state.mode === "demo" ? "The demo supervisor is a fixture" : undefined}
        >
          Shut down supervisor…
        </Button>
        {state.mode === "demo" ? (
          <p className="help-text dim">
            The demo supervisor cannot be shut down from here. Exit demo instead.
          </p>
        ) : null}
      </section>

      <div className="help-foot">
        <a href="/design" className="help-link">
          <ExternalLink className="icon" /> Design system specimen
        </a>
        <span>
          <Kbd>Esc</Kbd> closes this panel · closing the app ends observation
        </span>
      </div>
    </DialogShell>
  );
}

function Fact({
  label,
  value,
  mono,
  copy,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copy?: boolean;
}) {
  return (
    <div className="help-fact">
      <span className="help-fact__label">{label}</span>
      <span className={cn("help-fact__value", mono && "mono")}>{value}</span>
      {copy && value !== "not connected" ? (
        <Button size="sm" variant="ghost" onPress={() => void copyWithToast(value, label)}>
          Copy
        </Button>
      ) : null}
    </div>
  );
}

function Shortcut({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="shortcut-row">
      <span className="shortcut-row__keys">
        {keys.map((key) => (
          <Kbd key={key}>{key}</Kbd>
        ))}
      </span>
      <span className="shortcut-row__label">{label}</span>
    </div>
  );
}
