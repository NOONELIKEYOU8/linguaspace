"""
文本嵌入与相似度计算模块。

本模块提供基于哈希的轻量级文本嵌入方案，用于知识检索的相似度计算。
主要特点：
- 无需外部嵌入模型，使用 SHA256 哈希生成向量
- 支持中英文混合文本的分词
- 使用余弦相似度进行向量比较

适用于资源受限或需要快速部署的场景。
"""
from __future__ import annotations

import hashlib
import math
import re


def tokens(text: str) -> set[str]:
    """
    从文本中提取 token 集合。
    
    分词策略：
    - 英文/数字：提取长度 >= 2 的连续字符
    - 中文：提取所有汉字，生成二元语法（bigram）
    
    Args:
        text: 输入文本
        
    Returns:
        token 集合（包含英文 token 和中文 bigram）
    """
    normalized = re.sub(r"\s+", "", text.lower())
    latin = set(re.findall(r"[a-z0-9_-]{2,}", normalized))
    chinese = "".join(re.findall(r"[\u4e00-\u9fff]", normalized))
    grams = {chinese[index : index + 2] for index in range(max(0, len(chinese) - 1))}
    return latin | grams


def hash_embedding(text: str, dimensions: int = 256) -> list[float]:
    """
    生成文本的哈希嵌入向量。
    
    算法原理：
    1. 对每个 token 计算 SHA256 哈希
    2. 根据哈希值确定向量位置和符号
    3. 对向量进行归一化
    
    Args:
        text: 输入文本
        dimensions: 向量维度，默认 256
        
    Returns:
        归一化后的嵌入向量
    """
    vector = [0.0] * dimensions
    for token in tokens(text):
        digest = hashlib.sha256(token.encode("utf-8")).digest()
        index = int.from_bytes(digest[:4], "big") % dimensions
        vector[index] += -1.0 if digest[4] & 1 else 1.0
    norm = math.sqrt(sum(value * value for value in vector)) or 1.0
    return [value / norm for value in vector]


def cosine(left: list[float], right: list[float]) -> float:
    """
    计算两个向量的余弦相似度。
    
    Args:
        left: 左向量
        right: 右向量
        
    Returns:
        余弦相似度值（范围 [-1, 1]，值越大表示越相似）
    """
    return sum(a * b for a, b in zip(left, right))
