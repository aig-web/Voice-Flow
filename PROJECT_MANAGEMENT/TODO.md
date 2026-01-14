# Voice-Flow - Current TODO

**Last Updated:** 2026-01-14
**Current Focus:** MVP / Bare Minimum for Sharing

---

## Immediate: Before Switching to Mac

| ID | Task | Status | Assignee | Branch |
|----|------|--------|----------|--------|
| 0.1 | Commit all pending changes | PENDING | PM | main |
| 0.2 | Push to remote | PENDING | PM | main |

---

## Sprint 1: Bare Minimum Security (MVP)

**Goal:** Fix critical security issues before any external sharing

| ID | Task | Status | Assignee | Branch | Files |
|----|------|--------|----------|--------|-------|
| 1.1.1 | Remove exposed API key from `.env.example` | TODO | - | feature/security-hardening | `backend/.env.example` |
| 1.2.2 | Apply rate limiter to `/api/transcribe` | TODO | - | feature/rate-limiting | `backend/routers/transcription.py` |
| 1.3.1 | Fix CORS - remove "*" wildcard | TODO | - | feature/security-hardening | `backend/main.py` |
| 1.5.1 | Complete Firebase token validation | TODO | - | feature/auth-complete | `backend/services/firebase_auth.py` |

---

## Sprint 2: Stability & Backups

**Goal:** Ensure app doesn't lose data and errors are traceable

| ID | Task | Status | Assignee | Branch | Files |
|----|------|--------|----------|--------|-------|
| 2.1.1 | Setup proper logging | TODO | - | feature/logging | `backend/main.py` |
| 2.2.1 | Add global exception handler | TODO | - | feature/error-handling | `backend/main.py` |
| 2.3.3 | Setup automated backups | TODO | - | feature/db-backups | New script |

---

## Sprint 3: Distribution

**Goal:** Build working installer with auto-updates

| ID | Task | Status | Assignee | Branch | Files |
|----|------|--------|----------|--------|-------|
| 3.1.1 | Create PyInstaller spec file | TODO | - | feature/build-system | `build_engine.spec` |
| 3.2.1 | Get code signing certificate | TODO | - | - | External |
| 3.3.1 | Setup electron-updater | TODO | - | feature/auto-update | `windows/app/package.json` |

---

## Backlog (After MVP)

| ID | Task | Priority | Notes |
|----|------|----------|-------|
| 4.1.1 | Setup Sentry | Medium | After MVP stable |
| 4.2.1 | Setup analytics | Low | After monetization |
| 5.1.1 | Stripe integration | Medium | For subscriptions |
| 5.2.1 | Feature gating | Medium | After Stripe |

---

## How to Use This File

### Starting a Task
```
1. Find task in TODO.md
2. Change Status to "IN PROGRESS"
3. Add your name as Assignee
4. Create branch if not exists
5. Start coding
```

### Completing a Task
```
1. Create PR to develop branch
2. Get code review
3. Merge to develop
4. Change Status to "DONE"
5. Move to COMPLETED.md
6. Update PLAN.md checkbox
```

### Communication Format
```
"Working on 1.2.2 - rate limiter for transcribe endpoint"
"Done with 1.3.1 - CORS fix, ready for review"
"Need help with 2.1.1 - logging setup"
```

---

## Branch Checklist Before PR

- [ ] Code compiles without errors
- [ ] No new security vulnerabilities
- [ ] CLAUDE.md updated if architecture changed
- [ ] No hardcoded secrets/keys
- [ ] Tests pass (if applicable)
- [ ] Related TODO items addressed
