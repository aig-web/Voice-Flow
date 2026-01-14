# Voice-Flow Production Readiness Plan

**Project:** Voice-Flow Desktop Voice Transcription App
**Goal:** Make production-ready for public distribution with subscriptions
**Last Updated:** 2026-01-14

---

## 1. SECURITY HARDENING (CRITICAL - Before Any Distribution)

### 1.1 API Key & Secrets Management
- [ ] 1.1.1 Remove exposed OpenRouter API key from `backend/.env.example`
- [ ] 1.1.2 Add `.env` to `.gitignore` if not already
- [ ] 1.1.3 Create `.env.production.example` with placeholder values
- [ ] 1.1.4 Document secret rotation process

### 1.2 Rate Limiting
- [ ] 1.2.1 Import `RateLimiter` in `backend/main.py`
- [ ] 1.2.2 Apply rate limiter to `/api/transcribe` endpoint
- [ ] 1.2.3 Apply rate limiter to `/api/settings` endpoint
- [ ] 1.2.4 Apply rate limiter to `/api/modes` endpoint
- [ ] 1.2.5 Apply rate limiter to `/api/snippets` endpoint
- [ ] 1.2.6 Apply rate limiter to `/api/transcriptions` endpoint
- [ ] 1.2.7 Add 429 response with `Retry-After` header
- [ ] 1.2.8 Make rate limits configurable via environment

### 1.3 CORS Configuration
- [ ] 1.3.1 Remove `"*"` from CORS allowed origins in `backend/main.py:93`
- [ ] 1.3.2 Add environment variable for allowed origins
- [ ] 1.3.3 Configure production origins list

### 1.4 Input Validation
- [ ] 1.4.1 Add Pydantic models for all request bodies
- [ ] 1.4.2 Add request size limits to all endpoints
- [ ] 1.4.3 Validate transcription text length
- [ ] 1.4.4 Validate dictionary entry limits
- [ ] 1.4.5 Sanitize user inputs

### 1.5 Authentication
- [ ] 1.5.1 Complete Firebase token validation
- [ ] 1.5.2 Add auth middleware to all user-data endpoints
- [ ] 1.5.3 Implement token refresh in frontend
- [ ] 1.5.4 Add logout functionality
- [ ] 1.5.5 Add session persistence

---

## 2. STABILITY & ERROR HANDLING

### 2.1 Logging System
- [ ] 2.1.1 Import and call `setup_logging()` in `backend/main.py`
- [ ] 2.1.2 Replace all `print()` statements with proper logging
- [ ] 2.1.3 Add structured logging to all endpoints
- [ ] 2.1.4 Configure log rotation for production

### 2.2 Error Handling
- [ ] 2.2.1 Add global exception handler middleware
- [ ] 2.2.2 Create error codes for user-facing errors
- [ ] 2.2.3 Add circuit breaker for OpenRouter API
- [ ] 2.2.4 Add frontend error boundaries to all components

### 2.3 Database
- [ ] 2.3.1 Install Alembic for migrations
- [ ] 2.3.2 Create initial migration from current schema
- [ ] 2.3.3 Setup automated daily backups
- [ ] 2.3.4 Add backup verification script
- [ ] 2.3.5 Document disaster recovery process

---

## 3. DISTRIBUTION & UPDATES

### 3.1 Build System
- [ ] 3.1.1 Create `build_engine.spec` for PyInstaller
- [ ] 3.1.2 Fix Windows build script
- [ ] 3.1.3 Setup macOS build process
- [ ] 3.1.4 Version management (single source of truth)

### 3.2 Code Signing
- [ ] 3.2.1 Purchase Windows code signing certificate
- [ ] 3.2.2 Configure certificate in build process
- [ ] 3.2.3 Setup Apple Developer account for macOS
- [ ] 3.2.4 Configure notarization for macOS

### 3.3 Auto-Update System
- [ ] 3.3.1 Install `electron-updater` package
- [ ] 3.3.2 Configure update server (GitHub Releases or S3)
- [ ] 3.3.3 Create version manifest JSON
- [ ] 3.3.4 Implement update check on app startup
- [ ] 3.3.5 Add update notification UI
- [ ] 3.3.6 Test update flow end-to-end

---

## 4. OBSERVABILITY

### 4.1 Error Tracking
- [ ] 4.1.1 Create Sentry account
- [ ] 4.1.2 Install Sentry SDK in backend
- [ ] 4.1.3 Install Sentry SDK in frontend
- [ ] 4.1.4 Configure error capture rules
- [ ] 4.1.5 Setup Sentry alerts

### 4.2 Analytics (Optional - After MVP)
- [ ] 4.2.1 Choose analytics provider (PostHog recommended)
- [ ] 4.2.2 Implement basic event tracking
- [ ] 4.2.3 Track transcription usage
- [ ] 4.2.4 Track subscription events

---

## 5. MONETIZATION (After Core is Stable)

### 5.1 Payment Integration
- [ ] 5.1.1 Create Stripe account
- [ ] 5.1.2 Design pricing tiers
- [ ] 5.1.3 Implement checkout endpoint
- [ ] 5.1.4 Implement webhook handlers
- [ ] 5.1.5 Add subscription model to database

### 5.2 Feature Gating
- [ ] 5.2.1 Define free vs premium features
- [ ] 5.2.2 Implement usage limits for free tier
- [ ] 5.2.3 Add premium feature checks
- [ ] 5.2.4 Create upgrade prompts UI

### 5.3 Subscription Management
- [ ] 5.3.1 Build subscription management UI
- [ ] 5.3.2 Implement plan changes
- [ ] 5.3.3 Handle cancellations
- [ ] 5.3.4 Add billing history page

---

## BARE MINIMUM Before Sharing (MVP Checklist)

**Must Have:**
1. [ ] 1.1.1 - Remove exposed API key
2. [ ] 1.2.2 - Rate limit on transcribe endpoint
3. [ ] 1.3.1 - Fix CORS (remove "*")
4. [ ] 1.5.1 - Firebase auth working
5. [ ] 2.3.3 - Database backups
6. [ ] 3.1.1 - Working build system

**Should Have:**
7. [ ] 2.1.1 - Proper logging
8. [ ] 4.1.1 - Error tracking (Sentry)
9. [ ] 3.3.1 - Auto-update system

**Nice to Have (Later):**
10. [ ] 5.1.1 - Stripe integration
11. [ ] 4.2.1 - Analytics

---

## Branch Strategy

| Branch | Purpose | Who Works Here |
|--------|---------|----------------|
| `main` | Stable, production-ready code | Merge only after review |
| `develop` | Integration branch | All features merge here first |
| `feature/*` | Individual features | Individual developers |
| `hotfix/*` | Emergency fixes | Senior dev only |
| `release/*` | Release preparation | PM/Lead |

**Before Merging to Main:**
1. All tests pass
2. Code review completed
3. CLAUDE.md updated if needed
4. No security vulnerabilities
5. TODO items addressed

---

## File Reference

| File | Purpose |
|------|---------|
| `PROJECT_MANAGEMENT/PLAN.md` | This file - detailed plan |
| `PROJECT_MANAGEMENT/COMPLETED.md` | Tasks completed |
| `PROJECT_MANAGEMENT/TODO.md` | Current sprint tasks |
| `CLAUDE.md` | Root project instructions |
| `backend/CLAUDE.md` | Backend-specific instructions |
| `windows/CLAUDE.md` | Windows-specific instructions |
| `mac/CLAUDE.md` | macOS-specific instructions |
