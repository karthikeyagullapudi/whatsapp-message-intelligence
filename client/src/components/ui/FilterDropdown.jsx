import { ChevronDown } from 'lucide-react';
import Menu from './Menu.jsx';
import styles from './FilterDropdown.module.css';

// "Status ▾" style filter. options: [{ value, label, dot?, count? }]
export default function FilterDropdown({ label, value, options, onChange, onOpen }) {
  const current = options.find((o) => o.value === value);
  return (
    <Menu
      label={`Filter by ${label.toLowerCase()}`}
      onOpen={onOpen}
      width={220}
      trigger={(props) => (
        <button type="button" className={`${styles.trigger} ${value ? styles.active : ''}`} {...props}>
          <span className={styles.name}>{label}</span>
          {current && <span>{current.label}</span>}
          <ChevronDown size={14} strokeWidth={1.5} aria-hidden />
        </button>
      )}
      items={[
        { key: '__all', label: `Any ${label.toLowerCase()}`, checked: !value, onSelect: () => onChange('') },
        { separator: true },
        ...options.map((o) => ({
          key: o.value,
          label: o.label,
          dot: o.dot,
          count: o.count,
          checked: o.value === value,
          onSelect: () => onChange(o.value),
        })),
      ]}
    />
  );
}
