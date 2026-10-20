import type { ReactNode } from "react";
import { cn } from "../lib/cn";

export function Section({
  id,
  index,
  title,
  description,
  children,
}: {
  id: string;
  index: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="section" id={id}>
      <div className="section__head">
        <span className="section__index">{index}</span>
        <div>
          <h2 className="section__title">{title}</h2>
          {description ? <p className="section__desc">{description}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

export function Specimen({
  label,
  note,
  flush = false,
  children,
  className,
}: {
  label: string;
  note?: string;
  flush?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("specimen", className)}>
      <div className="specimen__head">
        <span className="specimen__label">{label}</span>
        {note ? <span className="specimen__note">{note}</span> : null}
      </div>
      <div className={cn("specimen__body", flush && "specimen__body--flush")}>
        {children}
      </div>
    </div>
  );
}
