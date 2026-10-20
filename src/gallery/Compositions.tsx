import {
  Check,
  CircleSlash,
  ListTree,
  MoreHorizontal,
  Send,
  Shield,
  Square,
  Terminal,
} from "lucide-react";
import { Button, IconButton } from "../components/Button";
import { Section } from "../components/Section";
import {
  Handle,
  Status,
  Tag,
  statusLampClass,
} from "../components/Status";
import { fleet } from "../data/fleet";

export function Compositions() {
  return (
    <Section
      id="console"
      index="17"
      title="Session console"
      description="The full surface, in one frame: fleet rail, transcript, inspector. The fleet subscription drives the rail; the event subscription drives the center; the inspector is a projection of the selected SessionView. No second protocol, no second source of truth."
    >
      <div className="console">
        <div className="console__bar">
          <div className="console__session">
            <Status status="busy" />
            <span className="console__name">refactor-auth</span>
            <span className="console__handle">#4f2a9c</span>
            <Tag>claude</Tag>
            <Tag>manual</Tag>
            <Tag tone="warn">1 needs you</Tag>
          </div>
          <div className="console__actions">
            <Button size="sm" variant="primary">
              <Send className="btn__icon icon" />
              Prompt
            </Button>
            <Button size="sm">
              <Square className="btn__icon icon" />
              Cancel turn
            </Button>
            <IconButton aria-label="More session actions">
              <MoreHorizontal className="btn__icon icon" />
            </IconButton>
          </div>
        </div>

        <div className="console__body">
          <aside className="console__fleet" aria-label="Fleet">
            <div className="console__fleet-head">
              <span>Fleet</span>
              <span>1 needs you · 6 live</span>
            </div>
            {fleet.map((row) => (
              <div
                className="console__fleet-row"
                key={row.id}
                data-active={row.selected ? true : undefined}
              >
                <span className={statusLampClass(row.status)} />
                <span className="console__fleet-name">{row.name}</span>
                <span className="console__fleet-id">{String(row.turn).padStart(2, "0")}</span>
              </div>
            ))}
          </aside>

          <div className="console__transcript">
            <div className="transcript transcript--compact">
              <div className="transcript__bar">
                <span className="transcript__title">
                  <span className="lamp lamp--accent" />
                  <strong>Live</strong>
                  <Handle id="4f2a9c" />
                  <span>seq 421</span>
                </span>
                <span className="caption">follow</span>
              </div>

              <div className="event event--user">
                <div className="event__gutter">
                  <span className="event__seq">0412</span>
                </div>
                <div className="event__body">
                  <div className="event__meta">
                    <span className="event__type">prompt.sent</span>
                    <span className="event__sep">/</span>
                    <span>operator</span>
                  </div>
                  <p className="event__text">
                    Run the auth tests and report the first failure. Do not change retry semantics.
                  </p>
                </div>
              </div>

              <div className="event">
                <div className="event__gutter">
                  <span className="event__seq">0414</span>
                </div>
                <div className="event__body">
                  <div className="event__meta">
                    <span className="event__type">tool.call</span>
                    <span className="event__sep">/</span>
                    <span>Bash · 12.4s</span>
                  </div>
                  <div className="tool">
                    <div className="tool__head">
                      <Terminal className="icon" />
                      <span className="tool__name">Bash</span>
                      <span>npm test -- auth/refresh</span>
                      <span className="tool__status tool__status--ok">completed</span>
                    </div>
                    <div className="tool__body">
                      <span className="tool__line tool__out--danger">
                        ✕ refresh mutex releases before the token write (2)
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="event event--permission">
                <div className="event__gutter">
                  <span className="event__seq">0415</span>
                </div>
                <div className="event__body">
                  <div className="event__meta">
                    <span className="event__type">permission.requested</span>
                    <span className="event__sep">/</span>
                    <span>waiting</span>
                  </div>
                  <div className="permission-card">
                    <div className="permission-card__head">
                      <Shield className="icon" />
                      Permission requested
                    </div>
                    <div className="permission-card__body">
                      <div className="permission-card__title">Run shell command</div>
                      <div className="permission-card__meta">Bash · session #9c1e07</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="event">
                <div className="event__gutter">
                  <span className="event__seq">0418</span>
                </div>
                <div className="event__body">
                  <div className="event__meta">
                    <span className="event__type">agent.message</span>
                    <span className="event__sep">/</span>
                    <span>claude</span>
                  </div>
                  <p className="event__text">
                    The failure is a race in the refresh mutex. I can patch it, but the fix changes
                    retry semantics.
                  </p>
                </div>
              </div>

              <div className="event event--notice">
                <div className="event__gutter">
                  <span className="event__seq">0419</span>
                </div>
                <div className="event__body">
                  <div className="event__meta">
                    <span className="event__type">notice</span>
                    <span className="event__sep">/</span>
                    <span>warning</span>
                  </div>
                  <div className="notice notice--warn">
                    <span className="notice__body">
                      <span className="notice__title">Context crossed 75%.</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <aside className="console__inspector" aria-label="Session inspector">
            <div className="console__section">
              <div className="console__section-title">Provider</div>
              <div className="stack stack--tight">
                <div className="row row--between">
                  <span className="caption">agent</span>
                  <span className="caption">claude-agent-acp · 0.93.0</span>
                </div>
                <div className="row row--between">
                  <span className="caption">title</span>
                  <span className="console__provider-title">Fix the auth refresh race</span>
                </div>
              </div>
            </div>

            <div className="console__section">
              <div className="console__section-title">Permission</div>
              <div className="permission-card">
                <div className="permission-card__head">
                  <Shield className="icon" />
                  Waiting · 18s
                </div>
                <div className="permission-card__body">
                  <div className="permission-card__title">Run shell command</div>
                  <div className="permission-card__meta">#9c1e07 · Bash</div>
                  <div className="permission-card__actions">
                    <Button size="sm">Allow once</Button>
                    <Button size="sm">Always</Button>
                    <Button size="sm" variant="danger">
                      Deny
                    </Button>
                  </div>
                  <span className="permission-card__consequence">
                    Always also switches the session policy to allow.
                  </span>
                </div>
              </div>
            </div>

            <div className="console__section">
              <div className="console__section-title">Plan</div>
              <div className="plan">
                <div className="plan__row">
                  <span className="plan__state plan__state--completed">
                    <Check className="icon" />
                  </span>
                  <span>Map the refresh mutex</span>
                  <span className="plan__priority plan__priority--high">high</span>
                </div>
                <div className="plan__row">
                  <span className="plan__state plan__state--in_progress" />
                  <span>Show the race, propose two fixes</span>
                  <span className="plan__priority plan__priority--medium">med</span>
                </div>
                <div className="plan__row">
                  <span className="plan__state" />
                  <span>Wait for the operator</span>
                  <span className="plan__priority">low</span>
                </div>
              </div>
            </div>

            <div className="console__section">
              <div className="console__section-title">Usage</div>
              <div className="meter">
                <div className="meter__head">
                  <span className="meter__label">context</span>
                  <span className="meter__value">124k / 200k</span>
                </div>
                <div className="meter__track">
                  <div className="meter__fill" style={{ width: "62%" }} />
                </div>
              </div>
              <div className="row row--between">
                <span className="caption">turn 07</span>
                <span className="caption">reported $1.84</span>
              </div>
            </div>

            <div className="console__section">
              <div className="console__section-title">Lineage</div>
              <div className="tree">
                <div className="tree__row">
                  <span className="lamp lamp--ok" />
                  <Handle id="b73d11" />
                  <span className="tree__name">root</span>
                </div>
                <div className="tree__children">
                  <div className="tree__row">
                    <span className="lamp lamp--accent" />
                    <Handle id="4f2a9c" />
                    <span className="tree__name">self</span>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>

      <div className="console-note">
        <span className="caption">
          <ListTree className="icon" style={{ width: 12, height: 12 }} />
          fleet: 1 subscription · transcript: 1 subscription · inspector: SessionView projection
        </span>
        <span className="caption">
          <CircleSlash className="icon" style={{ width: 12, height: 12 }} />
          no second protocol
        </span>
        <span className="caption">
          <Send className="icon" style={{ width: 12, height: 12 }} />
          actions are operator commands
        </span>
      </div>
    </Section>
  );
}
