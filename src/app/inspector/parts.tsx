import { cn } from "../../lib/cn";
import { CopyButton } from "../ui";

/** Shared inspector row and tone helpers. */

export function Row({
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
    <div className="inspector__row">
      <span className="inspector__label">{label}</span>
      <span className={cn("inspector__value", mono && "mono")}>{value}</span>
      {copy ? (
        <CopyButton text={value} label={label} className="inspector__copy" />
      ) : null}
    </div>
  );
}

export function meterTone(percent: number | null): string | null {
  if (percent === null) return null;
  if (percent >= 90) return "meter--danger";
  if (percent >= 75) return "meter--warn";
  return null;
}

export function planStateTone(status: string): "completed" | "in_progress" | "pending" {
  if (status === "completed") return "completed";
  if (status === "in_progress") return "in_progress";
  return "pending";
}

export function planPriorityTone(priority: string): "high" | "medium" | "low" {
  if (priority === "high") return "high";
  if (priority === "medium") return "medium";
  return "low";
}
