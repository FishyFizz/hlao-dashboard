import { formatDateTime } from "../../store/model";
import { canUse, type DashboardState } from "../../store/store";
import type { SessionView } from "../../wire/protocol";
import { CAPABILITIES } from "../../wire/protocol";
import { Row } from "./parts";

export function CompactionSection({
  state,
  session,
}: {
  state: DashboardState;
  session: SessionView;
}) {
  const canCompaction = canUse(state, CAPABILITIES.compaction);
  return (
    <section className="inspector__section">
      <div className="inspector__head">
        <span>Compaction</span>
      </div>
      {!canCompaction ? (
        <p className="inspector__none">Not supported by this supervisor.</p>
      ) : !session.compaction ? (
        <p className="inspector__none">No compaction reported.</p>
      ) : (
        <>
          <div className="inspector__rows inspector__rows--tight">
            <Row label="status" value={session.compaction.status} mono />
            <Row
              label="updated"
              value={formatDateTime(session.compaction.updatedAt)}
              mono
            />
          </div>
          {session.compaction.summary ? (
            <details className="inspector__details">
              <summary>Provider summary</summary>
              <pre className="inspector__pre">{session.compaction.summary}</pre>
              <p className="inspector__note">
                Compaction is provider state. The dashboard cannot trigger or
                prevent it.
              </p>
            </details>
          ) : null}
          {session.compaction.error ? (
            <p className="inspector__error">{session.compaction.error}</p>
          ) : null}
        </>
      )}
    </section>
  );
}
