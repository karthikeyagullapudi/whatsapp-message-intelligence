import { useState } from 'react';
import Chip from './Chip.jsx';
import styles from './ChipInput.module.css';

// Editable list of chips. Enter (or comma) adds, Backspace on an empty input
// removes the last chip.
// parse(text) → value | null, format(value) → label, isValid(value) → boolean
export default function ChipInput({
  id,
  values,
  onChange,
  placeholder,
  max = Infinity,
  parse = (t) => t,
  format = (v) => String(v),
  isValid = () => true,
}) {
  const [text, setText] = useState('');
  const full = values.length >= max;

  function add() {
    const value = parse(text.trim());
    if (text.trim() && value != null && !full) onChange([...values, value]);
    setText('');
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' || (e.key === ',' && text.trim())) {
      e.preventDefault();
      add();
    } else if (e.key === 'Backspace' && !text && values.length) {
      e.preventDefault();
      onChange(values.slice(0, -1));
    }
  }

  return (
    <div className={styles.box} onClick={(e) => e.currentTarget.querySelector('input')?.focus()}>
      {values.map((v, i) => (
        <Chip key={`${format(v)}-${i}`} invalid={!isValid(v)} onRemove={() => onChange(values.filter((_, j) => j !== i))}>
          {format(v)}
        </Chip>
      ))}
      {!full && (
        <input
          id={id}
          className={styles.input}
          value={text}
          placeholder={values.length ? '' : placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => text.trim() && add()}
        />
      )}
    </div>
  );
}
