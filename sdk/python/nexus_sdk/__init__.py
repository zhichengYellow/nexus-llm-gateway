"""
Nexus LLM Gateway - Python SDK

用法:
    from nexus_sdk import NexusClient
    client = NexusClient(base_url="http://localhost:8787", api_key="sk-...")
    resp = client.chat("deepseek-v4-flash", "你好")
    print(resp.content)
"""
from .client import NexusClient, NexusError, ChatResponse

__version__ = "0.1.0"
__all__ = ["NexusClient", "NexusError", "ChatResponse"]
