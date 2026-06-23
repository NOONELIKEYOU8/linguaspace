import { PlugZap } from "lucide-react";

export function ApiPendingState({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <section className="state-card pending-state">
      <PlugZap size={20} />
      <div>
        <strong>功能开发中</strong>
        <p>{items.join("、")}</p>
      </div>
    </section>
  );
}
