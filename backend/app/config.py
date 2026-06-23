"""
应用配置模块。

本模块定义了 LinguaSpace 应用的全局配置项。
配置项可通过环境变量进行覆盖，支持：
- LLM 提供者配置（Ollama / OpenAI 兼容 API）
- 数据库连接配置
- RAG 检索参数
- 认证与安全配置
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    """
    应用配置类。
    
    所有配置项均可通过环境变量覆盖，环境变量名称与属性名相同。
    配置类是不可变的（frozen=True），确保运行时配置不被修改。
    """
    app_name: str = "LinguaSpace API"  # 应用名称
    data_dir: Path = Path(__file__).parent / "data" / "csv"  # CSV 数据目录
    media_dir: Path = Path(__file__).parent.parent / "media"  # 媒体文件目录
    ollama_base_url: str = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")  # Ollama 服务地址
    ollama_model: str = os.getenv("OLLAMA_MODEL", "qwen3.5:9b")  # Ollama 文本模型
    ollama_vision_model: str = os.getenv("OLLAMA_VISION_MODEL", "qwen3-vl:4b")  # Ollama 视觉模型
    llm_provider: str = os.getenv("LLM_PROVIDER", "ollama")  # LLM 提供者：ollama 或 openai-compatible
    openai_compatible_base_url: str = os.getenv("OPENAI_COMPATIBLE_BASE_URL", "")  # OpenAI 兼容 API 地址
    openai_compatible_api_key: str = os.getenv("OPENAI_COMPATIBLE_API_KEY", "")  # OpenAI 兼容 API 密钥
    openai_compatible_model: str = os.getenv("OPENAI_COMPATIBLE_MODEL", "")  # OpenAI 兼容模型名称
    mysql_url: str = os.getenv("MYSQL_URL", "mysql+pymysql://linguaspace:linguaspace@127.0.0.1:3307/linguaspace")  # MySQL 连接字符串
    rag_min_score: float = float(os.getenv("RAG_MIN_SCORE", "1.0"))  # RAG 检索最低分数阈值
    rag_min_sources: int = int(os.getenv("RAG_MIN_SOURCES", "1"))  # RAG 检索最少来源数
    enable_llm_judge: bool = os.getenv("ENABLE_LLM_JUDGE", "true").lower() == "true"  # 是否启用 LLM 评分
    whisper_model: str = os.getenv("WHISPER_MODEL", "small")  # Whisper 模型名称
    enforce_auth: bool = os.getenv("ENFORCE_AUTH", "false").lower() == "true"  # 是否强制认证
    app_secret: str = os.getenv("APP_SECRET", "linguaspace-local-demo-secret")  # 应用密钥（用于令牌签名）

# 全局配置实例
settings = Settings()
# 确保媒体目录存在
settings.media_dir.mkdir(parents=True, exist_ok=True)
