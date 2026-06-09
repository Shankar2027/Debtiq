"""
DebtIQ™ — /api/score router
Production Version — Synchronized mapping parameters and strict validation handling.
"""

from fastapi import APIRouter, HTTPException
from models.schemas import ScoreRequest, FileScore, DebtLevel
from services.ai_service import analyse, _level
from datetime import datetime, timezone
import logging

router = APIRouter()
logger = logging.getLogger("debtiq.score")

@router.post("/", response_model=FileScore)
async def score_snippet(req: ScoreRequest):
    """Score a single code snippet and dynamically fulfill schema rules."""
    logger.info(f"🎯 Evaluating raw code snippet tracking index for path context: {req.file_path}")
    
    try:
        result = await analyse(req.code, req.language.value, req.file_path)
    except Exception as e:
        logger.error(f"Analysis service failure inside score router: {e}")
        raise HTTPException(status_code=500, detail=f"AI Scoring service failure: {str(e)}")
        
    if not result:
        raise HTTPException(status_code=500, detail="Failing to pull evaluations back from AI engine core.")

    score_val = int(result.get("score", 100))
    
    # Enforce precise string configuration bounds matching internal DebtLevel types
    extracted_level = str(result.get("debt_level", "healthy")).lower().strip()
    if extracted_level not in ["critical", "major", "minor", "healthy"]:
        extracted_level = _level(score_val)

    # Extract issues array safely (handles variations in LLM response formats)
    raw_problems = result.get("problems", []) or []
    formatted_problems = []
    
    for issue in raw_problems:
        if isinstance(issue, str):
            # 🎯 FIX: Structured to match required schema properties perfectly (line_number & severity formats)
            formatted_problems.append({
                "type": "code_smell",
                "description": issue,
                "severity": "major",
                "suggestion": "Refactor code logic to eliminate high-risk dependencies.",
                "line_number": None
            })
        elif isinstance(issue, dict):
            raw_sev = str(issue.get("severity", "major")).lower().strip()
            
            # Harmonize severity labels into valid values
            clean_sev = "critical" if raw_sev in ["high", "error", "critical"] else \
                        "major" if raw_sev in ["medium", "warn", "warning", "major"] else "minor"

            formatted_problems.append({
                "type": issue.get("type", "code_smell"),
                "description": issue.get("description") or issue.get("message") or str(issue),
                "severity": clean_sev,
                "suggestion": issue.get("suggestion", "Review structural layout constraints."),
                "line_number": issue.get("line_number") or issue.get("line")
            })

    # Construct file statistics properties safely
    loc = len(req.code.splitlines()) if req.code else 1

    # 🚀 Construct a perfectly valid FileScore structure before returning
    validated_response = {
        "file_path": req.file_path,
        "language": req.language.value,
        "score": score_val,
        "debt_level": extracted_level,
        "problems": formatted_problems,
        "lines_of_code": loc,
        "scanned_at": datetime.now(timezone.utc).isoformat(),
        # 🎯 FIX: Passing raw code content downstream prevents the single-file view from loading a blank screen
        "raw_content": req.code
    }
    
    return validated_response