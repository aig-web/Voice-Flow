# Voice-Flow - Kanban Task Cards

**For:** Copy-paste into Vibe-Kanban
**Format:** One card per task ID

---

## 1.1.x - API Key & Secrets Management

### Card: 1.1.1
**Title:** Remove exposed API key from .env.example
**Description:** The OpenRouter API key is exposed in `backend/.env.example`. Replace with placeholder like `sk-or-xxxx`.
**Files:** `backend/.env.example`
**Labels:** Security, Critical
**Acceptance:** No real API keys in any committed files

### Card: 1.1.2
**Title:** Add .env to .gitignore
**Description:** Ensure `.env` file is in `.gitignore` so secrets are never committed.
**Files:** `.gitignore`
**Labels:** Security
**Acceptance:** `git status` doesn't show .env files

### Card: 1.1.3
**Title:** Create .env.production.example
**Description:** Create a production environment template with all required variables documented.
**Files:** `backend/.env.production.example`
**Labels:** Config
**Acceptance:** All prod variables documented with safe placeholders

### Card: 1.1.4
**Title:** Document secret rotation process
**Description:** Write documentation on how to rotate API keys and secrets.
**Files:** `docs/SECRET_ROTATION.md`
**Labels:** Docs
**Acceptance:** Clear steps for rotating each secret type

---

## 1.2.x - Rate Limiting

### Card: 1.2.1
**Title:** Import RateLimiter in main.py
**Description:** Import the existing `RateLimiter` class from `rate_limiter.py` into `main.py`.
**Files:** `backend/main.py`
**Labels:** Security
**Acceptance:** RateLimiter imported and initialized

### Card: 1.2.2
**Title:** Apply rate limiter to /api/transcribe
**Description:** Add rate limiting to the transcription endpoint. Suggest 10 requests/minute for streaming.
**Files:** `backend/routers/transcription.py`
**Labels:** Security, High
**Acceptance:** Returns 429 when rate exceeded

### Card: 1.2.3
**Title:** Apply rate limiter to /api/settings
**Description:** Add rate limiting to settings endpoint. Suggest 30 requests/minute.
**Files:** `backend/routers/settings.py`
**Labels:** Security
**Acceptance:** Returns 429 when rate exceeded

### Card: 1.2.4
**Title:** Apply rate limiter to /api/modes
**Description:** Add rate limiting to modes endpoint. Suggest 30 requests/minute.
**Files:** `backend/routers/modes.py`
**Labels:** Security
**Acceptance:** Returns 429 when rate exceeded

### Card: 1.2.5
**Title:** Apply rate limiter to /api/snippets
**Description:** Add rate limiting to snippets endpoint. Suggest 30 requests/minute.
**Files:** `backend/routers/snippets.py`
**Labels:** Security
**Acceptance:** Returns 429 when rate exceeded

### Card: 1.2.6
**Title:** Apply rate limiter to /api/transcriptions
**Description:** Add rate limiting to transcriptions history endpoint. Suggest 30 requests/minute.
**Files:** `backend/routers/transcription.py`
**Labels:** Security
**Acceptance:** Returns 429 when rate exceeded

### Card: 1.2.7
**Title:** Add Retry-After header to 429 responses
**Description:** When rate limit exceeded, include `Retry-After` header with seconds to wait.
**Files:** `backend/services/rate_limiter.py`
**Labels:** Enhancement
**Acceptance:** 429 responses include Retry-After header

### Card: 1.2.8
**Title:** Make rate limits configurable via env
**Description:** Allow rate limits to be configured via environment variables.
**Files:** `backend/services/rate_limiter.py`, `.env.example`
**Labels:** Config
**Acceptance:** Can change limits without code changes

---

## 1.3.x - CORS Configuration

### Card: 1.3.1
**Title:** Remove "*" from CORS allowed origins
**Description:** Change CORS from allowing all origins to specific origins only. Current issue at `backend/main.py:93`.
**Files:** `backend/main.py`
**Labels:** Security, High
**Acceptance:** Only localhost origins allowed

### Card: 1.3.2
**Title:** Add env variable for allowed origins
**Description:** Make CORS origins configurable via environment variable `ALLOWED_ORIGINS`.
**Files:** `backend/main.py`, `.env.example`
**Labels:** Config
**Acceptance:** Origins can be set via env

### Card: 1.3.3
**Title:** Configure production origins list
**Description:** Document what origins should be allowed in production (e.g., app protocol, localhost).
**Files:** `docs/DEPLOYMENT.md`
**Labels:** Docs
**Acceptance:** Clear list of prod origins

---

## 1.4.x - Input Validation

### Card: 1.4.1
**Title:** Add Pydantic models for all request bodies
**Description:** Create Pydantic models for request validation on all POST endpoints.
**Files:** `backend/models/requests.py` (new)
**Labels:** Security
**Acceptance:** All POST endpoints use Pydantic models

### Card: 1.4.2
**Title:** Add request size limits to all endpoints
**Description:** Limit request body size to prevent DoS attacks.
**Files:** `backend/main.py`
**Labels:** Security
**Acceptance:** Large requests rejected

### Card: 1.4.3
**Title:** Validate transcription text length
**Description:** Add max length validation for transcription text (suggest 50000 chars).
**Files:** `backend/routers/transcription.py`
**Labels:** Security
**Acceptance:** Long text rejected with error

### Card: 1.4.4
**Title:** Validate dictionary entry limits
**Description:** Limit number of dictionary entries and entry length.
**Files:** `backend/routers/settings.py`
**Labels:** Security
**Acceptance:** Too many entries rejected

### Card: 1.4.5
**Title:** Sanitize user inputs
**Description:** Escape/sanitize user inputs to prevent injection attacks.
**Files:** All routers
**Labels:** Security
**Acceptance:** No XSS or injection possible

---

## 1.5.x - Authentication

### Card: 1.5.1
**Title:** Complete Firebase token validation
**Description:** Ensure all Firebase token validation is working correctly in `firebase_auth.py`.
**Files:** `backend/services/firebase_auth.py`
**Labels:** Auth, High
**Acceptance:** Invalid tokens rejected

### Card: 1.5.2
**Title:** Add auth middleware to all user-data endpoints
**Description:** Require authentication for all endpoints that access user data.
**Files:** All routers
**Labels:** Auth
**Acceptance:** Unauthenticated requests return 401

### Card: 1.5.3
**Title:** Implement token refresh in frontend
**Description:** Auto-refresh Firebase tokens before expiry (tokens last 1 hour).
**Files:** `windows/frontend/src/renderer/App.tsx`
**Labels:** Auth
**Acceptance:** Users stay logged in beyond 1 hour

### Card: 1.5.4
**Title:** Add logout functionality
**Description:** Implement logout that clears tokens and session.
**Files:** Frontend components
**Labels:** Auth
**Acceptance:** User can log out

### Card: 1.5.5
**Title:** Add session persistence
**Description:** Persist auth session across app restarts.
**Files:** Frontend
**Labels:** Auth
**Acceptance:** User stays logged in after restart

---

## 2.1.x - Logging System

### Card: 2.1.1
**Title:** Import and call setup_logging() in main.py
**Description:** The logging module exists but isn't used. Import from `logging_config.py` and call `setup_logging()`.
**Files:** `backend/main.py`
**Labels:** Stability
**Acceptance:** Logs written to file

### Card: 2.1.2
**Title:** Replace print() with proper logging
**Description:** Replace all `print()` statements with `logger.info()`, `logger.error()`, etc.
**Files:** All backend files
**Labels:** Stability
**Acceptance:** No print statements in production code

### Card: 2.1.3
**Title:** Add structured logging to all endpoints
**Description:** Log request/response for all API endpoints with request IDs.
**Files:** All routers
**Labels:** Stability
**Acceptance:** All requests logged

### Card: 2.1.4
**Title:** Configure log rotation for production
**Description:** Ensure logs rotate and don't fill up disk.
**Files:** `backend/logging_config.py`
**Labels:** Stability
**Acceptance:** Logs rotate at 5MB

---

## 2.2.x - Error Handling

### Card: 2.2.1
**Title:** Add global exception handler middleware
**Description:** Catch all unhandled exceptions and return proper error responses.
**Files:** `backend/main.py`
**Labels:** Stability
**Acceptance:** No 500 errors with stack traces

### Card: 2.2.2
**Title:** Create error codes for user-facing errors
**Description:** Define error codes like `RATE_LIMIT_EXCEEDED`, `AUTH_REQUIRED`, etc.
**Files:** `backend/models/errors.py` (new)
**Labels:** Enhancement
**Acceptance:** All errors have codes

### Card: 2.2.3
**Title:** Add circuit breaker for OpenRouter API
**Description:** Implement circuit breaker to handle API failures gracefully.
**Files:** `backend/services/ai_polish_service.py`
**Labels:** Stability
**Acceptance:** App works when OpenRouter is down

### Card: 2.2.4
**Title:** Add frontend error boundaries to all components
**Description:** Wrap components in error boundaries to prevent crashes.
**Files:** Frontend components
**Labels:** Stability
**Acceptance:** Component errors don't crash app

---

## 2.3.x - Database

### Card: 2.3.1
**Title:** Install Alembic for migrations
**Description:** Add Alembic to manage database schema changes.
**Files:** `backend/requirements.txt`, new migration files
**Labels:** Database
**Acceptance:** `alembic upgrade head` works

### Card: 2.3.2
**Title:** Create initial migration from current schema
**Description:** Generate migration from existing SQLAlchemy models.
**Files:** `backend/alembic/versions/`
**Labels:** Database
**Acceptance:** Migration matches current DB

### Card: 2.3.3
**Title:** Setup automated daily backups
**Description:** Script to backup SQLite database daily.
**Files:** `scripts/backup.py`
**Labels:** Database
**Acceptance:** Daily backups created

### Card: 2.3.4
**Title:** Add backup verification script
**Description:** Script to verify backups are valid and restorable.
**Files:** `scripts/verify_backup.py`
**Labels:** Database
**Acceptance:** Can restore from backup

### Card: 2.3.5
**Title:** Document disaster recovery process
**Description:** Document how to restore from backup.
**Files:** `docs/DISASTER_RECOVERY.md`
**Labels:** Docs
**Acceptance:** Clear restore steps

---

## 3.1.x - Build System

### Card: 3.1.1
**Title:** Create build_engine.spec for PyInstaller
**Description:** Create PyInstaller spec file for bundling backend.
**Files:** `build_engine.spec`
**Labels:** Distribution, High
**Acceptance:** PyInstaller builds successfully

### Card: 3.1.2
**Title:** Fix Windows build script
**Description:** Update `build.ps1` to work with current project structure.
**Files:** `windows/build.ps1`
**Labels:** Distribution
**Acceptance:** Windows build works

### Card: 3.1.3
**Title:** Setup macOS build process
**Description:** Create macOS build script.
**Files:** `mac/build.sh`
**Labels:** Distribution
**Acceptance:** macOS build works

### Card: 3.1.4
**Title:** Version management (single source of truth)
**Description:** Store version in one place and read from there.
**Files:** `package.json`, build scripts
**Labels:** Distribution
**Acceptance:** Version from single source

---

## 3.2.x - Code Signing

### Card: 3.2.1
**Title:** Purchase Windows code signing certificate
**Description:** Get EV or standard code signing cert from Sectigo/DigiCert.
**Files:** External
**Labels:** Distribution
**Acceptance:** Certificate obtained

### Card: 3.2.2
**Title:** Configure certificate in build process
**Description:** Update build script to sign .exe with certificate.
**Files:** `windows/build.ps1`
**Labels:** Distribution
**Acceptance:** Built exe is signed

### Card: 3.2.3
**Title:** Setup Apple Developer account for macOS
**Description:** Create Apple Developer account for code signing.
**Files:** External
**Labels:** Distribution
**Acceptance:** Account created

### Card: 3.2.4
**Title:** Configure notarization for macOS
**Description:** Setup notarization in macOS build process.
**Files:** `mac/build.sh`
**Labels:** Distribution
**Acceptance:** macOS app notarized

---

## 3.3.x - Auto-Update System

### Card: 3.3.1
**Title:** Install electron-updater package
**Description:** Add electron-updater to enable auto-updates.
**Files:** `windows/app/package.json`
**Labels:** Distribution
**Acceptance:** Package installed

### Card: 3.3.2
**Title:** Configure update server
**Description:** Setup GitHub Releases or S3 for hosting updates.
**Files:** Config files
**Labels:** Distribution
**Acceptance:** Update server configured

### Card: 3.3.3
**Title:** Create version manifest JSON
**Description:** Create `latest.json` with version info for update checks.
**Files:** Release server
**Labels:** Distribution
**Acceptance:** Manifest available

### Card: 3.3.4
**Title:** Implement update check on app startup
**Description:** Check for updates when app starts.
**Files:** Electron main process
**Labels:** Distribution
**Acceptance:** Updates detected

### Card: 3.3.5
**Title:** Add update notification UI
**Description:** Show update available notification to user.
**Files:** Frontend
**Labels:** Distribution
**Acceptance:** User sees update prompt

### Card: 3.3.6
**Title:** Test update flow end-to-end
**Description:** Full test of update from one version to another.
**Files:** -
**Labels:** QA
**Acceptance:** Update works completely

---

## 4.1.x - Error Tracking (Sentry)

### Card: 4.1.1
**Title:** Create Sentry account
**Description:** Sign up for Sentry and create project.
**Files:** External
**Labels:** Observability
**Acceptance:** Sentry project created

### Card: 4.1.2
**Title:** Install Sentry SDK in backend
**Description:** Add Sentry SDK to backend for error tracking.
**Files:** `backend/requirements.txt`, `backend/main.py`
**Labels:** Observability
**Acceptance:** Backend errors sent to Sentry

### Card: 4.1.3
**Title:** Install Sentry SDK in frontend
**Description:** Add Sentry SDK to React frontend.
**Files:** `windows/frontend/package.json`
**Labels:** Observability
**Acceptance:** Frontend errors sent to Sentry

### Card: 4.1.4
**Title:** Configure error capture rules
**Description:** Filter out noise, capture important errors.
**Files:** Sentry config
**Labels:** Observability
**Acceptance:** Only relevant errors captured

### Card: 4.1.5
**Title:** Setup Sentry alerts
**Description:** Configure alerts for critical errors.
**Files:** Sentry dashboard
**Labels:** Observability
**Acceptance:** Alerts working

---

## 5.1.x - Payment Integration (Stripe)

### Card: 5.1.1
**Title:** Create Stripe account
**Description:** Sign up for Stripe and get API keys.
**Files:** External
**Labels:** Monetization
**Acceptance:** Stripe account active

### Card: 5.1.2
**Title:** Design pricing tiers
**Description:** Define free vs premium features and pricing.
**Files:** `docs/PRICING.md`
**Labels:** Monetization
**Acceptance:** Pricing defined

### Card: 5.1.3
**Title:** Implement checkout endpoint
**Description:** Create `/api/subscriptions/checkout` endpoint.
**Files:** `backend/routers/subscriptions.py`
**Labels:** Monetization
**Acceptance:** Checkout works

### Card: 5.1.4
**Title:** Implement webhook handlers
**Description:** Handle Stripe webhook events (payment, cancellation).
**Files:** `backend/routers/webhooks.py`
**Labels:** Monetization
**Acceptance:** Webhooks processed

### Card: 5.1.5
**Title:** Add subscription model to database
**Description:** Create Subscription table with status, plan, dates.
**Files:** `backend/database.py`
**Labels:** Monetization
**Acceptance:** Subscription model created

---

## 5.2.x - Feature Gating

### Card: 5.2.1
**Title:** Define free vs premium features
**Description:** Document which features require premium.
**Files:** `docs/FEATURES.md`
**Labels:** Monetization
**Acceptance:** Feature list documented

### Card: 5.2.2
**Title:** Implement usage limits for free tier
**Description:** Add limits (e.g., 10 transcriptions/day free).
**Files:** Backend routers
**Labels:** Monetization
**Acceptance:** Limits enforced

### Card: 5.2.3
**Title:** Add premium feature checks
**Description:** Check premium status before allowing features.
**Files:** Backend routers
**Labels:** Monetization
**Acceptance:** Premium features gated

### Card: 5.2.4
**Title:** Create upgrade prompts UI
**Description:** Show upgrade prompts when user hits limits.
**Files:** Frontend
**Labels:** Monetization
**Acceptance:** Upgrade prompts shown

---

## Summary: Task Count by Section

| Section | Tasks |
|---------|-------|
| 1.1.x API Keys | 4 |
| 1.2.x Rate Limiting | 8 |
| 1.3.x CORS | 3 |
| 1.4.x Validation | 5 |
| 1.5.x Auth | 5 |
| 2.1.x Logging | 4 |
| 2.2.x Errors | 4 |
| 2.3.x Database | 5 |
| 3.1.x Build | 4 |
| 3.2.x Signing | 4 |
| 3.3.x Updates | 6 |
| 4.1.x Sentry | 5 |
| 5.1.x Stripe | 5 |
| 5.2.x Gating | 4 |
| **Total** | **66 tasks** |

**Recommended Order:**
1. All 1.1.x (4 tasks) → 2. All 1.2.x (8 tasks) → 3. All 1.3.x (3 tasks) → continue...
