import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone = "neutral",
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  return (
    <article className={`metric-card metric-card-${tone}`}>
      <Icon size={18} />
      <b>{value}</b>
      <span>{label}</span>
      {detail && <small>{detail}</small>}
    </article>
  );
}
