from fastapi       import FastAPI
from router.health import router as health

app = FastAPI(title="DCOMP Processing", docs_url=None, redoc_url=None, openapi_url=None)
app.include_router(health)
