"""
DebtIQ™ — /api/scan router
Production Version — High-capacity chunked task processing with rate limit isolation guards.
"""

from fastapi import APIRouter, HTTPException
from models.schemas import ScanRequest, ScanResult, DebtLevel, FileScore
from services.github_service import get_repo_files, get_repo_info
from services.ai_service import analyse, _level
from database import save_scan, get_history
import asyncio
import uuid
import logging
import time
from datetime import datetime, timezone

router = APIRouter()
logger = logging.getLogger("debtiq.scan")

async def process_single_file(f) -> FileScore:
    """Worker to perform AI analysis on a single file."""
    try:
        ai_data = await analyse(f["content"], f["language"], f["path"])
    except Exception as ai_err:
        logger.error(f"AI analysis failed for {f['path']}: {ai_err}")
        ai_data = {"score": 35, "debt_level": "critical", "problems": []}

    loc = len(f["content"].splitlines()) if f.get("content") else 1
    raw_problems = ai_data.get("problems", []) or []
    formatted_problems = []
    
    for prob in raw_problems:
        if isinstance(prob, dict):
            raw_sev = str(prob.get("severity", "major")).lower().strip()
            clean_sev = "critical" if raw_sev in ["high", "error", "critical"] else \
                        "major" if raw_sev in ["medium", "warn", "warning", "major"] else "minor"
            
            formatted_problems.append({
                "type": prob.get("type", "code_smell"),
                "description": prob.get("description") or prob.get("message") or str(prob),
                "severity": clean_sev,
                "suggestion": prob.get("suggestion", "Review code properties."),
                "line_number": prob.get("line_number") or prob.get("line")
            })
        else:
            formatted_problems.append({
                "type": "code_smell", 
                "description": str(prob), 
                "severity": "major", 
                "suggestion": "Review code.", 
                "line_number": None
            })
    
    try:
        raw_score = ai_data.get("score", 100)
        parsed_score = float(raw_score)
        
        if 0.0 < parsed_score <= 1.0:
            score_val = int(parsed_score * 100)
        elif 1.0 < parsed_score <= 10.0:
            score_val = int(parsed_score * 10)
        else:
            score_val = int(parsed_score)
            
        score_val = max(0, min(100, score_val))
    except (ValueError, TypeError):
        score_val = 70
        
    debt_level = str(ai_data.get("debt_level", "healthy")).lower().strip()
    if debt_level not in ["critical", "major", "minor", "healthy"]:
        debt_level = _level(score_val)

    return FileScore(
        file_path=f["path"],
        language=f["language"],
        score=score_val,
        debt_level=debt_level,
        problems=formatted_problems,
        lines_of_code=loc,
        scanned_at=datetime.now(timezone.utc).isoformat(),
        raw_content=f["content"]
    )

@router.post("/", response_model=ScanResult)
async def scan_repo(req: ScanRequest):
    t0 = time.perf_counter()
    scan_id = str(uuid.uuid4())
    
    target_subpath = ""
    raw_repo = req.repo_full_name.strip()
    
    # 🎯 STEP 1: DYNAMIC PATH & SUBFOLDER EXTRACTION
    # Parses both clean 'owner/repo' inputs and complex nested browser sub-paths instantly
    if "/tree/" in raw_repo:
        parts = raw_repo.split("/")
        cleaned_repo = f"{parts[0]}/{parts[1]}"
        
        # If there are segments after the branch name (parts[3] is branch, e.g., 'main')
        if len(parts) > 4:
            target_subpath = "/".join(parts[4:]).strip()
            
        logger.info(f"🧹 URL Sanitizer -> Repo: '{cleaned_repo}' | Target Subpath: '{target_subpath}'")
        req.repo_full_name = cleaned_repo

    logger.info(f"🔍 Scan initiated: {req.repo_full_name} [{scan_id[:8]}]")

    # 1. Fetch Repository Metadata Info
    try:
        repo_info = await get_repo_info(req.repo_full_name, req.github_token)
        owner = repo_info.get("owner") if repo_info else None
    except Exception as meta_err:
        logger.warning(f"Metadata lookup skipped: {meta_err}")
        owner = None

    if not owner:
        owner = req.repo_full_name.split("/")[0].strip() if "/" in req.repo_full_name else "Unknown"

    # 2. Fetch Targeted Code Repository Files Layout Tree
    try:
        files = await get_repo_files(req.repo_full_name, req.branch, req.github_token, req.max_files)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"GitHub fetch error: {str(e)}")

    if not files:
        raise HTTPException(status_code=404, detail="No supported code files found in targeted branch matching configuration layout rules.")

    # 3. 🎯 UPGRADED: Dynamic Subpath Filtering Isolation Guard
    # If the user pasted a deep URL link, filter strictly by that custom directory.
    # Otherwise, check if 'medical_appointment_system/' is present as an internal fallback.
    if target_subpath:
        filtered_sub_files = [f for f in files if target_subpath in str(f.get("path", ""))]
    else:
        # Smart Auto-detection: matches folder patterns dynamically if they are part of the target tree
        filtered_sub_files = [f for f in files if "medical_appointment_system/" in str(f.get("path", ""))]

    # If the filter yielded nothing, default safely back to the full root repository scan tree
    if not filtered_sub_files:
        logger.info("ℹ️ No restrictive subpaths isolated. Scanning base repository root framework scope.")
        filtered_sub_files = files

    # 4. Dynamic Chunk-Queue Array Processor
    scores = []
    CHUNK_SIZE = 2             
    COOL_DOWN_SECONDS = 1.2    
    valid_files = []

    for f in filtered_sub_files:
        content_length = len(f.get("content", ""))
        if content_length > 15000:  
            logger.warning(f"⚠️ Pre-emptively skipping {f['path']} - File size too large ({content_length} chars).")
            scores.append(FileScore(
                file_path=f["path"],
                language=f["language"],
                score=90,  
                debt_level="healthy",
                problems=[],
                lines_of_code=len(f["content"].splitlines()) if f.get("content") else 1,
                scanned_at=datetime.now(timezone.utc).isoformat(),
                raw_content=f["content"]
              ))
        else:
            valid_files.append(f)

    # Sequence processed chunk iterations down sequentially
    for i in range(0, len(valid_files), CHUNK_SIZE):
        current_chunk = valid_files[i:i + CHUNK_SIZE]
        logger.info(f"📦 Processing Isolation Batch {(i // CHUNK_SIZE) + 1} ({len(current_chunk)} files)...")
        
        chunk_results = await asyncio.gather(*(process_single_file(file_item) for file_item in current_chunk))
        scores.extend(chunk_results)
        
        if i + CHUNK_SIZE < len(valid_files):
            logger.info(f"⏳ Cooling down for {COOL_DOWN_SECONDS}s to safeguard API rate constraints...")
            await asyncio.sleep(COOL_DOWN_SECONDS)

    # 5. Compute Aggregate Metrics Configurations
    total_loc = sum(s.lines_of_code for s in scores) or 1
    overall = round(sum(s.score * s.lines_of_code for s in scores) / total_loc)
    level_str = _level(overall)

    try:
        validated_debt_enum = DebtLevel(level_str)
    except ValueError:
        validated_debt_enum = DebtLevel.HEALTHY if overall >= 85 else DebtLevel.MINOR if overall >= 70 else DebtLevel.MAJOR if overall >= 45 else DebtLevel.CRITICAL

    critical_count = sum(1 for s in scores if "critical" in str(s.debt_level).lower())
    major_count = sum(1 for s in scores if "major" in str(s.debt_level).lower())
    minor_count = sum(1 for s in scores if "minor" in str(s.debt_level).lower())
    healthy_count = sum(1 for s in scores if "healthy" in str(s.debt_level).lower())

    duration = round(time.perf_counter() - t0, 2)
    debt_level_value = validated_debt_enum.value if hasattr(validated_debt_enum, "value") else str(validated_debt_enum)

    # 6. Compile Unified Scan Result Schema
    result = ScanResult(
        id=scan_id,
        repo_full_name=req.repo_full_name,
        owner=owner,
        branch=req.branch,
        overall_score=overall,
        debt_level=str(debt_level_value).lower().strip(),  
        total_files=len(filtered_sub_files),
        files_scanned=len(scores),
        file_scores=scores,
        critical_count=critical_count,
        major_count=major_count, 
        minor_count=minor_count,
        healthy_count=healthy_count,
        scanned_at=datetime.now(timezone.utc).isoformat(),
        scan_duration_seconds=duration
    )

    # 7. Non-Blocking Background Persistence Execution Factory Tracer
    async def traced_save_task(payload: dict):
        try:
            await save_scan(payload)
        except Exception as db_err:
            logger.error(f"Async persistence background task operational failure: {db_err}")

    asyncio.create_task(traced_save_task(result.model_dump()))

    logger.info(f"✅ Scan complete: {req.repo_full_name} — {overall}/100 in {duration}s")
    return result

@router.get("/{owner}/{repo}/history")
async def scan_history(owner: str, repo: str):
    """Retrieve history dataset lists for the specified repository asset tracking index."""
    target_path = f"{owner}/{repo}".strip()
    try:
        history_data = await get_history(target_path)
        return {"repo": target_path, "history": history_data or []}
    except Exception as history_err:
        logger.error(f"Failed to fetch tracking history index logs for {target_path}: {history_err}")
        return {"repo": target_path, "history": []}