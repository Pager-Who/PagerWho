import { useState } from "react";

import { Field, NumberInput, Select } from "../../../shared/components";
import { customDelayValue, getDelayPresetValue } from "../lib/policy-form";

type DelayPresetFieldProps = {
  disabled: boolean;
  error: string | undefined;
  label: string;
  minimumSeconds: number;
  onChange: (seconds: number) => void;
  presets: readonly { label: string; seconds: number }[];
  value: number;
};

export function DelayPresetField({
  disabled,
  error,
  label,
  minimumSeconds,
  onChange,
  presets,
  value,
}: DelayPresetFieldProps) {
  const [forceCustom, setForceCustom] = useState(false);
  const presetValue = getDelayPresetValue(value, presets);
  const selectedValue = forceCustom ? customDelayValue : presetValue;
  const minimumMinutes = Math.max(0, Math.ceil(minimumSeconds / 60));
  const customMinutes = Math.max(minimumMinutes, Math.round(value / 60));

  return (
    <div className="grid gap-2 min-w-0">
      <Field error={error} label={label}>
        <Select
          aria-invalid={Boolean(error)}
          disabled={disabled}
          onChange={(event) => {
            if (event.target.value === customDelayValue) {
              setForceCustom(true);
              if (value < minimumSeconds) {
                onChange(minimumSeconds);
              }
              return;
            }
            setForceCustom(false);
            onChange(Number(event.target.value));
          }}
          value={selectedValue}
        >
          {presets.map((preset) => (
            <option key={preset.seconds} value={preset.seconds}>{preset.label}</option>
          ))}
          <option value={customDelayValue}>Custom</option>
        </Select>
      </Field>
      {selectedValue === customDelayValue ? (
        <Field label="Custom minutes">
          <NumberInput
            disabled={disabled}
            min={minimumMinutes}
            onChange={(event) => onChange(Math.max(minimumSeconds, Number(event.target.value) * 60))}
            value={customMinutes}
          />
        </Field>
      ) : null}
    </div>
  );
}
