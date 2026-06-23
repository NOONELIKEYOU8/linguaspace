"""
运行时数据存储模块。

本模块管理 MySQL 数据库中的运行时数据，包括：
- 用户管理
- 导游会话与消息记录
- 术语库管理
- 实训记录与评分
- 反馈与收藏

提供数据库表结构定义（SCHEMA）和 CRUD 操作。
"""
from __future__ import annotations

import hashlib
import hmac
import json
import secrets
import uuid
from datetime import datetime
from threading import RLock
from typing import Any

from .config import settings
from .store import store


def _hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), 120_000).hex()
    return f"pbkdf2_sha256${salt}${digest}"


def _verify_password(password: str, encoded: str) -> bool:
    if not encoded.startswith("pbkdf2_sha256$"):
        return hmac.compare_digest(password, encoded)
    _, salt, expected = encoded.split("$", 2)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), 120_000).hex()
    return hmac.compare_digest(digest, expected)


# 数据库表结构定义
# 包含所有运行时数据表的 CREATE TABLE 语句
SCHEMA = [
    """CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(64) PRIMARY KEY, username VARCHAR(64) UNIQUE NOT NULL,
        password VARCHAR(128) NOT NULL, display_name VARCHAR(128) NOT NULL,
        role VARCHAR(24) NOT NULL, language VARCHAR(24) DEFAULT 'zh',
        status VARCHAR(24) DEFAULT 'active', created_at VARCHAR(40) NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS guide_sessions (
        id VARCHAR(64) PRIMARY KEY, visitor_name VARCHAR(128), language VARCHAR(24),
        location VARCHAR(255), status VARCHAR(24), summary TEXT, risk_level VARCHAR(24),
        created_at VARCHAR(40) NOT NULL, updated_at VARCHAR(40) NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS messages (
        id VARCHAR(64) PRIMARY KEY, session_id VARCHAR(64), role VARCHAR(24),
        input_type VARCHAR(24), question TEXT, answer TEXT, sources_json LONGTEXT,
        reliable TINYINT DEFAULT 0, model VARCHAR(128), provider VARCHAR(64),
        created_at VARCHAR(40) NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS model_call_logs (
        id VARCHAR(64) PRIMARY KEY, request_id VARCHAR(64), capability VARCHAR(48),
        provider VARCHAR(64), model VARCHAR(128), prompt_summary TEXT, latency_ms INT,
        status VARCHAR(24), error_message TEXT, created_at VARCHAR(40) NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS review_tasks (
        id VARCHAR(64) PRIMARY KEY, object_type VARCHAR(48), object_id VARCHAR(64),
        title VARCHAR(255), content LONGTEXT, source VARCHAR(255), tags_json TEXT,
        status VARCHAR(24), reviewer VARCHAR(128), comment TEXT,
        created_at VARCHAR(40) NOT NULL, updated_at VARCHAR(40) NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS terms (
        id VARCHAR(64) PRIMARY KEY, zh_name VARCHAR(128), language VARCHAR(24),
        translation VARCHAR(255), scene VARCHAR(128), status VARCHAR(24),
        created_at VARCHAR(40) NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS training_records (
        id VARCHAR(64) PRIMARY KEY, scenario VARCHAR(255), question TEXT, answer TEXT,
        score INT, metrics_json TEXT, feedback_json TEXT, judge_mode VARCHAR(64),
        created_at VARCHAR(40) NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS guide_corrections (
        id VARCHAR(64) PRIMARY KEY, record_id VARCHAR(64), mode VARCHAR(24),
        guide_note TEXT, optimized_answer LONGTEXT, status VARCHAR(24),
        created_at VARCHAR(40) NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS feedback (
        id VARCHAR(64) PRIMARY KEY, message_id VARCHAR(64), rating INT,
        content TEXT, status VARCHAR(24), created_at VARCHAR(40) NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS visitor_profiles (
        session_id VARCHAR(64) PRIMARY KEY, language VARCHAR(24),
        interests_json TEXT, intent_types_json TEXT, visit_status VARCHAR(24),
        risk_level VARCHAR(24), last_question TEXT, updated_at VARCHAR(40) NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS request_traces (
        id VARCHAR(64) PRIMARY KEY, session_id VARCHAR(64), question TEXT,
        language VARCHAR(24), pipeline_json LONGTEXT, created_at VARCHAR(40) NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS favorites (
        id VARCHAR(64) PRIMARY KEY, session_id VARCHAR(64), item_type VARCHAR(48),
        item_id VARCHAR(128), title VARCHAR(255), created_at VARCHAR(40) NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS takeover_logs (
        id VARCHAR(64) PRIMARY KEY, session_id VARCHAR(64), action VARCHAR(48),
        guide_id VARCHAR(64), note TEXT, created_at VARCHAR(40) NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS guide_profiles (
        id VARCHAR(64) PRIMARY KEY, display_name VARCHAR(128), bio TEXT,
        languages_json TEXT, specialties_json TEXT,
        created_at VARCHAR(40) NOT NULL, updated_at VARCHAR(40) NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS knowledge_documents (
        id VARCHAR(64) PRIMARY KEY, title VARCHAR(255), source VARCHAR(255),
        tags_json TEXT, content LONGTEXT, status VARCHAR(32), vector_status VARCHAR(32),
        created_at VARCHAR(40) NOT NULL, updated_at VARCHAR(40) NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS knowledge_chunks (
        id VARCHAR(64) PRIMARY KEY, document_id VARCHAR(64), title VARCHAR(255),
        content LONGTEXT, tags_json TEXT, status VARCHAR(32), vector_status VARCHAR(32),
        created_at VARCHAR(40) NOT NULL, updated_at VARCHAR(40) NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS roles (
        id VARCHAR(64) PRIMARY KEY, name VARCHAR(128), description TEXT,
        created_at VARCHAR(40) NOT NULL, updated_at VARCHAR(40) NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS permissions (
        id VARCHAR(64) PRIMARY KEY, name VARCHAR(128), module VARCHAR(64),
        created_at VARCHAR(40) NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS role_permissions (
        id VARCHAR(64) PRIMARY KEY, role_id VARCHAR(64), permission_id VARCHAR(64),
        created_at VARCHAR(40) NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS system_settings (
        id VARCHAR(64) PRIMARY KEY, values_json LONGTEXT,
        created_at VARCHAR(40) NOT NULL, updated_at VARCHAR(40) NOT NULL)""",
]


def _now() -> str:
    """获取当前时间的 ISO 格式字符串。"""
    return datetime.now().isoformat(timespec="seconds")


class RuntimeStore:
    """
    运行时数据存储类。
    
    管理 MySQL 数据库中的所有运行时数据表，提供：
    - 数据库表结构初始化
    - 通用 CRUD 操作
    - 种子数据初始化
    """
    def __init__(self) -> None:
        self.lock = RLock()
        self.mysql_ok = self._ensure_schema()
        self._seed_users()
        self._seed_terms()
        self._seed_guide_profile()
        self._seed_roles_permissions()
        self._seed_system_settings()

    def _ensure_schema(self) -> bool:
        with store._connect() as connection, connection.cursor() as cursor:
            for statement in SCHEMA:
                cursor.execute(statement)
            connection.commit()
        return True

    def _all(self, table: str, limit: int = 200) -> list[dict[str, Any]]:
        """
        获取表中所有记录（按创建时间倒序）。
        
        Args:
            table: 表名
            limit: 最大记录数
            
        Returns:
            记录列表
        """
        with store._connect() as connection, connection.cursor() as cursor:
            cursor.execute(f"SELECT * FROM `{table}` ORDER BY created_at DESC LIMIT %s", (limit,))
            return list(cursor.fetchall())

    def _insert(self, table: str, item: dict[str, Any]) -> dict[str, Any]:
        """
        插入记录到表中。
        
        Args:
            table: 表名
            item: 记录数据
            
        Returns:
            插入的记录
        """
        with self.lock:
            with store._connect() as connection, connection.cursor() as cursor:
                columns = list(item)
                marks = ",".join(["%s"] * len(columns))
                cursor.execute(f"INSERT INTO `{table}` ({','.join(f'`{key}`' for key in columns)}) VALUES ({marks})", list(item.values()))
                connection.commit()
                return item

    def _update(self, table: str, item_id: str, changes: dict[str, Any]) -> dict[str, Any]:
        """
        更新表中的记录。
        
        Args:
            table: 表名
            item_id: 记录 ID
            changes: 要更新的字段
            
        Returns:
            更新后的记录
        """
        with store._connect() as connection, connection.cursor() as cursor:
            cursor.execute(f"UPDATE `{table}` SET {','.join(f'`{key}`=%s' for key in changes)} WHERE id=%s", [*changes.values(), item_id])
            connection.commit()
        return {"id": item_id, **changes}

    def _delete(self, table: str, item_id: str) -> None:
        """删除表中的记录。"""
        with store._connect() as connection, connection.cursor() as cursor:
            cursor.execute(f"DELETE FROM `{table}` WHERE id=%s", (item_id,))
            connection.commit()

    def _delete_where(self, table: str, column: str, value: str) -> None:
        """按条件删除表中的记录。"""
        with store._connect() as connection, connection.cursor() as cursor:
            cursor.execute(f"DELETE FROM `{table}` WHERE `{column}`=%s", (value,))
            connection.commit()

    def _find(self, table: str, item_id: str) -> dict[str, Any]:
        """
        查找表中的记录。
        
        Args:
            table: 表名
            item_id: 记录 ID
            
        Returns:
            记录数据
            
        Raises:
            KeyError: 如果记录不存在
        """
        with store._connect() as connection, connection.cursor() as cursor:
            cursor.execute(f"SELECT * FROM `{table}` WHERE id=%s", (item_id,))
            row = cursor.fetchone()
        if not row:
            raise KeyError(item_id)
        return row

    def _seed_users(self) -> None:
        """初始化默认用户（student, guide, admin）。"""
        if self._all("users"):
            return
        for username, role in (("student", "student"), ("guide", "guide"), ("admin", "admin")):
            self._insert("users", {"id": uuid.uuid4().hex, "username": username, "password": _hash_password("123456"), "display_name": username, "role": role, "language": "zh", "status": "active", "created_at": _now()})

    def _seed_terms(self) -> None:
        if self._all("terms"):
            return
        for zh, en, scene in (("大理古城", "Dali Ancient Town", "景点"), ("丽江古城", "Lijiang Old Town", "景点"), ("白族", "Bai ethnic group", "民族"), ("三道茶", "Three-course Tea Ceremony", "礼仪"), ("泼水节", "Water Splashing Festival", "节庆"), ("过桥米线", "Crossing-the-Bridge Rice Noodles", "饮食")):
            self.add_term(zh, "en", en, scene)

    def _seed_guide_profile(self) -> None:
        if self._all("guide_profiles"):
            return
        now = _now()
        self._insert("guide_profiles", {"id": "guide", "display_name": "LinguaSpace 导游", "bio": "负责人工接管、文化解释与知识纠偏。", "languages_json": json.dumps(["中文", "English"], ensure_ascii=False), "specialties_json": json.dumps(["云南文化", "行程协同", "风险提示"], ensure_ascii=False), "created_at": now, "updated_at": now})

    def _seed_roles_permissions(self) -> None:
        if not self._all("permissions"):
            for permission_id, name, module in (
                ("tourist.read", "游客端浏览", "tourist"),
                ("tourist.chat", "游客端问答", "tourist"),
                ("guide.collaborate", "导游协同", "guide"),
                ("knowledge.manage", "知识工程管理", "knowledge"),
                ("system.manage", "系统管理", "system"),
            ):
                self._insert("permissions", {"id": permission_id, "name": name, "module": module, "created_at": _now()})
        if not self._all("roles"):
            roles = (
                ("tourist", "游客", "使用行程、问答与收藏功能", ["tourist.read", "tourist.chat"]),
                ("student", "学员", "使用游客能力与实训功能", ["tourist.read", "tourist.chat"]),
                ("guide", "导游", "处理人工接管与知识纠偏", ["tourist.read", "tourist.chat", "guide.collaborate"]),
                ("admin", "管理员", "管理知识工程和系统配置", ["tourist.read", "tourist.chat", "guide.collaborate", "knowledge.manage", "system.manage"]),
            )
            for role_id, name, description, permissions in roles:
                now = _now()
                self._insert("roles", {"id": role_id, "name": name, "description": description, "created_at": now, "updated_at": now})
                for permission_id in permissions:
                    self._insert("role_permissions", {"id": f"{role_id}:{permission_id}", "role_id": role_id, "permission_id": permission_id, "created_at": now})

    def _seed_system_settings(self) -> None:
        if self._all("system_settings"):
            return
        now = _now()
        values = {"app_name": settings.app_name, "default_language": "zh", "rag_min_score": settings.rag_min_score, "rag_min_sources": settings.rag_min_sources, "weather_provider": "", "weather_note": "未配置天气服务提供方"}
        self._insert("system_settings", {"id": "default", "values_json": json.dumps(values, ensure_ascii=False), "created_at": now, "updated_at": now})

    def login(self, username: str, password: str) -> dict[str, Any] | None:
        for user in self._all("users"):
            if user["username"] == username and _verify_password(password, user["password"]) and user["status"] == "active":
                if not user["password"].startswith("pbkdf2_sha256$"):
                    self._update("users", user["id"], {"password": _hash_password(password)})
                return {key: user[key] for key in ("id", "username", "display_name", "role", "language")}
        return None

    def add_user(self, username: str, password: str, display_name: str, role: str, language: str = "zh") -> dict[str, Any]:
        if role not in ("tourist", "student", "guide", "admin"):
            raise ValueError(role)
        return self._insert("users", {"id": uuid.uuid4().hex, "username": username, "password": _hash_password(password), "display_name": display_name or username, "role": role, "language": language, "status": "active", "created_at": _now()})

    def update_user(self, user_id: str, display_name: str, role: str, language: str, status: str) -> dict[str, Any]:
        if role not in ("tourist", "student", "guide", "admin"):
            raise ValueError(role)
        if status not in ("active", "disabled", "locked"):
            raise ValueError(status)
        self._find("users", user_id)
        return self._update("users", user_id, {"display_name": display_name, "role": role, "language": language, "status": status})

    def create_session(self, language: str = "zh", location: str | None = None, visitor_name: str = "匿名游客") -> dict[str, Any]:
        now = _now()
        return self._insert("guide_sessions", {"id": uuid.uuid4().hex, "visitor_name": visitor_name, "language": language, "location": location or "", "status": "active", "summary": "", "risk_level": "normal", "created_at": now, "updated_at": now})

    def get_session(self, session_id: str) -> dict[str, Any]:
        for item in self._all("guide_sessions"):
            if item["id"] == session_id:
                return item
        raise KeyError(session_id)

    def list_sessions(self) -> list[dict[str, Any]]:
        sessions = self._all("guide_sessions")
        messages = self._all("messages", 1000)
        for session in sessions:
            related = [message for message in messages if message["session_id"] == session["id"]]
            session["messages"] = related
            session["last_question"] = next((message["question"] for message in related if message.get("question")), "")
        sessions.sort(key=lambda session: session.get("updated_at") or session.get("created_at") or "", reverse=True)
        return sessions

    def update_session(self, session_id: str, changes: dict[str, Any]) -> dict[str, Any]:
        self.get_session(session_id)
        return self._update("guide_sessions", session_id, {**changes, "updated_at": _now()})

    def record_message(self, session_id: str, role: str, input_type: str, question: str = "", answer: str = "", sources: list[dict[str, Any]] | None = None, reliable: bool = False, model: str = "", provider: str = "") -> dict[str, Any]:
        message = self._insert("messages", {"id": uuid.uuid4().hex, "session_id": session_id, "role": role, "input_type": input_type, "question": question, "answer": answer, "sources_json": json.dumps(sources or [], ensure_ascii=False), "reliable": int(reliable), "model": model, "provider": provider, "created_at": _now()})
        self._update("guide_sessions", session_id, {"updated_at": _now()})
        return message

    def log_model(self, capability: str, provider: str, model: str, prompt: str, latency_ms: int, status: str = "success", error: str = "") -> dict[str, Any]:
        return self._insert("model_call_logs", {"id": uuid.uuid4().hex, "request_id": uuid.uuid4().hex, "capability": capability, "provider": provider, "model": model, "prompt_summary": prompt[:500], "latency_ms": latency_ms, "status": status, "error_message": error, "created_at": _now()})

    def create_review(self, object_type: str, object_id: str, title: str, content: str, source: str = "", tags: list[str] | None = None) -> dict[str, Any]:
        now = _now()
        return self._insert("review_tasks", {"id": uuid.uuid4().hex, "object_type": object_type, "object_id": object_id, "title": title, "content": content, "source": source, "tags_json": json.dumps(tags or [], ensure_ascii=False), "status": "pending", "reviewer": "", "comment": "", "created_at": now, "updated_at": now})

    def create_document_reviews(self, title: str, content: str, source: str, tags: list[str]) -> dict[str, Any]:
        document_id = uuid.uuid4().hex
        now = _now()
        self._insert("knowledge_documents", {"id": document_id, "title": title, "source": source, "tags_json": json.dumps(tags, ensure_ascii=False), "content": content, "status": "pending_review", "vector_status": "pending", "created_at": now, "updated_at": now})
        tasks = self._replace_document_chunks(document_id, title, content, source, tags)
        return {"document_id": document_id, "title": title, "source": source, "chunk_count": len(tasks), "tasks": tasks, "status": "pending_review"}

    def _replace_document_chunks(self, document_id: str, title: str, content: str, source: str, tags: list[str]) -> list[dict[str, Any]]:
        blocks = [block.strip() for block in content.replace("\r", "").split("\n\n") if block.strip()]
        chunks: list[str] = []
        for block in blocks or [content]:
            while len(block) > 700:
                chunks.append(block[:700])
                block = block[650:]
            if block:
                chunks.append(block)
        self._delete_where("knowledge_chunks", "document_id", document_id)
        tasks = []
        for index, content_chunk in enumerate(chunks):
            now = _now()
            chunk_id = f"{document_id}-{index + 1}"
            self._insert("knowledge_chunks", {"id": chunk_id, "document_id": document_id, "title": f"{title} #{index + 1}", "content": content_chunk, "tags_json": json.dumps(tags, ensure_ascii=False), "status": "pending_review", "vector_status": "pending", "created_at": now, "updated_at": now})
            tasks.append(self.create_review("document", chunk_id, f"{title} #{index + 1}", content_chunk, source, tags))
        return tasks

    def list_documents(self) -> list[dict[str, Any]]:
        items = self._all("knowledge_documents")
        chunks = self._all("knowledge_chunks", 2000)
        for item in items:
            item["tags"] = json.loads(item.get("tags_json") or "[]")
            item["chunk_count"] = len([chunk for chunk in chunks if chunk["document_id"] == item["id"]])
        return items

    def delete_document(self, document_id: str) -> None:
        self._find("knowledge_documents", document_id)
        self._delete_where("knowledge_chunks", "document_id", document_id)
        self._delete("knowledge_documents", document_id)

    def split_document(self, document_id: str) -> dict[str, Any]:
        document = self._find("knowledge_documents", document_id)
        tasks = self._replace_document_chunks(document_id, document["title"], document["content"], document["source"], json.loads(document.get("tags_json") or "[]"))
        self._update("knowledge_documents", document_id, {"status": "pending_review", "vector_status": "pending", "updated_at": _now()})
        return {"document_id": document_id, "chunk_count": len(tasks), "tasks": tasks, "status": "pending_review"}

    def vectorize_document(self, document_id: str) -> dict[str, Any]:
        self._find("knowledge_documents", document_id)
        self._update("knowledge_documents", document_id, {"vector_status": "ready", "updated_at": _now()})
        with store._connect() as connection, connection.cursor() as cursor:
            cursor.execute("UPDATE knowledge_chunks SET vector_status='ready', updated_at=%s WHERE document_id=%s", (_now(), document_id))
            connection.commit()
        return self._find("knowledge_documents", document_id)

    def list_chunks(self, document_id: str = "") -> list[dict[str, Any]]:
        items = self._all("knowledge_chunks", 2000)
        return [item for item in items if not document_id or item["document_id"] == document_id]

    def add_chunk(self, document_id: str, title: str, content: str, tags: list[str]) -> dict[str, Any]:
        self._find("knowledge_documents", document_id)
        now = _now()
        return self._insert("knowledge_chunks", {"id": uuid.uuid4().hex, "document_id": document_id, "title": title, "content": content, "tags_json": json.dumps(tags, ensure_ascii=False), "status": "draft", "vector_status": "pending", "created_at": now, "updated_at": now})

    def update_chunk(self, chunk_id: str, title: str, content: str, tags: list[str]) -> dict[str, Any]:
        self._find("knowledge_chunks", chunk_id)
        return self._update("knowledge_chunks", chunk_id, {"title": title, "content": content, "tags_json": json.dumps(tags, ensure_ascii=False), "vector_status": "pending", "updated_at": _now()})

    def vectorize_chunk(self, chunk_id: str) -> dict[str, Any]:
        self._find("knowledge_chunks", chunk_id)
        self._update("knowledge_chunks", chunk_id, {"vector_status": "ready", "updated_at": _now()})
        return self._find("knowledge_chunks", chunk_id)

    def decide_review(self, task_id: str, status: str, reviewer: str, comment: str) -> dict[str, Any]:
        if status not in ("approved", "rejected", "offline"):
            raise ValueError(status)
        task = next((item for item in self._all("review_tasks") if item["id"] == task_id), None)
        if not task:
            raise KeyError(task_id)
        if task["status"] != "pending":
            raise RuntimeError("review task already decided")
        self._update("review_tasks", task_id, {"status": status, "reviewer": reviewer, "comment": comment, "updated_at": _now()})
        if status == "approved" and task["object_type"] in ("document", "correction"):
            store.add_knowledge({"title": task["title"], "content": task["content"], "tags": json.loads(task["tags_json"])})
        return {**task, "status": status, "reviewer": reviewer, "comment": comment}

    def add_term(self, zh_name: str, language: str, translation: str, scene: str = "") -> dict[str, Any]:
        return self._insert("terms", {"id": uuid.uuid4().hex, "zh_name": zh_name, "language": language, "translation": translation, "scene": scene, "status": "approved", "created_at": _now()})

    def update_term(self, term_id: str, zh_name: str, language: str, translation: str, scene: str = "") -> dict[str, Any]:
        return self._update("terms", term_id, {"zh_name": zh_name, "language": language, "translation": translation, "scene": scene})

    def add_training_record(self, scenario: str, question: str, answer: str, report: dict[str, Any]) -> dict[str, Any]:
        return self._insert("training_records", {"id": uuid.uuid4().hex, "scenario": scenario, "question": question, "answer": answer, "score": report["total"], "metrics_json": json.dumps(report["metrics"], ensure_ascii=False), "feedback_json": json.dumps(report["feedback"], ensure_ascii=False), "judge_mode": report["judge_mode"], "created_at": _now()})

    def create_correction(self, record_id: str, mode: str, guide_note: str, optimized_answer: str) -> dict[str, Any]:
        correction = self._insert("guide_corrections", {"id": uuid.uuid4().hex, "record_id": record_id, "mode": mode, "guide_note": guide_note, "optimized_answer": optimized_answer, "status": "pending", "created_at": _now()})
        self.create_review("correction", correction["id"], f"导游修正 {record_id}", optimized_answer, "导游端修正", ["导游修正", mode])
        return correction

    def update_correction(self, correction_id: str, guide_note: str, optimized_answer: str, status: str) -> dict[str, Any]:
        self._find("guide_corrections", correction_id)
        return self._update("guide_corrections", correction_id, {"guide_note": guide_note, "optimized_answer": optimized_answer, "status": status})

    def add_feedback(self, message_id: str, rating: int, content: str) -> dict[str, Any]:
        return self._insert("feedback", {"id": uuid.uuid4().hex, "message_id": message_id, "rating": rating, "content": content, "status": "open", "created_at": _now()})

    def upsert_profile(self, session_id: str, language: str, interests: list[str], intent_types: list[str], visit_status: str, risk_level: str, last_question: str) -> dict[str, Any]:
        payload = {
            "session_id": session_id,
            "language": language,
            "interests_json": json.dumps(sorted(set(interests)), ensure_ascii=False),
            "intent_types_json": json.dumps(sorted(set(intent_types)), ensure_ascii=False),
            "visit_status": visit_status,
            "risk_level": risk_level,
            "last_question": last_question,
            "updated_at": _now(),
        }
        with store._connect() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO visitor_profiles (session_id, language, interests_json, intent_types_json, visit_status, risk_level, last_question, updated_at)
                VALUES (%(session_id)s, %(language)s, %(interests_json)s, %(intent_types_json)s, %(visit_status)s, %(risk_level)s, %(last_question)s, %(updated_at)s)
                ON DUPLICATE KEY UPDATE
                  language=VALUES(language),
                  interests_json=VALUES(interests_json),
                  intent_types_json=VALUES(intent_types_json),
                  visit_status=VALUES(visit_status),
                  risk_level=VALUES(risk_level),
                  last_question=VALUES(last_question),
                  updated_at=VALUES(updated_at)
                """,
                payload,
            )
            connection.commit()
        return payload

    def get_profile(self, session_id: str) -> dict[str, Any] | None:
        with store._connect() as connection, connection.cursor() as cursor:
            cursor.execute("SELECT * FROM visitor_profiles WHERE session_id=%s", (session_id,))
            row = cursor.fetchone()
        if not row:
            return None
        row["interests_json"] = json.loads(row.get("interests_json") or "[]")
        row["intent_types_json"] = json.loads(row.get("intent_types_json") or "[]")
        return row

    def log_request_trace(self, session_id: str, question: str, language: str, pipeline: dict[str, Any]) -> dict[str, Any]:
        return self._insert(
            "request_traces",
            {
                "id": uuid.uuid4().hex,
                "session_id": session_id,
                "question": question,
                "language": language,
                "pipeline_json": json.dumps(pipeline, ensure_ascii=False),
                "created_at": _now(),
            },
        )

    def add_favorite(self, session_id: str, item_type: str, item_id: str, title: str) -> dict[str, Any]:
        return self._insert("favorites", {"id": uuid.uuid4().hex, "session_id": session_id, "item_type": item_type, "item_id": item_id, "title": title, "created_at": _now()})

    def list_favorites(self, session_id: str = "") -> list[dict[str, Any]]:
        return [item for item in self._all("favorites") if not session_id or item["session_id"] == session_id]

    def log_takeover(self, session_id: str, action: str, guide_id: str = "", note: str = "") -> dict[str, Any]:
        return self._insert("takeover_logs", {"id": uuid.uuid4().hex, "session_id": session_id, "action": action, "guide_id": guide_id, "note": note, "created_at": _now()})

    def guide_profile(self) -> dict[str, Any]:
        profile = self._find("guide_profiles", "guide")
        profile["languages"] = json.loads(profile.get("languages_json") or "[]")
        profile["specialties"] = json.loads(profile.get("specialties_json") or "[]")
        profile["stats"] = {"takeovers": len(self._all("takeover_logs", 1000)), "corrections": len(self._all("guide_corrections", 1000)), "replies": len([item for item in self._all("messages", 2000) if item["role"] == "guide"])}
        return profile

    def list_roles(self) -> list[dict[str, Any]]:
        permissions = self._all("role_permissions", 1000)
        items = self._all("roles")
        for item in items:
            item["permissions"] = [entry["permission_id"] for entry in permissions if entry["role_id"] == item["id"]]
        return items

    def set_role_permissions(self, role_id: str, permission_ids: list[str]) -> dict[str, Any]:
        self._find("roles", role_id)
        allowed = {item["id"] for item in self._all("permissions")}
        if any(permission_id not in allowed for permission_id in permission_ids):
            raise ValueError("invalid permission")
        self._delete_where("role_permissions", "role_id", role_id)
        for permission_id in sorted(set(permission_ids)):
            self._insert("role_permissions", {"id": f"{role_id}:{permission_id}", "role_id": role_id, "permission_id": permission_id, "created_at": _now()})
        return next(item for item in self.list_roles() if item["id"] == role_id)

    def get_settings(self) -> dict[str, Any]:
        item = self._find("system_settings", "default")
        return {"values": json.loads(item["values_json"]), "updated_at": item["updated_at"]}

    def update_settings(self, values: dict[str, Any]) -> dict[str, Any]:
        current = self.get_settings()["values"]
        current.update(values)
        self._update("system_settings", "default", {"values_json": json.dumps(current, ensure_ascii=False), "updated_at": _now()})
        return self.get_settings()


runtime = RuntimeStore()
