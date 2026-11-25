import React from "react";

export const Field: React.FC<{ label: string; children: React.ReactNode; className?: string }> = ({ label, children, className }) => (
  <label className={`block ${className ?? ""}`}><span className="label">{label}</span>{children}</label>
);

export function Select<T extends string>({ value, options, onChange, labels }: { value: T | undefined; options: readonly T[]; onChange: (v: T) => void; labels?: Record<string, string> }) {
  return (
    <select className="field" value={value ?? ""} onChange={(e) => onChange(e.target.value as T)}>
      {value === undefined ? <option value="">-</option> : null}
      {options.map((o) => <option key={o} value={o}>{labels?.[o] ?? o}</option>)}
    </select>
  );
}

/** Ô mốc thời gian: số giây hoặc tham chiếu (L2.w3, S1.t1, END...). */
export const TimeInput: React.FC<{ value: number | string | undefined; onChange: (v: number | string) => void; placeholder?: string }> = ({ value, onChange, placeholder }) => (
  <input className="field font-mono" value={value ?? ""} placeholder={placeholder ?? "1.5 / L2.w3 / END"}
    onChange={(e) => { const v = e.target.value; onChange(/^\s*\d+(\.\d+)?\s*$/.test(v) ? Number(v) : v); }} />
);

export const NumberInput: React.FC<{ value: number | undefined; onChange: (v: number | undefined) => void; step?: number; placeholder?: string }> = ({ value, onChange, step, placeholder }) => (
  <input className="field" type="number" step={step ?? 1} value={value ?? ""} placeholder={placeholder ?? "mặc định"}
    onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))} />
);
