# DebtIQ — Automated Technical Debt Remediation Platform

> AI-powered code health audits, architectural debt analysis, security vulnerability detection, and instant refactoring patches — all in one platform.

![Tech Stack](https://img.shields.io/badge/Backend-FastAPI-009688?style=flat-square&logo=fastapi)
![Frontend](https://img.shields.io/badge/Frontend-React%20%2B%20Vite-61DAFB?style=flat-square&logo=react)
![AI Engine](https://img.shields.io/badge/AI-Groq%20Llama--3.1-FF6600?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)

---

## What is DebtIQ?

DebtIQ connects directly to any public GitHub repository, scans every file concurrently, and uses a Groq-powered LLM pipeline to produce a structured health report — complete with a 0–100 codebase score, severity ratings, security findings, and ready-to-apply refactoring patches.

It is built as a decoupled full-stack application: a **FastAPI** backend handles all the heavy lifting (ingestion, AI inference, database writes), while a **React + Vite** dashboard surfaces results in real time.

---

## Features

- **Repository Scanning** — Point DebtIQ at any public GitHub repo. It pulls the full file tree and processes files concurrently using async worker lanes.
- **AI-Powered Debt Analysis** — Llama-3.1 via Groq reviews each file for architectural issues, code smells, and security vulnerabilities.
- **Health Scoring** — Every scan produces a 0–100 score mapped to one of four severity levels: `HEALTHY`, `MINOR`, `MAJOR`, or `CRITICAL`.
- **Multi-Key Rate Limit Handling** — A round-robin key pool rotates across three Groq API keys automatically. If one hits a `429` limit, the engine swaps keys and retries without interruption.
- **Self-Healing Response Parser** — Truncated or malformed LLM responses are intercepted and structurally repaired before any data is written to the database.
- **Persistent Scan History** — All results, scores, and vulnerability records are stored in PostgreSQL for historical comparison and trend analysis.
- **Interactive Dashboard** — Charts powered by Recharts display code quality trends and per-file breakdowns in a responsive dark-themed UI.

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React (Vite) | Single-page dashboard with async state management |
| Styling | Tailwind CSS | Responsive dark-themed UI |
| Charts | Recharts | Code quality trend graphs and gauges |
| Backend | FastAPI + Uvicorn | Async ASGI API with concurrent background workers |
| Validation | Pydantic v2 | Strict type-safe schemas for all API data |
| Database Driver | Asyncpg | Non-blocking PostgreSQL connection pooling |
| Database | PostgreSQL | Scan history, repo scores, vulnerability records |
| AI Compute | Groq Llama-3.1 | Ultra-low latency LLM inference |
| Proxy | Nginx | Routes `/api` to FastAPI; serves static frontend assets |
| Containerization | Multi-Stage Docker | Single-image deployment, non-root, cloud-ready |

---

## Prerequisites

Make sure these are installed before proceeding:

- [Node.js](https://nodejs.org/) v20.x or higher
- [Python](https://www.python.org/) v3.11.x or higher
- [Git](https://git-scm.com/)
- A live PostgreSQL database (e.g. [Supabase](https://supabase.com/) or a local instance)
- Three [Groq API keys](https://console.groq.com/) (one primary + two backups for rate-limit rotation)

---

## Local Setup

### 1. Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/DebtIQ.git
cd DebtIQ
```

---

### 2. Backend Setup

Navigate into the backend directory and create a virtual environment:

```bash
cd backend
python -m venv venv
```

Activate it:

```bash
# macOS / Linux
source venv/bin/activate

# Windows (PowerShell)
.\venv\Scripts\Activate.ps1
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Create a `.env` file inside the `backend/` folder with your credentials:

```env
DATABASE_URL="postgresql://your_db_user:password@your_host:5432/your_db"
GROQ_API_KEY="gsk_your_primary_groq_key"
GROQ_API_KEY_BACKUP_A="gsk_your_backup_groq_key_1"
GROQ_API_KEY_BACKUP_B="gsk_your_backup_groq_key_2"
```

Start the backend server:

```bash
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

The API is now live at `http://127.0.0.1:8000`.
Interactive Swagger docs are available at `http://127.0.0.1:8000/docs`.

---

### 3. Frontend Setup

Open a new terminal, go to the frontend directory, and install dependencies:

```bash
cd frontend
npm install
```

Start the Vite dev server:

```bash
npm run dev
```

Open your browser at the address shown in the terminal (typically `http://localhost:5173`).

You now have the full stack running locally. Enter any public GitHub `username/repo` in the dashboard to kick off a live scan.

---

## Docker Deployment (Production)

DebtIQ ships with a multi-stage Dockerfile that packages the entire application into a single container.

**How it works:**

1. **Stage 1 — Frontend Build:** An Alpine Node image compiles the React app into optimized static files via `npm run build`.
2. **Stage 2 — Backend + Proxy:** A Python Linux image installs the backend packages and Nginx.
3. **Wiring:** Nginx serves the compiled frontend on port `7860` and proxies all `/api` requests internally to FastAPI on port `8000`. The image runs as a non-root user (UID 1000) to satisfy cloud platform security requirements.

**Build and run:**

```bash
# Build the image
docker build -t debtiq-app .

# Run the container
docker run -p 7860:7860 \
  -e DATABASE_URL="your_postgres_connection_string" \
  -e GROQ_API_KEY="your_primary_groq_key" \
  -e GROQ_API_KEY_BACKUP_A="your_backup_key_1" \
  -e GROQ_API_KEY_BACKUP_B="your_backup_key_2" \
  debtiq-app
```

The application will be accessible at `http://localhost:7860`.

---

## How a Scan Works (Under the Hood)

```
User submits GitHub repo URL
        │
        ▼
FastAPI fetches full file tree via GitHub API
        │
        ▼
Files are processed concurrently via async workers
        │
        ▼
Each file is sent to Groq Llama-3.1 for analysis
  ├── Rate limit hit? → Swap to next API key, retry
  └── Malformed response? → Self-healing parser repairs it
        │
        ▼
Results compiled → Health score (0–100) + severity label
        │
        ▼
Scan record written to PostgreSQL
        │
        ▼
Dashboard displays score, findings, and patch suggestions
```

---

## Project Structure

```
DebtIQ/
├── backend/
│   ├── models/
│   │   └── schemas.py          # Pydantic v2 request/response schemas
│   ├── routers/
│   │   ├── dashboard.py        # Dashboard data endpoints
│   │   ├── fix.py              # Refactoring patch endpoints
│   │   ├── scan.py             # Repository scan trigger endpoints
│   │   ├── score.py            # Health score computation endpoints
│   │   └── webhook.py          # Webhook handler endpoints
│   ├── services/
│   │   ├── ai_service.py       # Groq Llama-3.1 inference + key rotation
│   │   └── github_service.py   # GitHub API file tree ingestion
│   ├── config.py               # Environment config and settings loader
│   ├── database.py             # Asyncpg connection pool setup
│   ├── main.py                 # FastAPI app entry point
│   ├── requirements.txt        # Python dependencies
│   └── .env                    # Your secrets (never commit this)
│
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── BeforeAfterT...  # Before/After code diff viewer
│       │   ├── DebtBadge.jsx    # Severity badge component
│       │   ├── FileList.jsx     # Scanned file list display
│       │   ├── FilePanel.jsx    # Per-file detail panel
│       │   ├── ProblemCar...    # Individual problem card
│       │   ├── ScoreRing.jsx    # Circular health score gauge
│       │   ├── Slicers.jsx      # Filter/slicer controls
│       │   └── StatCard.jsx     # Summary stat card
│       ├── pages/
│       │   └── Dashboard.jsx    # Main dashboard page
│       ├── services/
│       │   └── api.js           # Axios API service layer
│       ├── styles/
│       │   └── globals.css      # Global styles
│       ├── App.jsx              # Root React component
│       ├── main.jsx             # Vite entry point
│       └── index.html           # HTML shell
│
├── package.json
├── package-lock.json
├── vite.config.js
├── Dockerfile                   # Multi-stage production build
└── README.md
```

---

## License

Distributed under the [MIT License](LICENSE). You are free to use, modify, and distribute this project.
