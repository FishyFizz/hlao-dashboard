import { Shield } from "lucide-react";
import { Button } from "../components/Button";
import { Handle } from "../components/Status";
import { store } from "../store/store";
import { formatAge, formatDateTime } from "../store/model";
import type { SessionView } from "../wire/protocol";
import { useNow } from "./hooks";

export function PermissionGate({
  session,
  onAlways,
}: {
  session: SessionView;
  onAlways: () => void;
}) {
  const now = useNow();
  const permission = session.pendingPermission;
  if (!permission) return null;
  const pending = Boolean(store.getSnapshot().pending[`permit:${permission.requestId}`]);
  const age = formatAge(permission.requestedAt, now);
  return (
    <section className="permission-gate" aria-label="Permission requested">
      <div className="permission-gate__head">
        <span className="permission-gate__badge">
          <Shield className="icon" />
          Permission requested
        </span>
        <span className="permission-gate__age" title={formatDateTime(permission.requestedAt)}>
          waiting {age}
        </span>
      </div>
      <div className="permission-gate__body">
        <div className="permission-gate__question">
          <div className="permission-gate__title">{permission.title}</div>
          <div className="permission-gate__meta">
            {permission.kind ?? "permission"}
            {permission.toolCallId ? ` · ${permission.toolCallId}` : ""} · <Handle id={session.id} />
          </div>
        </div>
        <p className="permission-gate__explain">
          The session cannot proceed until this request is answered. The dashboard
          never answers it on your behalf.
        </p>
        {permission.options.length > 0 ? (
          <div className="permission-gate__options" role="group" aria-label="Permission options">
            {permission.options.map((option) => (
              <Button
                key={option.optionId}
                size="sm"
                variant={option.kind === "deny" ? "danger" : "secondary"}
                isDisabled={pending}
                onPress={() => void store.permit(option.optionId, false)}
                title={`Answer with ${option.optionId}`}
              >
                {option.name}
              </Button>
            ))}
            <Button
              size="sm"
              variant="ghost"
              isDisabled={pending}
              onPress={onAlways}
              title="Answer now and switch this session's HLAO policy to allow"
            >
              Allow always &amp; set policy…
            </Button>
          </div>
        ) : (
          <p className="permission-gate__explain permission-gate__explain--warn">
            The provider reported no options for this request. There is no safe
            default; answer from the CLI if the provider exposes one.
          </p>
        )}
        {pending ? (
          <span className="permission-gate__sending" role="status">
            sending answer · waiting for the supervisor
          </span>
        ) : null}
        <span className="permission-gate__consequence">
          The options above answer this request only. “Allow always &amp; set policy…”
          also switches the HLAO policy to <span className="mono">allow</span>; future
          requests will not ask. The provider mode is a separate layer.
        </span>
      </div>
    </section>
  );
}
