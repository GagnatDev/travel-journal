interface ToggleSwitchProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  id: string;
  disabled?: boolean;
}

export function ToggleSwitch({ checked, onChange, label, id, disabled = false }: ToggleSwitchProps) {
  return (
    <label
      htmlFor={id}
      className={`flex items-center justify-between gap-3 py-2 ${
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
      }`}
    >
      <span className="font-ui text-sm text-body">{label}</span>
      <div className="relative shrink-0">
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={checked}
          aria-checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only peer"
        />
        {/* Track */}
        <div className="w-10 h-6 rounded-full bg-caption/30 peer-checked:bg-accent transition-colors" />
        {/* Thumb */}
        <div
          className="absolute left-1 top-1 w-4 h-4 rounded-full bg-white transition-transform peer-checked:translate-x-4 pointer-events-none"
          aria-hidden="true"
        />
      </div>
    </label>
  );
}
