import hashlib
import os
import time
import warnings
import numpy      as np
import pypdfium2  as pdfium
import pytesseract
from pathlib   import Path
from threading import Lock
from PIL       import Image, ImageOps
from processing.preprocess import prepare
from processing.fields     import extract

PDF_LOCK = Lock()
Image.MAX_IMAGE_PIXELS = 20_000_000

def read_image(image: Image.Image, timeout: float) -> list[dict]:
    pixels = prepare(np.array(ImageOps.exif_transpose(image).convert("RGB")))
    data = pytesseract.image_to_data(pixels, lang="kor+eng", config="--psm 3", output_type=pytesseract.Output.DICT, timeout=timeout)
    groups = {}
    for index, text in enumerate(data["text"]):
        if not text.strip(): continue
        key = (data["block_num"][index], data["par_num"][index], data["line_num"][index])
        groups.setdefault(key, []).append((text, max(0, float(data["conf"][index])) / 100))
    return [{"text": " ".join(word for word, _ in words), "confidence": sum(score for _, score in words) / len(words)} for words in groups.values()]

def process(storage_key: str, content_type: str, sha256: str) -> dict:
    root = Path(os.environ.get("UPLOAD_DIR", "/app/uploads")).resolve()
    path = (root / storage_key).resolve()
    if not path.is_relative_to(root) or not path.is_file(): raise ValueError("원본 파일을 찾을 수 없습니다.")
    if not 0 < path.stat().st_size <= 20 * 1024 * 1024: raise ValueError("파일 크기를 확인해주세요.")
    if hashlib.sha256(path.read_bytes()).hexdigest() != sha256: raise ValueError("원본 파일이 변경되었습니다.")
    deadline = time.monotonic() + 140
    rows = []

    if content_type == "application/pdf":
        with PDF_LOCK, pdfium.PdfDocument(path) as document:
            if not 1 <= len(document) <= 10: raise ValueError("PDF는 10페이지까지 처리할 수 있습니다.")
            for index in range(len(document)):
                remaining = deadline - time.monotonic()
                if remaining <= 1: raise TimeoutError("문서 처리 시간이 초과되었습니다.")
                page = document[index]
                try:
                    width, height = page.get_size()
                    if min(width, height) <= 0: raise ValueError("PDF 크기가 올바르지 않습니다.")
                    scale = min(2.5, 2400 / max(width, height))
                    bitmap = page.render(scale=scale)
                    try:
                        with bitmap.to_pil() as image:
                            rows.extend(read_image(image, min(30, remaining)))
                    finally: bitmap.close()
                finally: page.close()
    else:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(path) as image:
                if image.format not in ("JPEG", "PNG") or min(image.size) < 3: raise ValueError("이미지 형식을 확인해주세요.")
                if image.width * image.height > 20_000_000: raise ValueError("이미지가 너무 큽니다.")
                rows = read_image(image, 60)

    text = "\n".join(row["text"] for row in rows)
    if not text.strip(): raise ValueError("문자 인식 결과가 없습니다. 더 선명한 파일로 다시 시도해주세요.")
    if len(text) > 100000: raise ValueError("문서의 텍스트가 너무 깁니다.")
    return {"text": text, "fields": extract(rows)}
