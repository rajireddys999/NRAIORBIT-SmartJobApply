from openai import AsyncOpenAI

from backend.config import settings

_client = AsyncOpenAI(api_key=settings.openai_api_key)
_MODEL = "text-embedding-3-small"  # 1536 dims, cheap, fast


async def embed(text: str) -> list[float]:
    text = text.replace("\n", " ")[:8000]
    response = await _client.embeddings.create(input=[text], model=_MODEL)
    return response.data[0].embedding


async def embed_batch(texts: list[str]) -> list[list[float]]:
    cleaned = [t.replace("\n", " ")[:8000] for t in texts]
    response = await _client.embeddings.create(input=cleaned, model=_MODEL)
    return [item.embedding for item in response.data]
