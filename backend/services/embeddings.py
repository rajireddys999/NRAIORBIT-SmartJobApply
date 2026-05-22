"""
Local embeddings using sentence-transformers (all-MiniLM-L6-v2).
No API key required. Model is downloaded once and cached on first use.
Produces 384-dim vectors — same cosine-similarity math as OpenAI embeddings.
"""
import asyncio
from functools import lru_cache

from sentence_transformers import SentenceTransformer

_MODEL_NAME = "all-MiniLM-L6-v2"


@lru_cache(maxsize=1)
def _get_model() -> SentenceTransformer:
    return SentenceTransformer(_MODEL_NAME)


def _embed_sync(texts: list[str]) -> list[list[float]]:
    model = _get_model()
    vectors = model.encode(texts, convert_to_numpy=True, normalize_embeddings=True)
    return [v.tolist() for v in vectors]


async def embed(text: str) -> list[float]:
    text = text.replace("\n", " ")[:8000]
    loop = asyncio.get_event_loop()
    results = await loop.run_in_executor(None, _embed_sync, [text])
    return results[0]


async def embed_batch(texts: list[str]) -> list[list[float]]:
    cleaned = [t.replace("\n", " ")[:8000] for t in texts]
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _embed_sync, cleaned)
