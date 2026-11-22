from fastapi       import FastAPI
from router.health import router as health
from router.ocr    import router as ocr

app = FastAPI(title="DCOMP Processing", docs_url=None, redoc_url=None, openapi_url=None)
app.include_router(health)
app.include_router(ocr)
