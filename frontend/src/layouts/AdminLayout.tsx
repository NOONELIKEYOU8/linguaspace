import { Activity } from "lucide-react";
import { useEffect, useState } from "react";
import { systemApi } from "../api/system";
import { AnimatedOutlet } from "../components/common/AnimatedOutlet";
import { Breadcrumbs } from "../components/navigation/Breadcrumbs";
import { PrimaryNav } from "../components/navigation/PrimaryNav";
import { RoleSwitcher } from "../components/navigation/RoleSwitcher";
import { SecondaryNav } from "../components/navigation/SecondaryNav";
import { modules, type ModuleKey } from "../config/navigation";

export function AdminLayout({ module }: { module: ModuleKey }) {
  const [connected, setConnected] = useState<boolean>();
  useEffect(() => { systemApi.health().then(() => setConnected(true)).catch(() => setConnected(false)); }, []);
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <a className="brand-mark" href="/intro/overview"><b>语界</b><span>LinguaSpace</span></a>
        <div className="admin-module-title">{modules[module].label}</div>
        <SecondaryNav module={module} />
        <div className="admin-switch"><PrimaryNav compact /></div>
      </aside>
      <section className="admin-main">
        <header className="admin-topbar">
          <Breadcrumbs />
          <div className="admin-topbar-right">
            <span className="connection-chip">
              <Activity size={14} />
              {connected === undefined ? "正在检查后端" : connected ? "后端已连接" : "后端连接失败"}
            </span>
            <RoleSwitcher />
          </div>
        </header>
        <main className="admin-content"><AnimatedOutlet /></main>
      </section>
    </div>
  );
}
