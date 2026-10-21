import { Shield } from "lucide-react";
import { Button } from "../components/Button";
import { Handle } from "../components/Status";
import { store } from "../store/store";
import { formatAge, formatDateTime } from "../store/model";
import type { SessionView } from "../wire/protocol";
import { useNow } from "./hooks";

/**
 * The operator relay for provider permission requests. Every ask is parked by
 * the supervisor and shown here with the provider's own options. Several
 * requests can be pending at once; each is answered individually by id.
 */
export function PermissionGate({ session }: { session: SessionView }) {
  const now = useNow();
  const permissions = session.pendingPermissions;
  if (permissions.length === 0) return null;
  const pending = store.getSnapshot().pending;
  const many = permissions.length > 1;

  return (
    <section
      className="permission-gate"
      aria-label={
        many
          ? `${permissions.length} permissions requested`
          : "Permission requested"
      }
    >
      <div className="permission-gate__head">
        <span className="permission-gate__badge">
          <Shield className="icon" />
          {many
            ? `${permissions.length} permissions requested`
            : "Permission requested"}
        </span>
        <span className="permission-gate__age">
          {many ? "FIFO queue" : ""}
        </span>
      </div>
      <div className="permission-gate__body">
        {permissions.map((permission, index) => {
          const sending = Boolean(pending[`permit:${permission.requestId}`]);
          const age = formatAge(permission.requestedAt, now);
          return (
            <div
              className="permission-gate__request"
              key={permission.requestId}
              data-request={permission.requestId}
            >
              <div className="permission-gate__question">
                <div className="permission-gate__title">{permission.title}</div>
                <div className="permission-gate__meta">
                  {many ? `queue ${index + 1} of ${permissions.length} · ` : ""}
                  {permission.kind ?? "permission"}
                  {permission.toolCallId ? ` · ${permission.toolCallId}` : ""} ·{" "}
                  <Handle id={session.id} />
                  <span
                    className="permission-gate__age"
                    title={formatDateTime(permission.requestedAt)}
                  >
                    {" "}
                    · waiting {age}
                  </span>
                </div>
              </div>
              {permission.options.length > 0 ? (
                <div
                  className="permission-gate__options"
                  role="group"
                  aria-label={`Permission options for ${permission.title}`}
                >
                  {permission.options.map((option) => (
                    <Button
                      key={option.optionId}
                      size="sm"
                      variant={option.kind === "deny" ? "danger" : "secondary"}
                      isDisabled={sending}
                      onPress={() =>
                        void store.permit(
                          permission.requestId,
                          option.optionId,
                        )
                      }
                      title={`Answer with ${option.optionId}`}
                    >
                      {option.name}
                    </Button>
                  ))}
                </div>
              ) : (
                <p className="permission-gate__explain permission-gate__explain--warn">
                  The provider reported no options for this request. There is no
                  safe default; answer from the CLI if the provider exposes one.
                </p>
              )}
              {sending ? (
                <span className="permission-gate__sending" role="status">
                  sending answer · waiting for the supervisor
                </span>
              ) : null}
            </div>
          );
        })}
        <details className="permission-gate__more">
          <summary>What these options do</summary>
          <p className="permission-gate__explain">
            The session cannot proceed until each request is answered. The
            dashboard never answers on your behalf, and it never chooses a
            provider option for you.
          </p>
          <p className="permission-gate__explain">
            Parallel requests are queued, not cancelled. Answer each one with the
            provider’s own options; the buttons answer only that request. The
            supervisor bounds the operator wait and fails closed at its deadline.
          </p>
        </details>
      </div>
    </section>
  );
}
