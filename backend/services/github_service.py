"""
DebtIQ™ — GitHub API service
Production Version — High-speed concurrent trees parsing and large blob SHA lookups.
"""

import httpx
import base64
import logging
import asyncio
from typing import Optional
from config import settings

logger = logging.getLogger("debtiq.github")
GH = "https://api.github.com"

EXT_MAP = {
    ".py": "python", ".js": "javascript", ".ts": "typescript",
    ".jsx": "javascript", ".tsx": "typescript",
    ".java": "java", ".cs": "csharp",
}
SKIP = {"node_modules", "__pycache__", ".git", "dist", "build",
        "vendor", ".venv", "venv", "env", "migrations", "test", "tests",
        "spec", ".github", "docs", "coverage", ".next", "out"}


def _headers(token: Optional[str]) -> dict:
    t = token or settings.GITHUB_TOKEN
    # 🎯 FIX: Added strict standard User-Agent header string to stop random production API rejections
    base_hdrs = {
        "Accept": "application/vnd.github.v3+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "DebtIQ-Backend-Engine"
    }
    if t and t.strip():
        base_hdrs["Authorization"] = f"Bearer {t}"
    return base_hdrs


async def get_repo_info(repo: str, token: Optional[str] = None) -> dict:
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.get(f"{GH}/repos/{repo}", headers=_headers(token))
            if r.status_code != 200:
                logger.warning(f"Failed to fetch metadata index for repo {repo}: {r.text}")
                return {}
            d = r.json()
            return {"name": d["name"], "owner": d["owner"]["login"],
                    "full_name": d["full_name"],
                    "default_branch": d["default_branch"],
                    "language": d.get("language"), "stars": d["stargazers_count"],
                    "url": d["html_url"]}
    except Exception as e:
        logger.error(f"get_repo_info unexpected exception: {e}")
        return {}


async def get_repo_files(repo: str, branch: str = "main",
                         token: Optional[str] = None,
                         max_files: int = 50) -> list[dict]:
    hdrs = _headers(token)
    
    async with httpx.AsyncClient(timeout=45) as c:
        # Fetch recursive tree layout schema indices
        r = await c.get(f"{GH}/repos/{repo}/git/trees/{branch}?recursive=1", headers=hdrs)
        
        if r.status_code in (401, 403):
            logger.warning("Token unauthorized/expired. Retrying layout as an anonymous public request...")
            anon_hdrs = {"Accept": "application/vnd.github.v3+json", "User-Agent": "DebtIQ-Backend-Engine"}
            r = await c.get(f"{GH}/repos/{repo}/git/trees/{branch}?recursive=1", headers=anon_hdrs)
            hdrs = anon_hdrs

        if r.status_code == 404:
            raise ValueError(f"Repo or branch not found: {repo}@{branch}")
        r.raise_for_status()
        tree = r.json().get("tree", [])

        candidates = []
        for item in tree:
            if item["type"] != "blob":
                continue
            
            path = item["path"]
            parts = path.split("/")
            
            if any(p in SKIP for p in parts):
                continue
                
            ext = f".{path.rsplit('.', 1)[-1]}" if "." in path else ""
            if ext not in EXT_MAP:
                continue
                
            if item.get("size", 0) > settings.MAX_FILE_SIZE_KB * 1024:
                continue
                
            # 🎯 FIX: Captured and passed file 'sha' hash down to pool workers to safely bypass large file payload errors
            candidates.append({
                "path": path, 
                "language": EXT_MAP[ext], 
                "sha": item.get("sha")
            })
            if len(candidates) >= max_files:
                break

        logger.info(f"Fetching {len(candidates)} files concurrently from remote tracking tree: {repo}")

        async def fetch_contents(item: dict) -> Optional[dict]:
            try:
                # 🎯 FIX: Switch lookup queries to look up direct git blob SHAs instead of text path contexts to prevent 1MB overflow boundaries
                cr = await c.get(
                    f"{GH}/repos/{repo}/git/blobs/{item['sha']}",
                    headers=hdrs)
                cr.raise_for_status()
                cd = cr.json()
                
                content = (base64.b64decode(cd["content"]).decode("utf-8", errors="replace")
                           if cd.get("encoding") == "base64" else cd.get("content", ""))
                           
                return {"path": item["path"], "content": content,
                        "language": item["language"], "size": cd.get("size", 0)}
            except Exception as e:
                logger.warning(f"Skip file payload extraction tracking bounds for {item['path']}: {e}")
                return None

        tasks = [fetch_contents(item) for item in candidates]
        results = await asyncio.gather(*tasks)
        
        return [res for res in results if res is not None]


async def post_pr_comment(repo: str, pr_number: int, score: int,
                          level: str, file_scores: list,
                          token: Optional[str] = None) -> bool:
    emoji = "🟢" if score >= 80 else "🟡" if score >= 60 else "🔴" if score >= 30 else "⛔"
    worst = sorted(file_scores, key=lambda x: x.get("score", 100))[:5]
    rows = "\n".join(
        f"| `{f['file_path']}` | {f['score']}/100 | {f['debt_level'].upper()} |"
        for f in worst)
    body = f"""## ⚡ DebtIQ™ Code Health Report

{emoji} **Overall Score: {score}/100** — `{level.upper()}`

| File | Score | Level |
|------|-------|-------|
{rows}

> {'⛔ **BLOCKED**: Critical debt detected — fix before merging.' if score < 25 else '✅ Safe to merge.' if score >= 80 else '⚠️ Review suggested before merge.'}

---
*Powered by [DebtIQ™](https://debtiq.azurewebsites.net) — Team AI Aura*"""

    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.post(
                f"{GH}/repos/{repo}/issues/{pr_number}/comments",
                headers=_headers(token), json={"body": body})
            return r.status_code == 201
    except Exception as e:
        logger.error(f"Failed to post PR hook notification comment: {e}")
        return False