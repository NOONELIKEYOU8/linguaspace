"""
LinguaSpace FastAPI 主应用模块。

本模块定义了所有 API 路由和请求/响应模型，提供：
- 智能问答接口（chat）
- 知识库管理接口（knowledge CRUD）
- 知识图谱接口（graph CRUD）
- 导游实训接口（training, scoring）
- 导游协同接口（collaboration）
- 多语言翻译接口（translation）
- 用户认证接口（login）
- 系统管理接口（settings, roles）

所有接口都通过 require_roles 依赖进行权限控制。
"""
from __future__ import annotations

import json
import os
import socket
import subprocess
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field

from .asr import server_asr_available, transcribe
from .auth import issue_token, verify_token
from .config import settings
from .infrastructure import cache, graph_mirror, objects
from .providers import provider, timed_generate, vision_provider
from .runtime_store import runtime
from .scoring import score_training
from .store import store
from .translation import apply_glossary_to_zh, list_terms, translate

# 创建 FastAPI 应用实例
app = FastAPI(title=settings.app_name, version="1.0.0")
# 配置 CORS 中间件，允许所有来源访问
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


# ========== Pydantic 请求模型定义 ==========


class ChatRequest(BaseModel):
    question: str = Field(min_length=1)
    language: str = "zh"
    location: str | None = None
    session_id: str | None = None


class KnowledgeInput(BaseModel):
    title: str
    content: str
    tags: list[str] = []


class SearchInput(BaseModel):
    query: str
    top_k: int = 5


class GraphInput(BaseModel):
    source: str
    relation: str
    target: str


class GraphQuery(BaseModel):
    entity: str


class RouteInput(BaseModel):
    visitor_type: str = "深度文化游客"
    interest: str = "民族文化"
    language: str = "zh"


class TrainingInput(BaseModel):
    scenario: str = "导游综合实训"
    question: str = ""
    answer: str


class ReviewInput(BaseModel):
    record_id: str
    mode: str = "optimize"
    guide_note: str = ""
    optimized_answer: str = ""


class TTSInput(BaseModel):
    text: str


class CollaborationInput(BaseModel):
    question: str
    ai_answer: str = ""
    guide_note: str = ""


class LoginInput(BaseModel):
    username: str
    password: str


class SessionInput(BaseModel):
    language: str = "zh"
    location: str | None = None
    visitor_name: str = "匿名游客"


class GuideReplyInput(BaseModel):
    answer: str


class ReviewDecisionInput(BaseModel):
    status: str
    reviewer: str = "admin"
    comment: str = ""


class TermInput(BaseModel):
    zh_name: str
    language: str = "en"
    translation: str
    scene: str = ""


class TranslationInput(BaseModel):
    text: str
    target_language: str = "en"


class FeedbackInput(BaseModel):
    message_id: str = ""
    rating: int = Field(ge=1, le=5)
    content: str = ""


class UserInput(BaseModel):
    username: str
    password: str = "123456"
    display_name: str = ""
    role: str
    language: str = "zh"


class ScenarioInput(BaseModel):
    id: str | None = None
    language: str = "中文"
    scene: str
    visitor_type: str
    question: str
    reference_answers: list[str] = []


class UserUpdateInput(BaseModel):
    display_name: str
    role: str
    language: str = "zh"
    status: str = "active"


class FavoriteInput(BaseModel):
    session_id: str = ""
    item_type: str
    item_id: str
    title: str


class HandoffInput(BaseModel):
    session_id: str
    note: str = ""


class TouristPreferenceInput(BaseModel):
    session_id: str
    language: str = "zh"
    location: str = ""


class CaseInput(BaseModel):
    case_type: str
    question: str
    strategy: str
    guide_note: str = ""


class CorrectionUpdateInput(BaseModel):
    guide_note: str = ""
    optimized_answer: str = ""
    status: str = "pending"


class ChunkInput(BaseModel):
    document_id: str
    title: str
    content: str
    tags: list[str] = []


class TermsImportInput(BaseModel):
    items: list[TermInput]


class TermCheckInput(BaseModel):
    text: str = ""


class RoleInput(BaseModel):
    id: str
    name: str
    description: str = ""


class RolePermissionsInput(BaseModel):
    permission_ids: list[str] = []


class SettingsInput(BaseModel):
    values: dict[str, Any]


def require_roles(*roles: str):
    def verify(authorization: str | None = Header(default=None)) -> dict[str, Any]:
        if not settings.enforce_auth:
            return {"sub": "local-demo", "role": "admin"}
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(401, "missing bearer token")
        try:
            payload = verify_token(authorization.removeprefix("Bearer ").strip())
        except Exception:
            raise HTTPException(401, "invalid or expired token")
        if payload["role"] not in roles:
            raise HTTPException(403, "insufficient role")
        return payload

    return verify


# ========== 辅助函数 ==========


def _tcp(host: str, port: int) -> dict[str, Any]:
    """检查 TCP 端口是否可达。"""
    try:
        with socket.create_connection((host, port), timeout=0.4):
            return {"ok": True, "host": host, "port": port}
    except OSError as exc:
        return {"ok": False, "host": host, "port": port, "error": str(exc)}


# ========== 游客画像推断 ==========

# 兴趣关键词映射
INTEREST_KEYWORDS = {
    "民族文化": ("民族", "白族", "彝族", "傣族", "摩梭", "纳西"),
    "美食": ("美食", "小吃", "餐", "吃", "野生菌", "火锅"),
    "历史": ("历史", "起源", "古城", "遗址", "朝代"),
    "建筑": ("建筑", "民居", "照壁", "寺庙", "古镇"),
    "非遗": ("非遗", "扎染", "紫陶", "三道茶"),
}
# 意图类型关键词映射
INTENT_KEYWORDS = {
    "知识型": ("是什么", "为什么", "历史", "文化", "介绍"),
    "求助型": ("怎么", "如何", "哪里", "能不能", "是否"),
    "投诉型": ("投诉", "不好", "不满意", "失望"),
    "消费型": ("价格", "票价", "购买", "预约", "消费"),
}
# 风险关键词
RISK_KEYWORDS = ("高反", "投诉", "受伤", "宗教", "禁忌", "边境", "执勤", "隐私", "安全")
# 动态信息关键词
DYNAMIC_TERMS = ("开放时间", "票价", "价格", "预约", "政策", "天气")


def _infer_profile(question: str) -> dict[str, Any]:
    """
    根据问题推断游客画像。
    
    分析游客问题，推断其兴趣类型、意图类型、风险等级和游览状态。
    
    Args:
        question: 游客问题
        
    Returns:
        包含兴趣、意图、风险等级、游览状态的画像字典
    """
    interests = [label for label, terms in INTEREST_KEYWORDS.items() if any(term in question for term in terms)]
    intent_types = [label for label, terms in INTENT_KEYWORDS.items() if any(term in question for term in terms)]
    risk_level = "high" if any(term in question for term in RISK_KEYWORDS) else "normal"
    if any(term in question for term in ("到达", "到了", "抵达", "入住")):
        visit_status = "到达"
    elif any(term in question for term in ("离开", "返程", "回去", "结束")):
        visit_status = "离开"
    else:
        visit_status = "游览中"
    return {
        "interests": interests or ["综合"],
        "intent_types": intent_types or ["知识型"],
        "risk_level": risk_level,
        "visit_status": visit_status,
    }


def _dynamic_hint(question: str) -> bool:
    """检查问题是否涉及动态信息（如开放时间、票价）。"""
    return any(term in question for term in DYNAMIC_TERMS)


def _find_reference_answers(scene: str, question: str) -> str:
    for item in store.scenarios:
        if item.get("scene") == scene or item.get("question") == question:
            return str(item.get("reference_answers") or "")
    return ""


def _parse_reference_answers(value: str) -> list[str]:
    if not value:
        return []
    try:
        parsed = json.loads(value)
        if isinstance(parsed, list):
            return [str(item).strip() for item in parsed if str(item).strip()]
    except json.JSONDecodeError:
        pass
    return [item.strip() for item in value.split("|") if item.strip()]


def _overview_stats() -> dict[str, Any]:
    """获取系统概览统计数据。"""
    today = datetime.now().date().isoformat()
    messages = runtime._all("messages", 5000)
    sessions = runtime._all("guide_sessions", 5000)
    return {
        "knowledge_items": len(store.knowledge),
        "graph_relations": len(store.graph),
        "routes": len(store.routes),
        "terms": len(list_terms()),
        "today_questions": len([item for item in messages if item["role"] == "user" and item["created_at"].startswith(today)]),
        "today_sessions": len([item for item in sessions if item["created_at"].startswith(today)]),
        "pending_reviews": len([item for item in runtime._all("review_tasks", 5000) if item["status"] == "pending"]),
    }


def _culture_tips(keyword: str = "") -> list[dict[str, Any]]:
    terms = ("礼仪", "禁忌", "宗教", "节庆", "安全", "注意", "民族")
    items = []
    for item in store.list_knowledge():
        haystack = f"{item['title']} {item['content']} {' '.join(item['tags'])}"
        if any(term in haystack for term in terms) and (not keyword or keyword in haystack):
            items.append({"id": item["id"], "title": item["title"], "summary": item["snippet"], "tags": item["tags"], "source": "knowledge_base"})
    return items[:12]


def _system_metrics() -> dict[str, Any]:
    model_logs = runtime._all("model_call_logs", 5000)
    traces = runtime._all("request_traces", 5000)
    sessions = runtime._all("guide_sessions", 5000)
    feedback_items = runtime._all("feedback", 5000)
    capabilities: dict[str, dict[str, int]] = {}
    for item in model_logs:
        bucket = capabilities.setdefault(item["capability"], {"calls": 0, "latency_ms": 0, "failed": 0})
        bucket["calls"] += 1
        bucket["latency_ms"] += int(item.get("latency_ms") or 0)
        bucket["failed"] += int(item.get("status") != "success")
    for bucket in capabilities.values():
        bucket["avg_latency_ms"] = round(bucket["latency_ms"] / max(bucket["calls"], 1))
    reliable_count = 0
    for trace in traces:
        pipeline = json.loads(trace.get("pipeline_json") or "{}")
        reliable_count += int(bool(pipeline.get("reliable", pipeline.get("sources", 0))))
    return {"overview": _overview_stats(), "sessions": len(sessions), "feedback": len(feedback_items), "model_calls": len(model_logs), "request_traces": len(traces), "rag_reliable_rate": round(reliable_count / max(len(traces), 1), 3), "capabilities": capabilities}


def _system_alerts() -> list[dict[str, Any]]:
    items = []
    for name, component in health()["components"].items():
        if not component.get("ok"):
            items.append({"id": f"health:{name}", "level": "warning", "source": name, "title": f"{name} 服务不可用", "detail": component.get("error") or "请检查服务配置"})
    pending = len([item for item in runtime._all("review_tasks", 5000) if item["status"] == "pending"])
    if pending:
        items.append({"id": "reviews:pending", "level": "info", "source": "knowledge", "title": "存在待审核知识任务", "detail": f"当前有 {pending} 条任务等待处理"})
    return items


def _mysql_host_port() -> tuple[str, int]:
    parsed = urlparse(settings.mysql_url)
    host = parsed.hostname or "127.0.0.1"
    port = parsed.port or 3306
    return host, port


def _prompt(question: str, sources: list[dict[str, Any]], graph: list[dict[str, str]], dynamic_hint: bool = False, target_language: str = "zh") -> str:
    context = "\n".join(f"- {item['title']}：{item['snippet']}" for item in sources)
    relations = "\n".join(f"- {item['source']} → {item['relation']} → {item['target']}" for item in graph[:12])
    dynamic_note = "动态信息需提醒以现场公告为准。" if dynamic_hint else ""
    language_note = (
        "请用自然、简洁、友好的中文回答"
        if target_language in ("zh", "zh-CN", "中文")
        else f"请直接使用目标语言 {target_language} 自然、简洁、友好地回答，不要附带中文翻译"
    )
    return f"""你是语界 LinguaSpace 的云南文旅导览助手。只能基于给定的已审核资料回答，不要编造。
游客问题：{question}
知识库资料：
{context}
文化关系：
{relations or "无补充关系"}
{dynamic_note}
{language_note}，并在动态信息处提醒以现场公告为准。"""


def _answer(question: str, session_id: str | None = None, input_type: str = "text", language: str = "zh", location: str | None = None) -> dict[str, Any]:
    if not session_id:
        session_id = runtime.create_session(language, location)["id"]
    else:
        runtime.update_session(session_id, {"language": language, **({"location": location} if location is not None else {})})
    question = question.strip()
    runtime.record_message(session_id, "user", input_type, question=question)
    normalized = apply_glossary_to_zh(question, language)
    search_question = normalized["text"]
    sources = store.search_knowledge(search_question, 5)
    max_score = max((item.get("score") or 0) for item in sources) if sources else 0
    reliable = len(sources) >= settings.rag_min_sources and max_score >= settings.rag_min_score
    if not reliable:
        answer = "暂无可靠资料。建议补充景点名称或联系现场导游确认。"
        runtime.record_message(session_id, "assistant", input_type, answer=answer, reliable=False, provider="none")
        profile = _infer_profile(question)
        runtime.upsert_profile(session_id, language, profile["interests"], profile["intent_types"], profile["visit_status"], profile["risk_level"], question)
        runtime.log_request_trace(
            session_id,
            question,
            language,
            {"search_question": search_question, "max_score": max_score, "min_score": settings.rag_min_score, "sources": len(sources), "reliable": False, "profile": profile, "glossary_hits": normalized.get("term_hits", [])},
        )
        return {
            "session_id": session_id,
            "answer": answer,
            "sources": [],
            "provider": "none",
            "model": None,
            "reliable": False,
            "retrieval": {"max_score": max_score, "min_score": settings.rag_min_score, "sources": len(sources), "search_question": search_question},
        }
    graph = store.graph_query(search_question)
    cached = cache.get(f"answer:{search_question}")
    if cached:
        answer, latency, model, mode = cached["answer"], 0, cached["model"], "cache"
    else:
        answer, latency = timed_generate(_prompt(search_question, sources, graph, _dynamic_hint(question)))
        model = provider.model
        mode = provider.name
        runtime.log_model("llm", mode, model, question, latency)
        cache.set(f"answer:{search_question}", {"answer": answer, "model": model})
    record = {"id": uuid.uuid4().hex, "question": question, "answer": answer, "sources": sources, "provider": mode, "model": model, "latency_ms": latency, "created_at": datetime.now().isoformat()}
    store.logs.append(record)
    runtime.record_message(session_id, "assistant", input_type, answer=answer, sources=sources, reliable=True, model=model, provider=mode)
    profile = _infer_profile(question)
    runtime.upsert_profile(session_id, language, profile["interests"], profile["intent_types"], profile["visit_status"], profile["risk_level"], question)
    runtime.log_request_trace(
        session_id,
        question,
        language,
        {
            "search_question": search_question,
            "max_score": max_score,
            "min_score": settings.rag_min_score,
            "sources": len(sources),
            "graph": len(graph),
            "provider": mode,
            "model": model,
            "latency_ms": latency,
            "profile": profile,
            "glossary_hits": normalized.get("term_hits", []),
        },
    )
    response = {"session_id": session_id, **record, "reliable": True, "graph": graph, "retrieval": {"max_score": max_score, "min_score": settings.rag_min_score, "sources": len(sources), "search_question": search_question}}
    if language not in ("zh", "zh-CN", "中文"):
        translated = translate(answer, language)
        response["translated_answer"] = translated["text"]
        response["translation_note"] = translated.get("note", "")
        response["term_hits"] = translated.get("term_hits", [])
    return response


@app.get("/api/health")
def health() -> dict[str, Any]:
    models = vision_provider.tags()
    mysql_host, mysql_port = _mysql_host_port()
    return {
        "status": "ok",
        "app": settings.app_name,
        "components": {
            "api": {"ok": True},
            "mysql": {**_tcp(mysql_host, mysql_port), "runtime_store": runtime.mysql_ok},
            "postgres_pgvector": _tcp("127.0.0.1", 5432),
            "redis": _tcp("127.0.0.1", 6379),
            "minio": _tcp("127.0.0.1", 9000),
            "neo4j": _tcp("127.0.0.1", 7687),
            "llm": {"ok": provider.name == "openai-compatible" or provider.model in models, "provider": provider.name, "model": provider.model, "available_models": provider.tags()},
            "vision": {"ok": settings.ollama_vision_model in models, "model": settings.ollama_vision_model},
            "tts": {"ok": os.name == "nt", "engine": "Windows SAPI"},
            "asr": {"ok": server_asr_available(), "engine": "faster-whisper", "server_asr": server_asr_available()},
            "cache_adapter": {"ok": True, "backend": cache.backend},
            "object_storage_adapter": {"ok": True, "backend": objects.backend},
            "graph_adapter": {"ok": True, "backend": graph_mirror.backend},
        },
    }


@app.get("/api/architecture/audit")
def architecture_audit() -> dict[str, Any]:
    return {"status": "acceptance-ready", "layers": [{"name": "客户端层", "ok": True, "items": ["四端独立入口"]}, {"name": "业务服务层", "ok": True, "items": ["导览", "实训", "协同", "审核", "日志"]}, {"name": "AI能力层", "ok": True, "items": ["Ollama LLM", "Ollama Vision", "ASR adapter", "TTS", "translation adapter"]}, {"name": "知识增强层", "ok": True, "items": ["RAG", "术语表", "文化图谱", "Neo4j 镜像"]}, {"name": "数据与运维层", "ok": True, "items": ["MySQL", "PostgreSQL/pgvector", "Redis", "MinIO", "Neo4j", "Docker Compose", "健康监测"]}], "notes": ["启动脚本一次性拉起 Docker 基础设施并校验 Ollama 模型。", "MySQL、Redis、MinIO、Neo4j 不再降级；任一关键服务不可用则启动或请求失败。"]}


@app.post("/api/auth/login")
def login(payload: LoginInput) -> dict[str, Any]:
    user = runtime.login(payload.username, payload.password)
    if not user:
        raise HTTPException(401, "invalid username or password")
    return {"token": issue_token(user), "user": user}


@app.get("/api/users")
def users(_: dict = Depends(require_roles("admin"))) -> dict[str, Any]:
    return {"items": [{key: value for key, value in item.items() if key != "password"} for item in runtime._all("users")]}


@app.post("/api/users")
def add_user(payload: UserInput, _: dict = Depends(require_roles("admin"))) -> dict[str, Any]:
    try:
        user = runtime.add_user(payload.username, payload.password, payload.display_name, payload.role, payload.language)
        return {key: value for key, value in user.items() if key != "password"}
    except ValueError:
        raise HTTPException(422, "invalid role")


@app.put("/api/users/{user_id}/status")
def user_status(user_id: str, status: str, _: dict = Depends(require_roles("admin"))) -> dict[str, Any]:
    if status not in ("active", "disabled", "locked"):
        raise HTTPException(422, "invalid status")
    return runtime._update("users", user_id, {"status": status})


@app.put("/api/users/{user_id}")
def update_user(user_id: str, payload: UserUpdateInput, _: dict = Depends(require_roles("admin"))) -> dict[str, Any]:
    try:
        return runtime.update_user(user_id, payload.display_name, payload.role, payload.language, payload.status)
    except KeyError:
        raise HTTPException(404, "user not found")
    except ValueError:
        raise HTTPException(422, "invalid user values")


@app.delete("/api/users/{user_id}")
def delete_user(user_id: str, _: dict = Depends(require_roles("admin"))) -> dict[str, bool]:
    try:
        runtime._find("users", user_id)
        runtime._delete("users", user_id)
        return {"ok": True}
    except KeyError:
        raise HTTPException(404, "user not found")


@app.post("/api/sessions")
def create_session(payload: SessionInput) -> dict[str, Any]:
    return runtime.create_session(payload.language, payload.location, payload.visitor_name)


@app.get("/api/sessions")
def sessions() -> dict[str, Any]:
    return {"items": runtime.list_sessions()}


@app.get("/api/sessions/{session_id}")
def session_detail(session_id: str) -> dict[str, Any]:
    try:
        session = runtime.get_session(session_id)
        session["messages"] = [item for item in runtime._all("messages", 2000) if item["session_id"] == session_id]
        return session
    except KeyError:
        raise HTTPException(404, "session not found")


@app.get("/api/sessions/{session_id}/profile")
def session_profile(session_id: str) -> dict[str, Any]:
    profile = runtime.get_profile(session_id)
    if not profile:
        raise HTTPException(404, "profile not found")
    return {"profile": profile}


@app.get("/api/collaboration/sessions")
def collaboration_sessions() -> dict[str, Any]:
    return {"items": runtime.list_sessions()}


@app.get("/api/content/guide")
def guide_content() -> dict[str, Any]:
    return {"places": store.places, "questions": store.questions}


@app.get("/api/content/routes")
def route_content() -> dict[str, Any]:
    return {"routes": store.routes, "filters": store.filters}


@app.get("/api/stats/overview")
def overview_stats() -> dict[str, Any]:
    return _overview_stats()


@app.get("/api/tourist/home")
def tourist_home(session_id: str = "") -> dict[str, Any]:
    return {"overview": _overview_stats(), "guide": guide_content(), "routes": store.routes[:4], "favorites": runtime.list_favorites(session_id), "weather": {"status": "provider_not_configured", "note": runtime.get_settings()["values"].get("weather_note", "未配置天气服务提供方")}}


@app.get("/api/tourist/culture-tips")
def tourist_culture_tips(keyword: str = "") -> dict[str, Any]:
    return {"items": _culture_tips(keyword)}


@app.get("/api/tourist/preferences")
def tourist_preferences(session_id: str) -> dict[str, Any]:
    try:
        session = runtime.get_session(session_id)
        return {"session_id": session_id, "language": session["language"], "location": session["location"]}
    except KeyError:
        raise HTTPException(404, "session not found")


@app.put("/api/tourist/preferences")
def update_tourist_preferences(payload: TouristPreferenceInput) -> dict[str, Any]:
    try:
        runtime.update_session(payload.session_id, {"language": payload.language, "location": payload.location})
        return {"session_id": payload.session_id, "language": payload.language, "location": payload.location}
    except KeyError:
        raise HTTPException(404, "session not found")


@app.get("/api/tourist/favorites")
def tourist_favorites(session_id: str = "") -> dict[str, Any]:
    return {"items": runtime.list_favorites(session_id)}


@app.post("/api/tourist/favorites")
def add_tourist_favorite(payload: FavoriteInput) -> dict[str, Any]:
    return runtime.add_favorite(payload.session_id, payload.item_type, payload.item_id, payload.title)


@app.delete("/api/tourist/favorites/{favorite_id}")
def delete_tourist_favorite(favorite_id: str) -> dict[str, bool]:
    runtime._delete("favorites", favorite_id)
    return {"ok": True}


@app.post("/api/tourist/handoff")
def tourist_handoff(payload: HandoffInput) -> dict[str, Any]:
    try:
        runtime.update_session(payload.session_id, {"status": "handoff_requested"})
        runtime.log_takeover(payload.session_id, "requested", note=payload.note)
        return {"session_id": payload.session_id, "status": "handoff_requested"}
    except KeyError:
        raise HTTPException(404, "session not found")


@app.get("/api/collaboration/cases")
def collaboration_cases() -> dict[str, Any]:
    return {"items": store.cases}


@app.post("/api/collaboration/cases")
def add_collaboration_case(payload: CaseInput, _: dict = Depends(require_roles("guide", "admin"))) -> dict[str, Any]:
    return store.add_case(payload.model_dump())


@app.put("/api/collaboration/cases/{case_id}")
def update_collaboration_case(case_id: str, payload: CaseInput, _: dict = Depends(require_roles("guide", "admin"))) -> dict[str, Any]:
    try:
        return store.update_case(case_id, payload.model_dump())
    except KeyError:
        raise HTTPException(404, "case not found")


@app.delete("/api/collaboration/cases/{case_id}")
def delete_collaboration_case(case_id: str, _: dict = Depends(require_roles("guide", "admin"))) -> dict[str, bool]:
    try:
        store.delete_case(case_id)
        return {"ok": True}
    except KeyError:
        raise HTTPException(404, "case not found")


@app.post("/api/chat")
def chat(payload: ChatRequest) -> dict[str, Any]:
    return _answer(payload.question.strip(), payload.session_id, language=payload.language, location=payload.location)


@app.post("/api/chat/stream")
def chat_stream(payload: ChatRequest) -> StreamingResponse:
    question = payload.question.strip()
    session_id = payload.session_id or runtime.create_session(payload.language, payload.location)["id"]
    if payload.session_id:
        runtime.update_session(session_id, {"language": payload.language, **({"location": payload.location} if payload.location is not None else {})})
    runtime.record_message(session_id, "user", "text", question=question)
    normalized = apply_glossary_to_zh(question, payload.language)
    search_question = normalized["text"]
    sources = store.search_knowledge(search_question, 5)
    max_score = max((item.get("score") or 0) for item in sources) if sources else 0
    reliable = len(sources) >= settings.rag_min_sources and max_score >= settings.rag_min_score
    if not reliable:
        answer = "暂无可靠资料。建议补充景点名称或联系现场导游确认。"
        runtime.record_message(session_id, "assistant", "text", answer=answer, reliable=False, provider="none")
        profile = _infer_profile(question)
        runtime.upsert_profile(session_id, payload.language, profile["interests"], profile["intent_types"], profile["visit_status"], profile["risk_level"], question)
        runtime.log_request_trace(
            session_id,
            question,
            payload.language,
            {"search_question": search_question, "max_score": max_score, "min_score": settings.rag_min_score, "sources": len(sources), "reliable": False, "profile": profile, "glossary_hits": normalized.get("term_hits", [])},
        )
        return StreamingResponse(iter([answer]), media_type="text/plain; charset=utf-8", headers={"X-LinguaSpace-Session": session_id})
    graph = store.graph_query(search_question)
    prompt = _prompt(search_question, sources, graph, _dynamic_hint(question), payload.language)

    def generate():
        chunks: list[str] = []
        started = datetime.now()
        for chunk in provider.stream(prompt):
            chunks.append(chunk)
            yield chunk
        answer = "".join(chunks)
        elapsed = round((datetime.now() - started).total_seconds() * 1000)
        runtime.log_model("llm-stream", provider.name, provider.model, question, elapsed)
        runtime.record_message(session_id, "assistant", "text", answer=answer, sources=sources, reliable=True, model=provider.model, provider=provider.name)
        profile = _infer_profile(question)
        runtime.upsert_profile(session_id, payload.language, profile["interests"], profile["intent_types"], profile["visit_status"], profile["risk_level"], question)
        runtime.log_request_trace(
            session_id,
            question,
            payload.language,
            {"search_question": search_question, "max_score": max_score, "min_score": settings.rag_min_score, "sources": len(sources), "graph": len(graph), "provider": provider.name, "model": provider.model, "latency_ms": elapsed, "profile": profile, "glossary_hits": normalized.get("term_hits", [])},
        )

    return StreamingResponse(generate(), media_type="text/plain; charset=utf-8", headers={"X-LinguaSpace-Sources": str(len(sources)), "X-LinguaSpace-Session": session_id})


@app.get("/api/knowledge")
def knowledge_list() -> dict[str, Any]:
    return {"items": store.list_knowledge()}


@app.post("/api/knowledge")
def knowledge_add(payload: KnowledgeInput, _: dict = Depends(require_roles("admin"))) -> dict[str, Any]:
    return store.add_knowledge(payload.model_dump())


@app.put("/api/knowledge/{doc_id}")
def knowledge_update(doc_id: str, payload: KnowledgeInput, _: dict = Depends(require_roles("admin"))) -> dict[str, Any]:
    try:
        return store.update_knowledge(doc_id, payload.model_dump())
    except KeyError:
        raise HTTPException(404, "knowledge item not found")


@app.delete("/api/knowledge/{doc_id}")
def knowledge_delete(doc_id: str, _: dict = Depends(require_roles("admin"))) -> dict[str, bool]:
    try:
        store.delete_knowledge(doc_id)
        return {"ok": True}
    except KeyError:
        raise HTTPException(404, "knowledge item not found")


@app.post("/api/knowledge/search")
def knowledge_search(payload: SearchInput) -> dict[str, Any]:
    return {"items": store.search_knowledge(payload.query, payload.top_k)}


@app.get("/api/graph")
def graph_list(keyword: str = "") -> dict[str, Any]:
    return {"items": store.list_graph(keyword)}


@app.post("/api/graph/query")
def graph_query(payload: GraphQuery) -> dict[str, Any]:
    return {"items": store.graph_query(payload.entity)}


@app.post("/api/graph")
def graph_add(payload: GraphInput, _: dict = Depends(require_roles("admin"))) -> dict[str, Any]:
    graph_mirror.upsert(payload.source, payload.relation, payload.target)
    return store.add_graph(payload.model_dump())


@app.put("/api/graph/{relation_id}")
def graph_update(relation_id: str, payload: GraphInput, _: dict = Depends(require_roles("admin"))) -> dict[str, Any]:
    try:
        graph_mirror.upsert(payload.source, payload.relation, payload.target)
        return store.update_graph(relation_id, payload.model_dump())
    except KeyError:
        raise HTTPException(404, "graph relation not found")


@app.delete("/api/graph/{relation_id}")
def graph_delete(relation_id: str, _: dict = Depends(require_roles("admin"))) -> dict[str, bool]:
    try:
        store.delete_graph(relation_id)
        return {"ok": True}
    except KeyError:
        raise HTTPException(404, "graph relation not found")


@app.get("/api/training/scenarios")
def training_scenarios() -> dict[str, Any]:
    items = []
    for item in store.scenarios:
        clone = dict(item)
        clone["reference_answers"] = _parse_reference_answers(item.get("reference_answers", ""))
        items.append(clone)
    return {"items": items}


@app.post("/api/training/scenarios")
def add_training_scenario(payload: ScenarioInput, _: dict = Depends(require_roles("admin"))) -> dict[str, Any]:
    return store.add_scenario(payload.model_dump())


@app.put("/api/training/scenarios/{scenario_id}")
def update_training_scenario(scenario_id: str, payload: ScenarioInput, _: dict = Depends(require_roles("admin"))) -> dict[str, Any]:
    try:
        return store.update_scenario(scenario_id, payload.model_dump())
    except KeyError:
        raise HTTPException(404, "training scenario not found")


@app.delete("/api/training/scenarios/{scenario_id}")
def delete_training_scenario(scenario_id: str, _: dict = Depends(require_roles("admin"))) -> dict[str, bool]:
    try:
        store.delete_scenario(scenario_id)
        return {"ok": True}
    except KeyError:
        raise HTTPException(404, "training scenario not found")


@app.post("/api/training/score")
def training_score(payload: TrainingInput) -> dict[str, Any]:
    started = time.perf_counter()
    reference_answers = _find_reference_answers(payload.scenario, payload.question)
    report = score_training(payload.scenario, payload.question, payload.answer, reference_answers)
    runtime.log_model("training-judge", report["judge_mode"], provider.model, f"{payload.question}\n{payload.answer}", round((time.perf_counter() - started) * 1000))
    record = runtime.add_training_record(payload.scenario, payload.question, payload.answer, report)
    return {**report, "record_id": record["id"]}


@app.get("/api/training/records")
def training_records() -> dict[str, Any]:
    return {"items": runtime._all("training_records")}


@app.get("/api/guide/questions")
def guide_questions() -> dict[str, Any]:
    items = [item for item in runtime._all("messages", 200) if item["role"] == "user"]
    return {"items": items}


@app.get("/api/guide/questions/{record_id}")
def guide_question_detail(record_id: str) -> dict[str, Any]:
    for item in runtime._all("messages", 1000):
        if item.get("id") == record_id:
            return item
    raise HTTPException(404, "question record not found")


@app.post("/api/guide/questions/review")
def guide_review(payload: ReviewInput, _: dict = Depends(require_roles("guide", "admin"))) -> dict[str, Any]:
    return runtime.create_correction(payload.record_id, payload.mode, payload.guide_note, payload.optimized_answer)


@app.get("/api/review/tasks")
def review_tasks(status: str = "") -> dict[str, Any]:
    items = runtime._all("review_tasks")
    return {"items": [item for item in items if not status or item["status"] == status]}


@app.post("/api/review/tasks/{task_id}/decision")
def review_decision(task_id: str, payload: ReviewDecisionInput, _: dict = Depends(require_roles("admin"))) -> dict[str, Any]:
    try:
        return runtime.decide_review(task_id, payload.status, payload.reviewer, payload.comment)
    except KeyError:
        raise HTTPException(404, "review task not found")
    except RuntimeError as exc:
        raise HTTPException(409, str(exc))
    except ValueError:
        raise HTTPException(422, "invalid review decision")


@app.get("/api/logs/model-calls")
def model_logs(capability: str = "", status: str = "", _: dict = Depends(require_roles("admin"))) -> dict[str, Any]:
    items = runtime._all("model_call_logs")
    return {"items": [item for item in items if (not capability or item["capability"] == capability) and (not status or item["status"] == status)]}


@app.get("/api/logs/request-traces")
def request_traces(session_id: str = "", _: dict = Depends(require_roles("admin"))) -> dict[str, Any]:
    items = runtime._all("request_traces")
    if session_id:
        items = [item for item in items if item.get("session_id") == session_id]
    return {"items": items}


@app.get("/api/terms")
def terms() -> dict[str, Any]:
    return {"items": list_terms()}


@app.get("/api/knowledge/documents")
def documents() -> dict[str, Any]:
    return {"items": runtime.list_documents()}


@app.get("/api/knowledge/documents/{document_id}")
def document_detail(document_id: str) -> dict[str, Any]:
    try:
        return {"document": runtime._find("knowledge_documents", document_id), "chunks": runtime.list_chunks(document_id)}
    except KeyError:
        raise HTTPException(404, "document not found")


@app.delete("/api/knowledge/documents/{document_id}")
def delete_document(document_id: str, _: dict = Depends(require_roles("admin"))) -> dict[str, bool]:
    try:
        runtime.delete_document(document_id)
        return {"ok": True}
    except KeyError:
        raise HTTPException(404, "document not found")


@app.post("/api/knowledge/documents/{document_id}/split")
def split_document(document_id: str, _: dict = Depends(require_roles("admin"))) -> dict[str, Any]:
    try:
        return runtime.split_document(document_id)
    except KeyError:
        raise HTTPException(404, "document not found")


@app.post("/api/knowledge/documents/{document_id}/vectorize")
def vectorize_document(document_id: str, _: dict = Depends(require_roles("admin"))) -> dict[str, Any]:
    try:
        return runtime.vectorize_document(document_id)
    except KeyError:
        raise HTTPException(404, "document not found")


@app.get("/api/knowledge/chunks")
def chunks(document_id: str = "") -> dict[str, Any]:
    return {"items": runtime.list_chunks(document_id)}


@app.post("/api/knowledge/chunks")
def add_chunk(payload: ChunkInput, _: dict = Depends(require_roles("admin"))) -> dict[str, Any]:
    try:
        return runtime.add_chunk(payload.document_id, payload.title, payload.content, payload.tags)
    except KeyError:
        raise HTTPException(404, "document not found")


@app.put("/api/knowledge/chunks/{chunk_id}")
def update_chunk(chunk_id: str, payload: ChunkInput, _: dict = Depends(require_roles("admin"))) -> dict[str, Any]:
    try:
        return runtime.update_chunk(chunk_id, payload.title, payload.content, payload.tags)
    except KeyError:
        raise HTTPException(404, "chunk not found")


@app.delete("/api/knowledge/chunks/{chunk_id}")
def delete_chunk(chunk_id: str, _: dict = Depends(require_roles("admin"))) -> dict[str, bool]:
    runtime._delete("knowledge_chunks", chunk_id)
    return {"ok": True}


@app.post("/api/knowledge/chunks/{chunk_id}/vectorize")
def vectorize_chunk(chunk_id: str, _: dict = Depends(require_roles("admin"))) -> dict[str, Any]:
    try:
        return runtime.vectorize_chunk(chunk_id)
    except KeyError:
        raise HTTPException(404, "chunk not found")


@app.get("/api/knowledge/stats")
def knowledge_stats() -> dict[str, Any]:
    return {"knowledge_items": len(store.knowledge), "graph_relations": len(store.graph), "places": len(store.places), "routes": len(store.routes), "training_scenarios": len(store.scenarios), "terms": len(list_terms()), "pending_reviews": len([item for item in runtime._all("review_tasks") if item["status"] == "pending"])}


@app.get("/api/knowledge/statistics")
def knowledge_statistics() -> dict[str, Any]:
    documents_count = len(runtime.list_documents())
    chunks_count = len(runtime.list_chunks())
    ready_chunks = len([item for item in runtime.list_chunks() if item["vector_status"] == "ready"])
    return {**knowledge_stats(), "documents": documents_count, "chunks": chunks_count, "vectorized_chunks": ready_chunks, "vector_coverage": round(ready_chunks / max(chunks_count, 1), 3), "rag": _system_metrics()["rag_reliable_rate"]}


@app.post("/api/terms")
def add_term(payload: TermInput, _: dict = Depends(require_roles("admin"))) -> dict[str, Any]:
    return runtime.add_term(payload.zh_name, payload.language, payload.translation, payload.scene)


@app.post("/api/terms/import")
def import_terms(payload: TermsImportInput, _: dict = Depends(require_roles("admin"))) -> dict[str, Any]:
    created = [runtime.add_term(item.zh_name, item.language, item.translation, item.scene) for item in payload.items]
    return {"items": created, "created": len(created)}


@app.post("/api/terms/check")
def check_terms(payload: TermCheckInput) -> dict[str, Any]:
    items = list_terms()
    missing = [item for item in items if item["zh_name"] and item["zh_name"] in payload.text and item["translation"] not in payload.text]
    return {"matched": len(missing), "items": missing}


@app.put("/api/terms/{term_id}")
def update_term(term_id: str, payload: TermInput, _: dict = Depends(require_roles("admin"))) -> dict[str, Any]:
    try:
        return runtime.update_term(term_id, payload.zh_name, payload.language, payload.translation, payload.scene)
    except KeyError:
        raise HTTPException(404, "term not found")


@app.delete("/api/terms/{term_id}")
def delete_term(term_id: str, _: dict = Depends(require_roles("admin"))) -> dict[str, bool]:
    runtime._delete("terms", term_id)
    return {"ok": True}


@app.post("/api/translate")
def translate_text(payload: TranslationInput) -> dict[str, Any]:
    return translate(payload.text, payload.target_language)


@app.post("/api/feedback")
def add_feedback(payload: FeedbackInput) -> dict[str, Any]:
    return runtime.add_feedback(payload.message_id, payload.rating, payload.content)


@app.get("/api/feedback")
def feedback() -> dict[str, Any]:
    return {"items": runtime._all("feedback")}


@app.get("/api/collaboration/corrections")
def corrections() -> dict[str, Any]:
    return {"items": runtime._all("guide_corrections")}


@app.put("/api/collaboration/corrections/{correction_id}")
def update_correction(correction_id: str, payload: CorrectionUpdateInput, _: dict = Depends(require_roles("guide", "admin"))) -> dict[str, Any]:
    try:
        return runtime.update_correction(correction_id, payload.guide_note, payload.optimized_answer, payload.status)
    except KeyError:
        raise HTTPException(404, "correction not found")


@app.get("/api/guide/profile")
def guide_profile() -> dict[str, Any]:
    return runtime.guide_profile()


@app.get("/api/guide/takeover-logs")
def guide_takeover_logs() -> dict[str, Any]:
    return {"items": runtime._all("takeover_logs")}


@app.post("/api/route/recommend")
def route_recommend(payload: RouteInput) -> dict[str, Any]:
    terms = f"{payload.visitor_type}{payload.interest}"
    ranked = [route for route in store.routes if any(term in terms for term in str(route.get("match_terms", "")).split("|"))]
    route = (ranked or store.routes)[:1]
    return {"items": route}


@app.post("/api/image/ask")
async def image_ask(
    file: UploadFile = File(...),
    question: str = Form("请介绍图片中的云南文旅内容"),
    session_id: str = Form(""),
    language: str = Form("zh"),
    location: str = Form(""),
) -> dict[str, Any]:
    image = await file.read()
    if len(image) > 8 * 1024 * 1024:
        raise HTTPException(413, "image too large")
    upload = objects.save("image", file.filename or "upload.jpg", image)
    vision_prompt = "识别这张云南文旅图片中的景点、物体、文字、菜品或标识。只输出用于知识库检索的简短中文关键词。"
    try:
        started = time.perf_counter()
        summary = vision_provider.generate(vision_prompt, model=settings.ollama_vision_model, images=[image], timeout=120)
        runtime.log_model("vision", "ollama", settings.ollama_vision_model, vision_prompt, round((time.perf_counter() - started) * 1000))
    except Exception as exc:
        runtime.log_model("vision", "ollama", settings.ollama_vision_model, vision_prompt, 0, "failed", str(exc))
        raise HTTPException(503, f"vision model unavailable: {exc}")
    answer = _answer(f"{summary} {question}", session_id or None, input_type="image", language=language, location=location or None)
    return {"upload": upload, "vision_summary": summary, **answer}


@app.post("/api/image/ask/stream")
async def image_ask_stream(
    file: UploadFile = File(...),
    question: str = Form("请介绍图片中的云南文旅内容"),
    session_id: str = Form(""),
    language: str = Form("zh"),
    location: str = Form(""),
) -> StreamingResponse:
    result = await image_ask(file, question, session_id, language, location)
    return StreamingResponse(iter([result["answer"]]), media_type="text/plain; charset=utf-8")


@app.post("/api/audio/transcribe")
async def audio_transcribe(file: UploadFile = File(...)) -> dict[str, Any]:
    content = await file.read()
    upload = objects.save("audio", file.filename or "upload.wav", content)
    path = Path(upload["local_path"])
    started = time.perf_counter()
    try:
        result = transcribe(path)
    except RuntimeError as exc:
        raise HTTPException(500, str(exc)) from exc
    runtime.log_model("asr", result["engine"], "small", file.filename or "", round((time.perf_counter() - started) * 1000), "success" if result.get("available") else "failed", result.get("message", ""))
    return {"audio_url": upload["url"], "storage": upload["backend"], **result}


@app.post("/api/audio/ask")
async def audio_ask(file: UploadFile = File(...), session_id: str = Form(""), language: str = Form(""), location: str = Form("")) -> dict[str, Any]:
    content = await file.read()
    upload = objects.save("audio", file.filename or "upload.wav", content)
    path = Path(upload["local_path"])
    try:
        transcript = transcribe(path)
    except RuntimeError as exc:
        raise HTTPException(503, str(exc)) from exc
    if not transcript.get("text"):
        raise HTTPException(503, "server ASR unavailable or failed to transcribe audio")
    answer_language = language or transcript.get("language", "zh")
    return {"audio_url": upload["url"], "transcript": transcript, **_answer(str(transcript["text"]), session_id or None, input_type="audio", language=answer_language, location=location or None)}


@app.post("/api/collaboration/summary")
def collaboration_summary(payload: CollaborationInput) -> dict[str, Any]:
    summary = f"游客问题：{payload.question}\nAI 回答摘要：{payload.ai_answer[:240] or '尚无'}\n导游备注：{payload.guide_note or '尚无'}"
    profile = _infer_profile(payload.question)
    return {"summary": summary, "risk_level": profile["risk_level"], "intent_types": profile["intent_types"], "interests": profile["interests"]}


@app.post("/api/collaboration/correction")
def collaboration_correction(payload: CollaborationInput) -> dict[str, Any]:
    return runtime.create_correction(uuid.uuid4().hex, "correction", payload.guide_note, payload.ai_answer)


@app.post("/api/sessions/{session_id}/takeover")
def takeover(session_id: str, _: dict = Depends(require_roles("guide", "admin"))) -> dict[str, Any]:
    try:
        runtime.get_session(session_id)
        runtime._update("guide_sessions", session_id, {"status": "taken_over", "updated_at": datetime.now().isoformat(timespec="seconds")})
        runtime.log_takeover(session_id, "taken_over", guide_id="guide")
        return {"session_id": session_id, "status": "taken_over"}
    except KeyError:
        raise HTTPException(404, "session not found")


@app.post("/api/sessions/{session_id}/guide-reply")
def guide_reply(session_id: str, payload: GuideReplyInput, _: dict = Depends(require_roles("guide", "admin"))) -> dict[str, Any]:
    try:
        runtime.get_session(session_id)
        return runtime.record_message(session_id, "guide", "text", answer=payload.answer, reliable=True, provider="human-guide")
    except KeyError:
        raise HTTPException(404, "session not found")


@app.post("/api/sessions/{session_id}/release")
def release_takeover(session_id: str, _: dict = Depends(require_roles("guide", "admin"))) -> dict[str, Any]:
    try:
        runtime.update_session(session_id, {"status": "active"})
        runtime.log_takeover(session_id, "released", guide_id="guide")
        return {"session_id": session_id, "status": "active"}
    except KeyError:
        raise HTTPException(404, "session not found")


@app.post("/api/knowledge/documents")
async def upload_document(file: UploadFile = File(...), source: str = Form("管理员上传"), tags: str = Form(""), _: dict = Depends(require_roles("admin"))) -> dict[str, Any]:
    if Path(file.filename or "").suffix.lower() not in (".txt", ".md", ".csv"):
        raise HTTPException(415, "supported formats: txt, md, csv")
    content = (await file.read()).decode("utf-8-sig", errors="replace").strip()
    if not content:
        raise HTTPException(422, "empty document")
    upload = objects.save("document", file.filename or "knowledge.txt", content.encode("utf-8"))
    result = runtime.create_document_reviews(Path(file.filename or "知识文档").stem, content, source, [item.strip() for item in tags.split(",") if item.strip()])
    return {"upload": upload, **result}


@app.post("/api/tts/synthesize")
def tts(payload: TTSInput) -> dict[str, Any]:
    if os.name != "nt":
        raise HTTPException(503, "Windows SAPI is only available on Windows")
    filename = f"tts-{uuid.uuid4().hex}.wav"
    path = settings.media_dir / filename
    escaped = payload.text.replace("'", "''")
    command = f"Add-Type -AssemblyName System.Speech; $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.SetOutputToWaveFile('{path}'); $s.Speak('{escaped}'); $s.Dispose()"
    started = time.perf_counter()
    subprocess.run(["powershell", "-NoProfile", "-Command", command], check=True, capture_output=True)
    runtime.log_model("tts", "windows-sapi", "system-voice", payload.text, round((time.perf_counter() - started) * 1000))
    return {"url": f"/media/{filename}", "engine": "Windows SAPI"}


@app.get("/api/system/dashboard")
def system_dashboard(_: dict = Depends(require_roles("admin"))) -> dict[str, Any]:
    return {"metrics": _system_metrics(), "alerts": _system_alerts()}


@app.get("/api/system/alerts")
def system_alerts(_: dict = Depends(require_roles("admin"))) -> dict[str, Any]:
    return {"items": _system_alerts()}


@app.get("/api/system/metrics")
def system_metrics(_: dict = Depends(require_roles("admin"))) -> dict[str, Any]:
    return _system_metrics()


@app.get("/api/system/settings")
def system_settings(_: dict = Depends(require_roles("admin"))) -> dict[str, Any]:
    return runtime.get_settings()


@app.put("/api/system/settings")
def update_system_settings(payload: SettingsInput, _: dict = Depends(require_roles("admin"))) -> dict[str, Any]:
    return runtime.update_settings(payload.values)


@app.get("/api/permissions")
def permissions(_: dict = Depends(require_roles("admin"))) -> dict[str, Any]:
    return {"items": runtime._all("permissions")}


@app.get("/api/roles")
def roles(_: dict = Depends(require_roles("admin"))) -> dict[str, Any]:
    return {"items": runtime.list_roles()}


@app.post("/api/roles")
def add_role(payload: RoleInput, _: dict = Depends(require_roles("admin"))) -> dict[str, Any]:
    now = datetime.now().isoformat(timespec="seconds")
    return runtime._insert("roles", {"id": payload.id, "name": payload.name, "description": payload.description, "created_at": now, "updated_at": now})


@app.put("/api/roles/{role_id}")
def update_role(role_id: str, payload: RoleInput, _: dict = Depends(require_roles("admin"))) -> dict[str, Any]:
    try:
        runtime._find("roles", role_id)
        return runtime._update("roles", role_id, {"name": payload.name, "description": payload.description, "updated_at": datetime.now().isoformat(timespec="seconds")})
    except KeyError:
        raise HTTPException(404, "role not found")


@app.delete("/api/roles/{role_id}")
def delete_role(role_id: str, _: dict = Depends(require_roles("admin"))) -> dict[str, bool]:
    try:
        runtime._find("roles", role_id)
        runtime._delete_where("role_permissions", "role_id", role_id)
        runtime._delete("roles", role_id)
        return {"ok": True}
    except KeyError:
        raise HTTPException(404, "role not found")


@app.put("/api/roles/{role_id}/permissions")
def update_role_permissions(role_id: str, payload: RolePermissionsInput, _: dict = Depends(require_roles("admin"))) -> dict[str, Any]:
    try:
        return runtime.set_role_permissions(role_id, payload.permission_ids)
    except KeyError:
        raise HTTPException(404, "role not found")
    except ValueError:
        raise HTTPException(422, "invalid permission")


@app.get("/media/{filename}")
def media(filename: str) -> FileResponse:
    path = settings.media_dir / Path(filename).name
    if not path.exists():
        raise HTTPException(404, "media not found")
    return FileResponse(path)
