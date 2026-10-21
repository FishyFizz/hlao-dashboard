import { Handle } from "../../components/Status";
import {
  childrenOf,
  displayLabel,
  parentOf,
  rootOf,
} from "../../store/model";
import type { DashboardState } from "../../store/store";
import type { SessionView } from "../../wire/protocol";

export function LineageSection({
  state,
  session,
  onOpenSession,
}: {
  state: DashboardState;
  session: SessionView;
  onOpenSession: (sessionId: string) => void;
}) {
  const sessions = Object.values(state.sessions);
  const parent = parentOf(session, sessions);
  const root = rootOf(session, sessions);
  const children = childrenOf(session.id, sessions);
  const subtree = sessions.filter(
    (candidate) => candidate.rootId === session.rootId,
  );
  return (
    <details className="inspector__section inspector__details">
      <summary>
        <span>Lineage</span>
        <span className="caption">{subtree.length} in subtree</span>
      </summary>
      <div className="tree">
        {root ? (
          <div className="tree__row">
            <span className="lamp lamp--ok" />
            <button
              type="button"
              className="tree__link"
              onClick={() => onOpenSession(root.id)}
            >
              <Handle id={root.id} />
              <span className="tree__name">{displayLabel(root)}</span>
            </button>
            <span className="tree__meta">root</span>
          </div>
        ) : null}
        {parent ? (
          <div className="tree__row">
            <span className="lamp lamp--accent" />
            <button
              type="button"
              className="tree__link"
              onClick={() => onOpenSession(parent.id)}
            >
              <Handle id={parent.id} />
              <span className="tree__name">{displayLabel(parent)}</span>
            </button>
            <span className="tree__meta">parent</span>
          </div>
        ) : null}
        <div className="tree__row">
          <span className="lamp lamp--accent" />
          <Handle id={session.id} />
          <span className="tree__name">{displayLabel(session)}</span>
          <span className="tree__meta">self</span>
        </div>
        {children.length > 0 ? (
          <div className="tree__children">
            {children.map((child) => (
              <div className="tree__row" key={child.id}>
                <span className={`lamp lamp--${child.status === "failed" ? "danger" : child.status === "idle" ? "ok" : "accent"}`} />
                <button
                  type="button"
                  className="tree__link"
                  onClick={() => onOpenSession(child.id)}
                >
                  <Handle id={child.id} />
                  <span className="tree__name">{displayLabel(child)}</span>
                </button>
                <span className="tree__meta">{child.status}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <div className="lineage-counts">
        <span>{subtree.length} in root subtree</span>
        <span>
          {subtree.filter((candidate) => candidate.status === "waiting_permission").length} waiting
        </span>
        <span>
          {subtree.filter((candidate) => candidate.status === "failed").length} failed
        </span>
      </div>
      <p className="inspector__note">
        Lineage is read from parentId/rootId. Every session remains addressable;
        this tree is not a permission boundary or a rollup status.
      </p>
    </details>
  );
}
