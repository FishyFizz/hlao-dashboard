import { useEffect, useState } from "react";
import { Radio, RadioGroup } from "react-aria-components";
import { canUse, store, type DashboardState } from "../../store/store";
import type { SessionConfigOptionView, SessionView } from "../../wire/protocol";
import { CAPABILITIES } from "../../wire/protocol";
import { SelectField, ToggleRow } from "../ui";

export function ProviderSection({
  state,
  session,
  terminal,
}: {
  state: DashboardState;
  session: SessionView;
  terminal: boolean;
}) {
  const canBackends = canUse(state, CAPABILITIES.backendsList);
  const pendingMode = Boolean(state.pending.mode);
  const [backendDefault, setBackendDefault] = useState<string | null>(null);
  const [backendDefaultLoaded, setBackendDefaultLoaded] = useState(false);

  // AgentView.defaultMode is per backend, so resolve it from the manifest list
  // for this session's backend. The effective mode stays on the session view.
  useEffect(() => {
    if (!canBackends) return;
    let cancelled = false;
    setBackendDefaultLoaded(false);
    store
      .listBackends(session.cwd)
      .then((result) => {
        if (cancelled) return;
        const agent = result.backends.find(
          (candidate) => candidate.name === session.backend,
        );
        setBackendDefault(agent?.defaultMode ?? null);
        setBackendDefaultLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setBackendDefault(null);
        setBackendDefaultLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [canBackends, session.backend, session.cwd]);

  return (
    <section className="inspector__section">
      <div className="inspector__head">
        <span>Provider</span>
      </div>
      {terminal ? (
        <p className="inspector__none">
          {state.removed
            ? "Removed · controls disabled · transcript is a local snapshot"
            : "Ended · controls disabled"}
        </p>
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
      <p className="inspector__note">
        The provider mode is the coarse permission policy and is operator-only.
        Backend default:{" "}
        <span className="mono">
          {!canBackends
            ? "not reported"
            : backendDefaultLoaded
              ? backendDefault ?? "not set"
              : "loading…"}
        </span>
        . A spawn resolves the operator mode, then the backend default, then the
        provider's own default. This control uses{" "}
        <span className="mono">sessions.set_mode</span>.
      </p>

      {session.pendingPermissions.length > 0 ? (
        <p className="inspector__note">
          {session.pendingPermissions.length} provider request
          {session.pendingPermissions.length === 1 ? " is" : "s are"} waiting for
          an operator answer in the permission gate.
        </p>
      ) : null}

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
  const isEffort =
    option.type === "select" &&
    option.values.length > 1 &&
    /effort/i.test(`${option.id} ${option.name}`);
  const currentValue = String(option.currentValue);
  if (
    isEffort &&
    option.values.some((candidate) => candidate.value === currentValue)
  ) {
    return (
      <div className="field">
        <span className="field__label">{option.name}</span>
        <RadioGroup
          className="segmented segmented--bar segmented--effort"
          aria-label={option.name}
          value={currentValue}
          isDisabled={disabled || pending}
          onChange={(value) => {
            if (value !== currentValue) {
              void store.setConfigOption(option.id, value);
            }
          }}
        >
          {option.values.map((candidate) => (
            <Radio
              key={candidate.value}
              className="segmented__item"
              value={candidate.value}
            >
              <span title={candidate.description ?? candidate.name}>
                {candidate.name}
              </span>
            </Radio>
          ))}
        </RadioGroup>
      </div>
    );
  }
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
      value={currentValue}
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
