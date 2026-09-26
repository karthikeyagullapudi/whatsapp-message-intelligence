import { useEffect } from 'react';
import { X } from 'lucide-react';
import styles from './Lightbox.module.css';

export default function Lightbox({ src, alt = '', onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true); // capture: close the lightbox before the drawer
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div className={styles.root} role="dialog" aria-label="Image" onClick={onClose}>
      <img src={src} alt={alt} className={styles.image} onClick={(e) => e.stopPropagation()} />
      <button type="button" className={styles.close} onClick={onClose} aria-label="Close image" autoFocus>
        <X size={16} strokeWidth={1.5} />
      </button>
    </div>
  );
}
