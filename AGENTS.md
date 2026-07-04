# Agent instructions

## Repo facts (non-obvious)

- **Build `shared` first.** `pnpm typecheck`/server tests fail with `Cannot find module '@travel-journal/shared'` until `pnpm --filter @travel-journal/shared build` has produced `packages/shared/dist`. Re-run it after editing shared types.
- **ESM imports need explicit `.js` extensions** on relative paths, even in `.ts`/`.tsx` files (`import { x } from './foo.js'`).
- **i18n strings live in two places.** User-facing strings need keys in both `packages/client/src/locales/{en,nb}/translation.json` **and** the inline `nb` resources in `packages/client/vitest.setup.ts` — client tests run with `lng: 'nb'` against that inline copy, so a key missing there renders as the raw key and breaks role/name queries.
- **Server tests need MongoDB.** `mongodb-memory-server` downloads a binary from `fastdl.mongodb.org` on first run; in sandboxes where that host is blocked, set `MONGODB_URI` to an existing instance or accept that server tests only run in CI.
- **No migrations.** MongoDB via Mongoose; schema changes are code-only, so new fields must tolerate legacy documents (defaults / optional).
- **Client tests**: Vitest + Testing Library + MSW. Default API handlers live in `packages/client/src/__tests__/mocks/`; override per-test with `server.use(...)`. Test pool is `forks` because the MSW server is a module singleton.
- **Trip roles gate writes**: `creator`/`contributor` may create entries and manage saved locations; `follower` is read-only (server returns 403). UI hides write affordances behind the same check.

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
