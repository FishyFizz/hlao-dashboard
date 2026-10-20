import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { statusLabel, type SessionStatus } from "../wire/protocol";

export type { SessionStatus };

/** A tighter label for dense rows; the full label lives in the wire vocabulary. */
const SHORT_STATUS_LABELS: Record<SessionStatus, string> = {
  starting: "Starting",
  idle: "Idle",
  busy: "Running",
  waiting_permission: "Waiting",
  closed: "Closed",
  failed: "Failed",
};

export function shortStatusLabel(status: SessionStatus): string {
  return SHORT_STATUS_LABELS[status];
}

/** Lamp classes for a status; a lamp is shape and color, never the only signal. */
export function statusLampClass(status: SessionStatus): string {
  switch (status) {
    case "busy":
      return "lamp lamp--accent";
    case "idle":
      return "lamp lamp--ok";
    case "waiting_permission":
      return "lamp lamp--warn lamp--blink";
    case "failed":
      return "lamp lamp--danger";
    case "starting":
    case "closed":
      return "lamp lamp--off";
  }
}

export function Status({
  status,
  label,
  className,
}: {
  status: SessionStatus;
  label?: string;
  className?: string;
}) {
  return (
    <span className={cn("status", `status--${status}`, className)}>
      <span className="status__lamp" aria-hidden="true" />
      <span>{label ?? statusLabel(status)}</span>
    </span>
  );
}

export function Tag({
  tone,
  children,
  className,
}: {
  tone?: "accent" | "ok" | "warn" | "danger";
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("tag", tone && `tag--${tone}`, className)}>{children}</span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

export function Handle({ id }: { id: string }) {
  return (
    <span className="handle">
      <span className="handle__hash">#</span>
      {id}
    </span>
  );
}
