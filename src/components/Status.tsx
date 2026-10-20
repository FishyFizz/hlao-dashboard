import type { ReactNode } from "react";
import { cn } from "../lib/cn";

export type SessionStatus =
  | "starting"
  | "idle"
  | "busy"
  | "waiting_permission"
  | "closed"
  | "failed";

const statusLabels: Record<SessionStatus, string> = {
  starting: "Starting",
  idle: "Idle",
  busy: "Running",
  waiting_permission: "Waiting for permission",
  closed: "Closed",
  failed: "Failed",
};

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
      <span>{label ?? statusLabels[status]}</span>
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
