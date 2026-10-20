import { Section, Specimen } from "../components/Section";

const swatches = [
  { name: "canvas", role: "Page background", token: "var(--bg)" },
  { name: "panel", role: "Primary surface", token: "var(--panel)" },
  { name: "raise", role: "Inputs, code blocks", token: "var(--raise)" },
  { name: "hover", role: "Hover and row wash", token: "var(--hover)" },
  { name: "line", role: "Hairline rule", token: "var(--line)" },
  { name: "line-strong", role: "Control border", token: "var(--line-2)" },
  { name: "ink", role: "Primary text", token: "var(--text)" },
  { name: "ink-2", role: "Secondary text", token: "var(--text-2)" },
  { name: "ink-3", role: "Meta text", token: "var(--text-3)" },
  { name: "accent", role: "Live, selected, primary", token: "var(--accent)", hex: "#6CD2FF" },
  { name: "accent-ink", role: "Text on accent", token: "var(--accent-ink)" },
  { name: "focus", role: "Keyboard focus ring", token: "var(--focus)" },
  { name: "ok", role: "Idle, completed", token: "var(--ok)" },
  { name: "warn", role: "Permission, threshold", token: "var(--warn)" },
  { name: "danger", role: "Failure, destructive", token: "var(--danger)" },
  { name: "backdrop", role: "Modal wash", token: "var(--backdrop)" },
];

const spacing = [4, 8, 12, 16, 24, 32, 48, 64];

export function Foundations() {
  return (
    <>
      <Section
        id="color"
        index="01"
        title="Color"
        description="A graphite instrument panel with one signal. Cyan is never decoration: it means live, selected, focused, or primary. Everything else is a neutral step or a semantic state."
      >
        <Specimen
          label="Surface and signal tokens"
          note="Every token resolves per theme. #6CD2FF is the only constant."
        >
          <div className="swatches">
            {swatches.map((swatch) => (
              <div className="swatch" key={swatch.name}>
                <div className="swatch__color" style={{ background: swatch.token }} />
                <span className="swatch__name">{swatch.name}</span>
                <span className="swatch__role">{swatch.role}</span>
                {swatch.hex ? <span className="swatch__hex">{swatch.hex}</span> : null}
              </div>
            ))}
          </div>
        </Specimen>

        <Specimen
          label="Rules of use"
          note="Contrast is a constraint, not a suggestion."
        >
          <div className="grid-3">
            <div className="stack stack--tight">
              <span className="label-1">Accent is a signal</span>
              <p className="note">
                Use cyan for the live session, the selected row, the focused control, and the one
                primary action. Never for a surface fill or a decorative border.
              </p>
            </div>
            <div className="stack stack--tight">
              <span className="label-1">State has its own hue</span>
              <p className="note">
                Idle is green, permission and thresholds are amber, failure is red. A status never
                borrows the accent to look important.
              </p>
            </div>
            <div className="stack stack--tight">
              <span className="label-1">Neutrals carry hierarchy</span>
              <p className="note">
                Four surfaces and two rule weights do the structural work. If a boundary needs a
                shadow to read, the surface step is wrong.
              </p>
            </div>
          </div>
        </Specimen>
      </Section>

      <Section
        id="type"
        index="02"
        title="Typography"
        description="Geist for prose and names; Geist Mono for identity, state, and numbers. Mono is not a costume — it is how the console keeps columns, handles, and timestamps aligned."
      >
        <Specimen label="Scale" note="Two families, one voice: technical, not theatrical.">
          <div className="type-row">
            <div className="type-meta">
              <strong>Display / 56</strong>
              Geist 500 · -0.04em
            </div>
            <div className="display-1">See the whole fleet.</div>
          </div>
          <div className="type-row">
            <div className="type-meta">
              <strong>Heading / 24</strong>
              Geist 500 · -0.025em
            </div>
            <div className="heading-1">Session transcript</div>
          </div>
          <div className="type-row">
            <div className="type-meta">
              <strong>Heading / 16</strong>
              Geist 500 · -0.01em
            </div>
            <div className="heading-2">Permission requested</div>
          </div>
          <div className="type-row">
            <div className="type-meta">
              <strong>Body / 14</strong>
              Geist 400 · 1.65
            </div>
            <p className="body-1">
              The supervisor&apos;s live table is the truth. This client renders it, and nothing
              else: every session in the instance, its state, and a bounded page of events.
            </p>
          </div>
          <div className="type-row">
            <div className="type-meta">
              <strong>Label / 10</strong>
              Geist Mono 500 · 0.10em
            </div>
            <span className="label-1">Waiting permission</span>
          </div>
          <div className="type-row">
            <div className="type-meta">
              <strong>Data / 11</strong>
              Geist Mono 400 · tabular
            </div>
            <span className="data-1">4f2a9c · turn 07 · 62% · $1.84 · 14:02:11</span>
          </div>
        </Specimen>

        <Specimen
          label="Numerals and identifiers"
          note="Slashed zero, tabular figures: six-character handles never shift a column."
        >
          <div className="row row--wide">
            <span className="data-1">0123456789</span>
            <span className="data-1">9c1e07</span>
            <span className="data-1">0O 1lI</span>
            <span className="data-1">124k / 200k</span>
            <span className="data-1">$1.84</span>
            <span className="caption">Geist Mono, tnum + zero</span>
          </div>
        </Specimen>
      </Section>

      <Section
        id="geometry"
        index="03"
        title="Space, line, and elevation"
        description="A 4px grid, one-pixel hairlines, and a hard zero radius. Depth is a surface step, never a blur or a shadow. The UI should feel drawn, not floated."
      >
        <div className="geo-grid">
          <div className="geo-box">
            <span className="geo-box__label">Corners</span>
            <div className="geo-box__stage">
              <div className="corner-frame" />
            </div>
            <span className="caption">0px. Every surface, control, and overlay.</span>
          </div>
          <div className="geo-box">
            <span className="geo-box__label">Lines</span>
            <div className="geo-box__stage">
              <div className="line-demo">
                <div className="line-demo__row">
                  <span className="line-demo__label">hairline</span>
                  <span className="line-demo__bar" style={{ height: 1 }} />
                </div>
                <div className="line-demo__row">
                  <span className="line-demo__label">strong</span>
                  <span className="line-demo__bar" style={{ height: 1, background: "var(--line-2)" }} />
                </div>
                <div className="line-demo__row">
                  <span className="line-demo__label">state bar</span>
                  <span className="line-demo__bar line-demo__bar--accent" style={{ height: 2 }} />
                </div>
              </div>
            </div>
            <span className="caption">1px separates. 2px marks state and selection.</span>
          </div>
          <div className="geo-box">
            <span className="geo-box__label">Elevation</span>
            <div className="geo-box__stage geo-box__stage--stack">
              <div className="surface-stack">
                <div className="surface-step surface-step--bg">
                  <span>canvas</span>
                  <span>--bg</span>
                </div>
                <div className="surface-step surface-step--panel">
                  <span>panel</span>
                  <span>--panel</span>
                </div>
                <div className="surface-step surface-step--raise">
                  <span>raise</span>
                  <span>--raise</span>
                </div>
                <div className="surface-step surface-step--hover">
                  <span>hover</span>
                  <span>--hover</span>
                </div>
              </div>
            </div>
            <span className="caption">No shadows. One step up means one step lighter.</span>
          </div>
        </div>

        <Specimen label="Spacing scale" note="4px base. Bars shown at 4×; component rhythm stays on the grid.">
          <div className="space-scale">
            {spacing.map((size) => (
              <div className="space-row" key={size}>
                <span className="space-label">{size}px</span>
                <span className="space-bar" style={{ width: size * 4 }} />
              </div>
            ))}
          </div>
        </Specimen>
      </Section>

      <Section
        id="motion"
        index="04"
        title="Motion"
        description="Motion only reports state: a hover, an overlay arriving, a session that is alive. No bounce, no overshoot, no looping decoration. Reduced motion collapses every duration."
      >
        <Specimen label="Durations" note="If it needs more than 260ms, it is an animation, not a transition.">
          <div className="motion-list">
            <div className="motion-row">
              <span className="motion-row__name">Hover and focus</span>
              <span className="motion-row__value">120ms</span>
              <span className="motion-row__value">ease-out</span>
              <span className="motion-sample">
                <span className="motion-sample__fill" />
              </span>
            </div>
            <div className="motion-row">
              <span className="motion-row__name">Overlay enter</span>
              <span className="motion-row__value">180ms</span>
              <span className="motion-row__value">4px rise</span>
              <span className="motion-sample" />
            </div>
            <div className="motion-row">
              <span className="motion-row__name">Busy lamp</span>
              <span className="motion-row__value">1.8s</span>
              <span className="motion-row__value">opacity pulse</span>
              <span className="lamp lamp--accent" />
            </div>
            <div className="motion-row">
              <span className="motion-row__name">Permission lamp</span>
              <span className="motion-row__value">1.1s</span>
              <span className="motion-row__value">hard blink</span>
              <span className="lamp lamp--warn" />
            </div>
          </div>
        </Specimen>
      </Section>
    </>
  );
}
