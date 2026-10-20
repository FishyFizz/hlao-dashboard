import { X } from "lucide-react";
import { store, type DashboardState } from "../store/store";

const TOAST_CLASS = {
  info: "toast",
  ok: "toast toast--ok",
  danger: "toast toast--danger",
} as const;

export function ToastRegion({ state }: { state: DashboardState }) {
  if (state.toasts.length === 0) return null;
  return (
    <div className="toast-region" aria-live="polite" aria-atomic="false">
      {state.toasts.map((toast) => (
        <div className={TOAST_CLASS[toast.tone]} key={toast.id} role="status">
          <div className="toast__body">
            <span className="toast__title">{toast.title}</span>
            {toast.text ? <span className="toast__text">{toast.text}</span> : null}
          </div>
          <button
            type="button"
            className="toast__close"
            aria-label={`Dismiss ${toast.title}`}
            onClick={() => store.dismissToast(toast.id)}
          >
            <X className="icon" />
          </button>
        </div>
      ))}
    </div>
  );
}
