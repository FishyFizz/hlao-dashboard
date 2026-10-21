import { cn } from "../../lib/cn";
import {
  contextPercent,
  formatCost,
  formatDateTime,
  formatTokens,
} from "../../store/model";
import { canUse, type DashboardState } from "../../store/store";
import type { SessionView } from "../../wire/protocol";
import { CAPABILITIES } from "../../wire/protocol";
import { meterTone, Row } from "./parts";

export function UsageSection({
  state,
  session,
}: {
  state: DashboardState;
  session: SessionView;
}) {
  const usage = session.usage;
  const percent = contextPercent(usage);
  const canUsage = canUse(state, CAPABILITIES.usage);
  return (
    <section className="inspector__section">
      <div className="inspector__head">
        <span>Usage</span>
      </div>
      {!canUsage ? (
        <p className="inspector__none">Not supported by this supervisor.</p>
      ) : usage ? (
        <>
          <div className={cn("meter", meterTone(percent))}>
            <div className="meter__head">
              <span className="meter__label">context</span>
              <span className="meter__value">
                {formatTokens(usage.used)} / {formatTokens(usage.size)}
                {percent !== null ? ` · ${percent}%` : ""}
              </span>
            </div>
            <div className="meter__track">
              <div
                className="meter__fill"
                style={{ width: `${percent ?? 0}%` }}
              />
            </div>
          </div>
          <details className="inspector__details">
            <summary>Usage details</summary>
            <div className="inspector__rows inspector__rows--tight">
              <Row label="reported cost" value={formatCost(usage)} mono />
              <Row label="snapshot at" value={formatDateTime(usage.at)} mono />
            </div>
            <p className="inspector__note">
              The latest reported snapshot. Not a cumulative bill, a session
              total, or a total token count.
            </p>
          </details>
        </>
      ) : (
        <p className="inspector__none">Usage not reported.</p>
      )}
    </section>
  );
}
