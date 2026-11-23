import type { Category } from '../../utils/constants';
import { getOutputFormats } from '../../utils/formats';

export interface FormatSelectorProps {
  category: Category | null;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function FormatSelector({
  category,
  value,
  onChange,
  disabled = false,
}: FormatSelectorProps) {
  const formats = category ? getOutputFormats(category) : [];

  return (
    <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
      Output format
      <select
        className="field-control"
        disabled={disabled || !category}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        value={value}
      >
        {!category && <option value="">Select a file first</option>}

        {formats.map((format) => (
          <option key={format.value} value={format.value}>
            {format.label}
          </option>
        ))}
      </select>
    </label>
  );
}
