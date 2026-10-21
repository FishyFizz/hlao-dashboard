import {
  ChevronRight,
  Database,
  Monitor,
  Play,
  RefreshCw,
  Shield,
  Terminal,
} from "lucide-react";
import { Button } from "../components/Button";
import { BrandMark } from "../components/BrandMark";
import { Kbd, Tag } from "../components/Status";
import type { DashboardState } from "../store/store";
import { WIRE_MAJOR, WIRE_MINOR } from "../wire/protocol";
import { copyWithToast } from "./ui";

const SETUP_TITLES: Record<string, string> = {
  bridge_unavailable: "The local bridge is not running.",
  unauthorized: "The supervisor rejected this home’s token.",
  version_mismatch: "This supervisor speaks a different wire major.",
  config_invalid: "The HLAO config is invalid, so no supervisor started.",
};

export function SetupScreen({
  state,
  onRetry,
  onDemo,
  onTheme,
}: {
  state: DashboardState;
  onRetry: () => void;
  onDemo: () => void;
  onTheme: () => void;
}) {
  const error = state.connectError;
  const code = error?.code ?? "supervisor_unavailable";
  const knownHome = state.home && state.home !== "unknown" ? state.home : null;
  const home = knownHome ?? "~/.hlao (bridge default)";
  const title = SETUP_TITLES[code] ?? "No HLAO supervisor at this home.";
  const bridgeCommand = knownHome
    ? `npm run bridge -- --home "${knownHome}"`
    : "npm run bridge";

  return (
    <div className="setup">
      <header className="setup__top">
        <a className="dash-brand" href="/" onClick={(event) => event.preventDefault()}>
          <BrandMark />
          <span className="dash-brand__name">HLAO</span>
          <span className="dash-brand__sub">Dashboard</span>
        </a>
        <span className="setup__top-meta">
          <Tag>local client</Tag>
          <Tag>wire {WIRE_MAJOR}.{WIRE_MINOR}</Tag>
          <button type="button" className="setup__theme" onClick={onTheme}>
            {state.theme === "dark" ? "Light theme" : "Dark theme"}
          </button>
        </span>
      </header>

      <main className="setup__main">
        <div className="setup__intro">
          <span className="setup__kicker">Instance / connection</span>
          <h1 className="setup__title">{title}</h1>
          <p className="setup__lede">
            This dashboard is a client for one HLAO instance: one{" "}
            <span className="mono">HLAO_HOME</span>, supervisor, socket, and token.
            It reads the supervisor’s live table and forwards only what the wire
            reports. It stores no orchestration data and never receives the
            supervisor token in the page.
          </p>
          <div className="setup__home">
            <span className="setup__home-label">Home</span>
            <span className="setup__home-path mono">{home}</span>
            <Button size="sm" variant="ghost" onPress={() => void copyWithToast(home, "home path")}>
              Copy
            </Button>
          </div>
          {error ? (
            <div className="setup__error">
              <span className="setup__error-code mono">{error.code}</span>
              <span>{error.message}</span>
              {error.details ? (
                <details className="setup__details">
                  <summary>Diagnostic details</summary>
                  <pre>{JSON.stringify(error.details, null, 2)}</pre>
                </details>
              ) : null}
            </div>
          ) : null}

          <div className="setup__actions">
            <Button variant="primary" onPress={onRetry} isDisabled={state.phase === "connecting"}>
              <RefreshCw className="btn__icon icon" />
              {state.phase === "connecting" ? "Connecting…" : "Retry connection"}
            </Button>
            <Button onPress={onDemo}>
              <Play className="btn__icon icon" />
              Explore demo instance
            </Button>
          </div>
          <p className="setup__demo-note">
            The demo is a simulated supervisor, clearly labelled throughout. It
            exercises the same client paths; it is not a real HLAO process and no
            work runs.
          </p>
        </div>

        <section className="setup__card">
          <div className="setup__card-head">
            <Terminal className="icon" />
            <span>Start the local bridge</span>
          </div>
          <p className="setup__card-text">
            The bridge reads <span className="mono">&lt;home&gt;/supervisor.json</span>,
            owns the token, and serves this page on loopback. The token never
            appears here.
          </p>
          <CommandBlock command={bridgeCommand} />
          <p className="setup__card-text dim">
            For development, run <span className="mono">npm run dev</span> and this
            bridge side by side. For a production build, run{" "}
            <span className="mono">npm run build</span> first; the bridge serves{" "}
            <span className="mono">dist/</span>.
          </p>
        </section>

        <section className="setup__card">
          <div className="setup__card-head">
            <Play className="icon" />
            <span>Start the supervisor</span>
          </div>
          <p className="setup__card-text">
            The dashboard does not silently spawn or stop a supervisor. Start HLAO
            in a terminal, then retry. The CLI autostarts one for a normal command.
          </p>
          <CommandBlock command={`hlao list --all`} />
          <p className="setup__card-text dim">
            To use another instance, restart the bridge with a different{" "}
            <span className="mono">--home</span> or set{" "}
            <span className="mono">HLAO_HOME</span>.
          </p>
        </section>

        <section className="setup__properties">
          <Property
            icon={Monitor}
            title="One instance"
            text="The boundary is a home, supervisor, socket, and token. Handles resolve only inside it."
          />
          <Property
            icon={Database}
            title="No orchestration store"
            text="The supervisor’s live table is the truth. Drafts, read markers, and selection are the only local state."
          />
          <Property
            icon={Shield}
            title="No token in the page"
            text="The bridge holds the supervisor credential. This origin gets a projection, never supervisor.json."
          />
        </section>

        <section className="setup__help">
          <span className="setup__help-title">If the bridge is running but this page is not</span>
          <ul>
            <li>
              Check the bridge window for the home path and port. The default is{" "}
              <span className="mono">127.0.0.1:4780</span>.
            </li>
            <li>
              If the supervisor is not running, start it with{" "}
              <span className="mono">hlao list</span> in a terminal.
            </li>
            <li>
              A wrong home is a wrong instance, not an empty fleet. Point the bridge
              at the intended home.
            </li>
            <li>
              Open the <a href="/design">design specimen</a> for the visual system
              and primitive inventory.
            </li>
          </ul>
        </section>
      </main>

      <footer className="setup__foot">
        <span>
          <ChevronRight className="icon" /> Connection before theater. No demo data is
          shown as live.
        </span>
        <span>
          <Kbd>?</Kbd> help · <Kbd>Ctrl</Kbd>+<Kbd>K</Kbd> commands · closing the app
          ends observation
        </span>
      </footer>
    </div>
  );
}

function CommandBlock({ command }: { command: string }) {
  return (
    <div className="setup__command">
      <code>{command}</code>
      <Button size="sm" variant="ghost" onPress={() => void copyWithToast(command, "command")}>
        Copy
      </Button>
    </div>
  );
}

function Property({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof Monitor;
  title: string;
  text: string;
}) {
  return (
    <div className="setup__property">
      <Icon className="icon" />
      <div>
        <span className="setup__property-title">{title}</span>
        <span className="setup__property-text">{text}</span>
      </div>
    </div>
  );
}
