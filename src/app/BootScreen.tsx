import { Tag } from "../components/Status";
import { WIRE_MAJOR, WIRE_MINOR } from "../wire/protocol";

/** The shared boot/suspense screen; the design specimen uses the same shape. */
export function BootScreen({
  title = "HLAO dashboard",
  text,
}: {
  title?: string;
  text: string;
}) {
  return (
    <div className="boot">
      <div className="boot__mark" aria-hidden="true">
        <span />
      </div>
      <div className="boot__title">{title}</div>
      <div className="boot__text">{text}</div>
      <Tag>wire {WIRE_MAJOR}.{WIRE_MINOR}</Tag>
    </div>
  );
}
