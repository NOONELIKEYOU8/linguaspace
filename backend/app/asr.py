"""
ASR (Automatic Speech Recognition) 语音识别模块。

本模块提供服务端语音识别功能，基于 faster-whisper 实现语音转录。
主要功能：
- 检测 ASR 服务是否可用
- 对转录文本进行归一化处理（繁简转换、地名纠错）
- 将音频文件转录为文本
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

from .config import settings


def server_asr_available() -> bool:
    """检测服务端 ASR 是否可用（检查 faster-whisper 是否已安装）。"""
    try:
        from faster_whisper import WhisperModel  # noqa: F401

        return True
    except ImportError:
        return False


def normalize_transcript(text: str) -> str:
    """
    归一化转录文本。
    
    处理步骤：
    1. 繁体转简体（使用 OpenCC）
    2. 纠正常见地名错误（如"大礼故城" -> "大理古城"）
    
    Args:
        text: 原始转录文本
        
    Returns:
        归一化后的文本
    """
    try:
        from opencc import OpenCC

        text = OpenCC("t2s").convert(text)
    except ImportError:
        pass
    replacements = {"大礼故城": "大理古城", "丽江故城": "丽江古城", "西双板纳": "西双版纳", "三到茶": "三道茶"}
    for source, target in replacements.items():
        text = text.replace(source, target)
    return text


@lru_cache(maxsize=1)
def _model():
    """
    获取 Whisper 模型实例（带缓存）。
    
    使用 LRU 缓存确保模型只加载一次。
    模型配置从 settings.whisper_model 读取。
    
    Returns:
        WhisperModel 实例
    """
    from faster_whisper import WhisperModel

    return WhisperModel(settings.whisper_model, device="cpu", compute_type="int8")


def transcribe(path: Path) -> dict[str, Any]:
    """
    转录音频文件。
    
    使用 faster-whisper 将音频文件转换为文本。
    
    Args:
        path: 音频文件路径
        
    Returns:
        包含以下字段的字典：
        - text: 归一化后的文本
        - raw_text: 原始转录文本
        - language: 检测到的语言
        - engine: 使用的引擎名称
        - available: 是否可用
        
    Raises:
        RuntimeError: 如果 faster-whisper 未安装或转录失败
    """
    try:
        segments, info = _model().transcribe(str(path), beam_size=3)
        raw_text = "".join(segment.text for segment in segments).strip()
        return {"text": normalize_transcript(raw_text), "raw_text": raw_text, "language": info.language, "engine": "faster-whisper", "available": True}
    except ImportError as exc:
        raise RuntimeError("faster-whisper is required for server ASR") from exc
    except Exception as exc:
        raise RuntimeError(f"server ASR failed: {exc}") from exc
