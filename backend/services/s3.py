"""
Resume file storage via Supabase Storage (replaces AWS S3).
Bucket name is configured via SUPABASE_STORAGE_BUCKET env var (default: resumes).
"""
from __future__ import annotations

from fastapi import UploadFile
from supabase import create_client, Client

from backend.config import settings

_client: Client | None = None


def _get_client() -> Client:
    global _client
    if _client is None:
        _client = create_client(settings.supabase_url, settings.supabase_service_key)
    return _client


def upload_resume(file: UploadFile, user_id: str) -> str:
    """Upload PDF to Supabase Storage and return a storable reference."""
    data = file.file.read()
    path = f"{user_id}/{file.filename}"
    bucket = settings.supabase_storage_bucket

    _get_client().storage.from_(bucket).upload(
        path=path,
        file=data,
        file_options={"content-type": "application/pdf", "upsert": "true"},
    )
    return f"supabase://{bucket}/{path}"


def get_presigned_url(storage_ref: str, expires: int = 3600) -> str:
    """Return a short-lived signed URL from a supabase:// reference."""
    if not storage_ref.startswith("supabase://"):
        return storage_ref  # legacy plain-URL rows
    _, rest = storage_ref.split("supabase://", 1)
    bucket, path = rest.split("/", 1)
    result = _get_client().storage.from_(bucket).create_signed_url(path, expires)
    return result["signedURL"]
