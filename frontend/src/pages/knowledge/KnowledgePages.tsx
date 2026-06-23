import {
  BookOpenCheck,
  Check,
  CircleHelp,
  Database,
  FileStack,
  Languages,
  Network,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { graphApi, type GraphRelation } from "../../api/graph";
import { knowledgeApi, type KnowledgeChunk, type KnowledgeDocument, type ReviewTask, type Term } from "../../api/knowledge";
import { touristApi } from "../../api/tourist";
import type { ChatResult } from "../../api/types";
import { uploadApi } from "../../api/upload";
import { DataTable } from "../../components/common/DataTable";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { FormMessage } from "../../components/common/FormMessage";
import { LoadingState } from "../../components/common/LoadingState";
import { MetricCard } from "../../components/common/MetricCard";
import { PageHeader } from "../../components/common/PageHeader";
import { StatusBadge } from "../../components/common/StatusBadge";

function badge(status = "") {
  return status === "approved" || status === "ready" || status === "vectorized"
    ? "success" as const
    : status === "rejected" || status === "failed"
      ? "danger" as const
      : "warning" as const;
}

function short(value = "", size = 92) {
  return value.length > size ? `${value.slice(0, size)}...` : value;
}

function parseBulkTerms(text: string) {
  return text
    .split("\n")
    .map((line) => line.split(",").map((cell) => cell.trim()))
    .filter((row) => row.length >= 2 && row[0] && row[1])
    .map(([zh_name, translation, scene = ""]) => ({ zh_name, translation, scene, language: "en" }));
}

export function KnowledgeDocumentsPage() {
  const [items, setItems] = useState<KnowledgeDocument[]>([]);
  const [file, setFile] = useState<File>();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    setLoading(true);
    setError("");
    knowledgeApi.documents()
      .then((result) => setItems(result.items))
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, []);

  const upload = async () => {
    if (!file) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await uploadApi.document(file, "管理员上传", "知识工程");
      setMessage(`已生成 ${String(result.chunk_count)} 个待审核切片。`);
      setFile(undefined);
      refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "文档上传失败");
    } finally {
      setBusy(false);
    }
  };

  const action = async (id: string, type: "delete" | "split" | "vectorize") => {
    setMessage("");
    try {
      if (type === "delete") await knowledgeApi.deleteDocument(id);
      if (type === "split") await knowledgeApi.splitDocument(id);
      if (type === "vectorize") await knowledgeApi.vectorizeDocument(id);
      setMessage(type === "delete" ? "文档已删除。" : type === "split" ? "已重新切片。" : "已提交向量化。");
      refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "操作失败");
    }
  };

  return (
    <section className="page-stack">
      <PageHeader kicker="KNOWLEDGE DOCUMENTS" title="知识文档管理" text="上传、重新切片、向量化和删除都写入真实后端。" icon={<FileStack size={16} />} actions={<button className="primary compact" onClick={refresh}><RefreshCw size={15} />刷新</button>} />
      <section className="section-shell">
        <header>
          <div>
            <h2>知识资料上传</h2>
            <p>资料进入切片与审核链路后，才会逐步成为可信导览知识。</p>
          </div>
          <Upload size={18} />
        </header>
        <div className="form-stack">
          <input type="file" accept=".txt,.md,.csv" onChange={(event) => setFile(event.target.files?.[0])} />
          <button className="primary" disabled={!file || busy} onClick={upload}><Upload size={16} />{busy ? "上传中" : "上传并切片"}</button>
        </div>
      </section>
      {message && <FormMessage>{message}</FormMessage>}
      {loading && <LoadingState />}
      {error && <ErrorState message={error} retry={refresh} />}
      {!loading && !error && !items.length && <EmptyState label="暂无上传文档" />}
      {!!items.length && (
        <DataTable heads={["文档", "来源", "切片", "向量状态", "更新时间", "操作"]}>
          {items.map((item) => (
            <tr key={item.id}>
              <td><b>{item.title}</b><small>{short(item.content)}</small></td>
              <td>{item.source}</td>
              <td>{item.chunk_count}</td>
              <td><StatusBadge tone={badge(item.vector_status)}>{item.vector_status}</StatusBadge></td>
              <td>{item.updated_at}</td>
              <td>
                <div className="row-actions">
                  <button onClick={() => action(item.id, "split")}>重新切片</button>
                  <button onClick={() => action(item.id, "vectorize")}>向量化</button>
                  <button className="danger-action" onClick={() => action(item.id, "delete")}><Trash2 size={14} /></button>
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </section>
  );
}

export function KnowledgeChunksPage() {
  const [items, setItems] = useState<KnowledgeChunk[]>([]);
  const [docs, setDocs] = useState<KnowledgeDocument[]>([]);
  const [form, setForm] = useState({ document_id: "", title: "", content: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const refresh = () => {
    setLoading(true);
    setError("");
    Promise.all([knowledgeApi.chunks(), knowledgeApi.documents()])
      .then(([chunkData, documentData]) => {
        setItems(chunkData.items);
        setDocs(documentData.items);
        setForm((current) => current.document_id ? current : { ...current, document_id: documentData.items[0]?.id ?? "" });
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, []);

  const create = async () => {
    if (!form.document_id || !form.title.trim() || !form.content.trim()) return;
    try {
      await knowledgeApi.addChunk(form);
      setForm({ ...form, title: "", content: "" });
      setMessage("切片已新增。");
      refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "新增切片失败");
    }
  };
  const remove = async (id: string) => {
    try {
      await knowledgeApi.deleteChunk(id);
      setMessage("切片已删除。");
      refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "删除切片失败");
    }
  };
  const vectorize = async (id: string) => {
    try {
      await knowledgeApi.vectorizeChunk(id);
      setMessage("切片已提交向量化。");
      refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "向量化失败");
    }
  };

  return (
    <section className="page-stack">
      <PageHeader kicker="KNOWLEDGE CHUNKS" title="知识切片管理" text="切片是独立可维护实体，可新增、删除和向量化。" icon={<Database size={16} />} actions={<button className="primary compact" onClick={refresh}><RefreshCw size={15} />刷新</button>} />
      <section className="section-shell">
        <header>
          <div>
            <h2>新增切片</h2>
            <p>用于人工补录或修正文旅知识片段。</p>
          </div>
          <Database size={18} />
        </header>
        <div className="form-stack">
          <select value={form.document_id} onChange={(event) => setForm({ ...form, document_id: event.target.value })}>
            {docs.map((doc) => <option key={doc.id} value={doc.id}>{doc.title}</option>)}
          </select>
          <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="切片标题" />
          <textarea value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} placeholder="切片正文" />
          <button className="primary" onClick={create} disabled={!form.document_id || !form.title.trim() || !form.content.trim()}><Plus size={15} />新增切片</button>
        </div>
      </section>
      {message && <FormMessage>{message}</FormMessage>}
      {loading && <LoadingState />}
      {error && <ErrorState message={error} retry={refresh} />}
      {!loading && !error && !items.length && <EmptyState label="暂无切片" />}
      {!!items.length && (
        <DataTable heads={["标题", "文档", "状态", "更新时间", "操作"]}>
          {items.map((item) => (
            <tr key={item.id}>
              <td><b>{item.title}</b><small>{short(item.content)}</small></td>
              <td><span className="cell-muted">{item.document_id.slice(0, 8)}</span></td>
              <td><StatusBadge tone={badge(item.vector_status)}>{item.vector_status}</StatusBadge></td>
              <td>{item.updated_at}</td>
              <td><div className="row-actions"><button onClick={() => vectorize(item.id)}>向量化</button><button className="danger-action" onClick={() => remove(item.id)}><Trash2 size={14} /></button></div></td>
            </tr>
          ))}
        </DataTable>
      )}
    </section>
  );
}

export function KnowledgeGraphPage() {
  const [items, setItems] = useState<GraphRelation[]>([]);
  const [form, setForm] = useState({ source: "", relation: "", target: "" });
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const refresh = (nextKeyword = keyword) => {
    setLoading(true);
    setError("");
    graphApi.list(nextKeyword)
      .then((result) => setItems(result.items))
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { refresh(""); }, []);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await graphApi.create(form);
      setForm({ source: "", relation: "", target: "" });
      setMessage("关系已新增。");
      refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "新增关系失败");
    }
  };
  const remove = async (id: string) => {
    try {
      await graphApi.remove(id);
      setMessage("关系已删除。");
      refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "删除关系失败");
    }
  };

  return (
    <section className="page-stack">
      <section className="knowledge-hero">
        <div>
          <span className="page-kicker"><Network size={16} /> CULTURAL GRAPH</span>
          <h1>文化知识图谱</h1>
          <p>维护真实三元组关系，让地点、民族文化、非遗、路线与礼仪形成可解释网络。</p>
        </div>
      </section>
      <section className="route-filter">
        <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索实体或关系" />
        <button className="primary compact" onClick={() => refresh(keyword)}><Search size={15} />搜索</button>
        <button className="compact" onClick={() => { setKeyword(""); refresh(""); }}><RefreshCw size={15} />重置</button>
      </section>
      <RelationPreview relations={items} />
      <form className="route-filter" onSubmit={create}>
        <input required value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} placeholder="实体" />
        <input required value={form.relation} onChange={(event) => setForm({ ...form, relation: event.target.value })} placeholder="关系" />
        <input required value={form.target} onChange={(event) => setForm({ ...form, target: event.target.value })} placeholder="目标" />
        <button className="primary compact"><Plus size={15} />新增关系</button>
      </form>
      {message && <FormMessage>{message}</FormMessage>}
      {loading && <LoadingState />}
      {error && <ErrorState message={error} retry={() => refresh()} />}
      {!loading && !error && !items.length && <EmptyState label="暂无图谱关系" />}
      {!!items.length && (
        <DataTable heads={["实体", "关系", "目标", "操作"]}>
          {items.slice(0, 120).map((item) => (
            <tr key={item.id}>
              <td>{item.source}</td>
              <td><StatusBadge>{item.relation}</StatusBadge></td>
              <td>{item.target}</td>
              <td><button className="danger-action" onClick={() => remove(item.id)}><Trash2 size={14} /></button></td>
            </tr>
          ))}
        </DataTable>
      )}
    </section>
  );
}

export function KnowledgeReviewPage() {
  const [items, setItems] = useState<ReviewTask[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const refresh = (nextStatus = status) => {
    setLoading(true);
    setError("");
    knowledgeApi.reviewTasks(nextStatus)
      .then((result) => setItems(result.items))
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { refresh(""); }, []);

  const decide = async (id: string, nextStatus: "approved" | "rejected") => {
    try {
      await knowledgeApi.decideReview(id, nextStatus);
      setMessage(nextStatus === "approved" ? "审核已通过。" : "审核已驳回。");
      refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "审核操作失败");
    }
  };

  return (
    <section className="page-stack">
      <PageHeader kicker="REVIEW WORKBENCH" title="知识审核工作台" text="审核通过后才进入正式知识库，导游修正不会绕过治理链路。" icon={<BookOpenCheck size={16} />} />
      <section className="route-filter">
        <select value={status} onChange={(event) => { setStatus(event.target.value); refresh(event.target.value); }}>
          <option value="">全部状态</option>
          <option value="pending">待审核</option>
          <option value="approved">已通过</option>
          <option value="rejected">已驳回</option>
        </select>
      </section>
      {message && <FormMessage>{message}</FormMessage>}
      {loading && <LoadingState />}
      {error && <ErrorState message={error} retry={() => refresh()} />}
      {!loading && !error && !items.length && <EmptyState label="暂无审核任务" />}
      {!!items.length && (
        <DataTable heads={["标题", "类型", "来源", "状态", "操作"]}>
          {items.map((item) => (
            <tr key={item.id}>
              <td><b>{item.title}</b><small>{short(item.content, 120)}</small></td>
              <td>{item.object_type}</td>
              <td>{item.source}</td>
              <td><StatusBadge tone={badge(item.status)}>{item.status}</StatusBadge></td>
              <td>
                {item.status === "pending" && (
                  <div className="row-actions">
                    <button className="success-action" onClick={() => decide(item.id, "approved")}><Check size={14} /></button>
                    <button className="danger-action" onClick={() => decide(item.id, "rejected")}><X size={14} /></button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </section>
  );
}

export function KnowledgeTermsPage() {
  const [items, setItems] = useState<Term[]>([]);
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ zh_name: "", language: "en", translation: "", scene: "" });

  const refresh = () => {
    setLoading(true);
    setError("");
    knowledgeApi.terms()
      .then((result) => setItems(result.items))
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, []);

  const create = async () => {
    try {
      await knowledgeApi.addTerm(form);
      setForm({ zh_name: "", language: form.language, translation: "", scene: "" });
      setMessage("术语已新增。");
      refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "新增术语失败");
    }
  };
  const check = async () => {
    try {
      const result = await knowledgeApi.checkTerms(text);
      setMessage(`命中 ${result.matched} 条需要检查的术语。`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "术语检查失败");
    }
  };
  const bulk = async () => {
    const parsed = parseBulkTerms(text);
    if (!parsed.length) {
      setMessage("请按“中文术语,翻译,场景”每行填写。");
      return;
    }
    try {
      const result = await knowledgeApi.importTerms(parsed);
      setMessage(`导入 ${result.created} 条术语。`);
      refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "批量导入失败");
    }
  };
  const remove = async (id: string) => {
    try {
      await knowledgeApi.deleteTerm(id);
      setMessage("术语已删除。");
      refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "删除术语失败");
    }
  };

  return (
    <section className="page-stack">
      <PageHeader kicker="TERM GLOSSARY" title="多语术语库" text="维护景点、民族、节庆、礼仪和饮食术语的一致翻译。" icon={<Languages size={16} />} />
      <section className="admin-two-col">
        <article className="tech-card form-stack">
          <strong>单条维护</strong>
          <input value={form.zh_name} onChange={(event) => setForm({ ...form, zh_name: event.target.value })} placeholder="中文术语" />
          <select value={form.language} onChange={(event) => setForm({ ...form, language: event.target.value })}>
            <option value="en">English</option>
            <option value="th">ไทย</option>
            <option value="vi">Tiếng Việt</option>
            <option value="ja">日本語</option>
          </select>
          <input value={form.translation} onChange={(event) => setForm({ ...form, translation: event.target.value })} placeholder="翻译" />
          <input value={form.scene} onChange={(event) => setForm({ ...form, scene: event.target.value })} placeholder="场景" />
          <button className="primary" onClick={create} disabled={!form.zh_name.trim() || !form.translation.trim()}><Plus size={15} />新增术语</button>
        </article>
        <article className="tech-card form-stack">
          <strong>批量导入 / 一致性检查</strong>
          <textarea value={text} onChange={(event) => setText(event.target.value)} placeholder={"每行：中文术语,翻译,场景\n也可粘贴待检查文本"} />
          <div className="row-actions">
            <button onClick={bulk}>批量导入</button>
            <button onClick={check}>一致性检查</button>
          </div>
        </article>
      </section>
      {message && <FormMessage>{message}</FormMessage>}
      {loading && <LoadingState />}
      {error && <ErrorState message={error} retry={refresh} />}
      {!loading && !error && !items.length && <EmptyState label="暂无术语" />}
      {!!items.length && (
        <DataTable heads={["中文", "语言", "翻译", "场景", "状态", "操作"]}>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{item.zh_name}</td>
              <td>{item.language}</td>
              <td>{item.translation}</td>
              <td>{item.scene}</td>
              <td><StatusBadge tone={badge(item.status)}>{item.status}</StatusBadge></td>
              <td><button className="danger-action" onClick={() => remove(item.id)}><Trash2 size={14} /></button></td>
            </tr>
          ))}
        </DataTable>
      )}
    </section>
  );
}

export function KnowledgeRagTestPage() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<ChatResult>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const ask = async () => {
    if (!question.trim()) return;
    setBusy(true);
    setError("");
    setResult(undefined);
    try {
      setResult(await touristApi.ask({ question: question.trim() }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "RAG 测试失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="page-stack">
      <PageHeader kicker="RAG TEST" title="检索增强测试" text="直接验证真实问答链路，查看回答、来源与图谱关系。" icon={<CircleHelp size={16} />} />
      <section className="tech-card form-stack">
        <textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="输入测试问题，例如：丽江古城有哪些文化礼仪要注意？" />
        <button className="primary" disabled={!question.trim() || busy} onClick={ask}><Search size={15} />{busy ? "执行中" : "执行测试"}</button>
      </section>
      {busy && <LoadingState label="正在执行检索、图谱增强与回答生成" />}
      {error && <ErrorState message={error} retry={ask} />}
      {result && (
        <section className="section-shell">
          <header>
            <div>
              <h2>回答结果</h2>
              <p>{result.reliable ? "命中可靠资料，可作为导览回答参考。" : "未达到可靠阈值，应提示补充信息或交给人工导游。"}</p>
            </div>
            <StatusBadge tone={result.reliable ? "success" : "warning"}>{result.reliable ? "可靠" : "需复核"}</StatusBadge>
          </header>
          <p>{result.answer}</p>
          <div className="admin-card-grid">
            <MetricCard icon={Database} label="来源数量" value={result.sources.length} />
            <MetricCard icon={Network} label="图谱关系" value={result.graph?.length ?? 0} />
            <MetricCard icon={ShieldCheck} label="Provider" value={result.provider || "unknown"} />
          </div>
          {!!result.sources.length && (
            <DataTable heads={["标题", "片段", "得分"]}>
              {result.sources.map((source) => <tr key={source.id}><td>{source.title}</td><td>{source.snippet}</td><td>{source.score ?? "-"}</td></tr>)}
            </DataTable>
          )}
        </section>
      )}
    </section>
  );
}

export function KnowledgeStatisticsPage() {
  const [value, setValue] = useState<Record<string, number>>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = () => {
    setLoading(true);
    setError("");
    knowledgeApi.statistics()
      .then((result) => setValue(result as unknown as Record<string, number>))
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const entries = value
    ? Object.entries(value).filter(([, amount]) => typeof amount === "number")
    : [];

  return (
    <section className="page-stack">
      <PageHeader kicker="KNOWLEDGE METRICS" title="知识资产统计" text="展示文档、切片、向量覆盖率与 RAG 命中率。" icon={<Database size={16} />} actions={<button className="primary compact" onClick={load}><RefreshCw size={15} />刷新</button>} />
      {loading && <LoadingState />}
      {error && <ErrorState message={error} retry={load} />}
      {value && (
        <div className="admin-stats-grid">
          {entries.map(([label, amount]) => <MetricCard key={label} icon={Database} label={label} value={Number.isInteger(amount) ? amount : amount.toFixed(2)} />)}
        </div>
      )}
    </section>
  );
}

function RelationPreview({ relations }: { relations: GraphRelation[] }) {
  const nodes = useMemo(() => {
    const names = [...new Set(relations.flatMap((item) => [item.source, item.target]).filter(Boolean))].slice(0, 10);
    return names.map((name, index) => {
      const angle = (Math.PI * 2 * index) / Math.max(names.length, 1) - Math.PI / 2;
      return {
        name,
        x: 50 + Math.cos(angle) * 34,
        y: 50 + Math.sin(angle) * 31,
      };
    });
  }, [relations]);
  const nodeMap = new Map(nodes.map((node) => [node.name, node]));

  if (!relations.length) {
    return (
      <div className="relation-preview">
        <div className="relation-preview-empty">
          <div>
            <Network size={32} />
            <p>新增或搜索图谱关系后，这里会展示真实三元组预览。</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relation-preview" aria-label="文化知识图谱预览">
      <svg viewBox="0 0 100 100" role="img">
        {relations.slice(0, 24).map((relation) => {
          const source = nodeMap.get(relation.source);
          const target = nodeMap.get(relation.target);
          if (!source || !target) return null;
          return <line key={relation.id} x1={source.x} y1={source.y} x2={target.x} y2={target.y} />;
        })}
        {nodes.map((node) => (
          <g key={node.name}>
            <circle cx={node.x} cy={node.y} r="4.2" />
            <text x={node.x + 5.2} y={node.y + 1.4}>{short(node.name, 8)}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}
