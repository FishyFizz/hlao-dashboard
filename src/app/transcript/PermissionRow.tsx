import { Check, Shield } from "lucide-react";
import { eventActor, stringField, type RenderItem } from "../../store/model";
import type { SessionView } from "../../wire/protocol";
import { StructuralRow } from "./eventFrame";

export function PermissionRow({
  item,
  session,
}: {
  item: Extract<RenderItem, { kind: "permission" }>;
  session: SessionView;
}) {
  const resolution = item.resolution;
  const pending =
    !resolution &&
    item.requestId !== null &&
    session.pendingPermissions.some(
      (permission) => permission.requestId === item.requestId,
    );
  const optionId = resolution
    ? stringField(resolution.data, ["optionId"])
    : null;
  const reason = resolution ? stringField(resolution.data, ["reason"]) : null;
  const actor = resolution ? eventActor(resolution) : null;
  const text = resolution
    ? `${item.title} · ${optionId ? `Option ${optionId}` : "Cancelled"}${
        reason ? ` · ${reason}` : ""
      }${actor ? ` · by ${actor}` : ""}`
    : pending
      ? `Waiting in the gate above · ${item.title}`
      : `History · ${item.title}`;
  return (
    <StructuralRow
      seq={item.seq}
      at={item.at}
      type="permission"
      text={text}
      icon={
        resolution ? (
          <Check className="icon" />
        ) : (
          <Shield className="icon" />
        )
      }
    />
  );
}
