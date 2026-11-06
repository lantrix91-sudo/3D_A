import type { ReactNode } from 'react';

export function Field({ label, htmlFor, children, hint, full }: { label: string; htmlFor: string; children: ReactNode; hint?: string; full?: boolean }) {
  return (
    <div className={`field${full ? ' field--full' : ''}`}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <small className="field__hint">{hint}</small>}
    </div>
  );
}
