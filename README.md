<p align="center">
  <h1 align="center">🛡️ SuRaksha — Sentinel-RegAI</h1>
  <p align="center">
    <strong>AI-Powered Regulatory Compliance & Anomaly Detection for Banking</strong>
  </p>
  <p align="center">
    <a href="#architecture">Architecture</a> •
    <a href="#features">Features</a> •
    <a href="#tech-stack">Tech Stack</a> •
    <a href="#getting-started">Getting Started</a> •
    <a href="#api-reference">API Reference</a> •
    <a href="#license">License</a>
  </p>
</p>

---

## Overview

**SuRaksha** (सुरक्षा — "protection" in Hindi) is a multi-agent AI system that automates regulatory compliance monitoring for banks and financial institutions. It ingests regulatory documents (PDFs, APIs, web sources), flags non-compliant or high-risk segments using a fine-tuned **BERT classifier**, generates actionable compliance tickets via an **LLM orchestrator**, routes them to the correct department, and audits submitted evidence — all through a single-pane-of-glass dashboard.

---

## Architecture

The system is built around a **dual-agent architecture**:

```
┌─────────────────────────────────────────────────────────────────┐
│                        DATA SOURCES                             │
│   PDF Upload  │  RBI/SEC API Feeds  │  Web Scraping (URLs)      │
└──────┬────────┴──────────┬──────────┴────────┬──────────────────┘
       │                   │                   │
       ▼                   ▼                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                    AGENT ALPHA (Scanner)                         │
│  Fine-tuned BERT (BertForSequenceClassification)                │
│  ─ Extracts text from PDFs (pypdf)                              │
│  ─ Segments text into paragraphs                                │
│  ─ Scores each segment → Rscore (regulatory risk probability)   │
│  ─ Escalates segments above configurable threshold              │
└──────────────────────────┬──────────────────────────────────────┘
                           │ Escalated Alerts
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    AGENT BETA (Orchestrator)                     │
│  LangGraph State Machine + Gemini 1.5 Flash LLM                │
│  ─ Generates Measurable Action Points (MAPs) from alerts        │
│  ─ Retrieves historical context via RAG (Pinecone + Embeddings) │
│  ─ Routes tickets to departments (TF-IDF cosine similarity)     │
│  ─ Audits submitted evidence against MAP requirements           │
│  ─ Dispatches Slack notifications for urgent compliance items   │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     REACT DASHBOARD                             │
│  ─ Compliance KPIs & charts                                     │
│  ─ Alert browser with risk scores                               │
│  ─ Ticket management (view, submit evidence, track status)      │
│  ─ Document upload & manual text ingestion                      │
│  ─ System settings & department skill profiles                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Features

### 🔍 Agent Alpha — Regulatory Scanner
- **PDF Ingestion** — Extracts and segments text from uploaded PDF documents
- **BERT Classification** — Fine-tuned `BertForSequenceClassification` model scores each segment with an **Rscore** (0–1 regulatory risk probability)
- **Threshold-based Escalation** — Segments exceeding the configurable threshold are flagged as compliance anomalies
- **Multi-source Intake** — Supports PDF upload, RBI/SEC API feeds, and arbitrary URL scraping

### 🤖 Agent Beta — Compliance Orchestrator
- **MAP Generation** — Converts raw regulatory alerts into concrete, measurable action points using Gemini 1.5 Flash (with keyword-based fallback)
- **RAG-enhanced Context** — Retrieves historical compliance policies from Pinecone vector store to improve MAP quality
- **Smart Department Routing** — Uses TF-IDF cosine similarity against configurable department skill profiles (IT, HR, Legal, Treasury)
- **Evidence Auditing** — Evaluates submitted compliance evidence against MAP requirements using LLM or TF-IDF fallback scoring
- **Slack Integration** — Dispatches formatted compliance alerts to Slack channels via webhook

### 📊 Dashboard
- **Real-time KPIs** — Documents scanned, alerts raised, escalation count, compliance rate
- **Ticket Lifecycle** — Open → Evidence Submitted → Approved/Rejected
- **Department Breakdown** — Ticket distribution across IT, HR, Legal, Treasury
- **System Settings** — Configure threshold, API keys, and department skill profiles

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **ML Model** | PyTorch, Hugging Face Transformers (BERT) |
| **Backend** | FastAPI, Uvicorn |
| **LLM** | Google Gemini 1.5 Flash (via LangChain) |
| **Agent Orchestration** | LangGraph (StateGraph) |
| **RAG** | Pinecone Vector DB, Google Generative AI Embeddings |
| **Task Queue** | Celery + Redis |
| **Database** | SQLite |
| **Frontend** | React 19, Vite |
| **Scraping** | BeautifulSoup4, lxml |
| **Notifications** | Slack Webhooks |
| **Containerization** | Docker, Docker Compose |

---

## Project Structure

```
SuRaksha/
├── AgentAlphaGoldMaster/        # Fine-tuned BERT model artifacts
│   ├── config.json              # Model architecture config
│   ├── tokenizer.json           # Tokenizer vocabulary
│   ├── tokenizer_config.json    # Tokenizer settings
│   └── training_args.bin        # Training hyperparameters
│
├── AgentBeta/
│   ├── backend/
│   │   ├── main.py              # FastAPI application & REST endpoints
│   │   ├── alpha_scanner.py     # Agent Alpha — BERT-based document scanner
│   │   ├── beta_orchestrator.py # Agent Beta — LangGraph MAP generator & auditor
│   │   ├── rag_pipeline.py      # RAG pipeline (Pinecone + Embeddings)
│   │   ├── database.py          # SQLite schema & connection management
│   │   ├── tasks.py             # Celery async tasks (scan, audit, ingest)
│   │   ├── integrations.py      # Slack webhook dispatcher
│   │   ├── celery_app.py        # Celery configuration
│   │   ├── ingestion/
│   │   │   ├── api_clients.py   # RBI/SEC regulatory API clients
│   │   │   └── scraper.py       # Web policy scraper (BeautifulSoup)
│   │   ├── requirements.txt     # Python dependencies
│   │   ├── Dockerfile           # Backend container definition
│   │   ├── docker-compose.yml   # Redis + Celery worker/beat services
│   │   └── test_integration.py  # Integration tests
│   │
│   └── frontend/
│       ├── src/
│       │   ├── App.jsx          # Main React application (single-page dashboard)
│       │   ├── index.css        # Global styles
│       │   └── main.jsx         # React entry point
│       ├── index.html           # HTML shell
│       ├── package.json         # Node dependencies (React 19, Vite)
│       └── vite.config.js       # Vite build configuration
│
├── BankSavers.pdf               # Sample test document
├── LICENSE                      # MIT License
└── .gitignore
```

---

## Getting Started

### Prerequisites

- **Python** 3.10+
- **Node.js** 18+
- **Docker & Docker Compose** (optional, for Celery/Redis)

### 1. Clone the Repository

```bash
git clone https://github.com/Himanshu49Gaur/SuRaksha.git
cd SuRaksha
```

### 2. Backend Setup

```bash
cd AgentBeta/backend

# Create and activate virtual environment
python -m venv .venv
source .venv/bin/activate   # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start the API server
uvicorn main:app --reload --port 8000
```

> **Note:** The BERT model weights in `AgentAlphaGoldMaster/` are loaded automatically on startup. Ensure `torch` and `transformers` are installed.

### 3. Frontend Setup

```bash
cd AgentBeta/frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

The frontend will be available at `http://localhost:5173` and proxies API calls to the backend at `http://localhost:8000`.

### 4. (Optional) Celery + Redis for Async Tasks

```bash
cd AgentBeta/backend

# Start Redis and Celery workers
docker-compose up -d
```

> Without Redis, the system falls back to synchronous processing for document scanning.

### 5. Environment Variables (Optional)

| Variable | Description |
|----------|-------------|
| `GEMINI_API_KEY` | Google Gemini API key for LLM-powered MAP generation and auditing |
| `PINECONE_API_KEY` | Pinecone API key for RAG vector store |
| `SLACK_WEBHOOK_URL` | Slack incoming webhook URL for compliance notifications |

These can also be configured via the **Settings** page in the dashboard.

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/dashboard` | Compliance KPIs and statistics |
| `GET` | `/api/alerts` | List all scanned alert segments |
| `GET` | `/api/tickets` | List all compliance tickets (optional `?department=` filter) |
| `POST` | `/api/upload` | Upload a PDF for scanning (`multipart/form-data`) |
| `POST` | `/api/ingest-text` | Manually ingest raw text for compliance scanning |
| `POST` | `/api/ingest-source` | Trigger ingestion from RBI/SEC APIs or web URLs |
| `POST` | `/api/tickets/{id}/submit-evidence` | Submit evidence for a ticket and trigger audit |
| `POST` | `/api/audit-loop` | Re-audit all tickets with submitted evidence |
| `GET` | `/api/settings` | Retrieve system settings |
| `POST` | `/api/settings` | Update threshold, API keys, and department skills |
| `GET` | `/api/task-status/{task_id}` | Poll Celery task status |

---

## How It Works

1. **Ingest** — A regulatory PDF is uploaded (or text is fetched from an API/URL)
2. **Scan** — Agent Alpha extracts text, segments it, and runs each segment through the BERT model to produce an Rscore
3. **Escalate** — Segments with Rscore ≥ threshold are flagged as compliance anomalies and stored as alerts
4. **Generate MAP** — Agent Beta converts each escalated alert into a Measurable Action Point using Gemini (or fallback heuristics), enriched with RAG context
5. **Route** — The MAP ticket is routed to the best-matching department (IT, HR, Legal, Treasury) via TF-IDF cosine similarity
6. **Notify** — A Slack notification is dispatched to the assigned department
7. **Evidence** — Department employees submit compliance evidence (text or file)
8. **Audit** — Agent Beta evaluates the evidence against the MAP requirements and marks the ticket as Approved or Rejected

---

## License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

