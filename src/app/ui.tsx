import { useId, type ReactNode } from "react";
import { Copy } from "lucide-react";
import { IconButton } from "../components/Button";
import { store } from "../store/store";

export function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).then(
      () => true,
      () => fallbackCopy(text),
    );
  }
  return Promise.resolve(fallbackCopy(text));
}

function fallbackCopy(text: string): boolean {
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

export async function copyWithToast(text: string, label: string): Promise<void> {
  const ok = await copyText(text);
  store.addToast({
    tone: ok ? "ok" : "danger",
    title: ok ? `${label} copied` : `Could not copy ${label.toLowerCase()}`,
  });
}

export function CopyButton({
  text,
  label,
  className,
}: {
  text: string;
  label: string;
  className?: string;
}) {
  return (
    <IconButton
      className={className}
      aria-label={`Copy ${label}`}
      title={`Copy ${label}`}
      onPress={() => void copyWithToast(text, label)}
    >
      <Copy className="icon" />
    </IconButton>
  );
}

export function FieldLabel({
  children,
  hint,
  htmlFor,
}: {
  children: ReactNode;
  hint?: string;
  htmlFor?: string;
}) {
  return (
    <label className="field" htmlFor={htmlFor}>
      <span className="field__label">{children}</span>
      {hint ? <span className="field__hint">{hint}</span> : null}
    </label>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  children,
  hint,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  hint?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <div className="field__control">
        <select
          id={id}
          className="field__input app-select"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        >
          {children}
        </select>
      </div>
      {hint ? <span className="field__hint">{hint}</span> : null}
    </div>
  );
}

export function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="app-toggle"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="app-toggle__text">
        <span className="app-toggle__label">{label}</span>
        {description ? <span className="app-toggle__desc">{description}</span> : null}
      </span>
      <span className="app-toggle__track" aria-hidden="true">
        <span className="app-toggle__thumb" />
      </span>
    </button>
  );
}

export function downloadText(filename: string, text: string, type: string): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function safeText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

export function shortStatus(status: string): string {
  if (status === "waiting_permission") return "Waiting";
  if (status === "busy") return "Running";
  if (status === "idle") return "Idle";
  if (status === "starting") return "Starting";
  if (status === "failed") return "Failed";
  if (status === "closed") return "Closed";
  return status;
}
