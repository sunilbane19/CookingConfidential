import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

app = FastAPI(title="Cooking Confidential DOC Converter", version="0.1.0")
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(20 * 1024 * 1024)))
CONVERSION_TIMEOUT_SECONDS = int(os.getenv("CONVERSION_TIMEOUT_SECONDS", "45"))
CONVERTER_API_KEY = os.getenv("CONVERTER_API_KEY", "").strip()

@app.get("/health")
def health():
    return {"ok": True, "service": "cc-doc-converter"}

def safe_stem(filename: str) -> str:
    stem = Path(filename or "upload.doc").stem
    stem = re.sub(r"[^A-Za-z0-9._-]+", "_", stem).strip("._-")
    return (stem or "upload")[:100]

@app.post("/convert/doc-to-docx")
async def convert_doc_to_docx(
    file: UploadFile = File(...),
    authorization: str | None = Header(default=None),
):
    # Do not expose a public unauthenticated document-conversion endpoint.
    if not CONVERTER_API_KEY:
        raise HTTPException(status_code=503, detail="Conversion service is not configured.")
    if authorization != f"Bearer {CONVERTER_API_KEY}":
        raise HTTPException(status_code=401, detail="Unauthorized.")

    filename = file.filename or ""
    if Path(filename).suffix.lower() != ".doc":
        raise HTTPException(status_code=415, detail="Please upload a legacy Word .doc file.")
    if not shutil.which("libreoffice"):
        raise HTTPException(status_code=503, detail="Conversion engine is unavailable.")

    work = tempfile.mkdtemp(prefix="cc-doc-")
    try:
        input_path = Path(work) / "input.doc"
        output_dir = Path(work) / "out"
        profile_dir = Path(work) / "lo-profile"
        output_dir.mkdir()
        total = 0
        with input_path.open("wb") as dst:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > MAX_UPLOAD_BYTES:
                    raise HTTPException(status_code=413, detail="File exceeds the 20 MB conversion limit.")
                dst.write(chunk)

        if total == 0:
            raise HTTPException(status_code=400, detail="The uploaded file is empty.")

        command = [
            "libreoffice", "--headless", "--invisible", "--nodefault",
            "--nofirststartwizard", "--nolockcheck", "--nologo", "--norestore",
            f"-env:UserInstallation=file://{profile_dir}",
            "--convert-to", "docx:Office Open XML Text", "--outdir",
            str(output_dir), str(input_path),
        ]
        try:
            result = subprocess.run(
                command, capture_output=True, text=True,
                timeout=CONVERSION_TIMEOUT_SECONDS, check=False,
            )
        except subprocess.TimeoutExpired:
            raise HTTPException(status_code=408, detail="Word conversion timed out. Try a smaller document.")
        output_path = output_dir / "input.docx"
        if result.returncode != 0 or not output_path.is_file() or output_path.stat().st_size == 0:
            raise HTTPException(status_code=422, detail="This .doc file could not be converted. It may be damaged or password-protected.")

        return FileResponse(
            output_path,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            filename=f"{safe_stem(filename)}.docx",
            background=BackgroundTask(shutil.rmtree, work, ignore_errors=True),
        )
    except Exception:
        # FileResponse owns the temp directory only on successful return.
        shutil.rmtree(work, ignore_errors=True)
        raise
    finally:
        await file.close()
