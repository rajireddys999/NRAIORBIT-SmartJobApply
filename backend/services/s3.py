"""
Resume file storage via Supabase Storage (replaces AWS S3).
Bucket name is configured via SUPABASE_STORAGE_BUCKET env var (default: resumes).
"""
from __future__ import annotations

from supabase import create_client, Client

from backend.config import settings

_client: Client | None = None


def _get_client() -> Client:
    global _client
    if _client is None:
        _client = create_client(settings.supabase_url, settings.supabase_service_key)
    return _client


def upload_resume(data: bytes, filename: str, user_id: str) -> str:
    """Upload PDF bytes to Supabase Storage and return a storable reference."""
    path = f"{user_id}/{filename}"
    bucket = settings.supabase_storage_bucket

    client = _get_client()
    existing = [b.name for b in client.storage.list_buckets()]
    if bucket not in existing:
        client.storage.create_bucket(bucket, options={"public": False})

    client.storage.from_(bucket).upload(
        path=path,
        file=data,
        file_options={"content-type": "application/pdf", "upsert": "true"},
    )
    return f"supabase://{bucket}/{path}"


def get_resume_bytes(storage_ref: str) -> tuple[bytes, str]:
    """Download resume bytes and return (bytes, filename). Raises if unavailable."""
    if storage_ref.startswith("supabase://"):
        _, rest = storage_ref.split("supabase://", 1)
        bucket, path = rest.split("/", 1)
        data = _get_client().storage.from_(bucket).download(path)
        filename = path.rsplit("/", 1)[-1]
        return data, filename
    if storage_ref.startswith("local://"):
        raise RuntimeError("Resume stored locally — Supabase not configured")
    raise RuntimeError(f"Unknown storage scheme: {storage_ref}")


def get_presigned_url(storage_ref: str, expires: int = 3600) -> str:
    """Return a short-lived signed URL from a supabase:// reference. Returns '' on failure."""
    if not storage_ref or storage_ref.startswith("local://"):
        return ""  # resume stored locally — no viewable URL
    if not storage_ref.startswith("supabase://"):
        return storage_ref  # already a plain https:// URL
    _, rest = storage_ref.split("supabase://", 1)
    bucket, path = rest.split("/", 1)
    try:
        result = _get_client().storage.from_(bucket).create_signed_url(path, expires)
        return result.get("signedURL") or ""
    except Exception:
        return ""
