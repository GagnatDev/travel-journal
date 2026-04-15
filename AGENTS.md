# Agent instructions

## Git

For a new feature or larger refactor, work on a separate branch branched from an up-to-date `main`, unless the user says otherwise.

### What "implement \<issue\>" means

When the user pastes a **GitHub issue URL** (with or without a verb like "implement", "do", "fix"), do **all** of the following:

1. **Fetch** the issue details from GitHub (via MCP or `gh`).
2. **`git fetch origin main`** to ensure the base is current.
3. Create a **git worktree** at `../<repo>-issue-<N>` on a new branch from `origin/main`. Name the branch descriptively (e.g. `feat/issue-5-travel-service`, `fix/issue-12-login-redirect`).
4. **Implement** the change described in the issue inside the worktree.
5. **Run relevant tests** from the worktree before committing.
6. **Commit** following [Commit messages](#commit-messages), with `Closes #<N>` in the body.
7. **Push** the branch to `origin`.
8. **Create a PR** into `main` referencing the issue.

The main working tree is left untouched.

### Commit messages

- Use **Conventional Commits**: a type prefix, optional scope in parentheses, then a short description.
  - Examples: `feat(frontend): …`, `fix(api): …`, `docs: …`, `refactor(meals): …`, `test(e2e): …`
- Keep the **subject line to the point** (about 50 characters or less when practical).
- **Describe behavior and outcomes** from the user or product perspective (what changed and why it matters), not implementation trivia.
- Add a **body** only when it helps: merge rationale, breaking changes, or follow-up notes.
- **Technical detail is appropriate** when it is the point of the change—for example fixing a specific bug, dependency, protocol, or build issue—so reviewers know what was wrong and what was fixed.

Bad (too vague or too internal): `wip`, `updates`, `fix stuff`, `refactor UserService.extractToken`.

Good (functional): `feat(nav): open app on Today and group secondary links in menus`

Good (technical when relevant): `fix(frontend): forward ref from Button for PopoverTrigger anchor`

## Cursor Cloud specific instructions

### Architecture overview

pnpm monorepo with three workspace packages (`packages/shared`, `packages/server`, `packages/client`) plus Playwright E2E tests in `e2e/`. See `docs/architecture.md` for full details.

### Infrastructure

Docker is required. MongoDB 8 and MinIO (S3-compatible) run via `docker compose up -d` from the repo root. The `createbuckets` init container auto-creates the `travel-journal` S3 bucket.

### Server `.env.local`

The Express server reads `packages/server/.env.local` (gitignored). Create it with at minimum:

```
ADMIN_EMAIL=admin@localhost
JWT_SECRET=dev-secret
S3_ENDPOINT=http://localhost:9100
S3_BUCKET=travel-journal
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
MONGODB_URI=mongodb://localhost:27017/travel-journal
```

Without `ADMIN_EMAIL`, the admin bootstrap registration endpoint returns 403.

### Key commands

| Task | Command |
|------|---------|
| Install deps | `pnpm install` |
| Build shared types (required before server/client) | `pnpm --filter @travel-journal/shared build` |
| Dev servers (API + Vite) | `pnpm dev` |
| Lint + typecheck | `pnpm lint` |
| Unit tests (server + client) | `pnpm test` |
| E2E tests (requires Docker) | `pnpm e2e` |

### Gotchas

- The `@travel-journal/shared` package **must be built** before running server or client (`pnpm --filter @travel-journal/shared build`). Without this, imports from `@travel-journal/shared` fail.
- pnpm 10 blocks build scripts by default. The root `package.json` field `pnpm.onlyBuiltDependencies` allowlists packages that need postinstall/install scripts (sharp, mongodb-memory-server, etc.). If a new native dependency is added and its build script is blocked, add it to that list.
- Server unit tests use `mongodb-memory-server` (embedded MongoDB binary) — no external MongoDB needed. Client unit tests use `msw` + `happy-dom` — no external services needed.
- Two client tests (`EntryCard.test.tsx` and `ImageReorder.test.tsx`) have pre-existing failures related to `createObjectURL` not being available in the jsdom/happy-dom test environment. These are not regressions.
- Docker daemon in nested container environments needs `fuse-overlayfs` storage driver and `iptables-legacy`. See the `daemon.json` and `update-alternatives` setup in the VM snapshot.
