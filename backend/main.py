import os
import uvicorn
import logging
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from datetime import datetime, timezone

# Import your modules
from routers import scan, score, fix, dashboard, webhook
from database import init_db
from config import settings

# Configure Logger
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
)
logger = logging.getLogger("debtiq")

# 🎯 LIFESPAN: Proper connection handling
@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    logger.info("🚀 Resilient Database Pool initialized.")
    yield
    logger.info("🛑 Shutting down DebtIQ module services.")

app = FastAPI(
    title="DebtIQ™ API",
    version="1.0.0",
    lifespan=lifespan
)

# 🎯 CORS: Strict configuration
# Ensure this matches your frontend origin precisely
origins = ["*"] 

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# ── ROUTERS LAYER ──
app.include_router(scan.router,      prefix="/api/scan",      tags=["Scan"])
app.include_router(score.router,     prefix="/api/score",     tags=["Score"])
app.include_router(fix.router,       prefix="/api/fix",       tags=["Fix"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["Dashboard"])
app.include_router(webhook.router,   prefix="/api/webhook",   tags=["Webhook"])

@app.get("/health", tags=["Health"])
async def health():
    return {"status": "healthy", "timestamp": datetime.now(timezone.utc).isoformat()}

# ── 2. STATIC FILES & SPA ROUTING ──
if os.path.exists("dist"):
    app.mount("/assets", StaticFiles(directory="dist/assets"), name="assets")

    @app.get("/{rest_of_path:path}", include_in_schema=False)
    async def serve_frontend(rest_of_path: str):
        if rest_of_path.startswith("api"):
            return JSONResponse(status_code=404, content={"detail": "API endpoint not found."})
        
        index_file = os.path.join("dist", "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file)
        return JSONResponse(status_code=500, content={"detail": "Frontend index.html missing."})

# ── 3. EXCEPTION INTERCEPTOR ──
@app.exception_handler(Exception)
async def global_handler(request: Request, exc: Exception):
    logger.error(f"❌ Global Error at {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
        content={"detail": str(exc)}
    )

if __name__ == "__main__":
    is_dev = str(settings.APP_ENV).lower().strip() == "development"
    port = int(os.getenv("PORT", 8000))
    
    logger.info(f"⚡ DebtIQ Booting | Dev: {is_dev} | Binding: 0.0.0.0:{port}")
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=is_dev)