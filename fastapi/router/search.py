from fastapi  import APIRouter
from pydantic import BaseModel, ConfigDict, Field
from processing.search import search as rank

router = APIRouter(prefix="/internal")

class SearchDocument(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: int = Field(gt=0)
    text: str = Field(max_length=101000)

class SearchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    query: str = Field(min_length=1, max_length=160)
    documents: list[SearchDocument] = Field(max_length=5000)
    page: int = Field(default=1, ge=1, le=1000000)
    limit: int = Field(default=20, ge=1, le=100)

class SearchHit(BaseModel):
    id: int
    score: float
    snippet: str

class SearchResponse(BaseModel):
    data: list[SearchHit]
    total: int

@router.post("/search", response_model=SearchResponse)
def search(request: SearchRequest) -> dict:
    return rank(request.query, [document.model_dump() for document in request.documents], request.page, request.limit)
