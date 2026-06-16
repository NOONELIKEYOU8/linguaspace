# 语界 LinguaSpace

![Python](https://img.shields.io/badge/Python%203.10+-3776AB?logo=python&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js%2018+-5FA04E?logo=nodedotjs&logoColor=white)
![Docker](https://img.shields.io/badge/Docker%20Desktop-2496ED?logo=docker&logoColor=white)
![Ollama](https://img.shields.io/badge/Ollama-000000?logo=ollama&logoColor=white)
![Qwen3.5-9b](https://img.shields.io/badge/qwen3.5:9b-FF6A00?logo=alibaba&logoColor=white)
![Qwen3-vl-4b](https://img.shields.io/badge/qwen3--vl:4b-792EE5?logo=alibaba&logoColor=white)

LinguaSpace 是面向云南文旅场景的多端 Web App，包含项目介绍、游客端、导游端、知识库维护和系统管理五个一级模块。前端优先接入真实 FastAPI 后端；后端缺少能力时，页面明确显示“接口待接入”，不使用 mock data 伪装成功。

## 启动方式

前置条件：

- Python 3.10+
- Node.js 18+
- Docker Desktop
- Ollama，已安装 `qwen3.5:9b` 与 `qwen3-vl:4b`

一键启动：

```powershell
.\scripts\start-linguaspace.ps1
```

也可以双击 `start-linguaspace.bat`。停止服务：

```powershell
.\scripts\stop-linguaspace.ps1
```

启动脚本会读取根目录 `.env`，拉起 MySQL、PostgreSQL/pgvector、Redis、MinIO、Neo4j、FastAPI 和 Vite 前端。前端端口会在 `5173` 到 `5190` 之间自动选择。

## 环境变量

前端通过 Vite 环境变量读取后端地址：

```text
VITE_API_BASE_URL=http://localhost:8000
VITE_WS_BASE_URL=ws://localhost:8000
```

后端环境变量示例见 `.env.example`。默认 API 文档地址为 `http://localhost:8000/docs`，健康检查地址为 `http://localhost:8000/api/health`。

## 技术栈

- React 18、TypeScript、Vite
- React Router 嵌套路由
- Lucide React 图标
- FastAPI 后端
- MySQL、PostgreSQL/pgvector、Redis、MinIO、Neo4j
- Ollama 文本模型、Ollama 视觉模型、faster-whisper ASR、Windows SAPI TTS

## 路由表

| 一级模块 | 子页面 |
| --- | --- |
| 项目介绍 `/intro` | `/intro/overview`、`/intro/architecture`、`/intro/features`、`/intro/scenarios`、`/intro/roadmap` |
| 游客端 `/tourist` | `/tourist/home`、`/tourist/chat`、`/tourist/voice`、`/tourist/image`、`/tourist/routes`、`/tourist/culture-tips`、`/tourist/history` |
| 导游端 `/guide` | `/guide/dashboard`、`/guide/sessions`、`/guide/sessions/:id`、`/guide/takeover`、`/guide/corrections`、`/guide/cases`、`/guide/profile` |
| 知识库 `/knowledge` | `/knowledge/documents`、`/knowledge/chunks`、`/knowledge/graph`、`/knowledge/review`、`/knowledge/terms`、`/knowledge/rag-test`、`/knowledge/statistics` |
| 系统管理 `/system` | `/system/dashboard`、`/system/users`、`/system/roles`、`/system/permissions`、`/system/health`、`/system/logs`、`/system/metrics`、`/system/settings` |

访问 `/` 时自动跳转到 `/intro/overview`。

## 双视觉体系

- `/intro`、`/tourist`、`/guide` 使用文旅沉浸式布局：顶部导航、Hero、旅行杂志式卡片、玻璃浮层、孔雀蓝与暖金色。
- `/knowledge`、`/system` 使用简洁科技后台布局：左侧 Sidebar、顶部状态栏、工具栏、表格、状态卡片和真实图谱画布。

视觉参考分析见 `docs/reference-analysis.md`。

## 已接入接口

### 游客端

- `GET /api/content/guide`
- `GET /api/content/routes`
- `POST /api/sessions`
- `GET /api/sessions`
- `POST /api/chat`
- `POST /api/chat/stream`
- `POST /api/audio/transcribe`
- `POST /api/audio/ask`
- `POST /api/image/ask`
- `POST /api/route/recommend`
- `POST /api/tts/synthesize`
- `GET/POST /api/feedback`
- `GET /api/stats/overview`
- `GET /api/tourist/home`
- `GET/PUT /api/tourist/preferences`
- `GET /api/tourist/culture-tips`
- `GET/POST/DELETE /api/tourist/favorites`
- `POST /api/tourist/handoff`

### 导游端

- `GET /api/collaboration/sessions`
- `GET /api/collaboration/corrections`
- `GET /api/collaboration/cases`
- `POST /api/collaboration/correction`
- `POST /api/sessions/:id/takeover`
- `POST /api/sessions/:id/guide-reply`
- `POST /api/sessions/:id/release`
- `GET /api/guide/takeover-logs`
- `GET /api/guide/profile`
- `POST/PUT/DELETE /api/collaboration/cases`
- `PUT /api/collaboration/corrections/:id`

### 知识库与系统管理

- `POST /api/auth/login`
- `GET/POST /api/users`
- `PUT /api/users/:id/status`
- `GET /api/architecture/audit`
- `GET /api/health`
- `GET/POST /api/knowledge/documents`
- `GET /api/review/tasks`
- `POST /api/review/tasks/:id/decision`
- `GET/POST/PUT/DELETE /api/terms`
- `GET/POST/PUT/DELETE /api/graph`
- `POST /api/graph/query`
- `POST /api/knowledge/search`
- `GET /api/knowledge/stats`
- `GET /api/logs/model-calls`
- `GET /api/logs/request-traces`
- `GET/PUT/DELETE /api/knowledge/documents/:id`
- `POST /api/knowledge/documents/:id/split`
- `POST /api/knowledge/documents/:id/vectorize`
- `GET/POST/PUT/DELETE /api/knowledge/chunks`
- `POST /api/terms/import`
- `POST /api/terms/check`
- `GET /api/knowledge/statistics`
- `PUT/DELETE /api/users/:id`
- `GET/POST/PUT/DELETE /api/roles`
- `GET /api/permissions`
- `PUT /api/roles/:id/permissions`
- `GET /api/system/dashboard`
- `GET /api/system/alerts`
- `GET /api/system/metrics`
- `GET/PUT /api/system/settings`

## 外部服务与后续增强

- 天气接口已返回明确的 Provider 配置状态；接入第三方天气服务后可返回实时天气。
- 浏览器内录音已接入 `MediaRecorder`；完整 ASR 效果需要演示设备录音复查。
- 系统指标已接入真实聚合；后续可增加按日趋势图。

## Mock 与图片资源

默认运行逻辑不依赖 mock data。外部服务未配置时，页面展示明确状态，不伪装成功。

现有图片位于 `frontend/public/assets/`。新增图片需求不联网下载素材，统一维护在 `docs/image-prompts.md`。该文件当前包含 43 条图片生成 Prompt，覆盖项目介绍、游客端、导游端、后台纹理和公共背景。

## 文档

- `docs/LinguaSpace_frontend_page_design.md`：完整页面设计与验收标准。
- `docs/reference-analysis.md`：参考网页提炼与原创转化方案。
- `docs/frontend-implementation-plan.md`：逐页接口映射、阶段进度和复查项。
- `docs/image-prompts.md`：后续图片生成清单。

## 验证

```powershell
cd frontend
npm run build

cd ..\backend
python -m pytest
```

项目当前没有独立 `lint` script；`npm run build` 已包含 `tsc -b` 类型检查。

## 后续优化

- 增加浏览器录音上传进度展示。
- 为图谱增加节点点击抽屉和关系删除确认。
- 补充系统指标按日趋势图表。
- 增加端到端浏览器测试和多语评测集。
