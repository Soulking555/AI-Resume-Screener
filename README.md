# AI Resume Skill Gap Analyzer

The AI Resume Skill Gap Analyzer is a full-stack web application that compares a candidate resume with an information-technology job description. It identifies explicitly required skills that are missing, discovers implicit prerequisite skills using an ESCO-derived dependency graph, ranks gaps, compares multiple NLP approaches, and generates a phased upskilling roadmap.

The project is located in the `SKILL-GAP-ANALYSER-main` directory and contains a FastAPI backend and a React/Vite frontend.

## Table of Contents

- [Project Overview](#project-overview)
- [Key Features](#key-features)
- [Technology Stack](#technology-stack)
- [Repository Structure](#repository-structure)
- [System Architecture](#system-architecture)
- [Analysis Workflow](#analysis-workflow)
- [Methods and Algorithms](#methods-and-algorithms)
- [Backend Dependencies](#backend-dependencies)
- [Frontend Dependencies](#frontend-dependencies)
- [Software and Tools Used](#software-and-tools-used)
- [Installation](#installation)
- [Running the Application](#running-the-application)
- [API Reference](#api-reference)
- [Input and Output](#input-and-output)
- [Model Benchmarking](#model-benchmarking)
- [Configuration and Environment](#configuration-and-environment)
- [Troubleshooting](#troubleshooting)

## Project Overview

Users can either paste resume and job-description text or upload PDF documents. The backend extracts text, recognizes known IT skills and aliases, calculates semantic similarity, determines prerequisite gaps, creates a learning roadmap, and produces JSON, CSV, and PDF reports.

The implementation includes:

- a self-contained ESCO-style ICT skill taxonomy;
- text and PDF ingestion;
- regex-based resume section segmentation;
- alias and canonical skill normalization;
- six transformer or transformer-based matching approaches;
- a weighted hybrid model with context-aware skill disambiguation;
- explicit and implicit gap classification;
- downloadable CSV and PDF reports; and
- interactive React dashboards for results and benchmarks.

## Key Features

### Document Ingestion

- Plain-text resume input.
- PDF resume upload, limited to 10 MB.
- Plain-text job-description input.
- PDF job-description upload.
- PDF text extraction using PyPDF.

### Skill Recognition

- Canonical recognition of ICT skills.
- Alias normalization, such as:
  - `k8s` to `Kubernetes`;
  - `postgres` or `psql` to `PostgreSQL`;
  - `py` or `python3` to `Python`; and
  - `ts` to `TypeScript`.
- Resume section detection for summary, skills, experience, education, and projects.
- Extraction of a ±15-token context window around each skill mention.

### Gap Analysis

- Explicit gap detection compares candidate skills against job-description requirements.
- Implicit gap detection follows prerequisite relationships in the taxonomy.
- Gap priority is assigned as `critical`, `high`, or `medium`.
- Implicit gaps identify the explicit skills that triggered them.
- Skill coverage and overall cosine-similarity scores are calculated.

### Reports and Visualization

- Interactive skill coverage and gap dashboards.
- Model comparison charts.
- Radar, bar, matrix, and distribution visualizations.
- Session-persisted analysis results.
- JSON reports saved on the backend.
- CSV and styled PDF report downloads.

## Technology Stack

| Area | Technology | Purpose |
|---|---|---|
| Backend language | Python 3 | API, parsing, NLP, report generation |
| Backend framework | FastAPI | REST API, validation, Swagger/ReDoc documentation |
| ASGI server | Uvicorn | Runs the FastAPI application |
| Data validation | Pydantic | Typed request and response models |
| PDF parsing | PyPDF | Extract text from uploaded PDF documents |
| NLP frameworks | Hugging Face Transformers and Sentence Transformers | Transformer encoders and embeddings |
| Machine learning | PyTorch | Tensor operations and transformer inference |
| Numerical processing | NumPy | Embeddings and similarity matrices |
| Metrics | scikit-learn | F1, precision, recall, and threshold calibration |
| Tabular/report data | pandas | Data processing support |
| PDF report generation | ReportLab | Generates styled PDF reports |
| Frontend language | JavaScript ES2020+ | Browser application logic |
| UI framework | React 18 | Component-based user interface |
| Routing | React Router | Navigation between application pages |
| Build tool | Vite 5 | Development server and frontend bundler |
| HTTP client | Axios | Communicates with FastAPI |
| Styling | Tailwind CSS and CSS | Responsive visual design |
| Charts | Recharts | Dashboard charts and visualizations |
| Animation | Framer Motion | Interface transitions |
| UI utilities | React Dropzone, Lucide React, React Hot Toast | File uploads, icons, notifications |
| Version control | Git and GitHub | Source control and collaboration |

## Repository Structure

```text
SKILL-GAP-ANALYSER-main/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                 # FastAPI application and startup lifecycle
│   │   ├── esco_taxonomy.py        # Skills, aliases, categories, and prerequisites
│   │   ├── resume_parser.py        # PDF and section parsing plus skill extraction
│   │   ├── nlp_models.py           # Matchers, embeddings, hybrid model, calibration
│   │   ├── schemas.py              # Pydantic response and health schemas
│   │   ├── reports/                # Generated JSON, CSV, and PDF reports
│   │   ├── routers/
│   │   │   └── analysis.py         # Analysis and report endpoints
│   │   └── services/
│   │       └── analyzer.py         # End-to-end analysis orchestration
│   ├── check_env.py
│   ├── test_pipeline.py
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/client.js           # Axios API client
│   │   ├── components/             # Shared UI and chart components
│   │   ├── hooks/useAnalysis.js    # Analysis state and sessionStorage cache
│   │   ├── pages/                  # Landing, analysis, dashboard, benchmark pages
│   │   ├── App.jsx                 # Application routes
│   │   └── main.jsx                # React entry point
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── postcss.config.js
├── run_backend.bat                 # Windows backend launcher
├── run_frontend.bat                # Windows frontend launcher
└── start_app.bat                   # Windows launcher for both applications
```

## System Architecture

```text
Browser / React
      │
      │  Multipart form or JSON-style API request
      ▼
Vite Development Server :5173
      │
      │  /api/* and /health proxy
      ▼
FastAPI + Uvicorn :8000
      │
      ├── PDF text extraction
      ├── Resume section segmentation
      ├── ESCO alias and skill extraction
      ├── Semantic model matching
      ├── Prerequisite graph traversal
      ├── Roadmap generation
      └── JSON / CSV / PDF report generation
```

Vite proxies `/api` and `/health` requests to `http://localhost:8000`. During application startup, FastAPI loads the NLP registry and taxonomy in a lifespan event.

## Analysis Workflow

1. The React page collects resume text or a PDF and job-description text or a PDF.
2. The frontend submits one multipart request to `POST /api/analyze`.
3. FastAPI validates the selected model and input files.
4. PyPDF extracts uploaded PDF content.
5. Resume text is segmented into header, summary, skills, experience, education, and project sections.
6. The skill extractor searches aliases using longest-first multi-token matching.
7. Canonical names are deduplicated.
8. A ±15-token context window is captured for every resume skill mention.
9. Job-description skills are extracted using the same alias dictionary.
10. The ESCO prerequisite graph expands explicit requirements into implicit prerequisites.
11. The selected model matches candidate skills against explicit and implicit requirements.
12. Cosine similarity is compared with the calibrated threshold.
13. Explicit and implicit gaps are classified and prioritized.
14. A two-phase learning roadmap is synthesized.
15. Analysis metrics and benchmark data are attached to the response.
16. A JSON report is written to `backend/app/reports`.
17. The frontend caches the result in `sessionStorage` and renders dashboards.
18. The user can download CSV or PDF reports using the returned report ID.

## Methods and Algorithms

### ESCO Taxonomy and Alias Normalization

The taxonomy engine maintains canonical skill labels, alternative labels, categories, descriptions, and prerequisite lists. Alias lookup converts a raw mention such as `golang` or `nodejs` into its canonical form.

The dependency graph is traversed recursively to discover foundational concepts required by the job-description skills. It also prevents prerequisites that are already explicit requirements from being counted again as implicit gaps.

### Resume Section Segmentation

A regex-based parser searches resume lines for common section headers such as `skills`, `work experience`, `education`, `summary`, and `projects`. The parser stores each subsequent line under the detected section and falls back to a header section when no headers are found.

### Context-Aware Skill Disambiguation

When the hybrid model encounters a candidate mention, it captures its surrounding context. It compares an embedding of that context with the ESCO description embedding for the canonical skill:

- similarity at or above `0.55` keeps a confidence weight of `1.0`; and
- lower similarity applies an attenuation weight of `0.35`.

This helps reduce false matches caused by ambiguous terms or unrelated usage.

### Transformer and Baseline Matching

The system provides six matching choices:

1. **Sentence-BERT** — `all-MiniLM-L6-v2` Sentence Transformer.
2. **BERT** — `bert-base-uncased` with mean pooling.
3. **RoBERTa** — `roberta-base` with mean pooling.
4. **DistilBERT** — `distilbert-base-uncased` with mean pooling.
5. **MPNet** — `all-mpnet-base-v2` Sentence Transformer.
6. **Proposed Hybrid** — an ensemble of MPNet, RoBERTa, lexical matching, taxonomy category affinity, and CASD.

For the Hugging Face baseline models, the code mean-pools the final hidden-state tokens while respecting the attention mask. Outputs are normalized and compared using cosine similarity.

### Proposed Hybrid Formula

The hybrid raw ensemble score is:

```text
0.45 × MPNet similarity
+ 0.25 × RoBERTa similarity
+ 0.15 × lexical n-gram/token similarity
+ 0.15 × ESCO category affinity
```

The result is then multiplied by the CASD context weight and clipped to the range `[0, 1]`.

### Lexical Similarity

The lexical component combines:

- token-set intersection-over-union; and
- character trigram overlap.

A canonical alias match receives full lexical similarity.

### Threshold Calibration

Forty calibration pairs are used to grid-search thresholds from `0.40` to `0.90` in `0.02` increments. For each model, the threshold that produces the best F1 score is selected.

### Gap Coverage

```text
coverage = matched explicit skills + matched implicit skills
           / (explicit required skills + implicit prerequisite skills)
```

Overall similarity is the mean of the best similarity score for each explicit job-description skill.

### Upskilling Roadmap

- **Phase 1**: up to five implicit prerequisite gaps, estimated at 2–3 weeks each.
- **Phase 2**: explicit skill gaps, estimated at 3–4 weeks each.

Each implicit roadmap item identifies the explicit job requirements that triggered it.

## Backend Dependencies

The backend requirements are declared in `backend/requirements.txt`:

| Dependency | Intended Purpose |
|---|---|
| `fastapi==0.111.0` | REST API framework |
| `uvicorn[standard]==0.29.0` | ASGI server and auto-reload support |
| `python-multipart==0.0.9` | Multipart PDF and text uploads |
| `pypdf==4.2.0` | PDF text extraction |
| `sentence-transformers==3.0.1` | MiniLM and MPNet sentence embeddings |
| `transformers==4.41.2` | Hugging Face BERT, RoBERTa, and DistilBERT |
| `torch==2.3.1` | Model loading and tensor inference |
| `scikit-learn==1.5.0` | Threshold and classification metrics |
| `numpy==1.26.4` | Embedding and matrix operations |
| `pandas==2.2.2` | Tabular data support |
| `reportlab==4.2.0` | Styled PDF report generation |
| `python-jose==3.3.0` | JWT-related support |
| `httpx==0.27.0` | HTTP client support |
| `aiofiles==23.2.1` | Asynchronous file operations |
| `pydantic==2.7.1` | API schema validation |

CUDA-enabled PyTorch may be used automatically when a compatible GPU is available. Otherwise, the system uses CPU inference.

## Frontend Dependencies

The frontend dependencies are declared in `frontend/package.json`:

| Dependency | Purpose |
|---|---|
| `react` | Component framework |
| `react-dom` | DOM rendering |
| `react-router-dom` | Page routing |
| `axios` | HTTP API calls |
| `recharts` | Charts and dashboards |
| `react-dropzone` | Drag-and-drop PDF upload |
| `react-hot-toast` | Success and error notifications |
| `lucide-react` | Icon library |
| `framer-motion` | UI animation |
| `clsx` | Conditional CSS classes |
| `vite` | Development server and build tool |
| `@vitejs/plugin-react` | React/Vite integration |
| `tailwindcss` | Utility-first styling |
| `postcss` | CSS transformations |
| `autoprefixer` | Cross-browser CSS prefix support |

## Software and Tools Used

The project can be developed and run using:

- **Windows 10 or 11** for the provided batch launchers.
- **Python 3.10 or 3.11** is recommended for the pinned dependency set; Python 3.12+ may require dependency compatibility adjustments.
- **Node.js and npm** for the React/Vite frontend.
- **Visual Studio Code** or another source-code editor.
- **Git** for source control.
- **GitHub** for remote repository hosting.
- **A terminal or PowerShell** for backend and frontend commands.
- **A modern browser** such as Microsoft Edge, Chrome, or Firefox.
- **Internet access on the first model download**, unless the models are already cached locally.
- **Optional NVIDIA GPU and CUDA-compatible PyTorch** for faster inference.

## Installation

Open PowerShell and move to the project root:

```powershell
cd "C:\Users\drago\OneDrive\Desktop\AI RESUME ANALYZER - Copy\SKILL-GAP-ANALYSER-main\SKILL-GAP-ANALYSER-main"
```

### 1. Create a Python environment

Using standard Python:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

If PowerShell blocks activation, run:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
```

Using Conda:

```powershell
conda create -n resume-analyzer python=3.10
conda activate resume-analyzer
cd backend
python -m pip install -r requirements.txt
```

### 2. Install frontend dependencies

```powershell
cd ..\frontend
npm install
```

## Running the Application

### Recommended Windows startup

From the project root:

```powershell
.\start_app.bat
```

This calls `run_backend.bat` and `run_frontend.bat` in separate terminal windows.

### Manual backend startup

Activate the Python environment and run:

```powershell
cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

The backend is available at:

- API: `http://localhost:8000`
- Swagger documentation: `http://localhost:8000/docs`
- ReDoc documentation: `http://localhost:8000/redoc`
- Health endpoint: `http://localhost:8000/health`

### Manual frontend startup

Open a second terminal:

```powershell
cd frontend
npm run dev
```

The frontend is available at:

- `http://localhost:5173`

### Production-style frontend build

```powershell
cd frontend
npm run build
npm run preview
```

The preview server provides a local production-style build. Deploying the frontend separately also requires configuring it to reach the FastAPI origin.

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Service metadata |
| `GET` | `/health` | Health, loaded-model status, device, ESCO count, and version |
| `GET` | `/api/models` | Available models, calibrated thresholds, and benchmark metrics |
| `GET` | `/api/esco/skills` | Taxonomy categories and skill prerequisites |
| `POST` | `/api/analyze` | Analyze resume and job-description inputs |
| `GET` | `/api/report/{report_id}/csv` | Download a CSV report |
| `GET` | `/api/report/{report_id}/pdf` | Download a PDF report |

### Analyze Request

Send a multipart form request using either text or PDF fields:

```text
resume_file=<PDF> or resume_text=<text>
jd_file=<PDF> or jd_text=<text>
model_name=Proposed Hybrid
```

Supported model names:

- `Proposed Hybrid`
- `Sentence-BERT`
- `BERT`
- `RoBERTa`
- `DistilBERT`
- `MPNet`

## Input and Output

### Accepted Input

- Resume: PDF or plain text; resume text must contain at least 30 characters.
- Job description: PDF or plain text; text must contain at least 20 characters.
- Maximum resume PDF size: 10 MB.
- Maximum uploaded job-description size is not separately enforced beyond normal request handling.

### Analysis Output

The response includes:

- resume and job-description previews;
- selected model;
- extracted candidate mentions and context;
- canonical job-description requirements;
- inferred implicit prerequisites;
- matched skills;
- explicit and implicit gap details;
- priority and triggering requirements;
- skill coverage percentage;
- overall similarity score;
- per-skill similarity scores;
- benchmark metrics for all models;
- an upskilling roadmap; and
- a report ID.

### Report Storage

Generated analysis JSON files are stored in `backend/app/reports/{report_id}.json`. CSV and PDF files are generated in the same directory when requested.

## Model Benchmarking

The benchmark metrics displayed by the application are precomputed values associated with the calibration evaluation in the project. They are presented for dashboard and comparison purposes and should be distinguished from a new evaluation performed on arbitrary user documents.

| Model | Accuracy | Precision | Recall | F1 | Explicit Gap F1 | Implicit Discovery |
|---|---:|---:|---:|---:|---:|---:|
| Proposed Hybrid | 95.00% | 95.24% | 95.24% | 0.9524 | 0.9333 | 90.00% |
| MPNet | 90.00% | 88.89% | 93.33% | 0.9106 | 0.8667 | 80.00% |
| Sentence-BERT | 87.50% | 85.71% | 90.00% | 0.8780 | 0.8333 | 75.00% |
| RoBERTa | 85.00% | 83.33% | 87.50% | 0.8537 | 0.8000 | 71.43% |
| BERT | 80.00% | 77.78% | 87.50% | 0.8235 | 0.7500 | 66.67% |
| DistilBERT | 77.50% | 75.00% | 85.00% | 0.7971 | 0.7273 | 62.50% |

## Configuration and Environment

### CORS

The backend allows the following frontend origins:

- `http://localhost:5173`
- `http://127.0.0.1:5173`
- `http://localhost:3000`
- `http://127.0.0.1:3000`

### Vite Proxy

`frontend/vite.config.js` proxies:

- `/api` to `http://localhost:8000`;
- `/health` to `http://localhost:8000`.

### Hugging Face Model Cache

Models may be downloaded automatically on first startup. They are cached locally by Hugging Face. An HF token is optional for public model downloads, but `HF_TOKEN` can be used when higher download limits or private resources are needed.

### GPU Selection

The backend checks whether PyTorch detects CUDA. No GPU configuration is required for CPU-only execution.

## Troubleshooting

### Frontend says the backend is unavailable

Confirm that:

- FastAPI is listening on port `8000`;
- Vite is listening on port `5173`;
- no firewall rule blocks local traffic; and
- model startup has finished.

Check:

```powershell
Invoke-RestMethod http://localhost:8000/health
```

### Backend remains in initializing state

The initial startup can take several minutes while downloading or loading transformer models. A fallback encoder is used if a pretrained model cannot be downloaded or loaded.

### Backend package errors

Use the pinned requirements rather than independently installing newer versions:

```powershell
python -m pip install -r requirements.txt
```

If pinned packages conflict with an existing environment, create a clean virtual environment.

### Node dependency errors

From `frontend`:

```powershell
Remove-Item -Recurse -Force node_modules
Remove-Item package-lock.json
npm install
npm run dev
```

Only remove `package-lock.json` if dependency lock regeneration is intentional.

### PDF text extraction is empty

The PDF may contain scanned images instead of selectable text. Use a text-based PDF or OCR the document before uploading it.

### Vite proxy returns `ECONNREFUSED`

Stop and restart both servers. Start the backend before opening or refreshing the frontend, and verify port `8000` is not occupied by another process.

## License

Add the project's license file before public distribution. Until one is added, copyright and reuse terms remain unspecified.
