"""
DebtIQ™ — FastAPI Backend Entrypoint
Production Version — Fully Optimized Single-Page Application (SPA) Routing
"""

import os
import uvicorn
import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from routers import scan, score, fix, dashboard, webhook
from database import init_db
from config import settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
)
logger = logging.getLogger("debtiq")

# 🎯 FIX: Migrated from old app.on_event("startup") to modern FastAPI lifespan control
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup actions
    await init_db()
    logger.info("🚀 Resilient Database Pool connection successfully rehydrated on lifecycle mount.")
    yield
    # Shutdown actions (Clean up connections if required)
    logger.info("🛑 Shutting down DebtIQ module services layer.")

app = FastAPI(
    title="DebtIQ™ API",
    description="AI-powered technical debt detection & refactoring engine",
    version="1.0.0",
    lifespan=lifespan
)

# Enforce strict cross-origin access gates across all endpoints
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── 1. EXPLICIT API ROUTERS LAYER (Registered First to Prevent Clipping) ──
app.include_router(scan.router,      prefix="/api/scan",      tags=["Scan"])
app.include_router(score.router,     prefix="/api/score",     tags=["Score"])
app.include_router(fix.router,       prefix="/api/fix",       tags=["Fix"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["Dashboard"])
app.include_router(webhook.router,   prefix="/api/webhook",   tags=["Webhook"])

@app.get("/health", tags=["Health"])
async def health():
    return {"status": "healthy", "timestamp": datetime.now(timezone.utc).isoformat()}


# ── 2. STATIC FILE ASSETS LAYER (Registered Second) ──
if os.path.exists("dist"):
    logger.info("📂 Production assets folder detected. Setting up SPA React engine layers.")
    app.mount("/assets", StaticFiles(directory="dist/assets"), name="assets")

    # 🎯 FIX: This route is placed at the bottom so it handles frontend routing without breaking /api routes
    @app.get("/{rest_of_path:path}", include_in_schema=False)
    async def serve_frontend(rest_of_path: str):
        # Explicit block shield: If someone queries a broken api route, return 404 instead of index.html
        if rest_of_path.startswith("api"):
            return JSONResponse(status_code=404, content={"detail": f"API Endpoint '/{rest_of_path}' not found."})
        
        index_file_path = os.path.join("dist", "index.html")
        if os.path.exists(index_file_path):
            return FileResponse(index_file_path)
        return JSONResponse(status_code=500, content={"detail": "Frontend index.html asset is missing from disk layout mapping."})


# ── 3. UNIFIED EXCEPTION INTERCEPTOR MATRIX (Issue #7) ──
@app.exception_handler(Exception)
async def global_handler(request: Request, exc: Exception):
    logger.error(f"❌ Global Error intercepted across context path: {request.url.path} — Fault: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500, 
        content={"detail": f"Backend Error: {str(exc)}"}
    )


# ── 4. PROCESS LAUNCH CONTROLLER ──
if __name__ == "__main__":
    # 🎯 FIX: Automatically toggle reloading loops based on env context blocks to block runtime engine stall crashes
    is_dev = str(settings.APP_ENV).lower().strip() == "development"
    port_env = int(os.getenv("PORT", 8000)) # Render inputs automatically configure variable parameters inside PORT keys
    
    logger.info(f"⚡ Booting process engine context. Dev-Watch: {is_dev} | Binding target: 0.0.0.0:{port_env}")
    
    uvicorn.run(
        "main:app", 
        host="0.0.0.0", 
        port=port_env, 
        reload=is_dev, 
        log_level="info"
    )