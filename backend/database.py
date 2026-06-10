"""
DebtIQ™ — Advanced Cloud PostgreSQL Database Layer
Optimized: Flattened N+1 query structures using atomic Postgres JSON aggregations.
"""

import os
import json
import logging
import asyncio
from typing import Optional
import asyncpg
from config import settings

logger = logging.getLogger("debtiq.db")

_pool: Optional[asyncpg.Pool] = None

async def init_db(retries=3):
    """Initializes a resilient connection pool with retrial logic."""
    global _pool
    db_url = getattr(settings, "DATABASE_URL", None) or os.getenv("DATABASE_URL")
    
    if not db_url:
        logger.critical("DATABASE_URL variable could not be resolved from config or environment.")
        return

    for attempt in range(retries):
        try:
            _pool = await asyncpg.create_pool(
                dsn=db_url,
                min_size=2,
                max_size=10,
                max_queries=500,
                timeout=30.0
            )
            logger.info("🚀 Resilient Cloud DB connection pool initialized successfully.")
            return
        except Exception as e:
            logger.warning(f"Database connection attempt {attempt + 1} failed: {e}")
            await asyncio.sleep(2)
    
    logger.critical("❌ Database pool initialization fatal error after retries.")

async def get_pool():
    """Helper to ensure we always return an active pool."""
    global _pool
    if _pool is None:
        await init_db()
    return _pool

async def save_scan(doc: dict) -> dict:
    """Saves a completed telemetry report using an atomic relational transaction block."""
    pool = await get_pool()
    if pool is None:
        logger.warning("⚠️ DB pool uninitialized. Bypassing data persistence.")
        return doc
        
    try:
        repo_name = doc.get("repo_full_name", "")
        owner = repo_name.split("/")[0] if "/" in repo_name else "Unknown"
        
        async with pool.acquire() as conn:
            async with conn.transaction():
                # 1. Insert Master Scan Analytics Header row profile
                scan_id = await conn.fetchval("""
                    INSERT INTO public.scans (
                        repo_full_name, owner, branch, overall_score, debt_level,
                        total_files, critical_count, major_count, minor_count, 
                        healthy_count, scan_duration_seconds
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                    RETURNING id;
                """,
                repo_name, owner, doc.get("branch", "main"),
                int(doc.get("overall_score", 100)), doc.get("debt_level", "healthy"),
                int(doc.get("total_files", 0)), int(doc.get("critical_count", 0)),
                int(doc.get("major_count", 0)), int(doc.get("minor_count", 0)),
                int(doc.get("healthy_count", 0)), float(doc.get("scan_duration_seconds", 0.0))
                )
                
                # 2. Bulk Insert File breakdown logs under parent transaction scope
                file_scores = doc.get("file_scores", [])
                if file_scores:
                    file_records = [
                        (
                            scan_id,
                            f.get("file_path"),
                            int(f.get("score", 100)),
                            f.get("debt_level", "healthy"),
                            f.get("language", "unknown"),
                            int(f.get("lines_of_code", 0)),
                            json.dumps(f.get("problems", []))
                        )
                        for f in file_scores
                    ]
                    
                    await conn.executemany("""
                        INSERT INTO public.file_scores (
                            scan_id, file_path, score, debt_level, language, lines_of_code, problems
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7);
                    """, file_records)
                    
        logger.info(f"✅ Relational transaction completed successfully for id: {scan_id}")
        return doc
    except Exception as e:
        logger.error(f"❌ Transaction rolled back. save_scan operational fault: {e}")
        return doc

async def get_history(repo_full_name: str, limit: int = 30) -> list:
    """Fetches historical telemetry trends matching a specific repository tracking index."""
    pool = await get_pool()
    if pool is None: return []
    try:
        async with pool.acquire() as conn:
            # 🎯 UPGRADED: Pulls parent metrics and pre-hydrates file_scores in a single atomic database query
            rows = await conn.fetch("""
                SELECT s.id, s.overall_score, s.debt_level, s.total_files, s.critical_count, 
                       s.major_count, s.minor_count, s.healthy_count, s.scan_duration_seconds, s.scanned_at,
                       COALESCE(
                           (SELECT json_agg(json_build_object(
                               'file_path', f.file_path,
                               'score', f.score,
                               'debt_level', f.debt_level,
                               'language', f.language,
                               'lines_of_code', f.lines_of_code,
                               'problems', f.problems
                           ))
                            FROM public.file_scores f
                            WHERE f.scan_id = s.id), '[]'::json
                       ) as file_scores
                FROM public.scans s
                WHERE s.repo_full_name = $1
                ORDER BY s.scanned_at DESC
                LIMIT $2;
            """, repo_full_name, limit)
            
            result_list = []
            for r in rows:
                d = dict(r)
                # Parse out the pre-aggregated JSON field string array matching frontend formats cleanly
                if isinstance(d["file_scores"], str):
                    d["file_scores"] = json.loads(d["file_scores"])
                result_list.append(d)
            return result_list
    except Exception as e:
        logger.error(f"get_history error: {e}")
        return []

async def get_dashboard(owner: str) -> list:
    """Aggregates full organization metrics profiles using single-trip JSON aggregation."""
    pool = await get_pool()
    if pool is None: return []
    try:
        async with pool.acquire() as conn:
            # 🎯 UPGRADED: Completely eliminated the N+1 loop via PostgreSQL inner aggregation window blocks
            rows = await conn.fetch("""
                WITH latest_scans AS (
                    SELECT DISTINCT ON (repo_full_name) 
                           id, repo_full_name, overall_score, debt_level, total_files, scanned_at
                    FROM public.scans
                    WHERE owner = $1
                    ORDER BY repo_full_name, scanned_at DESC
                    LIMIT 100
                )
                SELECT s.*, 
                       COALESCE(
                           (SELECT json_agg(json_build_object(
                               'file_path', f.file_path,
                               'score', f.score,
                               'debt_level', f.debt_level,
                               'language', f.language,
                               'lines_of_code', f.lines_of_code,
                               'problems', f.problems
                           ))
                            FROM public.file_scores f
                            WHERE f.scan_id = s.id), '[]'::json
                       ) as file_scores
                FROM latest_scans s
                ORDER BY s.scanned_at DESC;
            """, owner)
            
            scan_list = []
            for r in rows:
                scan_dict = dict(r)
                if isinstance(scan_dict["file_scores"], str):
                    scan_dict["file_scores"] = json.loads(scan_dict["file_scores"])
                scan_list.append(scan_dict)
                
            return scan_list
    except Exception as e:
        logger.error(f"get_dashboard pipeline exception error: {e}")
        return []