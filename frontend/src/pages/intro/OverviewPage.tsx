import {
  ArrowDown,
  ArrowRight,
  BookOpenCheck,
  Camera,
  Database,
  FileStack,
  Gauge,
  Globe2,
  Languages,
  MessageCircle,
  Network,
  ScanLine,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
  Waypoints,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { graphApi } from "../../api/graph";
import { knowledgeApi, type KnowledgeStatistics } from "../../api/knowledge";
import { systemApi, type SystemMetrics } from "../../api/system";
import { touristApi } from "../../api/tourist";
import type { OverviewStats } from "../../api/types";
import { ErrorState } from "../../components/common/ErrorState";

type LandingData = {
  overview?: OverviewStats;
  knowledge?: KnowledgeStatistics;
  graphEntities?: number;
  termLanguages?: number;
  averageLatency?: number;
};

type Metric = {
  label: string;
  value?: number;
  suffix?: string;
  decimals?: number;
  source: string;
};

const heroFlow = ["多模态输入", "RAG 检索", "知识图谱增强", "多语输出", "审核回流"];

const capabilities: Array<[LucideIcon, string, string, string, string]> = [
  [Languages, "多语交互", "面向跨境游客组织一致、自然的文化讲解。", "多语", "/assets/intro-feature-multilingual-tour.png"],
  [Camera, "拍照识别", "从建筑与文化场景中提取线索，再进入可信检索。", "多模态", "/assets/intro-scenario-photo-recognition.png"],
  [Database, "RAG 文旅知识库", "基于审核资料召回，回答来源可核验、可追踪。", "可信", "/assets/intro-feature-trusted-rag.png"],
  [Network, "文化知识图谱", "将地点、民俗、建筑与非遗关系组织为文化网络。", "可解释", "/assets/intro-feature-cultural-knowledge-graph.png"],
  [UserRoundCheck, "真人导游协同", "低置信问题转交导游接管，修正后进入审核回流。", "人机协同", "/assets/intro-scenario-human-guide-handoff.png"],
  [BookOpenCheck, "AI 导游实训", "把知识、讲解与服务应对转化为高校训练场景。", "产教融合", "/assets/intro-feature-ai-guide-training.png"],
];

const pipeline: Array<[LucideIcon, string, string]> = [
  [ScanLine, "多模态输入", "文字 · 语音 · 图片 · 位置"],
  [Languages, "理解与翻译", "ASR · 翻译 · 视觉线索"],
  [Database, "可信 RAG", "审核资料召回与排序"],
  [Network, "文化图谱", "实体关系语义增强"],
  [Sparkles, "大模型生成", "依据知识组织讲解"],
  [Globe2, "多语输出", "跨境表达 · TTS 播报"],
  [UserRoundCheck, "审核回流", "导游修正 · 专家复核"],
];

const scenarios = [
  ["外国游客多语问答", "跨越语言门槛，获取有文化依据的旅行讲解。", "/tourist/chat", "/assets/intro-scenario-multilingual-visitors.png", "EXPLORE"],
  ["拍照识别讲解", "让古建细节、街巷与文化场景成为导览入口。", "/tourist/image", "/assets/public-lijiang-rooftops.jpg", "DISCOVER"],
  ["导游人工接管", "在低置信与高风险时刻，把服务交给真人导游。", "/guide/takeover", "/assets/public-tour-guide-group.jpg", "COLLABORATE"],
  ["高校 AI 导游实训", "围绕真实文旅知识开展讲解训练与能力评估。", "/intro/features", "/assets/public-classroom-student.jpg", "LEARN"],
  ["文旅知识资产沉淀", "把优质讲解、术语与审核结果持续沉淀为资产。", "/knowledge/documents", "/assets/intro-scenario-knowledge-growth.png", "GROW"],
] as const;

const barriers: Array<[LucideIcon, string, string]> = [
  [Database, "可信 RAG", "审核知识召回、来源引用与命中阈值控制"],
  [Network, "文化知识图谱", "真实三元组关系增强文化语义理解"],
  [Languages, "多语术语表", "景点、民俗与文化专名的一致表达"],
  [ShieldCheck, "跨文化风险控制", "对动态信息与敏感边界保持克制"],
  [UserRoundCheck, "导游修正与专家审核", "人工反馈不会绕过审核直接入库"],
  [Waypoints, "全链路日志追踪", "从检索、图谱到模型调用均可复盘"],
];

export function OverviewPage() {
  const [data, setData] = useState<LandingData>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const heroRef = useRef<HTMLElement>(null);
  const reducedMotion = useReducedMotion();

  const load = async () => {
    setLoading(true);
    setError("");
    const [overview, knowledge, graph, terms, systemMetrics] = await Promise.allSettled([
      touristApi.overview(),
      knowledgeApi.statistics(),
      graphApi.list(),
      knowledgeApi.terms(),
      systemApi.metrics(),
    ]);
    const next: LandingData = {
      overview: overview.status === "fulfilled" ? overview.value : undefined,
      knowledge: knowledge.status === "fulfilled" ? knowledge.value : undefined,
      graphEntities: graph.status === "fulfilled"
        ? new Set(graph.value.items.flatMap((item) => [item.source, item.target]).filter(Boolean)).size
        : undefined,
      termLanguages: terms.status === "fulfilled"
        ? new Set(terms.value.items.map((item) => item.language).filter(Boolean)).size
        : undefined,
      averageLatency: systemMetrics.status === "fulfilled" ? calculateAverageLatency(systemMetrics.value) : undefined,
    };
    setData(next);
    if (!next.overview && !next.knowledge && next.graphEntities === undefined) {
      setError("首页实时指标暂时无法读取。页面仍保留接口状态，不会使用模拟数据替代。");
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const hero = heroRef.current;
      if (!hero) return;
      const shift = Math.max(-34, Math.min(34, -hero.getBoundingClientRect().top * 0.11));
      hero.style.setProperty("--hero-shift", `${shift}px`);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [reducedMotion]);

  const metrics: Metric[] = [
    { label: "术语覆盖语种", value: data.termLanguages, suffix: " 种", source: "GET /api/terms" },
    { label: "文旅知识文档", value: data.knowledge?.documents, suffix: " 份", source: "GET /api/knowledge/statistics" },
    { label: "知识切片", value: data.knowledge?.chunks, suffix: " 条", source: "GET /api/knowledge/statistics" },
    { label: "图谱实体", value: data.graphEntities, suffix: " 个", source: "GET /api/graph 派生" },
    { label: "图谱关系", value: data.overview?.graph_relations ?? data.knowledge?.graph_relations, suffix: " 条", source: "GET /api/stats/overview" },
    { label: "今日问答", value: data.overview?.today_questions, suffix: " 次", source: "GET /api/stats/overview" },
    { label: "RAG 命中率", value: data.knowledge ? data.knowledge.rag * 100 : undefined, suffix: "%", decimals: 1, source: "GET /api/knowledge/statistics" },
    { label: "平均响应时延", value: data.averageLatency, suffix: " ms", source: "需管理员指标权限或产生调用日志" },
  ];

  return (
    <div className="overview-page-immersive">
      <section className="overview-hero" ref={heroRef}>
        <div className="overview-hero-network" aria-hidden="true" />
        <div className="overview-hero-copy hero-enter">
          <span className="overview-kicker"><Sparkles size={15} /> TRUSTED MULTILINGUAL CULTURAL TOURISM AI</span>
          <h1><em>语界</em><span>LinguaSpace</span></h1>
          <h2>面向南亚、东南亚游客的<br />可信多语文旅智能服务平台</h2>
          <p>让云南山水、古城与民族文化被更准确地理解。平台连接多模态导览、可信知识、文化图谱、真人导游和高校实训，形成可持续生长的文旅智能服务闭环。</p>
          <div className="overview-hero-actions">
            <Link className="overview-primary-action" to="/tourist/chat"><MessageCircle size={18} />进入游客端</Link>
            <Link className="overview-secondary-action" to="/intro/architecture"><Workflow size={18} />查看技术架构</Link>
          </div>
          <Link className="overview-admin-link" to="/knowledge/documents">进入知识库维护 / 系统后台 <ArrowRight size={15} /></Link>
          <div className="overview-hero-tags">
            <span>跨境游客服务</span><span>云南文化知识底座</span><span>Human-in-the-loop</span>
          </div>
        </div>
        <aside className="overview-hero-flow hero-enter hero-enter-delay">
          <header><Workflow size={18} /><span>TRUSTED AI ORCHESTRATION</span></header>
          <h3>可信导览核心链路</h3>
          <ol>{heroFlow.map((item, index) => <li key={item} style={{ "--flow-order": index } as CSSProperties}><i /><span>{item}</span></li>)}</ol>
          <footer><ShieldCheck size={15} /> 知识增强与人工审核共同守住文化表达边界</footer>
        </aside>
        <a className="overview-scroll-cue" href="#overview-stats"><span>向下探索</span><ArrowDown size={16} /></a>
      </section>

      <Reveal className="overview-stats-section" id="overview-stats">
        <SectionHeading kicker="LIVE KNOWLEDGE ASSETS" title="一套正在生长的文旅知识底座" text="平台运行指标均来自实时服务端数据，持续反映文旅知识资产与服务运行状态。" />
        {error && <ErrorState message={error} retry={load} />}
        <div className="overview-stats-grid">
          {loading
            ? Array.from({ length: 8 }, (_, index) => <StatSkeleton key={index} />)
            : metrics.map((metric) => <AnimatedMetric key={metric.label} {...metric} />)}
        </div>
      </Reveal>

      <Reveal className="overview-narrative-section">
        <SectionHeading kicker="CULTURE MEETS INTELLIGENCE" title="从旅行现场出发，让 AI 更懂文化" text="不是一个聊天框，而是一套围绕跨境游客体验、可信知识与人工协同建立的文旅智能服务。" />
        <div className="overview-capability-grid">
          {capabilities.map(([Icon, title, text, tag, image], index) => (
            <article className="overview-capability-card" key={title} style={{ "--card-image": `url(${image})`, "--stagger": index } as CSSProperties}>
              <div className="overview-capability-icon"><Icon size={21} /></div>
              <span>{tag}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </Reveal>

      <Reveal className="overview-pipeline-section" id="ai-pipeline">
        <SectionHeading kicker="EXPLAINABLE AI PIPELINE" title="每一次讲解，背后都有一条可追踪链路" text="从游客发问到专家审核回流，节点在进入视口后依次点亮，呈现系统的真实编排逻辑。" tone="dark" />
        <div className="overview-pipeline">
          {pipeline.map(([Icon, title, text], index) => (
            <article className="overview-pipeline-node" key={title} style={{ "--pipeline-order": index } as CSSProperties}>
              <div><Icon size={19} /></div>
              <b>{String(index + 1).padStart(2, "0")}</b>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
        <Link className="overview-inline-link" to="/intro/architecture">展开查看技术架构 <ArrowRight size={15} /></Link>
      </Reveal>

      <Reveal className="overview-scenarios-section">
        <SectionHeading kicker="TRAVEL STORIES, REAL SERVICES" title="在云南旅行的每一个瞬间，找到合适的服务入口" text="用目的地叙事连接游客体验、导游协同、高校实训与知识资产沉淀。" />
        <div className="overview-scenario-grid">
          {scenarios.map(([title, text, to, image, label], index) => (
            <Link className={`overview-scenario-card scenario-${index + 1}`} key={title} to={to}>
              <div className="overview-scenario-image"><img src={image} alt="" /><span>{label}</span></div>
              <div className="overview-scenario-copy">
                <small>0{index + 1}</small>
                <h3>{title}</h3>
                <p>{text}</p>
                <b>进入场景 <ArrowRight size={14} /></b>
              </div>
            </Link>
          ))}
        </div>
      </Reveal>

      <Reveal className="overview-barrier-section">
        <SectionHeading kicker="BEYOND A CHAT WRAPPER" title="技术壁垒，藏在每一条可信回答之后" text="LinguaSpace 将知识工程、文化语义与人工治理组合为一套可审计、可回流的服务基础设施。" tone="dark" />
        <div className="overview-barrier-grid">
          {barriers.map(([Icon, title, text], index) => (
            <article key={title} style={{ "--stagger": index } as CSSProperties}>
              <Icon size={19} /><span>0{index + 1}</span><h3>{title}</h3><p>{text}</p>
            </article>
          ))}
        </div>
      </Reveal>

      <Reveal className="overview-cta-section">
        <div>
          <span className="overview-kicker">ENTER THE PLATFORM</span>
          <h2>从一段云南文化讲解开始，走进可信文旅 AI</h2>
          <p>答辩演示可从游客问答进入，再逐步查看知识图谱、审核回流和系统运行链路。</p>
        </div>
        <div className="overview-portal-grid">
          <PortalLink icon={MessageCircle} title="游客端" text="体验多语智能导览" to="/tourist/chat" />
          <PortalLink icon={Database} title="知识库维护" text="查看 RAG 与审核回流" to="/knowledge/documents" />
          <PortalLink icon={Gauge} title="系统后台" text="查看服务健康与日志" to="/system/dashboard" />
        </div>
      </Reveal>

      <Reveal className="overview-footer-banner">
        <div><span>LINGUASPACE · YUNNAN CULTURAL TOURISM AI</span><h2>山水有故事，技术有边界，服务有温度。</h2></div>
        <Link to="/tourist/home">开始探索云南 <ArrowRight size={16} /></Link>
      </Reveal>
    </div>
  );
}

function Reveal({ children, className, id }: { children: ReactNode; className: string; id?: string }) {
  const [ref, visible] = useOnceInView<HTMLElement>();
  return <section className={`overview-reveal ${visible ? "is-visible" : ""} ${className}`} id={id} ref={ref}>{children}</section>;
}

function SectionHeading({ kicker, title, text, tone = "light" }: { kicker: string; title: string; text: string; tone?: "light" | "dark" }) {
  return <header className={`overview-section-heading ${tone}`}><span>{kicker}</span><div><h2>{title}</h2><p>{text}</p></div></header>;
}

function AnimatedMetric({ label, value, suffix = "", decimals = 0, source }: Metric) {
  const [ref, visible] = useOnceInView<HTMLElement>();
  const reducedMotion = useReducedMotion();
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!visible || value === undefined) return;
    if (reducedMotion) {
      setDisplay(value);
      return;
    }
    let frame = 0;
    const started = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - started) / 900, 1);
      setDisplay(value * (1 - Math.pow(1 - progress, 3)));
      if (progress < 1) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [reducedMotion, value, visible]);

  return (
    <article className={`overview-stat-card ${value === undefined ? "is-pending" : ""}`} ref={ref}>
      <span>{label}</span>
      {value === undefined
        ? <strong>—</strong>
        : <strong>{display.toLocaleString("zh-CN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}<small>{suffix}</small></strong>}
      <small>{source}</small>
    </article>
  );
}

function StatSkeleton() {
  return <article className="overview-stat-card is-loading"><i /><i /><i /></article>;
}

function PortalLink({ icon: Icon, title, text, to }: { icon: LucideIcon; title: string; text: string; to: string }) {
  return <Link to={to}><Icon size={19} /><div><strong>{title}</strong><span>{text}</span></div><ArrowRight size={17} /></Link>;
}

function calculateAverageLatency(metrics: SystemMetrics) {
  const capabilities = Object.values(metrics.capabilities);
  const calls = capabilities.reduce((sum, capability) => sum + capability.calls, 0);
  if (!calls) return undefined;
  return Math.round(capabilities.reduce((sum, capability) => sum + capability.calls * capability.avg_latency_ms, 0) / calls);
}

function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reducedMotion;
}

function useOnceInView<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (!("IntersectionObserver" in window)) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "0px 0px -10%", threshold: 0.08 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, visible] as const;
}
