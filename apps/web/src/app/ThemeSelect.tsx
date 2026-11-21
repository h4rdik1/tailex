import { Select } from '../components/ui/fields.tsx';
import { useTheme, type ThemeChoice } from './theme.ts';

const CHOICES: Record<ThemeChoice, string> = { system: 'System', light: 'Light', dark: 'Dark' };

function isThemeChoice(value: string): value is ThemeChoice {
  return value in CHOICES;
}

export function ThemeSelect() {
  const [choice, setChoice] = useTheme();
  return (
    <Select
      aria-label="Theme"
      className="h-8 w-auto py-0"
      value={choice}
      onChange={(event) => {
        if (isThemeChoice(event.target.value)) setChoice(event.target.value);
      }}
    >
      {Object.entries(CHOICES).map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </Select>
  );
}
