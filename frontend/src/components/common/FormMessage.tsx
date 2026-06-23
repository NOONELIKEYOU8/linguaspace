import { CheckCircle2, CircleAlert } from "lucide-react";

export function FormMessage({ children, tone = "success" }: { children: React.ReactNode; tone?: "success" | "warning" }) {
  const Icon = tone === "success" ? CheckCircle2 : CircleAlert;
  return (
    <p className={`form-message form-message-${tone}`}>
      <Icon size={14} />
      {children}
    </p>
  );
}
