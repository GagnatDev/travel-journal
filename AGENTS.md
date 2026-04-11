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
