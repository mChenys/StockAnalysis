# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-powered real-time stock analysis system with multi-model AI support, news monitoring, technical analysis, and WeChat push notifications. The system integrates Node.js backend with Python services for comprehensive financial data analysis and intelligent reporting.

## Development Commands

```bash
# Development
npm run dev          # Start with nodemon (hot reload)
npm start            # Production mode

# Testing
npm test             # Run all tests with coverage
npm run test:watch   # Watch mode for tests
npx jest path/to/file.test.js -t 'test name'  # Single test

# Code Quality
npm run lint         # Lint the codebase
npm run lint -- --fix  # Auto-fix lint issues

# Database
npm run init-db      # Initialize database

# Production
npm run build        # Install production dependencies
npm run pm2:start    # Start with PM2
npm run pm2:restart  # Restart PM2 process
npm run pm2:stop     # Stop PM2 process

# Python Service
cd python_service && source venv/bin/activate  # Activate Python environment
python -m TrendRadar  # Run TrendRadar service
```

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Node.js Backend                        │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐  │
│  │ Express │  │WebSocket │  │ Scheduler│  │  AI Models  │  │
│  │  Server │  │  Server  │  │ (Cron)   │  │  Manager    │  │
│  └────┬────┘  └────┬─────┘  └────┬─────┘  └──────┬──────┘  │
│       │            │             │               │         │
│       └────────────┴─────────────┴───────────────┘         │
│                          │                                  │
│  ┌───────────────────────┴───────────────────────────────┐ │
│  │                    MongoDB / In-Memory                 │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Python Services                          │
│  ┌──────────────────┐  ┌──────────────────────────────┐    │
│  │   TrendRadar     │  │  Agno Agent (yfinance)       │    │
│  │  News Aggregator │  │  Enhanced Stock Analysis     │    │
│  └──────────────────┘  └──────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### Core Components

| Component | File | Description |
|-----------|------|-------------|
| Application Entry | `src/app.js` | Express server setup, WebSocket initialization, middleware config |
| AI Model Manager | `src/ai/modelManager.js` | Multi-provider model registry (OpenAI, NVIDIA NIM, etc.) |
| Stock Analyzer | `src/analyzer/aiAnalyzer.js` | 9-dimension analysis engine |
| AI Agent | `src/agent/stockAgent.js` | Conversational agent with tool-calling |
| Task Scheduler | `src/scheduler/taskScheduler.js` | Cron-based task management |
| Python Client | `src/services/pythonClient.js` | Bridge to Python services |

### AI Model Manager (`src/ai/modelManager.js`)

Manages multiple AI providers through a unified interface:

```javascript
// Key APIs
modelManager.loadModels()     // Sync models from MongoDB
modelManager.addModel(config) // Add new model configuration
modelManager.callModel(prompt, modelId) // Execute AI call
modelManager.getModels()      // Get all available models
```

**Supported Providers**: OpenAI, NVIDIA NIM, OpenRouter, any OpenAI-compatible API

### 9-Dimension Stock Analyzer (`src/analyzer/aiAnalyzer.js`)

| Dimension | Description |
|-----------|-------------|
| Technical | Price patterns, indicators (RSI, MACD, MA) |
| Fundamental | Financial metrics, P/E, revenue growth |
| Sentiment | Market sentiment, news analysis |
| Risk | Volatility, downside analysis |
| Macro | Economic factors, industry trends |
| Competition | Peer comparison, market position |
| Short-term | Near-term price prediction |
| Long-term | Long-term investment outlook |
| Advice | Actionable investment recommendations |

### AI Agent (`src/agent/stockAgent.js`)

Conversational agent with tool-calling capabilities:

```javascript
// Available Tools
tools.getStockPrice(symbol)      // Real-time stock prices
tools.getTechnicalIndicators(symbol) // Technical analysis
tools.searchNews(query)          // News search
tools.analyzeStock(params)       // Comprehensive analysis
```

**Tool-Calling Protocol**:
1. LLM outputs `TOOL_CALL_START\n[{tool, args}]\nTOOL_CALL_END`
2. System executes tools and returns data
3. LLM generates final analysis based on real data

### Task Scheduler (`src/scheduler/taskScheduler.js`)

Cron-based scheduling for automated tasks:

| Task | Schedule | Description |
|------|----------|-------------|
| Pre-market Analysis | Before market open | Daily market outlook |
| Intraday Monitor | Every 30min during market | Price alerts, news |
| Post-market Summary | After market close | Daily recap |
| Weekly Report | Weekend | Weekly analysis |
| Health Check | Every 5min | System health monitoring |

### Data Layer

**Database Connection** (`src/database/connection.js`):
- MongoDB primary with automatic in-memory fallback
- Check `global.isInMemory` for current mode

**Data Models**:

| Model | File | Key Fields |
|-------|------|------------|
| User | `models/User.js` | username, email, password, role, preferences |
| ModelConfig | `models/ModelConfig.js` | name, provider, model, apiKey, baseUrl, maxTokens |
| AgentSession | `models/AgentSession.js` | sessionId, userId, title, messages[] |
| Favorite | `models/Favorite.js` | userId, type, symbol, title, content |
| NewsItem | `models/NewsItem.js` | sourceId, url, title, content, publishedAt |
| Task | `models/Task.js` | userId, name, type, cronExpression, enabled |
| Topic | `models/Topic.js` | name, relevance, relatedSymbols[] |

### Routes Structure

```
/api
├── /auth          # Authentication (JWT-based)
│   ├── POST /login
│   ├── POST /register
│   └── POST /logout
├── /users         # User management
├── /news          # News operations
│   ├── GET /list
│   └── POST /refresh
├── /agent         # AI Agent chat
│   └── POST /chat
├── /tasks         # Scheduled tasks CRUD
├── /models        # AI model management
├── /analysis      # Stock analysis
│   ├── POST /stock/:symbol
│   └── POST /batch
└── /trendradar    # Python service integration
    ├── POST /generate
    └── GET /status
```

### Python Services

Located in `python_service/`:

**TrendRadar** - Financial news aggregation and analysis:
- Multi-source news fetching (Sina, EastMoney, etc.)
- AI-powered sentiment analysis
- Report generation (HTML, Markdown, DingTalk)
- Push notifications (WeChat, DingTalk, Feishu)

**Agno Agent** - Enhanced AI agent:
- yfinance integration for real-time data
- Advanced technical analysis
- Natural language querying

## Key Patterns

### Dual-Mode Operation

```javascript
// Check current mode
if (global.isInMemory) {
  // Use in-memory storage
} else {
  // Use MongoDB
}
```

### WebSocket Events

| Event | Description | Payload |
|-------|-------------|---------|
| `analysis_result` | Stock analysis completed | `{ symbol, result }` |
| `trendradar_status` | Report generation progress | `{ progress, message }` |
| `model_status_changed` | Model config updated | `{ action, model }` |

### Error Handling

```javascript
// Centralized error handler
app.use((err, req, res, next) => {
  logger.error('Request error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});
```

## Environment Variables

```bash
# Server
PORT=3000
NODE_ENV=development

# Database
MONGODB_URI=mongodb://localhost:27017/stockanalysis  # Optional

# Authentication
JWT_SECRET=your-jwt-secret

# AI Providers (configure via API or .env)
OPENAI_API_KEY=sk-...
NVIDIA_API_KEY=nvapi-...

# WeChat Push
WECHAT_CORPID=...
WECHAT_CORPSECRET=...
WECHAT_AGENTID=...

# Python Service
PYTHON_SERVICE_URL=http://localhost:5001
```

## Code Style

- JavaScript (CommonJS modules)
- 2-space indentation
- Single quotes for strings
- Async/await preferred over callbacks
- Winston for logging (`src/utils/logger.js`)
- JSDoc comments for functions

## File Structure

```
src/
├── app.js                 # Application entry
├── ai/
│   └── modelManager.js    # AI model management
├── analyzer/
│   └── aiAnalyzer.js      # Stock analysis engine
├── agent/
│   └── stockAgent.js      # Conversational AI agent
├── database/
│   ├── connection.js      # MongoDB connection
│   └── models/            # Mongoose models
├── routes/
│   └── api.js             # API routes
├── scheduler/
│   └── taskScheduler.js   # Cron tasks
├── services/
│   └── pythonClient.js    # Python service client
├── utils/
│   └── logger.js          # Winston logger
└── public/                # Static files

python_service/
├── venv/                  # Python virtual environment
├── TrendRadar/            # News aggregation service
└── main.py                # Python entry point
```

## Testing

```bash
# Run all tests
npm test

# Run specific test file
npx jest tests/models.test.js

# Run with coverage
npm test -- --coverage
```

## Deployment

```bash
# PM2 deployment
npm run pm2:start
npm run pm2:restart
npm run pm2:stop

# View logs
pm2 logs stockanalysis
```