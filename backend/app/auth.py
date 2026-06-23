"""
身份认证模块。

本模块提供基于 HMAC 的简单令牌认证机制。
主要功能：
- 生成用户认证令牌
- 验证令牌有效性
- 令牌过期检查

注意：这是一个简化的认证实现，适用于开发和演示环境。
生产环境建议使用更安全的 JWT 库。
"""
from __future__ import annotations

import base64
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import json

from .config import settings


def _encode(data: bytes) -> str:
    """将字节数据编码为 URL 安全的 Base64 字符串。"""
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _decode(data: str) -> bytes:
    """将 URL 安全的 Base64 字符串解码为字节数据。"""
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def issue_token(user: dict) -> str:
    """
    生成用户认证令牌。
    
    令牌格式：{payload}.{signature}
    - payload: Base64 编码的 JSON 数据（包含用户ID、角色、过期时间）
    - signature: HMAC-SHA256 签名
    
    Args:
        user: 用户信息字典，需包含 'id' 和 'role' 字段
        
    Returns:
        认证令牌字符串
    """
    payload = {
        "sub": user["id"],
        "role": user["role"],
        "exp": int((datetime.now(timezone.utc) + timedelta(hours=12)).timestamp()),
    }
    encoded = _encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signature = hmac.new(settings.app_secret.encode("utf-8"), encoded.encode("ascii"), hashlib.sha256).digest()
    return f"{encoded}.{_encode(signature)}"


def verify_token(token: str) -> dict:
    """
    验证并解析认证令牌。
    
    验证步骤：
    1. 检查签名是否正确
    2. 检查令牌是否过期
    
    Args:
        token: 认证令牌字符串
        
    Returns:
        解析后的 payload 数据（包含用户ID、角色等）
        
    Raises:
        ValueError: 如果签名无效或令牌已过期
    """
    encoded, signature = token.split(".", 1)
    expected = hmac.new(settings.app_secret.encode("utf-8"), encoded.encode("ascii"), hashlib.sha256).digest()
    if not hmac.compare_digest(expected, _decode(signature)):
        raise ValueError("invalid signature")
    payload = json.loads(_decode(encoded))
    if payload["exp"] < int(datetime.now(timezone.utc).timestamp()):
        raise ValueError("expired token")
    return payload
