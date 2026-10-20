import { Radio, RadioGroup } from "react-aria-components";
import type { PermissionPolicy } from "../wire/protocol";

const POLICY_OPTIONS: Array<{
  value: PermissionPolicy;
  label: string;
  title: string;
}> = [
  {
    value: "allow",
    label: "allow",
    title: "Requests are allowed without asking.",
  },
  {
    value: "ask",
    label: "ask",
    title: "An unattended session can wait indefinitely; someone must answer.",
  },
  {
    value: "deny",
    label: "deny",
    title: "Requests are denied without asking.",
  },
];

export function PolicySelector({
  value,
  onChange,
  disabled,
  ariaLabel = "HLAO permission policy",
}: {
  value: PermissionPolicy;
  onChange: (value: PermissionPolicy) => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <RadioGroup
      className="segmented segmented--bar segmented--policy"
      aria-label={ariaLabel}
      value={value}
      isDisabled={disabled}
      onChange={(next) => onChange(next as PermissionPolicy)}
    >
      {POLICY_OPTIONS.map((option) => (
        <Radio
          key={option.value}
          className={`segmented__item segmented__item--${option.value}`}
          value={option.value}
        >
          <span title={option.title}>{option.label}</span>
        </Radio>
      ))}
    </RadioGroup>
  );
}
