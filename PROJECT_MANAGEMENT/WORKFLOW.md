# Voice-Flow Team Workflow Guide

**For:** All developers and Claude agents working on this project
**Last Updated:** 2026-01-14

---

## Team Structure

| Role | Responsibility |
|------|----------------|
| **PM (Project Manager)** | Plans tasks, reviews PRs, manages TODO/COMPLETED/PLAN files |
| **Backend Developer** | Works on FastAPI, database, services |
| **Frontend Developer** | Works on React, Electron, UI components |
| **DevOps** | Builds, deployment, CI/CD, certificates |

---

## Branch Strategy

```
main (protected)
  │
  ├── develop (integration)
  │     │
  │     ├── feature/security-hardening
  │     ├── feature/rate-limiting
  │     ├── feature/auth-complete
  │     ├── feature/logging
  │     ├── feature/build-system
  │     └── feature/auto-update
  │
  └── hotfix/* (emergency only)
```

### Branch Rules

| Branch | Who Can Push | PR Required | Review Required |
|--------|--------------|-------------|-----------------|
| `main` | Nobody (merge only) | Yes | Yes (PM) |
| `develop` | All devs | Yes | Yes (1 reviewer) |
| `feature/*` | Assigned dev | No | Before merge |
| `hotfix/*` | Senior only | Yes | Yes (PM + 1) |

---

## Task Assignment Flow

### 1. PM Assigns Task
```
PM: "@BackendDev please work on 1.2.2 - rate limiter"
```

### 2. Developer Starts Work
```bash
# Create branch from develop
git checkout develop
git pull origin develop
git checkout -b feature/rate-limiting

# Start work...
```

### 3. Developer Completes Work
```bash
# Push branch
git push -u origin feature/rate-limiting

# Create PR to develop
gh pr create --base develop --title "1.2.2: Apply rate limiter to transcribe endpoint"
```

### 4. PM Reviews
- Check code quality
- Verify task requirements met
- Run tests if applicable
- Approve or request changes

### 5. Merge & Update
```
PM:
1. Merge PR to develop
2. Update TODO.md - mark as DONE
3. Move to COMPLETED.md
4. Update PLAN.md checkbox
```

---

## Communication Format

### Referring to Tasks
Always use the task ID format: `X.Y.Z`

```
Good: "Working on 1.2.2"
Good: "Done with 1.3.1, ready for review"
Good: "Blocked on 2.1.1, need clarification"

Bad: "Working on rate limiting" (which one?)
Bad: "Done with the CORS thing" (unclear)
```

### Status Updates
```
Starting:    "Starting 1.2.2 - rate limiter for transcribe"
Progress:    "1.2.2 - 50% done, testing now"
Blocked:     "1.2.2 - blocked, need help with X"
Done:        "1.2.2 - PR ready: #123"
```

---

## Code Review Checklist

Before approving any PR:

### Security
- [ ] No hardcoded API keys or secrets
- [ ] No sensitive data in logs
- [ ] Input validation present
- [ ] Auth checks where needed

### Quality
- [ ] Code follows existing patterns
- [ ] No unnecessary complexity
- [ ] Error handling present
- [ ] Logging added for important operations

### Documentation
- [ ] CLAUDE.md updated if architecture changed
- [ ] Code comments for complex logic
- [ ] Function/endpoint documented

### Testing
- [ ] Manual testing done
- [ ] Edge cases considered
- [ ] No regression in existing features

---

## File Management

### PM Manages These Files
| File | Update When |
|------|-------------|
| `PROJECT_MANAGEMENT/PLAN.md` | New features planned |
| `PROJECT_MANAGEMENT/TODO.md` | Tasks assigned/completed |
| `PROJECT_MANAGEMENT/COMPLETED.md` | Tasks finished |
| `CLAUDE.md` (all locations) | Architecture changes |

### Developers Update These Files
| File | Update When |
|------|-------------|
| Code files | During development |
| `.env.example` | New env vars added |
| `requirements.txt` | New dependencies |
| `package.json` | New npm packages |

---

## Merge to Main Process

### When to Merge develop → main
1. Sprint completed
2. All planned features working
3. All tests passing
4. PM approval

### Merge Checklist
- [ ] All TODO items for sprint marked DONE
- [ ] COMPLETED.md updated
- [ ] No pending PRs to develop
- [ ] Manual testing on develop passed
- [ ] Version number updated

### After Merge
```bash
# Tag the release
git tag -a v1.0.0 -m "Release 1.0.0 - Security hardening complete"
git push origin v1.0.0
```

---

## Emergency Hotfix Process

Only for critical bugs in production:

```bash
# Create hotfix from main
git checkout main
git checkout -b hotfix/critical-security-fix

# Fix the issue...
# Create PR directly to main
gh pr create --base main --title "HOTFIX: Critical security fix"

# After merge, also merge to develop
git checkout develop
git merge main
git push origin develop
```

---

## Claude Agent Guidelines

When working as a Claude agent on this project:

1. **Always check TODO.md first** - Know what tasks are assigned
2. **Use task IDs** - Reference 1.2.2, not "rate limiting"
3. **Update files after changes** - Keep CLAUDE.md current
4. **Ask before big changes** - Get PM approval for architecture changes
5. **Create branches** - Never push directly to main or develop
6. **Document your work** - Add comments explaining complex code
