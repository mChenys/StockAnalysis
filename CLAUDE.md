# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-powered real-time stock analysis system with multi-model AI support, news monitoring, technical analysis, and WeChat push notifications.

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
```

## Architecture

### Core Components

- **`src/app.js`** - Application entry point, Express server setup, WebSocket initialization
- **`src/ai/modelManager.js`** - AI model registry supporting OpenAI-compatible APIs (OpenAI, NVIDIA NIM, etc.)
- **`src/analyzer/aiAnalyzer.js`** - 9-dimension stock analysis engine (technical, fundamental, sentiment, risk, macro, competition, short/long-term, advice)
- **`src/agent/stockAgent.js`** - Conversational AI agent with tool-calling capabilities (stock prices, technical indicators, news search)
- **`src/scheduler/taskScheduler.js`** - Cron-based task scheduling (market analysis, news monitoring, health checks)

### Data Layer

- **`src/database/connection.js`** - MongoDB connection with automatic in-memory fallback when MongoDB unavailable
- **Models**: `ModelConfig`, `NewsItem`, `User`, `Task`, `Favorite`, `Topic`, `AgentSession`

### Routes Structure

- `/api/auth` - Authentication (JWT-based)
- `/api/users` - User management
- `/api/news` - News operations
- `/api/agent` - AI Agent chat endpoint
- `/api/tasks` - Scheduled task management
- `/api/models` - AI model CRUD operations
- `/api/analysis` - Stock analysis endpoints
- `/api/trendradar` - TrendRadar Python service integration

### Python Service

Located in `python_service/`:
- **TrendRadar** - Financial news aggregation and analysis
- **Agno Agent** - Enhanced AI agent with yfinance integration
- Uses virtual environment at `python_service/venv/`

## Key Patterns

### Dual-Mode Operation
The system operates in two modes:
1. **MongoDB mode** - Full persistence when MongoDB is available
2. **In-memory mode** - Automatic fallback for development without MongoDB

Check `global.isInMemory` to handle data storage appropriately.

### AI Model Configuration
Models are stored in MongoDB and cached in memory. Use `modelManager.loadModels()` to sync. Models must have: `name`, `provider`, `model`, `apiKey`, `baseUrl` (for custom endpoints).

### WebSocket Events
- `analysis_result` - Stock analysis completed
- `trendradar_status` - TrendRadar generation progress
- `model_status_changed` - Model added/updated/deleted

### Agent Tool-Calling Flow
The agent uses a custom tool-calling protocol:
1. LLM outputs `TOOL_CALL_START\n[{tool, args}]\nTOOL_CALL_END`
2. System executes tools and returns data
3. LLM generates final analysis based on real data

## Environment Variables

See `.env.example` for required configuration:
- `MONGODB_URI` - MongoDB connection (optional, falls back to in-memory)
- `PORT` - Server port (default: 3000)
- AI API keys for various providers
- WeChat push notification credentials
- `JWT_SECRET` - JWT signing secret

## Code Style

- JavaScript (CommonJS modules)
- 2-space indentation
- Single quotes for strings
- Async/await preferred over callbacks
- Winston for logging (`src/utils/logger.js`)
- JSDoc comments for functions