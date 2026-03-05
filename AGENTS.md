# AGENTS.md - Agent Collaboration Protocol for StockAnalysis

This document codifies how autonomous agentic workers (agents) should operate inside this repository. It enables predictable, safe, and auditable collaboration between human engineers and AI agents that operate on code, tests, and configuration.

Notes:
- This file is intended for agentic actors (e.g., task runners, code transformers, lint bots).
- It complements project-specific conventions in README and existing scripts.

## 1) Core Principles
- Do no harm: avoid breaking builds, tests, or data in ways users rely on.
- Be explicit: document decisions, assumptions, and rationales in patches or commit messages.
- Safety first: never commit sensitive information or bypass tests without explicit user approval.
- Incremental changes: prefer small, well-scoped edits over large rewrites.
- Observability: add logging and comments where decisions may be audited later.

## 2) System Architecture Overview

This is an AI-powered real-time stock analysis system with multi-model AI support. The system integrates Node.js backend with Python services.

### Core Architecture Components

```
Node.js Backend (Express + WebSocket)
├── AI Model Manager - Multi-provider model registry (OpenAI, NVIDIA NIM, etc.)
├── 9-Dimension Stock Analyzer - Technical, fundamental, sentiment, risk, macro analysis
├── AI Agent - Conversational agent with tool-calling capabilities
├── Task Scheduler - Cron-based automated tasks
└── Data Layer - MongoDB with in-memory fallback

Python Services (python_service/)
├── TrendRadar - Financial news aggregation and sentiment analysis
├── vnpy_service - Trading strategy service
└── stock_data.py - Real-time stock data fetching
```

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| Application Entry | `src/app.js` | Express server, WebSocket initialization |
| Model Manager | `src/ai/modelManager.js` | Manages multiple AI providers (OpenAI, NVIDIA NIM, etc.) |
| Stock Analyzer | `src/analyzer/aiAnalyzer.js` | 9-dimension analysis engine |
| AI Agent | `src/agent/stockAgent.js` | Conversational agent with tool calling |
| Task Scheduler | `src/scheduler/taskScheduler.js` | Cron-based task management |
| Python Client | `src/services/pythonClient.js` | Bridge to Python services |

### AI Model Manager

Manages multiple AI providers through a unified interface. Supports OpenAI, NVIDIA NIM, OpenRouter, and any OpenAI-compatible API.

```javascript
// Key APIs
modelManager.loadModels()           // Sync models from database
modelManager.addModel(config)       // Add new model configuration
modelManager.callModel(prompt, id)  // Execute AI call
modelManager.getModels()            // Get all available models
```

### 9-Dimension Stock Analysis

The analyzer performs comprehensive stock analysis across 9 dimensions:
- Technical (price patterns, RSI, MACD, moving averages)
- Fundamental (financial metrics, P/E, revenue growth)
- Sentiment (market sentiment, news analysis)
- Risk (volatility, downside analysis)
- Macro (economic factors, industry trends)
- Competition (peer comparison, market position)
- Short-term prediction
- Long-term outlook
- Investment advice

### AI Agent Tool-Calling Protocol

The AI agent uses a structured tool-calling protocol:
1. LLM outputs `TOOL_CALL_START\n[{tool, args}]\nTOOL_CALL_END`
2. System executes tools and returns data
3. LLM generates final analysis based on real data

Available tools: `getStockPrice`, `getTechnicalIndicators`, `searchNews`, `analyzeStock`

### Dual-Mode Database Operation

The system supports both MongoDB and in-memory storage:
- Check `global.isInMemory` to determine current mode
- Automatic fallback to in-memory when MongoDB unavailable
- Data models in `src/database/models/`

### WebSocket Events

| Event | Description |
|-------|-------------|
| `analysis_result` | Stock analysis completed |
| `trendradar_status` | Report generation progress |
| `model_status_changed` | Model config updated |

### API Route Structure

```
/api
├── /auth          # Authentication (JWT-based)
├── /users         # User management
├── /news          # News operations
├── /agent         # AI Agent chat
├── /tasks         # Scheduled tasks CRUD
├── /models        # AI model management
├── /analysis      # Stock analysis
└── /trendradar    # Python service integration
```

## 3) Build, Lint, Test commands (single-test flow included)
- Setup
  - Install dependencies: npm install
  - Python service setup:
    ```bash
    cd python_service
    python -m venv venv
    source venv/bin/activate  # On Windows: venv\Scripts\activate
    pip install -r requirements.txt
    ```
- Build and run
  - Development: npm run dev
  - Production: npm run start
  - Python service: cd python_service && source venv/bin/activate && python main.py
  - TrendRadar: cd python_service && source venv/bin/activate && python -m TrendRadar
- Tests
  - Run all tests with coverage: npm test
  - Watch tests: npm run test:watch
  - Run a single test (best practice):
    - npx jest path/to/file.test.js -t 'test name'
    - or npm test -- path/to/file.test.js -t 'test name'
- Lint
  - Lint the codebase: npm run lint
  - Auto-fix lint issues (where safe): npm run lint -- --fix
- Database and setup tasks
  - Init database: npm run init-db
- Packaging
  - Build production dependencies: npm run build
- Production deployment
  - Start with PM2: npm run pm2:start
  - Restart PM2 process: npm run pm2:restart
  - Stop PM2 process: npm run pm2:stop
  - View PM2 logs: pm2 logs stockanalysis
- Quick sanity check
  - Static checks: npm run lint && npm test

> Note: Some scripts assume a Node.js environment >= 16.0.0 and npm >= 8.0.0 as declared in package.json engines.

## 4) Environment Configuration

Create a `.env` file in the project root (copy from `.env.example`):

```bash
# Server Configuration
PORT=3000
NODE_ENV=development

# Database (optional - system will use in-memory storage if not provided)
MONGODB_URI=mongodb://localhost:27017/stockanalysis

# Authentication
JWT_SECRET=your-jwt-secret-here

# AI Providers (can also be configured via API or web interface)
OPENAI_API_KEY=sk-...
NVIDIA_API_KEY=nvapi-...

# WeChat Push Notifications (optional)
WECHAT_CORPID=...
WECHAT_CORPSECRET=...
WECHAT_AGENTID=...

# Python Service
PYTHON_SERVICE_URL=http://localhost:5001
```

Important: Never commit API keys or secrets to version control. Use environment variables for all sensitive configuration.

## 5) Code Style Guidelines
- Language and ecosystem
  - Primary language: JavaScript (CommonJS modules) per src/app.js usage.
  - Prefer modern, async/await patterns; avoid callback hell.
- Formatting and conventions
  - Indentation: 2 spaces.
  - Semicolons: Use semicolons consistently.
  - Quotes: Prefer single quotes for strings; use double quotes only for template literals or when necessary.
  - File naming: Use camelCase for internal modules (e.g., modelManager.js, taskScheduler.js).
  - Exports: Use module.exports = ... for CommonJS, avoid mixing module patterns.
- Import style and ordering
  - Group imports: built-ins, external libs, internal modules, relative paths.
  - Prefer destructuring where helpful to readability.
- Types and documentation
  - Use JSDoc for functions and complex logic to communicate intent and types.
  - Validate inputs at the boundary of modules; throw clear errors when invalid.
- Error handling and robustness
  - Do not swallow errors; propagate with meaningful messages.
  - Use try/catch around I/O, network, and database operations; log and rethrow where appropriate.
- Logging and observability
  - Use Winston (as in dependencies) for standard logging levels and structured output.
  - Do not log secrets; redact sensitive information from logs.
- Security and data handling
  - Validate external inputs; sanitization where applicable.
  - Environment variables should be accessed through process.env and validated on startup.
- Testing and reliability
  - Tests should be deterministic and fast where possible.
  - Mock external services when feasible; avoid flakey tests caused by network I/O.
- Performance considerations
  - Prefer lazy initialization and caching for expensive computations where safe.
  - Avoid global mutable state; prefer per-request or per-task scoping.
- API design (Express endpoints)
  - Return consistent JSON error shapes; include statusCode, message, and optional data fields.
  - Validate request bodies using middleware before business logic.
- Versioning and changes
  - Each commit should have a clear message focused on the why, not just the what.
  - Include minimal, safe changes; avoid broad refactors when fixing bugs.

## 6) Cursor and Copilot Rules (if present)
- If a project contains Cursor rules under .cursor/rules/ or Copilot rules under .github/copilot-instructions.md, agents MUST:
- Read and respect those rules as part of global coding standards.
- Do not override or disable cursor/copilot constraints without explicit user approval.
- If no such files exist, proceed with the guidelines above.

## 7) Codebase Assessment and adaptation notes
- When introducing changes for a new module, mirror the style of nearby modules.
- Prefer small tests to demonstrate behavior when adding new functionality.
- Document architectural decisions in commit messages or a short inline comment near the change.

## 8) Version control and patching practices (non-destructive)
- Do not push to remote without explicit user instruction.
- Create a focused patch with a descriptive summary:
- Include a short rationale for why the change is needed and what it affects.
- Run diagnostics (lint, tests) before finalizing a patch.

## 9) Verification checklist before finalizing a change
- [ ] Lint passes without errors
- [ ] Tests pass (or run selectively for the affected area)
- [ ] Build succeeds for the target environment
- [ ] No sensitive data in diffs
- [ ] Documentation (AGENTS.md or commit messages) reflects the rationale

## 10) Quick reference: local commands (condensed)
- Install: npm install
- Dev: npm run dev
- Start: npm run start
- Test: npm test
- Lint: npm run lint
- Init DB: npm run init-db
- Build: npm run build
- PM2 start: npm run pm2:start
- PM2 restart: npm run pm2:restart
- PM2 stop: npm run pm2:stop
- Python venv: cd python_service && source venv/bin/activate
- Python service: python main.py
- TrendRadar: python -m TrendRadar

## 11) Important File Paths

- Main application: `src/app.js`
- AI models configuration: `src/ai/modelManager.js`
- Stock analyzer: `src/analyzer/aiAnalyzer.js`
- AI agent: `src/agent/stockAgent.js`
- Task scheduler: `src/scheduler/taskScheduler.js`
- Database models: `src/database/models/`
- API routes: `src/routes/`
- Python services: `python_service/`
- Configuration: `config/`
- Logs: `logs/`

## 12) Python Services

The project includes Python services for enhanced functionality:

**TrendRadar** (`python_service/TrendRadar/`):
- Financial news aggregation from multiple sources
- AI-powered sentiment analysis
- Report generation (HTML, Markdown, DingTalk formats)
- Push notifications (WeChat, DingTalk, Feishu)

**vnpy_service** (`python_service/vnpy_service/`):
- Trading strategy service
- Quantitative trading support

**stock_data.py** (`python_service/stock_data.py`):
- Real-time stock data fetching
- Integration with yfinance and other data sources

When working with Python services:
1. Always activate the virtual environment first
2. Check `requirements.txt` for dependencies
3. Python service logs are in `python_service/python_service.log`
4. The Node.js backend communicates with Python services via `PYTHON_SERVICE_URL`

## 13) Task Scheduler Tasks

The system runs several automated tasks:

| Task | Schedule | Description |
|------|----------|-------------|
| Pre-market Analysis | Before market open | Daily market outlook |
| Intraday Monitor | Every 30min during market | Price alerts, news |
| Post-market Summary | After market close | Daily recap |
| Weekly Report | Weekend | Weekly analysis |
| Health Check | Every 5min | System health monitoring |

Tasks can be managed via the API at `/api/tasks` endpoint.

---

This AGENTS.md is intended to be a practical, living document. Update it whenever project conventions change or when new tooling is introduced.
