import io
import pdfplumber
import httpx


async def parse_pdf_from_url(url: str) -> str:
    async with httpx.AsyncClient() as client:
        resp = await client.get(url)
        resp.raise_for_status()
    with pdfplumber.open(io.BytesIO(resp.content)) as pdf:
        return "\n".join(page.extract_text() or "" for page in pdf.pages)


def parse_pdf_bytes(data: bytes) -> str:
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        return "\n".join(page.extract_text() or "" for page in pdf.pages)
