import { ListTree } from "lucide-react";
import { formatDateTime, planKindLabel } from "../../store/model";
import { canUse, type DashboardState } from "../../store/store";
import type { SessionView } from "../../wire/protocol";
import { CAPABILITIES } from "../../wire/protocol";
import { planPriorityTone, planStateTone } from "./parts";

export function PlanSection({
  state,
  session,
}: {
  state: DashboardState;
  session: SessionView;
}) {
  const canPlan = canUse(state, CAPABILITIES.plan);
  return (
    <section className="inspector__section">
      <div className="inspector__head">
        <span>Plan</span>
      </div>
      {!canPlan ? (
        <p className="inspector__none">Not supported by this supervisor.</p>
      ) : !session.plan ? (
        <p className="inspector__none">No plan reported.</p>
      ) : (
        <div className="plan">
          <div className="plan__head">
            <ListTree className="icon" />
            <span>{planKindLabel(session.plan)}</span>
            <strong>{formatDateTime(session.plan.updatedAt)}</strong>
          </div>
          {session.plan.kind === "items" && session.plan.entries ? (
            session.plan.entries.map((entry, index) => (
              <div className="plan__row" key={`${entry.content}-${index}`}>
                <span
                  className={`plan__state plan__state--${planStateTone(entry.status)}`}
                />
                <span>{entry.content}</span>
                <span
                  className={`plan__priority plan__priority--${planPriorityTone(entry.priority)}`}
                >
                  {entry.priority}
                </span>
              </div>
            ))
          ) : (
            <pre className="inspector__pre">
              {session.plan.content ?? session.plan.uri ?? "No plan content reported."}
            </pre>
          )}
        </div>
      )}
      {session.plan ? (
        <details className="inspector__details">
          <summary>About provider plans</summary>
          <p className="inspector__note">
            Provider-reported and read-only. It is not a task board and is not
            aggregated across sessions.
          </p>
        </details>
      ) : null}
    </section>
  );
}
