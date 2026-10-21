import { useEffect, useState } from "react";
import { Button } from "../components/Button";
import { Handle } from "../components/Status";
import { store, type DashboardState } from "../store/store";
import type { SessionView } from "../wire/protocol";
import { DialogShell } from "./DialogShell";

export function RenameDialog({
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
  // The header shows the name, falling back to the provider title for a
  // session the operator never named. Start the field with that visible label
  // so double-clicking the header edits what is actually on screen.
  const current = session.name ?? session.title ?? "";
  const [name, setName] = useState(current);
  const pending = Boolean(state.pending.rename);

  useEffect(() => {
    if (open) setName(current);
  }, [open, current]);

  const duplicate = Object.values(state.sessions).filter(
    (candidate) =>
      candidate.id !== session.id &&
      candidate.name &&
      name.trim() &&
      candidate.name === name.trim(),
  );
  const submit = () => {
    if (pending) return;
    void store.rename(name).then((ok) => {
      if (ok) onClose();
    });
  };

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      kicker={`Session ${session.id}`}
      title="Rename session"
      footer={
        <>
          <Button variant="ghost" onPress={onClose} isDisabled={pending}>
            Cancel
          </Button>
          <Button variant="primary" onPress={submit} isDisabled={pending}>
            {pending ? "Saving…" : "Save name"}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label className="field">
          <span className="field__label">Name</span>
          <input
            className="field__input"
            value={name}
            autoFocus
            placeholder="Empty clears the name"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
      </form>
      <p className="dialog-note">
        The handle <Handle id={session.id} /> does not change. Names are mutable
        labels, not identity. Duplicate names are allowed by the wire, but they make
        name-based addressing ambiguous.
      </p>
      {duplicate.length > 0 ? (
        <div className="notice notice--warn">
          <span className="notice__body">
            <span className="notice__title">
              {duplicate.length} other live session{duplicate.length === 1 ? "" : "s"}{" "}
              already use this name.
            </span>
            <span>
              {duplicate.map((candidate) => `#${candidate.id}`).join(", ")}. Use the
              handle when addressing.
            </span>
          </span>
        </div>
      ) : null}
    </DialogShell>
  );
}
