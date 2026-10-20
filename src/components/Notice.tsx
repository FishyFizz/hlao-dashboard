import type { ReactNode } from "react";
import { Info, TriangleAlert } from "lucide-react";
import { cn } from "../lib/cn";

/** Inline condition notice: a title, an optional body, and a tone. */
export function Notice({
  tone = "warn",
  title,
  children,
  className,
}: {
  tone?: "info" | "warn" | "danger";
  title: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const Icon = tone === "info" ? Info : TriangleAlert;
  return (
    <div className={cn("notice", `notice--${tone}`, className)}>
      <Icon className="icon" aria-hidden="true" />
      <div className="notice__body">
        <span className="notice__title">{title}</span>
        {children}
      </div>
    </div>
  );
}
