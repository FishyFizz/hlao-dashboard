import { useId } from "react";
import type { DashboardState } from "../store/store";
import type { SessionView } from "../wire/protocol";

/**
 * Provider mode ids are provider-native and cannot be enumerated before a
 * session exists. Live sessions of the same backend are the only honest source
 * of known ids; the field stays free-text so an operator can still supply an id
 * the dashboard has not seen yet. An empty value means "use the default".
 */
export function knownPermissionModes(
  sessions: Iterable<SessionView>,
  backend: string,
): { id: string; name: string }[] {
  const byId = new Map<string, string>();
  for (const session of sessions) {
    if (session.backend !== backend || !session.modes) continue;
    for (const mode of session.modes.availableModes) {
      if (!byId.has(mode.id)) byId.set(mode.id, mode.name);
    }
  }
  return [...byId.entries()].map(([id, name]) => ({ id, name }));
}

export function PermissionModeField({
  state,
  backend,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  state: DashboardState;
  backend: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  const id = useId();
  const modes = knownPermissionModes(Object.values(state.sessions), backend);
  return (
    <label className="field">
      <span className="field__label">Permission mode</span>
      <input
        className="field__input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        list={`${id}-modes`}
        spellCheck={false}
        disabled={disabled}
        title={`Optional provider mode id. Leave empty to use ${placeholder}.`}
      />
      <datalist id={`${id}-modes`}>
        {modes.map((mode) => (
          <option value={mode.id} key={mode.id}>
            {mode.name}
          </option>
        ))}
      </datalist>
    </label>
  );
}
