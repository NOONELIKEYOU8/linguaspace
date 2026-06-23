"""
LLM 提供者模块。

本模块封装了不同的大语言模型（LLM）提供者的调用接口：
- OllamaProvider: 本地 Ollama 服务
- OpenAICompatibleProvider: OpenAI 兼容 API（如 vLLM、LM Studio）

提供统一的 generate 和 stream 接口，支持文本生成和视觉理解。
"""
from __future__ import annotations

import base64
import json
import time
from collections.abc import Iterator

import httpx

from .config import settings


class OllamaProvider:
    """Ollama 本地 LLM 提供者。"""
    
    name = "ollama"
    
    def __init__(self) -> None:
        """初始化 Ollama 连接配置。"""
        self.base_url = settings.ollama_base_url
        self.model = settings.ollama_model

    def tags(self) -> list[str]:
        try:
            payload = httpx.get(f"{self.base_url}/api/tags", timeout=2).json()
            return [item["name"] for item in payload.get("models", [])]
        except Exception:
            return []

    def generate(self, prompt: str, model: str | None = None, images: list[bytes] | None = None, timeout: float = 90) -> str:
        """
        生成文本回复（非流式）。
        
        注意：视觉调用仍使用 Ollama vision adapter。
        
        Args:
            prompt: 输入提示
            model: 模型名称（可选）
            images: 图像字节列表（暂不支持）
            timeout: 超时时间（秒）
            
        Returns:
            生成的文本
            
        Raises:
            RuntimeError: 如果尝试使用视觉功能
        """
        payload: dict[str, object] = {"model": model or self.model, "prompt": prompt, "stream": False, "think": False, "keep_alive": "10m", "options": {"temperature": 0.2, "num_predict": 320}}
        if images:
            payload["images"] = [base64.b64encode(image).decode() for image in images]
        response = httpx.post(f"{self.base_url}/api/generate", json=payload, timeout=timeout)
        response.raise_for_status()
        return response.json().get("response", "").strip()

    def stream(self, prompt: str) -> Iterator[str]:
        with httpx.stream("POST", f"{self.base_url}/api/generate", json={"model": self.model, "prompt": prompt, "stream": True, "think": False, "keep_alive": "10m", "options": {"temperature": 0.2, "num_predict": 320}}, timeout=90) as response:
            response.raise_for_status()
            for line in response.iter_lines():
                if line:
                    chunk = json.loads(line).get("response", "")
                    if chunk:
                        yield chunk


class OpenAICompatibleProvider:
    """OpenAI 兼容 API 提供者（如 vLLM、LM Studio）。"""
    
    name = "openai-compatible"

    def __init__(self) -> None:
        """初始化 OpenAI 兼容 API 连接配置。"""
        self.base_url = settings.openai_compatible_base_url.rstrip("/")
        self.model = settings.openai_compatible_model
        self.headers = {"Authorization": f"Bearer {settings.openai_compatible_api_key}"}

    def tags(self) -> list[str]:
        """返回配置的模型名称。"""
        if images:
            raise RuntimeError("Vision calls remain on the Ollama vision adapter")
        payload = {"model": model or self.model, "messages": [{"role": "user", "content": prompt}], "stream": False, "temperature": 0.2, "max_tokens": 320}
        response = httpx.post(f"{self.base_url}/chat/completions", headers=self.headers, json=payload, timeout=timeout)
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"].strip()

    def stream(self, prompt: str) -> Iterator[str]:
        payload = {"model": self.model, "messages": [{"role": "user", "content": prompt}], "stream": True, "temperature": 0.2, "max_tokens": 320}
        with httpx.stream("POST", f"{self.base_url}/chat/completions", headers=self.headers, json=payload, timeout=90) as response:
            response.raise_for_status()
            for line in response.iter_lines():
                if line.startswith("data: ") and line != "data: [DONE]":
                    chunk = json.loads(line[6:])["choices"][0]["delta"].get("content", "")
                    if chunk:
                        yield chunk


# 全局提供者实例
# vision_provider: 用于视觉理解（始终使用 Ollama）
# provider: 根据配置选择 Ollama 或 OpenAI 兼容 API
vision_provider = OllamaProvider()
provider = OpenAICompatibleProvider() if settings.llm_provider == "openai-compatible" else vision_provider


def timed_generate(prompt: str, **kwargs: object) -> tuple[str, int]:
    """
    带计时的文本生成。
    
    Args:
        prompt: 输入提示
        **kwargs: 其他生成参数
        
    Returns:
        (生成的文本, 耗时毫秒数)
    """
    started = time.perf_counter()
    answer = provider.generate(prompt, **kwargs)
    return answer, round((time.perf_counter() - started) * 1000)
