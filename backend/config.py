"""
DebtIQ™ — All settings via environment variables
Upgraded with resilient OS string fallbacks for cloud hosting containers.
"""

import os
import logging
from pydantic_settings import BaseSettings
from typing import Optional
from dotenv import load_dotenv

logger = logging.getLogger("debtiq.config")

# FORCED INITIALIZATION: Read the actual local .env file out from disk immediately
load_dotenv(override=True)


class Settings(BaseSettings):
    # ── Cloud PostgreSQL Database (Supabase) ─────────────────────
    DATABASE_URL: str               = "postgresql://postgres:postgres@localhost:5432/postgres"

    # ── Azure OpenAI / Groq Dynamic Key Mapping Pool ──────────────
    AZURE_OPENAI_API_KEY: str       = "YOUR_AZURE_OPENAI_KEY"
    
    # 🎯 FIX: Added backup rotating keys to match your updated ai_service pool layout cleanly
    GROQ_API_KEY_BACKUP_A: str      = ""
    GROQ_API_KEY_BACKUP_B: str      = ""
    GROQ_API_KEY_BACKUP_C: str      = ""
    
    AZURE_OPENAI_ENDPOINT: str      = "https://YOUR_RESOURCE.openai.azure.com/"
    AZURE_OPENAI_DEPLOYMENT: str    = "gpt-4o"
    AZURE_OPENAI_API_VERSION: str   = "2024-02-15-preview"

    # ── GitHub ───────────────────────────────────────────────────
    GITHUB_TOKEN: str               = "ghp_YOUR_TOKEN"
    GITHUB_WEBHOOK_SECRET: str      = "your-webhook-secret"

    # ── Azure Cosmos DB ──────────────────────────────────────────
    COSMOS_ENDPOINT: str            = "https://YOUR_COSMOS.documents.azure.com:443/"
    COSMOS_KEY: str                 = "YOUR_COSMOS_KEY=="
    COSMOS_DATABASE: str            = "debtiq"

    # ── App ──────────────────────────────────────────────────────
    APP_ENV: str                    = "development"
    SECRET_KEY: str                 = "change-this-in-production"
    MAX_FILE_SIZE_KB: int           = 500
    MAX_CONCURRENT_ANALYSES: int    = 5

    # ── Debt Thresholds ─────────────────────────────────────────
    THRESHOLD_CRITICAL: int         = 30    # score ≤ 30
    THRESHOLD_MAJOR: int            = 60    # score ≤ 60
    THRESHOLD_MINOR: int            = 80    # score ≤ 80
    BLOCK_PR_BELOW: int             = 25    # block merge if score < 25

    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"            # 🌟 Ignores extra values to prevent startup crashes


# ── RESILIENCE ENGINE FACTORY INTERCEPTOR (Issue #6) ──
try:
    settings = Settings()
except Exception as pydantic_err:
    logger.warning(f"⚠️ Pydantic config initialization stalled: {pydantic_err}. Activating raw OS kernel fallbacks.")
    
    # Structural re-generation bypassing strict validation schemas
    class ResilientSettings:
        def __init__(self):
            # Dynamic lookups prioritize your system environments directly
            self.DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/postgres")
            self.AZURE_OPENAI_API_KEY = os.getenv("AZURE_OPENAI_API_KEY", "YOUR_AZURE_OPENAI_KEY")
            
            # 🎯 FIX: Mirror backup rotating env descriptors down into the kernel fallback engine block
            self.GROQ_API_KEY_BACKUP_A = os.getenv("GROQ_API_KEY_BACKUP_A", "")
            self.GROQ_API_KEY_BACKUP_B = os.getenv("GROQ_API_KEY_BACKUP_B", "")
            self.GROQ_API_KEY_BACKUP_C = os.getenv("GROQ_API_KEY_BACKUP_C", "")
            
            self.AZURE_OPENAI_ENDPOINT = os.getenv("AZURE_OPENAI_ENDPOINT", "https://YOUR_RESOURCE.openai.azure.com/")
            self.AZURE_OPENAI_DEPLOYMENT = os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-4o")
            self.AZURE_OPENAI_API_VERSION = os.getenv("AZURE_OPENAI_API_VERSION", "2024-02-15-preview")
            
            self.GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "ghp_YOUR_TOKEN")
            self.GITHUB_WEBHOOK_SECRET = os.getenv("GITHUB_WEBHOOK_SECRET", "your-webhook-secret")
            
            self.APP_ENV = os.getenv("APP_ENV", "development")
            self.SECRET_KEY = os.getenv("SECRET_KEY", "change-this-in-production")
            self.MAX_FILE_SIZE_KB = int(os.getenv("MAX_FILE_SIZE_KB", 500))
            self.MAX_CONCURRENT_ANALYSES = int(os.getenv("MAX_CONCURRENT_ANALYSES", 5))
            
            self.THRESHOLD_CRITICAL = int(os.getenv("THRESHOLD_CRITICAL", 30))
            self.THRESHOLD_MAJOR = int(os.getenv("THRESHOLD_MAJOR", 60))
            self.THRESHOLD_MINOR = int(os.getenv("THRESHOLD_MINOR", 80))
            self.BLOCK_PR_BELOW = int(os.getenv("BLOCK_PR_BELOW", 25))

    settings = ResilientSettings()