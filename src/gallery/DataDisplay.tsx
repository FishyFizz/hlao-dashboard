import type { ReactNode } from "react";
import {
  Check,
  CircleAlert,
  CornerDownRight,
  Filter,
  ListTree,
  MessageSquare,
  Power,
  Shield,
  Terminal,
  TriangleAlert,
} from "lucide-react";
import { Button, IconButton } from "../components/Button";
import { Section, Specimen } from "../components/Section";
import { Handle, Status, Tag } from "../components/Status";
import { fleet } from "../data/fleet";

function EventIcon({ type }: { type: string }) {
  if (type.startsWith("tool")) return <Terminal className="icon" />;
  if (type.startsWith("permission")) return <Shield className="icon" />;
  if (type.startsWith("plan")) return <ListTree className="icon" />;
  if (type === "session.failed") return <CircleAlert className="icon" />;
  if (type === "session.closed") return <Power className="icon" />;
  return <MessageSquare className="icon" />;
}

function Meta({
  type,
  children,
}: {
  type: string;
  children?: ReactNode;
}) {
  return (
    <div className="event__meta">
      <span className="event__type">{type}</span>
      {children ? <span className="event__sep">/</span> : null}
      {children}
    </div>
  );
}

export function DataDisplay() {
  return (
    <>
      <Section
        id="table"
        index="10"
        title="Fleet table"
        description="The fleet is a table, not a card wall. One row per session, one status lamp, one six-character handle. The selected row gets a 2px cyan rule and a wash; nothing else moves."
      >
        <Specimen
          label="Live fleet"
          note="Rows 34px. Attention first; the last event is truncated, never wrapped."
          flush
        >
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Status</th>
                  <th scope="col">Session</th>
                  <th scope="col">Backend</th>
                  <th scope="col">Turn</th>
                  <th scope="col">Queue</th>
                  <th scope="col">Context</th>
                  <th scope="col">Last event</th>
                  <th scope="col">Age</th>
                </tr>
              </thead>
              <tbody>
                {fleet.map((row) => (
                  <tr key={row.id} data-selected={row.selected ? true : undefined}>
                    <td>
                      <Status status={row.status} />
                    </td>
                    <td>
                      <div className="table__session">
                        <span className="table__name">{row.name}</span>
                        <span className="table__id">#{row.id}</span>
                      </div>
                    </td>
                    <td>
                      <span className="data-1">{row.backend}</span>
                    </td>
                    <td>
                      <span className="table__num">{String(row.turn).padStart(2, "0")}</span>
                    </td>
                    <td>
                      <span className="table__num">{String(row.queue).padStart(2, "0")}</span>
                    </td>
                    <td>
                      <span className="table__meter">
                        <span className="table__meter-track">
                          <span
                            className="table__meter-fill"
                            data-warn={row.context >= 75 ? "true" : undefined}
                            data-danger={row.context >= 90 ? "true" : undefined}
                            style={{ width: `${row.context}%` }}
                          />
                        </span>
                        <span className="table__num">{row.context}%</span>
                      </span>
                    </td>
                    <td>
                      <span className="table__last">
                        <EventIcon type={row.lastType} />
                        <span>{row.lastTitle}</span>
                      </span>
                    </td>
                    <td>
                      <span className="table__age">{row.age}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="table__footer">
              <span>6 of 6 · 2 need attention</span>
              <span>fleet subscription · wire 3.0</span>
            </div>
          </div>
        </Specimen>
      </Section>

      <Section
        id="transcript"
        index="11"
        title="Transcript"
        description="One event per row, sequence and time in the gutter, type and actor in the meta line. Known types get a deliberate shape; unknown types get a generic row. The layout never depends on a payload field it has not read."
      >
        <Specimen
          label="Session 4f2a9c · turn 07"
          note="The event type is the renderer key. Unknown types fall back; they never break the page."
          flush
        >
          <div className="transcript">
            <div className="transcript__bar">
              <span className="transcript__title">
                <Status status="busy" />
                <strong>Transcript</strong>
                <Handle id="4f2a9c" />
                <span>turn 07</span>
              </span>
              <span className="transcript__actions">
                <Tag tone="accent">
                  <span className="lamp lamp--accent" />
                  Live
                </Tag>
                <Button size="sm" variant="ghost">
                  Follow
                </Button>
                <IconButton aria-label="Filter transcript">
                  <Filter className="btn__icon icon" />
                </IconButton>
              </span>
            </div>

            <div className="event event--divider">Turn 07 · 14:02:11 · operator prompt</div>

            <div className="event event--user">
              <div className="event__gutter">
                <span className="event__seq">0412</span>
                <span className="event__time">14:02:11</span>
              </div>
              <div className="event__body">
                <Meta type="prompt.sent">
                  <span>operator →</span>
                  <Handle id="4f2a9c" />
                  <span>· message</span>
                  <span className="ident">8c41</span>
                </Meta>
                <p className="event__text">
                  Run the auth tests and report the first failure. Do not change retry semantics
                  until you have shown me the race.
                </p>
              </div>
            </div>

            <div className="event event--thought">
              <div className="event__gutter">
                <span className="event__seq">0413</span>
                <span className="event__time">14:02:14</span>
              </div>
              <div className="event__body">
                <Meta type="agent.thought">claude · 1.2s</Meta>
                <p className="event__text">
                  The failing test is in the token refresh path. I will isolate the mutex before
                  changing any behavior.
                </p>
              </div>
            </div>

            <div className="event">
              <div className="event__gutter">
                <span className="event__seq">0414</span>
                <span className="event__time">14:02:19</span>
              </div>
              <div className="event__body">
                <Meta type="tool.call">Bash · 12.4s</Meta>
                <div className="tool">
                  <div className="tool__head">
                    <Terminal className="icon" />
                    <span className="tool__name">Bash</span>
                    <span>npm test -- auth/refresh</span>
                    <span className="tool__status tool__status--ok">completed</span>
                  </div>
                  <div className="tool__body">
                    <span className="tool__line tool__prompt">$ npm test -- auth/refresh</span>
                    <span className="tool__line tool__out">▶ auth/refresh.test.ts (12 tests)</span>
                    <span className="tool__line tool__out tool__out--danger">
                      ✕ refresh mutex releases before the token write (2)
                    </span>
                    <span className="tool__line tool__out">Tests: 2 failed, 10 passed · 12.4s</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="event event--permission">
              <div className="event__gutter">
                <span className="event__seq">0415</span>
                <span className="event__time">14:02:21</span>
              </div>
              <div className="event__body">
                <Meta type="permission.requested">
                  <span className="ident">9c1e07</span>
                  <span>· Bash · waiting</span>
                </Meta>
                <div className="permission-card">
                  <div className="permission-card__head">
                    <Shield className="icon" />
                    Permission requested · 18s ago
                  </div>
                  <div className="permission-card__body">
                    <div className="permission-card__title">Run shell command</div>
                    <div className="permission-card__meta">
                      Bash · npm test -- auth/refresh · session #9c1e07
                    </div>
                    <div className="permission-card__actions">
                      <Button size="sm">Allow once</Button>
                      <Button size="sm">Always allow</Button>
                      <Button size="sm" variant="danger">
                        Deny
                      </Button>
                    </div>
                    <span className="permission-card__consequence">
                      Each option answers only this request; the provider mode is unchanged.
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="event">
              <div className="event__gutter">
                <span className="event__seq">0416</span>
                <span className="event__time">14:02:26</span>
              </div>
              <div className="event__body">
                <Meta type="plan.update">claude · 4 entries</Meta>
                <div className="plan">
                  <div className="plan__head">
                    <ListTree className="icon" />
                    Plan updated
                    <strong>4 entries</strong>
                  </div>
                  <div className="plan__row">
                    <span className="plan__state plan__state--completed">
                      <Check className="icon" />
                    </span>
                    <span>Map the refresh mutex and its release points</span>
                    <span className="plan__priority plan__priority--high">high</span>
                  </div>
                  <div className="plan__row">
                    <span className="plan__state plan__state--completed">
                      <Check className="icon" />
                    </span>
                    <span>Reproduce the failure without touching retry behavior</span>
                    <span className="plan__priority plan__priority--high">high</span>
                  </div>
                  <div className="plan__row">
                    <span className="plan__state plan__state--in_progress" />
                    <span>Show the race and propose two fixes</span>
                    <span className="plan__priority plan__priority--medium">medium</span>
                  </div>
                  <div className="plan__row">
                    <span className="plan__state" />
                    <span>Wait for the operator&apos;s decision</span>
                    <span className="plan__priority">low</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="event event--notice">
              <div className="event__gutter">
                <span className="event__seq">0417</span>
                <span className="event__time">14:02:29</span>
              </div>
              <div className="event__body">
                <Meta type="notice">warning · usage</Meta>
                <div className="notice notice--warn">
                  <TriangleAlert className="icon" />
                  <div className="notice__body">
                    <span className="notice__title">Context use crossed 75%.</span>
                    <span>Compaction is available but has not run. The session can continue.</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="event">
              <div className="event__gutter">
                <span className="event__seq">0418</span>
                <span className="event__time">14:02:31</span>
              </div>
              <div className="event__body">
                <Meta type="agent.message">claude · 2.1s</Meta>
                <p className="event__text">
                  The failure is a race in the refresh mutex: the lock is released before the token
                  write completes, so a second refresh can read the old token.
                </p>
                <p className="event__text event__text--muted">
                  I can patch it, but the fix changes retry semantics. That is a product decision,
                  not a code decision.
                </p>
              </div>
            </div>

            <div className="event event--message">
              <div className="event__gutter">
                <span className="event__seq">0419</span>
                <span className="event__time">14:02:44</span>
              </div>
              <div className="event__body">
                <Meta type="session.message">
                  <Handle id="b73d11" />
                  <span>→</span>
                  <Handle id="4f2a9c" />
                  <span>· message</span>
                </Meta>
                <div className="message-route">
                  <CornerDownRight className="icon" />
                  <span>from</span>
                  <Handle id="b73d11" />
                  <span>· fleet-observer</span>
                </div>
                <p className="event__text">Two sessions are idle. Do not spawn a third observer.</p>
              </div>
            </div>

            <div className="event">
              <div className="event__gutter">
                <span className="event__seq">0420</span>
                <span className="event__time">14:02:58</span>
              </div>
              <div className="event__body">
                <Meta type="compaction">claude · summary</Meta>
                <div className="compaction">
                  <span className="compaction__label">Compaction · summary</span>
                </div>
                <p className="event__text event__text--muted">
                  Older turns were summarized. The provider kept the plan and the last two tool
                  results; the dashboard renders the summary, never the raw payload.
                </p>
              </div>
            </div>

            <div className="event">
              <div className="event__gutter">
                <span className="event__seq">0421</span>
                <span className="event__time">14:03:02</span>
              </div>
              <div className="event__body">
                <Meta type="provider.heartbeat">unknown type · generic fallback</Meta>
                <p className="event__text event__text--mono">
                  data.openObject · no renderer · shown as a generic row
                </p>
              </div>
            </div>
          </div>
        </Specimen>
      </Section>

      <Section
        id="meters"
        index="12"
        title="Meters and stats"
        description="Context and cost are read at a glance. A meter is a 6px filled track with a one-pixel frame; the threshold changes the hue, not the geometry. Numbers are mono and tabular."
      >
        <Specimen label="Context thresholds" note="Accent below 75%; amber at 75%; red at 90%.">
          <div className="grid-3">
            <div className="panel stack">
              <span className="label-1">Nominal</span>
              <div className="meter">
                <div className="meter__head">
                  <span className="meter__label">context</span>
                  <span className="meter__value">124k / 200k</span>
                </div>
                <div className="meter__track">
                  <div className="meter__fill" style={{ width: "62%" }} />
                </div>
              </div>
              <span className="caption">62% · no notice</span>
            </div>
            <div className="panel stack">
              <span className="label-1">Warning</span>
              <div className="meter meter--warn">
                <div className="meter__head">
                  <span className="meter__label">context</span>
                  <span className="meter__value">154k / 200k</span>
                </div>
                <div className="meter__track">
                  <div className="meter__fill" style={{ width: "77%" }} />
                </div>
              </div>
              <span className="caption">77% · notice at 75%</span>
            </div>
            <div className="panel stack">
              <span className="label-1">Critical</span>
              <div className="meter meter--danger">
                <div className="meter__head">
                  <span className="meter__label">context</span>
                  <span className="meter__value">186k / 200k</span>
                </div>
                <div className="meter__track">
                  <div className="meter__fill" style={{ width: "93%" }} />
                </div>
              </div>
              <span className="caption">93% · provider may compact</span>
            </div>
          </div>
        </Specimen>

        <Specimen label="Stats and sparkline" note="One number, one unit, one time window.">
          <div className="split">
            <div className="grid-4">
              <div className="stat">
                <span className="stat__label">cost</span>
                <span className="stat__value">$1.84</span>
                <span className="stat__sub">latest report</span>
              </div>
              <div className="stat">
                <span className="stat__label">turns</span>
                <span className="stat__value">07</span>
                <span className="stat__sub">one at a time</span>
              </div>
              <div className="stat">
                <span className="stat__label">queued</span>
                <span className="stat__value">02</span>
                <span className="stat__sub">prompts</span>
              </div>
              <div className="stat">
                <span className="stat__label">last tool</span>
                <span className="stat__value">12.4s</span>
                <span className="stat__sub">Bash</span>
              </div>
            </div>
            <div className="spark">
              <div className="spark__head">
                <span className="spark__label">events / 60s</span>
                <span className="spark__value">42 evt/min</span>
              </div>
              <svg
                className="spark__svg"
                viewBox="0 0 240 44"
                preserveAspectRatio="none"
                role="img"
                aria-label="Event rate over the last sixty seconds"
              >
                <line className="spark__grid" x1="0" y1="11" x2="240" y2="11" />
                <line className="spark__grid" x1="0" y1="22" x2="240" y2="22" />
                <line className="spark__grid" x1="0" y1="33" x2="240" y2="33" />
                <polyline
                  className="spark__line"
                  points="0,34 12,32 24,35 36,28 48,30 60,24 72,27 84,22 96,25 108,18 120,21 132,16 144,19 156,14 168,17 180,12 192,15 204,10 216,13 228,9 240,11"
                />
              </svg>
              <div className="spark__axis">
                <span>−60s</span>
                <span>−30s</span>
                <span>now</span>
              </div>
            </div>
          </div>
        </Specimen>
      </Section>

      <Section
        id="lineage"
        index="13"
        title="Lineage"
        description="Lineage is context, not authority. The tree is drawn from parentId, rootId, and depth; it never decides who may see or stop what. Every session in the instance is addressable by every caller."
      >
        <Specimen label="Session tree" note="Vertical rule, square ticks, one lamp per node.">
          <div className="panel">
            <div className="tree">
              <div className="tree__row">
                <span className="lamp lamp--ok" />
                <span className="tree__handle">#b73d11</span>
                <span className="tree__name">fleet-observer</span>
                <span className="tree__meta">root · claude · idle</span>
              </div>
              <div className="tree__children">
                <div className="tree__row">
                  <span className="lamp lamp--accent" />
                  <span className="tree__handle">#4f2a9c</span>
                  <span className="tree__name">refactor-auth</span>
                  <span className="tree__meta">depth 1 · claude · busy</span>
                </div>
                <div className="tree__children">
                  <div className="tree__row">
                    <span className="lamp lamp--ok" />
                    <span className="tree__handle">#e0a4b8</span>
                    <span className="tree__name">docs-audit</span>
                    <span className="tree__meta">depth 2 · gemini · idle</span>
                  </div>
                </div>
                <div className="tree__row">
                  <span className="lamp lamp--warn" />
                  <span className="tree__handle">#9c1e07</span>
                  <span className="tree__name">codex-probe</span>
                  <span className="tree__meta">depth 1 · codex · waiting</span>
                </div>
                <div className="tree__row">
                  <span className="lamp lamp--danger" />
                  <span className="tree__handle">#2d9f6a</span>
                  <span className="tree__name">flaky-test-triage</span>
                  <span className="tree__meta">depth 1 · claude · failed</span>
                </div>
              </div>
            </div>
          </div>
        </Specimen>

        <Specimen label="Lineage in a row" note="A depth badge is enough when the tree is not on screen.">
          <div className="row row--wide">
            <span className="caption">root</span>
            <Handle id="b73d11" />
            <span className="caption">→</span>
            <Handle id="4f2a9c" />
            <Tag>depth 1</Tag>
            <span className="caption">→</span>
            <Handle id="e0a4b8" />
            <Tag>depth 2</Tag>
            <span className="caption">not a permission boundary</span>
          </div>
        </Specimen>
      </Section>
    </>
  );
}
