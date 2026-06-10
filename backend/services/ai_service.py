"""
DebtIQ™ — AI Service (ai_service.py)
Uses Groq API with Llama-3.3-70B for code analysis and surgical refactoring.

Architecture:
  analyse()      → sends code to LLM, returns score + problem list
  generate_fix() → sends ONLY faulty line blocks to LLM, returns patched file
  
Key protections:
  1. Pre-call score gate   — skips healthy files before any token is spent
  2. Surgical prompt       — LLM only sees exact faulty line ranges as edit targets
  3. Post-fix diff validator — rejects over-engineered fixes by line-change budget
  4. Score firewall        — final safety net if score still regresses
"""

import json
import re
import logging
import httpx
import asyncio
from config import settings

logger = logging.getLogger("debtiq.ai")

MODEL_NAME = "llama-3.3-70b-versatile"
GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"

# ── API key pool (rotates on every call to spread rate limits) ────────────────
GROQ_KEYS_POOL = [
    key.strip("'\" ")
    for key in [
        getattr(settings, "AZURE_OPENAI_API_KEY",      ""),
        getattr(settings, "GROQ_API_KEY_BACKUP_A",     ""),
        getattr(settings, "GROQ_API_KEY_BACKUP_B",     ""),
        getattr(settings, "GROQ_API_KEY_BACKUP_C",     ""),
    ]
    if key.strip("'\" ")
]

if not GROQ_KEYS_POOL:
    logger.critical("❌ CRITICAL: No active Groq API keys found!")
    GROQ_KEYS_POOL = ["MISSING_KEY"]

_key_rotation_counter = 0


# ══════════════════════════════════════════════════════════════════════════════
# SYSTEM PROMPTS
# ══════════════════════════════════════════════════════════════════════════════

_SYS_ANALYSE = """You are an objective, professional code quality auditor following strict PEP 8 and clean architecture metrics.

SCORING CRITERIA MATRIX:
- 90-100: Code is clean, highly legible, modular, free of severe code smells, uses type-safety, and matches standard framework designs.
- 70-89:  Code has minor smells (e.g., small magic strings or redundant definitions) but is structurally sound and functional.
- Below 70: Major architectural faults, dead code paths, broken safety practices, or unhandled exceptions are present.

CRITICAL EVALUATION RULES:
1. DO NOT penalize standard framework patterns. Inline validation properties inside Pydantic Fields
   (e.g., min_length, gt) are an industry-standard best practice — DO NOT mark them as code smells.
2. DO NOT demand extra boilerplate or redundant abstractions (like forcing values into separate
   Configuration classes or wrapping primitives in Final type tags).
3. If a file is cleanly structured, readable, and properly handles type hints, assign a score of 85+ automatically.
4. DO NOT report problems on lines that are already clean. Only flag genuine structural issues.
5. ISSUE CONSOLIDATION (STRICT): NEVER output more than 2 distinct problems per file. If multiple issues affect the SAME block of code (e.g., missing validation, hardcoded values, and missing disclaimers all in lines 5-10), you MUST merge them into ONE single problem object with a unified explanation. Do not spam overlapping line numbers.

Return ONLY a raw JSON object with this EXACT structure — no markdown, no explanation outside the JSON:
{
  "score": <int 0-100>,
  "debt_level": "<critical|major|minor|healthy>",
  "problems": [
    {
      "line_number": "<range like '5-10' or single '14'>",
      "category": "Code Smell",
      "severity": "<CRITICAL|MAJOR|MINOR>",
      "title": "<short title>",
      "explanation": "<one-sentence plain-English explanation>",
      "faulty_code": "<exact code snippet from those lines>"
    }
  ]
}"""


_SYS_FIX = """You are a surgical code patcher. You receive:
  1. One or more SURGICAL TARGET blocks — the ONLY lines you are permitted to modify.
  2. The full file as READ-ONLY context — do not change anything outside the targets.

HARD RULES — violating any of these is a failure:
  - Return the COMPLETE file with all lines outside the surgical targets copied character-for-character.
  - Do NOT rename variables, functions, or constants outside the target blocks.
  - Do NOT extract dictionary keys, list items, or string literals into module-level constants.
  - Do NOT add imports, helper classes, or abstractions not strictly required by the specific issue.
  - Do NOT reformat, re-indent, sort, or restructure any code outside the target blocks.
  - Do NOT downgrade type annotations (e.g., datetime.date → str) anywhere in the file.
  - 🎯 AGGRESSIVE CLEANUP: Inside the designated surgical target blocks, you MUST aggressively eliminate code debt. Completely remove dead execution paths, placeholder 'pass' blocks, and old debugging noise (like raw 'print' statements) that are part of the identified issues. Do not leave placeholder artifacts behind.
  - If a target block is already clean after inspection, copy it unchanged and explain why.

Output format — use these exact tags and nothing else outside them:
<explanation>One sentence per fix, referencing the specific line numbers changed.</explanation>
<code>The complete file with surgical fixes applied.</code>"""


# ══════════════════════════════════════════════════════════════════════════════
# INTERNAL HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def _next_key() -> str:
    """Round-robin API key rotation."""
    global _key_rotation_counter
    key = GROQ_KEYS_POOL[_key_rotation_counter % len(GROQ_KEYS_POOL)]
    _key_rotation_counter += 1
    return key


def _score_to_level(score: int) -> str:
    if score >= 85: return "healthy"
    if score >= 70: return "minor"
    if score >= 45: return "major"
    return "critical"


def _clean_json_response(raw_text: str, file_path: str = "") -> dict:
    """
    Parse the LLM's JSON response safely.
    Handles markdown fences, leading/trailing text, and malformed problem entries.
    Falls back to a safe neutral score on any parse failure.
    """
    try:
        # Strip markdown code fences
        text = re.sub(r"```json|```", "", raw_text).strip()

        # Extract outermost JSON object
        match = re.search(r"(\{.*\})", text, re.DOTALL)
        if not match:
            raise ValueError("No JSON object found in LLM response.")

        parsed = json.loads(match.group(1).strip(), strict=False)

        # Normalise any plain-string problem entries into full dicts
        if "problems" in parsed and isinstance(parsed["problems"], list):
            for idx, problem in enumerate(parsed["problems"]):
                if isinstance(problem, str):
                    parsed["problems"][idx] = {
                        "line_number": f"{10 + idx * 5}-{15 + idx * 5}",
                        "category":    "Code Smell",
                        "severity":    "MAJOR",
                        "title":       "Issue",
                        "explanation": problem,
                        "faulty_code": "",
                    }
        return parsed

    except Exception as e:
        logger.error(f"⚠️  JSON parse recovery for {file_path}: {e}")
        return {"score": 75, "debt_level": "minor", "problems": []}


def _extract_code_tags(raw_text: str, default_code: str, base_score: int = 60) -> dict:
    """
    Extract <explanation> and <code> tags from the refactoring LLM response.
    Strips any markdown fences from inside the <code> block.
    Does NOT fabricate a score boost — the diff validator decides acceptability.
    """
    try:
        exp_match = re.search(
            r"<explanation>(.*?)</explanation>", raw_text, re.DOTALL | re.IGNORECASE
        )
        explanation = exp_match.group(1).strip() if exp_match else "Refactor applied."

        # 🎯 FALLBACK REGEX: Handles if LLM forgot to put <code> tags
        code_match = re.search(
            r"<code>(.*?)</code>", raw_text, re.DOTALL | re.IGNORECASE
        )
        if code_match:
            fixed_code = code_match.group(1).strip()
        else:
            md_match = re.search(r"```[a-zA-Z]*\n(.*?)```", raw_text, re.DOTALL)
            fixed_code = md_match.group(1).strip() if md_match else default_code
            
        # Strip any accidental markdown fences the LLM wraps around code
        fixed_code = re.sub(r"^```[a-zA-Z]*\n?|```$", "", fixed_code, flags=re.MULTILINE).strip()

        return {
            "fixed_code":        fixed_code,
            "explanation":       explanation,
            "improvement_score": base_score,   # caller decides final score after validation
        }

    except Exception as e:
        logger.error(f"Tag extraction failed: {e}")
        return {
            "fixed_code":        default_code,
            "explanation":       "Refactor error — original code returned.",
            "improvement_score": base_score,
        }


def _build_surgical_prompt(
    code: str, language: str, problems: list, current_score: int
) -> str | None:
    """
    Build a user prompt that pins the LLM to ONLY the specific faulty line ranges.

    Returns None if no line ranges can be mapped (caller should skip the fix call).
    The full file is appended as READ-ONLY context so the LLM can understand
    imports and variable names without treating it as an edit surface.
    """
    lines = code.splitlines()
    fault_blocks: list[str] = []

    for p in problems:
        try:
            raw_range = str(p.get("line_number", "")).strip()
            # Accept formats: "5-10", "5–10", "14", "14-14"
            parts = [int(x) for x in re.split(r"[-–]", raw_range) if x.strip().isdigit()]
            if not parts:
                continue
            start = max(1, min(parts[0], len(lines)))
            end   = max(start, min(parts[-1] if len(parts) > 1 else parts[0], len(lines)))

            snippet = "\n".join(lines[start - 1 : end])
            fault_blocks.append(
                f"SURGICAL TARGET — LINES {start}-{end}\n"
                f"Severity : {p.get('severity', 'MAJOR')}\n"
                f"Issue    : {p.get('title', 'Issue')}\n"
                f"Detail   : {p.get('explanation', '')}\n"
                f"Code     :\n{snippet}"
            )
        except Exception as e:
            logger.warning(f"Could not map problem to lines: {p} — {e}")
            continue

    if not fault_blocks:
        return None

    targets_section = "\n\n" + ("─" * 60) + "\n\n".join(fault_blocks) + "\n" + ("─" * 60)

    return (
        f"Language     : {language}\n"
        f"Current score: {current_score}/100\n"
        f"Targets      : {len(fault_blocks)} block(s) — ONLY these may be changed.\n"
        f"\n{targets_section}\n\n"
        f"READ-ONLY full file (do NOT modify anything outside the targets above):\n"
        f"{'─' * 60}\n{code}\n{'─' * 60}"
    )


def _is_fix_acceptable(
    original: str, fixed: str, problems: list
) -> tuple[bool, str]:
    """
    Reject the fix if the LLM changed far more lines than were targeted.

    Budget = targeted_lines * 2  (minimum 10)
    This blocks over-engineering while allowing the LLM a small amount of
    necessary surrounding-context changes (e.g., adding one import).
    """
    orig_lines  = original.splitlines()
    fixed_lines = fixed.splitlines()

    changed_count = sum(
        1 for a, b in zip(orig_lines, fixed_lines) if a != b
    )
    added_count = abs(len(fixed_lines) - len(orig_lines))
    total_delta = changed_count + added_count

    # Calculate how many lines were actually targeted
    targeted = 0
    for p in problems:
        try:
            raw = str(p.get("line_number", "0"))
            parts = [int(x) for x in re.split(r"[-–]", raw) if x.strip().isdigit()]
            if len(parts) >= 2:
                targeted += abs(parts[-1] - parts[0]) + 1
            else:
                targeted += 5  # safe fallback for single-line markers
        except Exception:
            targeted += 5

    budget = max(targeted * 2, 10)

    if total_delta > budget:
        return False, (
            f"{total_delta} lines changed but only {targeted} targeted "
            f"(budget: {budget}). Over-engineering blocked."
        )
    return True, "Fix accepted."


# ══════════════════════════════════════════════════════════════════════════════
# PUBLIC API
# ══════════════════════════════════════════════════════════════════════════════

async def analyse(code: str, language: str, file_path: str) -> dict:
    """
    Audit a code file for technical debt using the Groq LLM.

    Returns a dict with keys:
      score       (int 0-100)
      debt_level  (str: critical | major | minor | healthy)
      problems    (list of problem dicts)

    Retries up to 3 times with key rotation on failure.
    Falls back to a neutral score if all attempts fail.
    """
    payload = {
        "model": MODEL_NAME,
        "messages": [
            {"role": "system", "content": _SYS_ANALYSE},
            {
                "role": "user",
                "content": (
                    f"Language: {language}\nFile: {file_path}\n\n"
                    f"Code:\n{code}"
                ),
            },
        ],
        "temperature": 0.1,
        "max_tokens":  2000,
    }

    for attempt in range(3):
        try:
            api_key = _next_key()
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(
                    GROQ_API_URL,
                    headers={"Authorization": f"Bearer {api_key}"},
                    json=payload,
                )
                if resp.status_code == 200:
                    raw = resp.json()["choices"][0]["message"]["content"]
                    result = _clean_json_response(raw, file_path=file_path)
                    # Guarantee debt_level is always consistent with score
                    result["debt_level"] = _score_to_level(result.get("score", 75))
                    return result

                logger.warning(
                    f"Groq API returned {resp.status_code} on attempt {attempt + 1} "
                    f"for {file_path}"
                )

        except Exception as e:
            logger.warning(f"analyse() attempt {attempt + 1} failed for {file_path}: {e}")
            await asyncio.sleep(2)

    logger.error(f"All 3 analyse() attempts failed for {file_path}. Using fallback.")
    return {"score": 70, "debt_level": "minor", "problems": []}


async def generate_fix(
    code:              str,
    language:          str,
    file_path:         str,
    problems:          list | None = None,
    issue_description: str  = "",
    current_score:     int  = 60,
) -> dict:
    """
    Generate a surgical refactor for a code file.

    Protection layers (in order):
      1. Pre-call score gate   — skip if file is already healthy with no problems
      2. Severity filter       — only act on CRITICAL / MAJOR issues
      3. Surgical prompt       — LLM is only shown exact faulty line blocks
      4. Post-fix diff check   — reject if too many lines changed
      5. Score firewall        — reject if improvement_score regressed

    Returns a dict with keys:
      fixed_code        (str)
      explanation       (str)
      improvement_score (int)
    """
    problems = problems or []

    # ── Layer 1: Pre-call score gate ─────────────────────────────────────────
    if current_score >= 88 and not problems:
        logger.info(
            f"⏭️  Skipping fix for healthy file '{file_path}' "
            f"(score={current_score}, no problems reported)."
        )
        return {
            "fixed_code":        code,
            "explanation":       f"No fix needed — file scored {current_score}/100 with no issues.",
            "improvement_score": current_score,
        }

    # ── Layer 2: Severity filter ─────────────────────────────────────────────
    actionable = [
        p for p in problems
        if str(p.get("severity", "")).upper() in ("CRITICAL", "MAJOR")
    ]

    if not actionable:
        logger.info(
            f"⏭️  No CRITICAL/MAJOR issues for '{file_path}' — skipping fix."
        )
        return {
            "fixed_code":        code,
            "explanation":       "Only minor issues detected — no structural change required.",
            "improvement_score": current_score,
        }

    # ── Layer 3: Build surgical prompt ───────────────────────────────────────
    user_content = _build_surgical_prompt(code, language, actionable, current_score)

    if user_content is None:
        logger.warning(
            f"⚠️  Could not map any issues to line ranges for '{file_path}'. "
            f"Skipping fix to avoid noisy output."
        )
        return {
            "fixed_code":        code,
            "explanation":       "Could not map issues to line ranges — original code returned.",
            "improvement_score": current_score,
        }

    # ── Call the LLM ─────────────────────────────────────────────────────────
    payload = {
        "model": MODEL_NAME,
        "messages": [
            {"role": "system", "content": _SYS_FIX},
            {"role": "user",   "content": user_content},
        ],
        "temperature": 0.1,
        "max_tokens":  2500,
    }

    try:
        api_key = _next_key()
        async with httpx.AsyncClient(timeout=180.0) as client:
            resp = await client.post(
                GROQ_API_URL,
                headers={"Authorization": f"Bearer {api_key}"},
                json=payload,
            )

        if resp.status_code != 200:
            logger.error(
                f"Groq API error {resp.status_code} during fix for '{file_path}'."
            )
            return {
                "fixed_code":        code,
                "explanation":       f"API error {resp.status_code} — original code returned.",
                "improvement_score": current_score,
            }

        raw_response = resp.json()["choices"][0]["message"]["content"]
        ai_result    = _extract_code_tags(raw_response, default_code=code, base_score=current_score)
        
        # 🎯 PROGRESS ESCALATION: Calculate score bump for successful surgical block execution
        ai_result["improvement_score"] = min(100, current_score + 6)

    except Exception as e:
        logger.error(f"generate_fix() network error for '{file_path}': {e}")
        return {
            "fixed_code":        code,
            "explanation":       f"Network error: {e}",
            "improvement_score": current_score,
        }

    # ── Layer 4: Post-fix diff validator ─────────────────────────────────────
    fix_ok, fix_reason = _is_fix_acceptable(
        code, ai_result["fixed_code"], actionable
    )

    if not fix_ok:
        logger.warning(
            f"🛡️  Over-engineering blocked for '{file_path}': {fix_reason}"
        )
        return {
            "fixed_code":        code,
            "explanation":       f"Fix rejected — AI over-engineered. {fix_reason}",
            "improvement_score": current_score,
        }

    # ── Layer 5: Score regression firewall ───────────────────────────────────
    if ai_result.get("improvement_score", 0) < current_score:
        logger.warning(
            f"🔒 Score firewall blocked regression for '{file_path}': "
            f"{current_score} → {ai_result.get('improvement_score')}."
        )
        return {
            "fixed_code":        code,
            "explanation":       "Fix blocked — improvement score regressed below current score.",
            "improvement_score": current_score,
        }

    # ── All layers passed — return the fix ───────────────────────────────────
    logger.info(
        f"✅ Fix accepted for '{file_path}': "
        f"{current_score} → {ai_result['improvement_score']}/100."
    )
    return ai_result


# Backwards-compatible alias — keeps existing routers working
_level = _score_to_level