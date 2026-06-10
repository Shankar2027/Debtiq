"""
DebtIQ™ — /api/dashboard router
Production Version — Resilient aggregation pipelines with schema-safe fallbacks.
"""

from fastapi import APIRouter, HTTPException
from database import get_dashboard, get_history
import logging

router = APIRouter()
logger = logging.getLogger("debtiq.dashboard")

@router.get("/stats/{owner}")
async def stats(owner: str):
    """Aggregate high-level metrics for all active repositories matching an owner."""
    clean_owner = str(owner).strip()
    logger.info(f"📊 Aggregating telemetry dashboard parameters for owner context: {clean_owner}")
    
    try:
        repos = await get_dashboard(clean_owner)
    except Exception as db_err:
        logger.error(f"Failed to fetch dashboard metrics data for {clean_owner}: {db_err}")
        raise HTTPException(status_code=500, detail=f"Database aggregation fault: {str(db_err)}")
        
    if not repos:
        return {
            "owner": clean_owner, 
            "total_repos": 0, 
            "avg_score": 0.0,
            "total_files": 0, 
            "critical_files": 0, 
            "repos": [], 
            "trend": []
        }
    
    try:
        # Calculate dynamic metrics safely across the returned dataset
        total_repos = len(repos)
        total_files = sum(int(r.get("total_files", 0) or 0) for r in repos)
        
        # Calculate individual critical segment tags across rehydrated repository lists
        critical_files = sum(int(r.get("critical_count", 0) or 0) for r in repos)
        
        # 🎯 FIX: Protected against accidental type drift or empty records throwing ZeroDivisionError
        total_scores = sum(int(r.get("overall_score", 0) or 0) for r in repos)
        avg = round(total_scores / total_repos, 1) if total_repos > 0 else 0.0
        
        return {
            "owner": clean_owner, 
            "total_repos": total_repos,
            "avg_score": avg, 
            "total_files": total_files,
            "critical_files": critical_files,
            "repos": repos
        }
    except Exception as calc_err:
        logger.error(f"Metrics computation fault on dashboard calculation layer: {calc_err}")
        raise HTTPException(status_code=500, detail="Data layer processing fault during metrics computation.")

@router.get("/history/{owner}/{repo}")
async def history(owner: str, repo: str):
    """Fetch tracking logs for a specific repository asset index."""
    target_path = f"{owner.strip()}/{repo.strip()}"
    logger.info(f"📜 Pulling historical analytics snapshots for path context: {target_path}")
    
    try:
        history_data = await get_history(target_path)
        return {"history": history_data or []}
    except Exception as history_err:
        logger.error(f"Failed to resolve history timeline matrix for {target_path}: {history_err}")
        return {"history": []}