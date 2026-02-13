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

## 2) Build, Lint, Test commands (single-test flow included)
- Setup
  - Install dependencies: npm install
- Build and run
  - Development: npm run dev
  - Production: npm run start
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
- Quick sanity check
  - Static checks: npm run lint && npm test

> Note: Some scripts assume a Node.js environment >= 16.0.0 and npm >= 8.0.0 as declared in package.json engines.

## 3) Code Style Guidelines
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

## 4) Cursor and Copilot Rules (if present)
- If a project contains Cursor rules under .cursor/rules/ or Copilot rules under .github/copilot-instructions.md, agents MUST:
- Read and respect those rules as part of global coding standards.
- Do not override or disable cursor/copilot constraints without explicit user approval.
- If no such files exist, proceed with the guidelines above.

## 5) Codebase Assessment and adaptation notes
- When introducing changes for a new module, mirror the style of nearby modules.
- Prefer small tests to demonstrate behavior when adding new functionality.
- Document architectural decisions in commit messages or a short inline comment near the change.

## 6) Version control and patching practices (non-destructive)
- Do not push to remote without explicit user instruction.
- Create a focused patch with a descriptive summary:
- Include a short rationale for why the change is needed and what it affects.
- Run diagnostics (lint, tests) before finalizing a patch.

## 7) Verification checklist before finalizing a change
- [ ] Lint passes without errors
- [ ] Tests pass (or run selectively for the affected area)
- [ ] Build succeeds for the target environment
- [ ] No sensitive data in diffs
- [ ] Documentation (AGENTS.md or commit messages) reflects the rationale

## 8) Quick reference: local commands (condensed)
- Install: npm install
- Dev: npm run dev
- Start: npm run start
- Test: npm test
- Lint: npm run lint
- Init DB: npm run init-db
- Build: npm run build

This AGENTS.md is intended to be a practical, living document. Update it whenever project conventions change or when new tooling is introduced.
