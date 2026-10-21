import { Shield, TriangleAlert } from "lucide-react";
import { Button } from "../../components/Button";
import { formatDateTime, sessionLocalKey } from "../../store/model";
import { canUse, store, type DashboardState } from "../../store/store";
import type { SessionView } from "../../wire/protocol";
import { CAPABILITIES } from "../../wire/protocol";

export function NoticeSection({
  state,
  session,
}: {
  state: DashboardState;
  session: SessionView;
}) {
  const canNotices = canUse(state, CAPABILITIES.notices);
  const notice = state.notices[sessionLocalKey(session)];
  return (
    <section className="inspector__section">
      <div className="inspector__head">
        <span>Notice</span>
      </div>
      {!canNotices ? (
        <p className="inspector__none">Not supported by this supervisor.</p>
      ) : notice ? (
        <div className={`notice notice--${notice.severity === "error" ? "danger" : "warn"}`}>
          {notice.severity === "error" ? (
            <TriangleAlert className="icon" />
          ) : (
            <Shield className="icon" />
          )}
          <span className="notice__body">
            <span className="notice__title">{notice.text}</span>
            <span className="caption">
              seq {notice.seq} · {notice.severity} · {formatDateTime(notice.at)}
            </span>
          </span>
        </div>
      ) : (
        <p className="inspector__none">No notice reported.</p>
      )}
      {notice?.severity === "error" ? (
        <Button size="sm" onPress={() => store.dismissNotice(session.id)}>
          Dismiss locally
        </Button>
      ) : null}
    </section>
  );
}
