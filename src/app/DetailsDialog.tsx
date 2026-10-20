import { Button } from "../components/Button";
import type { DashboardState } from "../store/store";
import { store } from "../store/store";
import type { SessionView } from "../wire/protocol";
import { DialogShell } from "./DialogShell";
import { Inspector } from "./Inspector";

export function DetailsDialog({
  open,
  state,
  session,
  onClose,
}: {
  open: boolean;
  state: DashboardState;
  session: SessionView;
  onClose: () => void;
}) {
  return (
    <DialogShell
      open={open}
      onClose={onClose}
      kicker={`Session #${session.id}`}
      title="Session details"
      wide
      className="details-dialog"
      footer={
        <Button variant="primary" onPress={onClose}>
          Close
        </Button>
      }
    >
      <Inspector
        state={state}
        session={session}
        onOpenSession={(sessionId) => {
          onClose();
          store.selectSession(sessionId);
        }}
      />
    </DialogShell>
  );
}
