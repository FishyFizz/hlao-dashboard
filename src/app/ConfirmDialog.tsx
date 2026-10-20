import type { ReactNode } from "react";
import { Button } from "../components/Button";
import { DialogShell } from "./DialogShell";

export function ConfirmDialog({
  open,
  title,
  kicker,
  children,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "primary",
  busy,
  confirmDisabled,
  onConfirm,
  onCancel,
  hideCancel,
}: {
  open: boolean;
  title: string;
  kicker?: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "primary" | "danger" | "secondary";
  busy?: boolean;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  hideCancel?: boolean;
}) {
  return (
    <DialogShell
      open={open}
      onClose={onCancel}
      kicker={kicker}
      title={title}
      footer={
        <>
          {hideCancel ? null : (
            <Button variant="ghost" onPress={onCancel} isDisabled={busy}>
              {cancelLabel}
            </Button>
          )}
          <Button
            variant={tone}
            onPress={onConfirm}
            isDisabled={busy || confirmDisabled}
          >
            {busy ? "Working…" : confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </DialogShell>
  );
}
