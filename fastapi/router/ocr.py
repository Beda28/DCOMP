import logging
from fastapi  import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from typing   import Literal
from processing.ocr import process

router = APIRouter(prefix="/internal")
logger = logging.getLogger(__name__)

class OcrRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    storageKey: str = Field(pattern=r"^\d+/[a-f0-9-]{36}$")
    contentType: Literal["image/png", "image/jpeg", "application/pdf"]
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")

class OcrResponse(BaseModel):
    text: str
    fields: dict[str, str | None]

@router.post("/ocr", response_model=OcrResponse)
def ocr(request: OcrRequest) -> dict:
    try: return process(request.storageKey, request.contentType, request.sha256)
    except (ValueError, OSError) as error:
        raise HTTPException(status_code=422, detail="문서 파일을 읽을 수 없습니다.") from error
    except Exception as error:
        logger.exception("문서 처리 오류")
        raise HTTPException(status_code=503, detail="문서 처리에 실패했습니다.") from error
