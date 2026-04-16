from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.routes.data import router as data_router


BASE_DIR = Path(__file__).resolve().parents[2]
FRONTEND_DIST_DIR = BASE_DIR / "frontend" / "dist"


app = FastAPI(
    title="Smart Data Cleaner API",
    version="0.1.0",
    description="Dataset profiling, cleaning, transformation, and export API.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(data_router, prefix="/api")

if FRONTEND_DIST_DIR.exists():
    assets_dir = FRONTEND_DIST_DIR / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/{full_path:path}")
def serve_frontend(full_path: str):
    if not FRONTEND_DIST_DIR.exists():
        return JSONResponse(
            status_code=503,
            content={
                "detail": "Frontend build not found. Run `npm install` and `npm run build` inside the frontend folder."
            },
        )

    requested_path = (FRONTEND_DIST_DIR / full_path).resolve()
    if full_path and requested_path.exists() and requested_path.is_file() and FRONTEND_DIST_DIR in requested_path.parents:
        return FileResponse(requested_path)

    index_file = FRONTEND_DIST_DIR / "index.html"
    return FileResponse(index_file)
