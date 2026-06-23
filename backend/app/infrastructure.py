"""
基础设施适配器模块。

本模块提供与外部基础设施服务的连接适配器，包括：
- CacheAdapter: Redis 缓存服务
- ObjectStorageAdapter: MinIO 对象存储服务
- GraphMirrorAdapter: Neo4j 图数据库服务

这些适配器封装了底层服务的连接逻辑，提供统一的接口。
"""
from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any

from .config import settings


class CacheAdapter:
    """Redis 缓存适配器，提供键值缓存功能。"""
    
    def __init__(self) -> None:
        """初始化 Redis 连接。"""
        import redis

        self.client = redis.from_url("redis://127.0.0.1:6379/0", socket_connect_timeout=3)
        self.client.ping()

    @property
    def backend(self) -> str:
        """返回后端类型标识。"""
        return "redis"

    def get(self, key: str) -> Any | None:
        """
        从缓存获取值。
        
        Args:
            key: 缓存键
            
        Returns:
            缓存值（JSON 解析后），不存在则返回 None
        """
        raw = self.client.get(key)
        return json.loads(raw) if raw else None

    def set(self, key: str, value: Any, ttl: int = 600) -> None:
        """
        设置缓存值。
        
        Args:
            key: 缓存键
            value: 缓存值（将被 JSON 序列化）
            ttl: 过期时间（秒），默认 600 秒
        """
        self.client.setex(key, ttl, json.dumps(value, ensure_ascii=False))


class ObjectStorageAdapter:
    """MinIO 对象存储适配器，提供文件存储功能。"""
    
    def __init__(self) -> None:
        """初始化 MinIO 连接并确保 bucket 存在。"""
        from minio import Minio
        from urllib3 import PoolManager, Timeout

        http_client = PoolManager(timeout=Timeout(connect=3, read=3), retries=False)
        self.client = Minio("127.0.0.1:9000", access_key="linguaspace", secret_key="linguaspace-local", secure=False, http_client=http_client)
        if not self.client.bucket_exists("linguaspace"):
            self.client.make_bucket("linguaspace")

    @property
    def backend(self) -> str:
        """返回后端类型标识。"""
        return "minio"

    def save(self, category: str, filename: str, content: bytes) -> dict[str, str]:
        """
        保存文件到对象存储。
        
        文件会同时保存到本地媒体目录和 MinIO。
        
        Args:
            category: 文件分类（如 'audio', 'image'）
            filename: 原始文件名
            content: 文件内容（字节）
            
        Returns:
            包含 URL、本地路径和后端类型的字典
        """
        from io import BytesIO

        safe_name = f"{category}-{uuid.uuid4().hex}{Path(filename).suffix}"
        path = settings.media_dir / safe_name
        path.write_bytes(content)
        object_name = f"{category}/{safe_name}"
        self.client.put_object("linguaspace", object_name, BytesIO(content), len(content))
        return {"url": f"minio://linguaspace/{object_name}", "local_path": str(path), "backend": self.backend}


class GraphMirrorAdapter:
    """Neo4j 图数据库适配器，提供知识图谱存储功能。"""
    
    def __init__(self) -> None:
        """初始化 Neo4j 连接。"""
        from neo4j import GraphDatabase

        self.driver = GraphDatabase.driver("bolt://127.0.0.1:7687", auth=("neo4j", "linguaspace"), connection_timeout=3)
        self.driver.verify_connectivity()

    @property
    def backend(self) -> str:
        """返回后端类型标识。"""
        return "neo4j"

    def upsert(self, source: str, relation: str, target: str) -> None:
        """
        创建或更新图关系。
        
        使用 MERGE 语句确保节点和关系存在。
        
        Args:
            source: 源实体名称
            relation: 关系类型
            target: 目标实体名称
        """
        with self.driver.session() as session:
            session.run("MERGE (a:CultureEntity {name: $source}) MERGE (b:CultureEntity {name: $target}) MERGE (a)-[r:RELATED {type: $relation}]->(b)", source=source, target=target, relation=relation)

# 全局适配器实例
cache = CacheAdapter()
objects = ObjectStorageAdapter()
graph_mirror = GraphMirrorAdapter()
