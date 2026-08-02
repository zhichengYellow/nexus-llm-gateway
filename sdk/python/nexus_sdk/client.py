"""
Nexus LLM Gateway Python SDK Client
"""
from dataclasses import dataclass, field
from typing import Optional, List, AsyncIterator
import json
import urllib.request
import urllib.error


@dataclass
class ChatResponse:
    id: str = ""
    content: str = ""
    model: str = ""
    provider: str = "unknown"
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    cached: bool = False
    request_id: str = ""


class NexusError(Exception):
    def __init__(self, message: str, status: int = 0, error_type: str = "unknown"):
        super().__init__(message)
        self.status = status
        self.type = error_type


class NexusClient:
    def __init__(self, base_url: str, api_key: str, timeout: int = 30):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout

    @property
    def _headers(self) -> dict:
        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }

    def _fetch(self, path: str, body: Optional[dict] = None) -> dict:
        url = f"{self.base_url}{path}"
        data = json.dumps(body).encode("utf-8") if body else None
        req = urllib.request.Request(
            url,
            data=data,
            headers=self._headers,
            method="POST" if body else "GET",
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                result = json.loads(resp.read().decode("utf-8"))
                return result
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8")
            try:
                err = json.loads(body)
                raise NexusError(
                    err.get("error", {}).get("message", str(e)),
                    e.code,
                    err.get("error", {}).get("type", "unknown"),
                )
            except json.JSONDecodeError:
                raise NexusError(str(e), e.code)

    def chat(
        self,
        prompt: str,
        model: str = "deepseek-v4-flash",
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        system_prompt: Optional[str] = None,
    ) -> ChatResponse:
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        body = {"model": model, "messages": messages, "stream": False}
        if temperature is not None:
            body["temperature"] = temperature
        if max_tokens is not None:
            body["max_tokens"] = max_tokens

        data = self._fetch("/v1/chat/completions", body)
        nexus = data.get("nexus", {})
        usage = data.get("usage", {})

        return ChatResponse(
            id=data.get("id", ""),
            content=data.get("choices", [{}])[0].get("message", {}).get("content", ""),
            model=data.get("model", ""),
            provider=nexus.get("provider", "unknown"),
            prompt_tokens=usage.get("prompt_tokens", 0),
            completion_tokens=usage.get("completion_tokens", 0),
            total_tokens=usage.get("total_tokens", 0),
            cached=nexus.get("cached", False),
            request_id=nexus.get("requestId", ""),
        )

    def list_models(self) -> List[dict]:
        data = self._fetch("/v1/models")
        return [
            {"id": m.get("id"), "owned_by": m.get("owned_by")}
            for m in data.get("data", [])
        ]

    def health(self) -> dict:
        return self._fetch("/health")
