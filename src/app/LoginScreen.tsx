import { useState, type FormEvent } from "react";
import { KeyRound, RefreshCw, Shield, Terminal } from "lucide-react";
import { Button } from "../components/Button";
import { BrandMark } from "../components/BrandMark";
import { Tag } from "../components/Status";
import type { DashboardState } from "../store/store";
import { WIRE_MAJOR, WIRE_MINOR } from "../wire/protocol";

/**
 * The bridge gates every API call behind an operator token. The token is typed
 * or pasted here and exchanged for an HttpOnly cookie; it never enters page
 * storage or a request URL.
 */
export function LoginScreen({
  state,
  onSignIn,
  onRetry,
  onDemo,
  onTheme,
}: {
  state: DashboardState;
  onSignIn: (token: string) => Promise<void>;
  onRetry: () => void;
  onDemo: () => void;
  onTheme: () => void;
}) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const error = state.authError;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || token.trim() === "") return;
    setBusy(true);
    try {
      await onSignIn(token);
    } finally {
      setBusy(false);
    }
  };

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
          <span className="setup__kicker">Operator / sign in</span>
          <h1 className="setup__title">This dashboard is locked.</h1>
          <p className="setup__lede">
            The local bridge requires the operator token for this home. It is not
            the supervisor token: the bridge holds that one and never sends it to
            the page. Signing in sets an HttpOnly session cookie; the token is not
            written to browser storage or added to a URL.
          </p>

          <form className="login__form" onSubmit={(event) => void submit(event)}>
            <label className="field">
              <span className="field__label">Operator token</span>
              <input
                className="field__input"
                type="password"
                value={token}
                autoFocus
                autoComplete="off"
                spellCheck={false}
                aria-invalid={error ? true : undefined}
                onChange={(event) => setToken(event.target.value)}
              />
              <span className="field__hint">
                Paste the contents of the token file the bridge printed, or the
                value of <span className="mono">HLAO_DASHBOARD_TOKEN</span>.
              </span>
            </label>

            {error ? (
              <div className="setup__error" role="alert">
                <span className="setup__error-code mono">{error.code}</span>
                <span>{error.message}</span>
              </div>
            ) : null}

            <div className="setup__actions">
              <Button
                type="submit"
                variant="primary"
                isDisabled={busy || token.trim() === ""}
              >
                <KeyRound className="btn__icon icon" />
                {busy ? "Signing in…" : "Sign in"}
              </Button>
              <Button onPress={onRetry} isDisabled={busy}>
                <RefreshCw className="btn__icon icon" />
                Retry connection
              </Button>
              <Button onPress={onDemo} isDisabled={busy}>
                Explore demo instance
              </Button>
            </div>
          </form>

          <p className="setup__demo-note">
            The demo is a simulated supervisor, clearly labelled throughout. It
            does not touch this bridge and needs no token.
          </p>
        </div>

        <section className="setup__card">
          <div className="setup__card-head">
            <Terminal className="icon" />
            <span>Find the token</span>
          </div>
          <p className="setup__card-text">
            Without an explicit token, the bridge generates one per home and logs{" "}
            <span className="mono">auth operator token from &lt;path&gt;</span>. Open
            that file and paste its single line here. If the bridge was started with{" "}
            <span className="mono">HLAO_DASHBOARD_TOKEN</span> or{" "}
            <span className="mono">--token-file</span>, use that value instead.
          </p>
          <p className="setup__card-text dim">
            The bridge never prints the token itself. Rotating the token signs out
            every open dashboard.
          </p>
        </section>

        <section className="setup__card">
          <div className="setup__card-head">
            <Shield className="icon" />
            <span>Two different credentials</span>
          </div>
          <p className="setup__card-text">
            The operator token gates this dashboard. The supervisor token is full
            authority over the fleet, stays inside the bridge process, and is read
            from <span className="mono">&lt;home&gt;/supervisor.json</span>. Neither
            one appears in the page.
          </p>
        </section>
      </main>

      <footer className="setup__foot">
        <span>
          <Shield className="icon" /> Gate first, then connect. No demo data is shown
          as live.
        </span>
        <span>
          <Tag>wire {WIRE_MAJOR}.{WIRE_MINOR}</Tag>
        </span>
      </footer>
    </div>
  );
}
