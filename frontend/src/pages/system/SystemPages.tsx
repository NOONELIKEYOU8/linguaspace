import {
  Activity,
  Bell,
  ChartNoAxesCombined,
  Clock3,
  Database,
  Gauge,
  KeyRound,
  Plus,
  RefreshCw,
  Save,
  ServerCog,
  Settings,
  ShieldCheck,
  Trash2,
  UserRound,
  UsersRound,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { systemApi, type Permission, type Role, type SystemAlert, type SystemMetrics } from "../../api/system";
import type { User, UserRole } from "../../api/types";
import { DataTable } from "../../components/common/DataTable";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { FormMessage } from "../../components/common/FormMessage";
import { LoadingState } from "../../components/common/LoadingState";
import { MetricCard } from "../../components/common/MetricCard";
import { PageHeader } from "../../components/common/PageHeader";
import { StatusBadge } from "../../components/common/StatusBadge";
import { useAuth } from "../../store/AuthContext";

type HealthComponent = {
  ok: boolean;
  host?: string;
  port?: number;
  model?: string;
  engine?: string;
  backend?: string;
  error?: string;
};
type Health = { components: Record<string, HealthComponent> };
type LogItem = {
  id: string;
  capability?: string;
  provider?: string;
  model?: string;
  latency_ms?: number;
  status?: string;
  question?: string;
  created_at?: string;
};

const userRoleLabels: Record<UserRole, string> = {
  tourist: "游客",
  student: "学员",
  guide: "导游",
  admin: "管理员",
};

function statusTone(status = "") {
  return status === "active" || status === "success" || status === "ok" || status === "completed"
    ? "success" as const
    : status === "disabled" || status === "failed" || status === "error"
      ? "danger" as const
      : "warning" as const;
}

function capabilityCount(metrics?: SystemMetrics) {
  return metrics ? Object.keys(metrics.capabilities).length : 0;
}

function MetricOverview({ value }: { value: SystemMetrics }) {
  return (
    <div className="admin-stats-grid">
      <MetricCard icon={UsersRound} label="会话" value={value.sessions} detail="游客与导游协同会话" />
      <MetricCard icon={ShieldCheck} label="反馈" value={value.feedback} detail="真实游客反馈记录" />
      <MetricCard icon={Activity} label="模型调用" value={value.model_calls} detail={`${capabilityCount(value)} 类能力链路`} />
      <MetricCard icon={Gauge} label="RAG 命中率" value={`${Math.round(value.rag_reliable_rate * 100)}%`} detail="可信检索回答占比" />
    </div>
  );
}

function componentDetail(item: HealthComponent) {
  return item.error || item.model || item.engine || item.backend || (item.host ? `${item.host}:${item.port ?? ""}` : "未返回详细配置");
}

export function SystemDashboardPage() {
  const [metrics, setMetrics] = useState<SystemMetrics>();
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    setError("");
    systemApi.dashboard()
      .then((result) => {
        setMetrics(result.metrics);
        setAlerts(result.alerts);
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  return (
    <section className="page-stack">
      <section className="system-hero">
        <div>
          <span className="page-kicker"><Activity size={16} /> SYSTEM OPERATIONS</span>
          <h1>系统运行总览</h1>
          <p>聚合真实运行指标、模型调用、RAG 命中率与服务告警。</p>
        </div>
      </section>
      <PageHeader
        kicker="LIVE CONTROL CENTER"
        title="运行态势"
        text="所有指标来自系统端真实接口；读取失败时保留错误状态，不用静态数值冒充运行数据。"
        actions={<button className="primary compact" onClick={load}><RefreshCw size={15} />刷新</button>}
      />
      {loading && <LoadingState />}
      {error && <ErrorState message={error} retry={load} />}
      {metrics && <MetricOverview value={metrics} />}
      <section className="section-shell">
        <header>
          <div>
            <h2>系统告警</h2>
            <p>用于演示运维可信度：没有告警时明确展示空状态。</p>
          </div>
          <Bell size={18} />
        </header>
        {alerts.length ? (
          <div className="history-list">
            {alerts.map((item) => (
              <article key={item.id}>
                <Activity size={15} />
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.source} · {item.level} · {item.detail}</small>
                </div>
              </article>
            ))}
          </div>
        ) : !loading && !error ? <EmptyState label="当前无系统告警" /> : null}
      </section>
    </section>
  );
}

export function SystemUsersPage() {
  const [items, setItems] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState<{ username: string; password: string; display_name: string; role: UserRole; language: string }>({
    username: "",
    password: "123456",
    display_name: "",
    role: "tourist",
    language: "zh",
  });
  const { user, login, logout } = useAuth();
  const [credentials, setCredentials] = useState({ username: "admin", password: "123456" });

  const refresh = () => {
    setLoading(true);
    setError("");
    systemApi.users()
      .then((result) => setItems(result.items))
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, []);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    try {
      await systemApi.addUser(form);
      setForm({ ...form, username: "", display_name: "" });
      setMessage("用户已创建。");
      refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "新增用户失败");
    }
  };

  const remove = async (id: string) => {
    try {
      await systemApi.deleteUser(id);
      setMessage("用户已删除。");
      refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "删除用户失败");
    }
  };

  const toggleStatus = async (item: User) => {
    try {
      await systemApi.updateUserStatus(item.id, item.status === "active" ? "disabled" : "active");
      refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "更新用户状态失败");
    }
  };

  const doLogin = async () => {
    try {
      await login(credentials.username, credentials.password);
      setMessage("登录成功。");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "登录失败");
    }
  };

  return (
    <section className="page-stack">
      <PageHeader kicker="USER ACCESS" title="用户管理" text="新增、启用、停用和删除真实账户，保持与后端权限模型一致。" icon={<UsersRound size={16} />} />
      <section className="admin-two-col">
        <form className="tech-card form-stack" onSubmit={create}>
          <strong>新增账户</strong>
          <input required value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} placeholder="用户名" />
          <input value={form.display_name} onChange={(event) => setForm({ ...form, display_name: event.target.value })} placeholder="显示名" />
          <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as UserRole })}>
            {(Object.keys(userRoleLabels) as UserRole[]).map((role) => <option key={role} value={role}>{userRoleLabels[role]}</option>)}
          </select>
          <button className="primary"><Plus size={15} />新增用户</button>
        </form>
        <article className="tech-card form-stack">
          <strong>当前登录</strong>
          {user ? (
            <>
              <p>{user.display_name || user.username} · {userRoleLabels[user.role]}</p>
              <button type="button" onClick={logout}>退出登录</button>
            </>
          ) : (
            <>
              <input value={credentials.username} onChange={(event) => setCredentials({ ...credentials, username: event.target.value })} />
              <input type="password" value={credentials.password} onChange={(event) => setCredentials({ ...credentials, password: event.target.value })} />
              <button type="button" onClick={doLogin}><UserRound size={15} />登录</button>
            </>
          )}
        </article>
      </section>
      {message && <FormMessage>{message}</FormMessage>}
      {loading && <LoadingState />}
      {error && <ErrorState message={error} retry={refresh} />}
      {!loading && !error && !items.length && <EmptyState label="暂无用户" />}
      {!!items.length && (
        <DataTable heads={["用户", "角色", "状态", "操作"]}>
          {items.map((item) => (
            <tr key={item.id}>
              <td><b>{item.display_name || item.username}</b><small>{item.username}</small></td>
              <td>{userRoleLabels[item.role]}</td>
              <td><StatusBadge tone={statusTone(item.status)}>{item.status || "unknown"}</StatusBadge></td>
              <td>
                <div className="row-actions">
                  <button onClick={() => toggleStatus(item)}>{item.status === "active" ? "停用" : "启用"}</button>
                  <button className="danger-action" onClick={() => remove(item.id)}><Trash2 size={14} /></button>
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </section>
  );
}

export function SystemRolesPage() {
  const [items, setItems] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = () => {
    setLoading(true);
    setError("");
    systemApi.roles()
      .then((result) => setItems(result.items))
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, []);

  return (
    <section className="page-stack">
      <PageHeader kicker="ROLE MANAGEMENT" title="角色管理" text="展示真实角色定义和已分配权限，便于说明多端角色边界。" icon={<ShieldCheck size={16} />} />
      {loading && <LoadingState />}
      {error && <ErrorState message={error} retry={refresh} />}
      {!loading && !error && !items.length && <EmptyState label="暂无角色定义" />}
      <section className="case-grid">
        {items.map((item) => (
          <article key={item.id}>
            <StatusBadge>{item.id}</StatusBadge>
            <h3>{item.name}</h3>
            <p>{item.description}</p>
            <small>{item.permissions.length ? item.permissions.join(" · ") : "尚未分配权限"}</small>
          </article>
        ))}
      </section>
    </section>
  );
}

export function SystemPermissionsPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [selected, setSelected] = useState("admin");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const refresh = () => {
    setLoading(true);
    setError("");
    Promise.all([systemApi.roles(), systemApi.permissions()])
      .then(([roleData, permissionData]) => {
        setRoles(roleData.items);
        setPermissions(permissionData.items);
        setSelected((current) => roleData.items.some((role) => role.id === current) ? current : roleData.items[0]?.id ?? "");
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, []);

  const role = roles.find((item) => item.id === selected);
  const toggle = (id: string) => {
    if (!role) return;
    const next = role.permissions.includes(id)
      ? role.permissions.filter((permission) => permission !== id)
      : [...role.permissions, id];
    setRoles(roles.map((item) => item.id === role.id ? { ...item, permissions: next } : item));
  };
  const save = async () => {
    if (!role) return;
    try {
      await systemApi.updateRolePermissions(role.id, role.permissions);
      setMessage("权限已保存。");
      refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存权限失败");
    }
  };

  return (
    <section className="page-stack">
      <PageHeader kicker="PERMISSION MATRIX" title="权限矩阵" text="按角色配置页面、操作与数据访问权限。" icon={<KeyRound size={16} />} />
      {loading && <LoadingState />}
      {error && <ErrorState message={error} retry={refresh} />}
      {message && <FormMessage>{message}</FormMessage>}
      {!loading && !error && (
        <section className="section-shell">
          <header>
            <div>
              <h2>角色权限</h2>
              <p>勾选后保存到真实后端权限表。</p>
            </div>
            <select value={selected} onChange={(event) => setSelected(event.target.value)}>
              {roles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </header>
          {permissions.length ? (
            <div className="form-stack">
              {permissions.map((permission) => (
                <label key={permission.id}>
                  <input type="checkbox" checked={!!role?.permissions.includes(permission.id)} onChange={() => toggle(permission.id)} />
                  {permission.name} · {permission.module}
                </label>
              ))}
              <button className="primary compact" onClick={save} disabled={!role}><Save size={15} />保存权限</button>
            </div>
          ) : <EmptyState label="暂无权限项" />}
        </section>
      )}
    </section>
  );
}

export function SystemHealthPage() {
  const [value, setValue] = useState<Health>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = () => {
    setLoading(true);
    setError("");
    systemApi.health()
      .then((result) => setValue(result as unknown as Health))
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, []);

  return (
    <section className="page-stack">
      <PageHeader
        kicker="SERVICE HEALTH"
        title="服务健康监控"
        text="检查 API、数据库、缓存、对象存储、图数据库和模型服务状态。"
        icon={<ServerCog size={16} />}
        actions={<button className="primary compact" onClick={refresh}><RefreshCw size={15} />刷新</button>}
      />
      {loading && <LoadingState />}
      {error && <ErrorState message={error} retry={refresh} />}
      {value && (
        <section className="service-grid">
          {Object.entries(value.components).map(([name, item]) => (
            <article className="service-card" key={name}>
              <div>
                <strong>{name}</strong>
                <StatusBadge tone={item.ok ? "success" : "danger"}>{item.ok ? "正常" : "异常"}</StatusBadge>
              </div>
              <small>{componentDetail(item)}</small>
            </article>
          ))}
        </section>
      )}
    </section>
  );
}

export function SystemLogsPage() {
  const [models, setModels] = useState<LogItem[]>([]);
  const [traces, setTraces] = useState<LogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = () => {
    setLoading(true);
    setError("");
    Promise.all([systemApi.modelLogs(), systemApi.requestTraces()])
      .then(([modelData, traceData]) => {
        setModels(modelData.items as LogItem[]);
        setTraces(traceData.items as LogItem[]);
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, []);

  return (
    <section className="page-stack">
      <PageHeader kicker="OBSERVABILITY LOGS" title="调用与请求日志" text="查看真实模型调用和请求链路。" icon={<Clock3 size={16} />} actions={<button className="primary compact" onClick={refresh}><RefreshCw size={15} />刷新</button>} />
      {loading && <LoadingState />}
      {error && <ErrorState message={error} retry={refresh} />}
      {!loading && !error && (
        <>
          {models.length ? (
            <DataTable heads={["能力", "Provider", "耗时", "状态"]}>
              {models.map((item) => (
                <tr key={item.id}>
                  <td>{item.capability || "unknown"}</td>
                  <td>{item.provider || "provider"}/{item.model || "model"}</td>
                  <td>{item.latency_ms ?? "-"} ms</td>
                  <td><StatusBadge tone={statusTone(item.status)}>{item.status || "unknown"}</StatusBadge></td>
                </tr>
              ))}
            </DataTable>
          ) : <EmptyState label="暂无模型调用日志" />}
          {traces.length ? (
            <DataTable heads={["问题", "时间"]}>
              {traces.map((item) => <tr key={item.id}><td>{item.question || "未记录问题"}</td><td>{item.created_at || "-"}</td></tr>)}
            </DataTable>
          ) : <EmptyState label="暂无请求链路日志" />}
        </>
      )}
    </section>
  );
}

export function SystemMetricsPage() {
  const [value, setValue] = useState<SystemMetrics>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    setError("");
    systemApi.metrics()
      .then(setValue)
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  return (
    <section className="page-stack">
      <PageHeader kicker="SYSTEM METRICS" title="系统指标" text="由真实会话、日志、反馈和 RAG 链路聚合。" icon={<ChartNoAxesCombined size={16} />} actions={<button className="primary compact" onClick={load}><RefreshCw size={15} />刷新</button>} />
      {loading && <LoadingState />}
      {error && <ErrorState message={error} retry={load} />}
      {value && (
        <>
          <MetricOverview value={value} />
          <DataTable heads={["能力", "调用", "平均耗时", "失败"]}>
            {Object.entries(value.capabilities).map(([name, item]) => (
              <tr key={name}>
                <td>{name}</td>
                <td>{item.calls}</td>
                <td>{item.avg_latency_ms} ms</td>
                <td>{item.failed}</td>
              </tr>
            ))}
          </DataTable>
        </>
      )}
    </section>
  );
}

export function SystemSettingsPage() {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = () => {
    setLoading(true);
    setError("");
    systemApi.settings()
      .then((result) => setValues(result.values))
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const update = (key: string, value: string) => setValues({ ...values, [key]: value });
  const save = async () => {
    try {
      const result = await systemApi.updateSettings(values);
      setValues(result.values);
      setMessage("设置已保存。");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存设置失败");
    }
  };

  return (
    <section className="page-stack">
      <PageHeader kicker="SYSTEM SETTINGS" title="系统设置" text="维护非敏感运行参数，避免在前端暴露密钥类配置。" icon={<Settings size={16} />} />
      {loading && <LoadingState />}
      {error && <ErrorState message={error} retry={load} />}
      {message && <FormMessage>{message}</FormMessage>}
      {!loading && !error && (
        <section className="tech-card form-stack">
          {Object.entries(values).length ? Object.entries(values).map(([key, value]) => (
            <label key={key}>
              {key}
              <input value={String(value)} onChange={(event) => update(key, event.target.value)} />
            </label>
          )) : <EmptyState label="暂无可维护配置" />}
          <button className="primary" onClick={save} disabled={!Object.entries(values).length}><Save size={15} />保存设置</button>
        </section>
      )}
    </section>
  );
}
