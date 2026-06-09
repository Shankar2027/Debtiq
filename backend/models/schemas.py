"""
DebtIQ™ — Pydantic Data Validation Models
Production Version — Synchronized parameters matching frontend payloads and AI outputs.
"""

from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from enum import Enum


class DebtLevel(str, Enum):
    CRITICAL = "critical"
    MAJOR    = "major"
    MINOR    = "minor"
    HEALTHY  = "healthy"


class Language(str, Enum):
    PYTHON     = "python"
    JAVASCRIPT = "javascript"
    TYPESCRIPT = "typescript"
    JAVA       = "java"
    CSHARP     = "csharp"


# ── Requests ────────────────────────────────────────────────────

class ScanRequest(BaseModel):
    repo_full_name: str = Field(..., json_schema_extra={"example": "octocat/Hello-World"})
    branch: str = Field("main")
    github_token: Optional[str] = None
    max_files: int = Field(50, ge=1, le=200)


class ScoreRequest(BaseModel):
    code: str
    language: Language
    file_path: str


class FixRequest(BaseModel):
    repo_full_name: Optional[str] = None  # Optional so local testing doesn't break
    file_path: str
    original_code: str
    problems: List[str]
    language: str  # Softened to str so the frontend can safely pass down raw string payloads


# ── Sub-models ──────────────────────────────────────────────────

class DebtProblem(BaseModel):
    # 🎯 FIXED: Standardized to line_number to cleanly pass code rows to ProblemCard.jsx
    line_number: Optional[int] = None
    type: str
    severity: str  # Softened to str to allow flexible AI severity string variations safely
    description: str
    suggestion: str


class FileScore(BaseModel):
    file_path: str
    language: str
    score: int = Field(..., ge=0, le=100)
    debt_level: str  # 🎯 Softened to str to prevent parsing crashes from LLM variations
    problems: List[Dict[str, Any]] = []  # 🎯 Relaxed typing prevents 422 errors on structure shifts
    lines_of_code: int
    scanned_at: str
    raw_content: Optional[str] = None  # 🎯 Preserved to hydrate code comparison views cleanly


# ── Responses ───────────────────────────────────────────────────

class FixSuggestion(BaseModel):
    file_path: str
    original_code: str
    fixed_code: str
    changes_made: List[str]
    improvement_score: int
    explanation: str


class ScanResult(BaseModel):
    id: str
    repo_full_name: str
    owner: str
    branch: str
    overall_score: int
    debt_level: str  # 🎯 Softened to str to match outer data layout rules smoothly
    total_files: int
    files_scanned: int
    file_scores: List[FileScore]
    critical_count: int
    major_count: int
    minor_count: int
    healthy_count: int
    scanned_at: str
    scan_duration_seconds: float


class DashboardData(BaseModel):
    owner: str
    total_repos: int
    avg_score: float
    total_files: int
    critical_files: int
    repos: List[Dict[str, Any]]
    trend: List[Dict[str, Any]]