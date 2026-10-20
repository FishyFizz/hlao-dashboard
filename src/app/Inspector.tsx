import { ListTree, Shield, TriangleAlert } from "lucide-react";
import { Button } from "../components/Button";
import { Handle } from "../components/Status";
import {
  canUse,
  store,
  type DashboardState,
} from "../store/store";
import {
  childrenOf,
  contextPercent,
  displayLabel,
  formatCost,
  formatDateTime,
  formatTokens,
  parentOf,
  planKindLabel,
  rootOf,
  sessionLocalKey,
} from "../store/model";
import type { SessionConfigOptionView, SessionView } from "../wire/protocol";
import { CopyButton, SelectField, ToggleRow } from "./ui";

export function Inspector({
  state,
  session,
  onOpenSession,
}: {
  state: DashboardState;
  session: SessionView;
  onOpenSession: (sessionId: string) => void;
}) {
  const key = sessionLocalKey(session);
  const notice = state.notices[key];
  const usage = session.usage;
  const percent = contextPercent(usage);
  const parent = parentOf(session, Object.values(state.sessions));
  const root = rootOf(session, Object.values(state.sessions));
  const children = childrenOf(session.id, Object.values(state.sessions));
  const subtree = Object.values(state.sessions).filter(
    (candidate) => candidate.rootId === session.rootId,
  );
  const canPlan = canUse(state, "session.plan");
  const canCompaction = canUse(state, "session.compaction");
  const canNotices = canUse(state, "session.notices");
  const canMessages = canUse(state, "session.messages");
  const canUsage = canUse(state, "session.usage");
  const canTitle = canUse(state, "session.title");
  const canAgent = canUse(state, "session.agent");
  const pendingPolicy = Boolean(state.pending.policy);
  const pendingMode = Boolean(state.pending.mode);
  const terminal =
    state.removed || session.status === "closed" || session.status === "failed";

  return (
    <div className="inspector">
      <section className="inspector__section">
        <div className="inspector__head">
          <span>Provider</span>
        </div>
        <div className="inspector__rows">
          <Row label="backend" value={session.backend} mono />
        </div>
        <details className="inspector__details">
          <summary>Provider details</summary>
          <div className="inspector__rows inspector__rows--tight">
            <Row label="cwd" value={session.cwd} mono copy />
            <Row
              label="agent"
              value={
                canAgent && session.agentName
                  ? `${session.agentName}${session.agentVersion ? `@${session.agentVersion}` : ""}`
                  : canAgent
                    ? "not reported"
                    : "not supported"
              }
              mono
            />
            <Row
              label="title"
              value={canTitle ? session.title || "not reported" : "not supported"}
            />
            <Row label="created by" value={session.createdBy ?? "not reported"} />
            <Row label="instance" value={state.home} mono />
          </div>
          {canMessages ? (
            <p className="inspector__note">
              Inter-session messages appear in the transcript; they are not
              operator prompts.
            </p>
          ) : null}
        </details>
      </section>

      <section className="inspector__section">
        <div className="inspector__head">
          <span>Layers</span>
        </div>
        <SelectField
          label="HLAO permission policy"
          value={session.permissionPolicy}
          disabled={terminal || pendingPolicy}
          onChange={(value) => {
            if (value === session.permissionPolicy) return;
            void store.setPolicy(value as "ask" | "allow" | "deny");
          }}
        >
          <option value="allow">allow</option>
          <option value="ask">ask</option>
          <option value="deny">deny</option>
        </SelectField>
        {terminal ? (
          <p className="inspector__none">
            {state.removed
              ? "Removed · controls disabled · transcript is a local snapshot"
              : "Ended · controls disabled"}
          </p>
        ) : null}
        {session.permissionPolicy === "ask" ? (
          <div className="notice notice--warn inspector__warn">
            <TriangleAlert className="icon" />
            <span className="notice__body">
              <span className="notice__title">ask can park a session indefinitely</span>
              <span>Answering is an operator action, here or in another client.</span>
            </span>
          </div>
        ) : null}

        {session.modes ? (
          <SelectField
            label="Provider mode"
            value={session.modes.currentModeId}
            disabled={terminal || pendingMode}
            onChange={(value) => {
              if (value === session.modes?.currentModeId) return;
              void store.setMode(value);
            }}
          >
            {session.modes.availableModes.map((mode) => (
              <option value={mode.id} key={mode.id}>
                {mode.name}
              </option>
            ))}
          </SelectField>
        ) : (
          <p className="inspector__none">No provider modes advertised.</p>
        )}

        {session.configOptions && session.configOptions.length > 0 ? (
          <div className="inspector__config">
            <div className="inspector__subhead">Provider config options</div>
            {session.configOptions.map((option) => (
              <ConfigOption
                key={option.id}
                option={option}
                pending={Boolean(state.pending[`config:${option.id}`])}
                disabled={terminal}
              />
            ))}
          </div>
        ) : (
          <p className="inspector__none">No provider config options advertised.</p>
        )}
      </section>

      <section className="inspector__section">
        <div className="inspector__head">
          <span>Usage</span>
        </div>
        {!canUsage ? (
          <p className="inspector__none">Not supported by this supervisor.</p>
        ) : usage ? (
          <>
            <div className={`meter${percent !== null && percent >= 90 ? " meter--danger" : percent !== null && percent >= 75 ? " meter--warn" : ""}`}>
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
                    className={`plan__state plan__state--${entry.status === "completed" ? "completed" : entry.status === "in_progress" ? "in_progress" : "pending"}`}
                  />
                  <span>{entry.content}</span>
                  <span className={`plan__priority plan__priority--${entry.priority === "high" ? "high" : entry.priority === "medium" ? "medium" : "low"}`}>
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

      <details className="inspector__section inspector__details">
        <summary>
          <span>Diagnostics</span>
          <span className="caption">local view</span>
        </summary>
        <div className="inspector__rows inspector__rows--tight">
          <Row label="agent session" value={session.agentSessionId ?? "not reported"} mono />
          <Row
            label="process"
            value={session.processId !== null ? String(session.processId) : "not reported"}
            mono
          />
          <Row label="last seq" value={String(session.lastSeq)} mono />
          <Row label="last stop" value={session.lastStopReason ?? "not reported"} mono />
          <Row
            label="exit"
            value={
              session.exit
                ? `${session.exit.code ?? "—"}${session.exit.signal ? ` · ${session.exit.signal}` : ""}`
                : "not reported"
            }
            mono
          />
        </div>
        <p className="inspector__note">
          These values are diagnostics from the session view, not orchestration
          status. Provider logs are not part of this surface.
        </p>
      </details>
    </div>
  );
}

function ConfigOption({
  option,
  pending,
  disabled,
}: {
  option: SessionConfigOptionView;
  pending: boolean;
  disabled: boolean;
}) {
  if (option.type === "boolean") {
    return (
      <ToggleRow
        label={option.name}
        checked={option.currentValue === true}
        disabled={disabled || pending}
        onChange={(value) => void store.setConfigOption(option.id, value)}
      />
    );
  }
  return (
    <SelectField
      label={option.name}
      value={String(option.currentValue)}
      disabled={disabled || pending}
      onChange={(value) => void store.setConfigOption(option.id, value)}
    >
      {option.values.map((candidate) => (
        <option value={candidate.value} key={candidate.value}>
          {candidate.name}
        </option>
      ))}
    </SelectField>
  );
}

function Row({
  label,
  value,
  mono,
  copy,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copy?: boolean;
}) {
  return (
    <div className="inspector__row">
      <span className="inspector__label">{label}</span>
      <span className={`inspector__value${mono ? " mono" : ""}`}>{value}</span>
      {copy ? <CopyButton text={value} label={label} /> : null}
    </div>
  );
}
