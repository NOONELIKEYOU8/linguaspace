import type { ReactNode } from "react";

export function PageHeader({
  kicker,
  title,
  text,
  icon,
  actions,
  className = "",
}: {
  kicker: string;
  title: string;
  text: string;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={`page-heading page-header ${className}`.trim()}>
      <span className="page-kicker">
        {icon}
        {kicker}
      </span>
      <div>
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </header>
  );
}
