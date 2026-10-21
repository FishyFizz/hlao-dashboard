import { History, Play } from "lucide-react";
import { Button } from "../../components/Button";
import { formatAge } from "../../store/model";
import type { RecoveryReceiptView } from "../../wire/protocol";

/** One historical spawn receipt that has no live attached session. */
export function RecoveryRow({
  receipt,
  now,
  busy,
  onRecover,
  onQuickResume,
}: {
  receipt: RecoveryReceiptView;
  now: number;
  busy: boolean;
  onRecover: (receipt: RecoveryReceiptView) => void;
  onQuickResume: (receipt: RecoveryReceiptView) => void;
}) {
  const parent = receipt.parentHlaoName
    ? `under ${receipt.parentHlaoName}`
    : receipt.parentHlaoSessionId
      ? `under #${receipt.parentHlaoSessionId}`
      : null;
  return (
    <div className="rail-recovery">
      <button
        type="button"
        className="rail-recovery__main"
        onClick={() => onRecover(receipt)}
        title="Open the resume dialog with this provider id"
      >
        <span className="rail-recovery__top">
          <History className="rail-recovery__icon icon" />
          <span className="rail-recovery__label">
            {receipt.name ?? receipt.childProviderId}
          </span>
          <span className="rail-recovery__age">
            {formatAge(receipt.recordedAt, now)}
          </span>
        </span>
        <span className="rail-recovery__meta">
          {receipt.backend} · {receipt.cwd}
        </span>
        <span className="rail-recovery__meta rail-recovery__provider">
          {receipt.childProviderId}
          {parent ? ` · ${parent}` : null}
        </span>
      </button>
      <Button
        size="sm"
        variant="secondary"
        className="rail-recovery__resume"
        onPress={() => onQuickResume(receipt)}
        isDisabled={busy}
        aria-label={`Quick resume ${receipt.name ?? receipt.childProviderId}`}
        title="Resume with the recorded backend, cwd, and name"
      >
        <Play className="icon" />
        Resume
      </Button>
    </div>
  );
}
