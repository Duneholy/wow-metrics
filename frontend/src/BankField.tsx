import type { ReactNode } from "react";

export function BankField({
  label,
  readOnly,
  value,
  children,
}: {
  label: string;
  readOnly: boolean;
  value: string;
  children: ReactNode;
}) {
  return (
    <label className="field-label">
      <span className="crm-field-caption">{label}</span>
      {readOnly ? <span className="crm-field-readonly">{value}</span> : children}
    </label>
  );
}
