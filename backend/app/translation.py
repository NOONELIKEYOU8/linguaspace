"""
多语言翻译模块。

本模块提供基于术语库的翻译功能，用于：
- 将中文翻译为其他语言（如英文）
- 将其他语言反向翻译为中文
- 确保文化术语的一致性翻译

当前版本使用 MySQL 术语库，未来可扩展为完整的机器翻译。
"""
from __future__ import annotations

from typing import Any

from .runtime_store import runtime


def _terms_by_language(language: str) -> list[dict[str, Any]]:
    """获取指定语言的术语列表。"""
    return [term for term in list_terms() if term.get("language") == language]


def apply_glossary_to_zh(text: str, source_language: str) -> dict[str, Any]:
    """
    将非中文文本反向翻译为中文。
    
    使用术语库将外语术语替换为中文名称。
    
    Args:
        text: 输入文本
        source_language: 源语言（如 'en'）
        
    Returns:
        包含翻译结果、语言、引擎和术语匹配的字典
    """
    if source_language in ("zh", "zh-CN", "中文"):
        return {"text": text, "language": "zh", "engine": "identity", "term_hits": []}
    translated = text
    hits = []
    for term in _terms_by_language(source_language):
        translation = term.get("translation")
        zh_name = term.get("zh_name")
        if translation and zh_name and translation in translated:
            translated = translated.replace(translation, zh_name)
            hits.append({"source": translation, "translation": zh_name})
    return {"text": translated, "language": "zh", "engine": "glossary-reverse", "term_hits": hits}


def list_terms() -> list[dict[str, Any]]:
    """获取所有术语条目。"""
    return runtime._all("terms")


def translate(text: str, target_language: str) -> dict[str, Any]:
    """
    将中文文本翻译为目标语言。
    
    使用术语库将中文术语替换为目标语言翻译。
    
    Args:
        text: 输入文本（中文）
        target_language: 目标语言（如 'en'）
        
    Returns:
        包含翻译结果、语言、引擎和术语匹配的字典
    """
    if target_language in ("zh", "zh-CN", "中文"):
        return {"text": text, "language": "zh", "engine": "identity", "term_hits": []}
    hits = []
    translated = text
    for term in _terms_by_language(target_language):
        zh_name = term.get("zh_name")
        translation = term.get("translation")
        if zh_name and translation and zh_name in translated:
            translated = translated.replace(zh_name, translation)
            hits.append({"source": zh_name, "translation": translation})
    return {
        "text": translated,
        "language": target_language,
        "engine": "glossary",
        "term_hits": hits,
        "note": "当前版本使用 MySQL 术语库保证多语名称一致性，可继续接入 NLLB 或云端翻译适配器扩展全文翻译。",
    }
