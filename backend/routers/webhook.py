"""
DebtIQ™ — /api/webhook router
Production Version — Cryptographic verification and secure non-blocking background runners.
"""

from fastapi import APIRouter, Request, Header, HTTPException, BackgroundTasks
from services.github_service import get_repo_files, post_pr_comment
# 🎯 FIX: Import directly from routers.scan to match your project architecture
from routers.scan import process_single_file
from services.ai_service import _level
from database import save_scan
from config import settings
import hmac
import hashlib
import asyncio
import logging
import time
from datetime import datetime, timezone

router = APIRouter()
logger = logging.getLogger("debtiq.webhook")


def verify_signature(payload: bytes, signature: str) -> bool:
    """Verifies that the incoming webhook signature matches the local secret hash validation key."""
    if not settings.GITHUB_WEBHOOK_SECRET or settings.GITHUB_WEBHOOK_SECRET == "your-webhook-secret":
        # Bypassed if unconfigured in local development environment settings
        return True
    if not signature:
        return False
        
    # Compute HMAC hex digest using SHA256 match tokens
    secret = settings.GITHUB_WEBHOOK_SECRET.encode("utf-8")
    computed = "sha256=" + hmac.new(secret, payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(computed, signature)


async def execute_async_pr_scan(payload: dict):
    """Background worker task to execute repo scans and post feedback back onto GitHub PR branches."""
    try:
        action = payload.get("action")
        # Only analyze pull request events when opened, synchronized, or reopened
        if action not in ["opened", "synchronize", "reopened"]:
            return

        pr_data = payload.get("pull_request", {})
        pr_number = payload.get("number")
        repo_data = payload.get("repository", {})
        repo_full_name = repo_data.get("full_name")
        branch = pr_data.get("head", {}).get("ref", "main")

        logger.info(f"⚓ Webhook PR Scan Worker spawned for {repo_full_name} PR #{pr_number}")
        t0 = time.perf_counter()

        # 1. Fetch targeted delta branch file tree matrices concurrently
        files = await get_repo_files(repo_full_name, branch, token=settings.GITHUB_TOKEN, max_files=30)
        if not files:
            logger.warning(f"No code files detected for background scanning module on {repo_full_name}")
            return

        # 2. Run file scans in parallel over async engines
        # Imports process loops inside execution scopes dynamically to dodge circular dependencies
        from routers.scan import process_single_file
        scores = await asyncio.gather(*(process_single_file(f) for f in files))

        # 3. Calculate telemetry metrics configurations
        total_loc = sum(s.lines_of_code for s in scores) or 1
        overall = round(sum(s.score * s.lines_of_code for s in scores) / total_loc)
        level_str = _level(overall)

        # 4. Push automated health check comments back to GitHub PR timeline
        comment_success = await post_pr_comment(
            repo=repo_full_name,
            pr_number=pr_number,
            score=overall,
            level=level_str,
            file_scores=[s.model_dump() for s in scores],
            token=settings.GITHUB_TOKEN
        )
        
        # 5. Commit report metrics rows securely to PostgreSQL instance
        db_payload = {
            "repo_full_name": repo_full_name,
            "branch": branch,
            "overall_score": overall,
            "debt_level": level_str,
            "total_files": len(files),
            "critical_count": sum(1 for s in scores if "critical" in str(s.debt_level).lower()),
            "major_count": sum(1 for s in scores if "major" in str(s.debt_level).lower()),
            "minor_count": sum(1 for s in scores if "minor" in str(s.debt_level).lower()),
            "healthy_count": sum(1 for s in scores if "healthy" in str(s.debt_level).lower()),
            "scan_duration_seconds": round(time.perf_counter() - t0, 2),
            "file_scores": [s.model_dump() for s in scores]
        }
        await save_scan(db_payload)
        logger.info(f"🎯 Webhook PR Engine complete for PR #{pr_number}. Posted to GitHub: {comment_success}")

    except Exception as background_err:
        logger.error(f"Background webhook thread processor execution error: {background_err}", exc_info=True)


@router.post("/")
async def github_webhook_receiver(
    request: Request,
    background_tasks: BackgroundTasks,
    x_hub_signature_256: str = Header(None)
):
    """Listens for GitHub tracking events and handles them inside a decoupled thread block pool."""
    body_bytes = await request.body()
    
    # 🎯 FIX: Security token validation safeguard verification
    if not verify_signature(body_bytes, x_hub_signature_256):
        logger.warning("❌ Webhook intercept signature validation mismatch token rejected.")
        raise HTTPException(status_code=401, detail="Invalid hash signature token validation verification.")

    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload structure configuration.")

    # Detect event execution vectors
    event_type = request.headers.get("X-GitHub-Event", "ping")
    if event_type == "ping":
        return {"message": "⚡ Connection handshake initialized optimally."}

    if event_type == "pull_request":
        # 🎯 FIX: Offload task processing to background workers so the webhook returns an immediate 202 to GitHub
        background_tasks.add_task(execute_async_pr_scan, payload)
        return {"status": "queued", "detail": "Pull Request telemetry pipeline worker queued in background thread block successfully."}

    return {"status": "ignored", "detail": f"Event hook type '{event_type}' bypassed cleanly."}