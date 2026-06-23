import {
  Activity,
  BookOpenCheck,
  Bot,
  Camera,
  ChartNoAxesCombined,
  CircleHelp,
  Compass,
  Database,
  FileStack,
  GraduationCap,
  HeartHandshake,
  House,
  Image,
  KeyRound,
  Languages,
  LayoutDashboard,
  ListChecks,
  Map,
  MessageCircle,
  Mic,
  Network,
  NotebookTabs,
  Route,
  ScrollText,
  Settings,
  ShieldCheck,
  Sparkles,
  SquareUserRound,
  Trophy,
  UsersRound,
  Waypoints,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type ModuleKey = "intro" | "tourist" | "guide" | "student" | "knowledge" | "system";

export type PageSpec = {
  path: string;
  label: string;
  title: string;
  description: string;
  icon: LucideIcon;
  api: string[];
  pending?: string[];
  sections: string[];
};

export const modules: Record<ModuleKey, { label: string; home: string; tone: "tourism" | "admin" }> = {
  intro: { label: "项目介绍", home: "/intro/overview", tone: "tourism" },
  tourist: { label: "游客端", home: "/tourist/home", tone: "tourism" },
  guide: { label: "导游端", home: "/guide/dashboard", tone: "tourism" },
  student: { label: "学生端", home: "/student/home", tone: "tourism" },
  knowledge: { label: "知识库维护", home: "/knowledge/documents", tone: "admin" },
  system: { label: "系统管理", home: "/system/dashboard", tone: "admin" },
};

const page = (
  path: string,
  label: string,
  title: string,
  description: string,
  icon: PageSpec["icon"],
  sections: string[],
  api: string[] = [],
  pending: string[] = [],
): PageSpec => ({ path, label, title, description, icon, sections, api, pending });

export const pageSpecs: Record<string, PageSpec> = Object.fromEntries(
  [
    page("/intro/overview", "项目总览", "可信多语文旅 AI", "连接多模态导览、可信知识、文化图谱、导游协同与人才实训。", Sparkles, ["数据概览", "核心能力", "技术壁垒", "系统入口"], ["GET /api/knowledge/stats"], ["今日问答综合统计"]),
    page("/intro/architecture", "技术架构", "可信多语文旅 AI 系统架构", "从游客输入到知识增强，再到多语输出和人工审核回流。", Waypoints, ["系统分层", "调用链路", "数据闭环"], ["GET /api/architecture/audit", "GET /api/health"]),
    page("/intro/features", "核心功能", "完整能力矩阵", "按真实业务入口展示游客、导游、知识工程与运维能力。", ListChecks, ["功能卡片网格", "重点功能详情", "演示入口"]),
    page("/intro/scenarios", "应用场景", "从旅行现场到知识回流", "沿真实用户旅程讲清楚 LinguaSpace 的使用场景。", Compass, ["场景时间线", "场景详情", "相关入口"]),
    page("/intro/roadmap", "建设路线", "从可信问答到人机协同", "展示已经落地的能力与下一步产品演进方向。", Route, ["路线时间轴", "当前完成度", "下一步计划"]),
    page("/tourist/home", "游客首页", "在云南旅行中使用 AI 导览", "快速进入问答、语音、拍照、路线和文化提醒。", House, ["景区 Banner", "快捷入口", "今日推荐", "最近会话"], ["GET /api/content/guide", "GET /api/content/routes", "GET /api/sessions"], ["当前位置与天气", "语言偏好写入"]),
    page("/tourist/chat", "多语问答", "可信文化导览", "回答来自审核知识检索与真实模型链路，并展示来源和图谱增强。", MessageCircle, ["会话区", "处理链路", "来源引用", "人工接管"], ["POST /api/sessions", "POST /api/chat", "POST /api/chat/stream"], ["游客主动申请接管接口"]),
    page("/tourist/voice", "语音导览", "边走边问，听见云南", "上传或录制音频，经过 ASR、RAG 和 TTS 完成真实语音导览。", Mic, ["录音区", "处理链路", "转写结果", "语音播放"], ["POST /api/audio/transcribe", "POST /api/audio/ask", "POST /api/tts/synthesize"]),
    page("/tourist/image", "拍照识别", "拍照识别，发现文化故事", "视觉模型提取线索，文化解释继续通过可信知识链路生成。", Camera, ["上传预览", "识别摘要", "文化讲解", "来源引用"], ["POST /api/image/ask"]),
    page("/tourist/routes", "路线推荐", "按兴趣发现云南路线", "从真实路线库中筛选并生成可解释的推荐结果。", Map, ["路线筛选", "路线卡片", "路线详情"], ["GET /api/content/routes", "POST /api/route/recommend"]),
    page("/tourist/culture-tips", "文化提醒", "带着尊重走近当地文化", "按地点和场景查看礼仪、禁忌和服务提醒。", HeartHandshake, ["地点筛选", "提醒卡片", "文化来源"], [], ["文化提醒专用接口"]),
    page("/tourist/history", "游览历史", "回看问答、识别与反馈", "聚合真实游客会话和反馈记录。", ScrollText, ["会话记录", "识别记录", "反馈入口"], ["GET /api/sessions", "GET /api/feedback", "POST /api/feedback"], ["游客收藏接口"]),
    page("/guide/dashboard", "导游工作台", "真人导游协同工作台", "聚焦待接管会话、风险问题、修正记录和知识回流。", LayoutDashboard, ["工作台 Banner", "关键指标", "待处理会话", "最近修正"], ["GET /api/collaboration/sessions", "GET /api/collaboration/corrections"], ["导游告警接口"]),
    page("/guide/sessions", "游客会话", "游客会话列表", "查看真实游客会话、地点、语言、状态和最近问题。", MessageCircle, ["筛选工具栏", "会话列表", "状态摘要"], ["GET /api/collaboration/sessions"]),
    page("/guide/sessions/:id", "会话详情", "游客会话详情", "查看消息上下文、接管状态，并发送真人导游回复。", Bot, ["游客画像", "对话时间线", "接管操作", "导游回复"], ["GET /api/collaboration/sessions", "POST /api/sessions/:id/takeover", "POST /api/sessions/:id/guide-reply"], ["释放接管接口"]),
    page("/guide/takeover", "人工接管", "人工接管中心", "统一处理需要真人导游介入的游客会话。", ShieldCheck, ["待接管列表", "风险摘要", "回复区"], ["GET /api/collaboration/sessions", "POST /api/sessions/:id/takeover", "POST /api/sessions/:id/guide-reply"], ["释放接管与接管日志接口"]),
    page("/guide/corrections", "回答修正", "AI 回答修正与审核回流", "修正低置信回答并提交审核任务，避免未经审核直接入库。", BookOpenCheck, ["修正列表", "问题上下文", "优化回答", "提交审核"], ["GET /api/collaboration/corrections", "POST /api/guide/questions/review", "POST /api/collaboration/correction"], ["修正编辑接口"]),
    page("/guide/cases", "讲解案例", "优秀讲解案例库", "浏览真实协同案例，支持后续沉淀高质量服务经验。", NotebookTabs, ["案例筛选", "案例卡片", "案例详情"], ["GET /api/collaboration/cases"], ["案例新增与编辑接口"]),
    page("/guide/profile", "个人中心", "导游个人中心", "展示导游资料、贡献、接管记录和修正统计。", SquareUserRound, ["资料卡片", "贡献统计", "历史记录"], [], ["导游资料与贡献接口"]),
    page("/knowledge/documents", "文档管理", "知识文档管理", "上传真实知识文档，进入切片和审核链路。", FileStack, ["上传区", "文档列表", "审核状态"], ["GET /api/knowledge/documents", "POST /api/knowledge/documents"], ["文档删除、重切片、向量化接口"]),
    page("/knowledge/chunks", "知识切片", "知识切片管理", "查看上传文档产生的真实审核任务和切片内容。", Database, ["筛选工具栏", "切片列表", "切片详情"], ["GET /api/review/tasks"], ["独立切片 CRUD 与向量化接口"]),
    page("/knowledge/graph", "文化图谱", "文化知识图谱", "使用真实三元组关系渲染节点、边和关系标签。", Network, ["图谱工具栏", "图谱画布", "详情抽屉", "关系编辑"], ["GET /api/graph", "POST /api/graph", "PUT /api/graph/:id", "DELETE /api/graph/:id", "POST /api/graph/query"]),
    page("/knowledge/review", "审核工作台", "知识审核工作台", "审核文档切片与导游修正内容，再决定是否进入正式知识库。", BookOpenCheck, ["任务筛选", "审核列表", "任务详情", "审核操作"], ["GET /api/review/tasks", "POST /api/review/tasks/:id/decision"]),
    page("/knowledge/terms", "多语术语", "多语术语表", "维护景点、民族、节庆、礼仪和饮食术语的一致翻译。", Languages, ["术语筛选", "术语列表", "新增编辑"], ["GET /api/terms", "POST /api/terms", "PUT /api/terms/:id", "DELETE /api/terms/:id"], ["术语检查与导入接口"]),
    page("/knowledge/rag-test", "RAG 测试", "RAG 检索测试", "验证检索命中、得分拆解、图谱增强与回答生成。", CircleHelp, ["测试参数", "检索结果", "图谱关系", "回答结果"], ["POST /api/knowledge/search", "POST /api/graph/query", "POST /api/chat"]),
    page("/knowledge/statistics", "知识统计", "知识资产统计", "展示真实知识、关系、路线、术语和待审核任务数量。", ChartNoAxesCombined, ["统计卡片", "覆盖说明", "待审核摘要"], ["GET /api/knowledge/stats"], ["覆盖率与趋势接口"]),
    page("/system/dashboard", "系统总览", "系统运行总览", "聚合真实服务健康、知识资产和模型调用状态。", LayoutDashboard, ["关键指标", "服务状态", "日志摘要", "系统告警"], ["GET /api/health", "GET /api/knowledge/stats", "GET /api/logs/model-calls"], ["系统告警接口"]),
    page("/system/users", "用户管理", "用户与状态管理", "查看真实用户并新增账号或更新账号状态。", UsersRound, ["筛选工具栏", "用户表格", "新增用户"], ["GET /api/users", "POST /api/users", "PUT /api/users/:id/status"], ["用户资料编辑与删除接口"]),
    page("/system/roles", "角色管理", "角色管理", "维护游客、学生、导游和管理员角色定义。", SquareUserRound, ["角色卡片", "角色详情", "角色操作"], [], ["角色管理接口"]),
    page("/system/permissions", "权限管理", "权限矩阵", "按角色查看和配置页面、操作与数据访问权限。", KeyRound, ["权限矩阵", "角色筛选", "保存操作"], [], ["权限管理接口"]),
    page("/system/health", "健康监控", "服务健康监控", "查看 API、数据库、缓存、对象存储、图数据库和模型服务状态。", Activity, ["服务状态卡片", "刷新操作", "异常详情"], ["GET /api/health"]),
    page("/system/logs", "调用日志", "模型调用与请求链路日志", "追踪真实模型调用、耗时、异常和请求链路。", ScrollText, ["日志筛选", "模型调用表格", "请求链路表格"], ["GET /api/logs/model-calls", "GET /api/logs/request-traces"]),
    page("/system/metrics", "指标分析", "系统指标分析", "展示请求量、语言分布、延迟、错误率和 RAG 命中趋势。", ChartNoAxesCombined, ["指标筛选", "趋势图表", "占比图表"], [], ["系统指标趋势接口"]),
    page("/system/settings", "系统设置", "系统设置", "查看后端地址、模型配置、审核策略和维护参数。", Settings, ["接口配置", "模型配置", "审核策略", "系统维护"], [], ["系统设置读写接口"]),
    page("/student/home", "实训首页", "AI 导游实训", "快速进入虚拟带团训练、查看训练报告和知识点覆盖。", GraduationCap, ["训练概览", "快捷入口", "最近记录"], ["GET /api/training/scenarios", "GET /api/training/records"]),
    page("/student/scenarios", "实训场景库", "实训场景库", "浏览后端真实训练场景，按游客类型和关键词筛选后进入虚拟带团训练。", BookOpenCheck, ["场景筛选", "场景卡片", "训练入口"], ["GET /api/training/scenarios"]),
    page("/student/training", "虚拟带团", "虚拟带团训练", "选择训练场景，面对虚拟游客提问，提交语音或文字讲解并获得多维评分。", ShieldCheck, ["场景选择", "虚拟问答", "语音提交", "多维评分"], ["GET /api/training/scenarios", "POST /api/training/score", "POST /api/audio/transcribe"]),
    page("/student/reports", "训练报告", "训练报告与成长轨迹", "查看历史训练记录、评分详情、知识点覆盖和改进建议。", Trophy, ["历史记录", "评分详情", "知识点覆盖", "改进建议"], ["GET /api/training/records"]),
  ].map((item) => [item.path, item]),
);

export const modulePages: Record<ModuleKey, PageSpec[]> = {
  intro: ["/intro/overview", "/intro/architecture", "/intro/features", "/intro/scenarios", "/intro/roadmap"].map((path) => pageSpecs[path]),
  tourist: ["/tourist/home", "/tourist/chat", "/tourist/voice", "/tourist/image", "/tourist/routes", "/tourist/culture-tips", "/tourist/history"].map((path) => pageSpecs[path]),
  guide: ["/guide/dashboard", "/guide/sessions", "/guide/takeover", "/guide/corrections", "/guide/cases", "/guide/profile"].map((path) => pageSpecs[path]),
  student: ["/student/home", "/student/scenarios", "/student/training", "/student/reports"].map((path) => pageSpecs[path]),
  knowledge: ["/knowledge/documents", "/knowledge/chunks", "/knowledge/graph", "/knowledge/review", "/knowledge/terms", "/knowledge/rag-test", "/knowledge/statistics"].map((path) => pageSpecs[path]),
  system: ["/system/dashboard", "/system/users", "/system/roles", "/system/permissions", "/system/health", "/system/logs", "/system/metrics", "/system/settings"].map((path) => pageSpecs[path]),
};
