import { Database, Monitor, Shield } from "lucide-react";
import { Button } from "../components/Button";
import { DialogShell } from "./DialogShell";

export function IntroDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <DialogShell
      open={open}
      onClose={onClose}
      kicker="First run"
      title="A client for one HLAO instance."
      wide
      footer={
        <Button variant="primary" onPress={onClose}>
          Open dashboard
        </Button>
      }
    >
      <p className="dialog-lede">
        This dashboard reads one local supervisor and shows what it reports. It is
        not a task board, a chat app, a transcript store, or a second source of
        truth. Closing it ends live observation; there is no background monitor.
      </p>
      <div className="intro-points">
        <div>
          <Monitor className="icon" />
          <span>
            <strong>One instance</strong>
            <span>
              One home, supervisor, socket, and token. Handles resolve only inside
              this instance.
            </span>
          </span>
        </div>
        <div>
          <Database className="icon" />
          <span>
            <strong>No orchestration store</strong>
            <span>
              Live sessions are the state. Drafts, read markers, and selection are
              local operator state only.
            </span>
          </span>
        </div>
        <div>
          <Shield className="icon" />
          <span>
            <strong>No token in this page</strong>
            <span>
              A local bridge holds the supervisor credential. This origin gets a
              projection, never supervisor.json.
            </span>
          </span>
        </div>
      </div>
      <p className="dialog-note">
        Attention is structural: a waiting permission, an unacknowledged failure, or
        an error notice. Idle and settled are never “done”.
      </p>
    </DialogShell>
  );
}
