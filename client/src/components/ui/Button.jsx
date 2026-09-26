import { forwardRef } from 'react';
import Kbd from './Kbd.jsx';
import styles from './Button.module.css';

// variant: primary (accent) | secondary | ghost | danger
const Button = forwardRef(function Button(
  { variant = 'secondary', size = 'md', icon: Icon, kbd, children, className = '', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={`${styles.button} ${styles[variant]} ${styles[size]} ${className}`}
      {...props}
    >
      {Icon && <Icon size={16} strokeWidth={1.5} aria-hidden />}
      {children}
      {kbd && <Kbd className={styles.kbd}>{kbd}</Kbd>}
    </button>
  );
});

export default Button;
