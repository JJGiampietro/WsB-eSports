# Contributing to WsB eSports

This project uses a fork-and-pull-request workflow so changes can be tested before they reach the live repository.

## Repository roles

- Upstream/live repository: `adetrick7/WsB-eSports`
- Development fork: `JJGiampietro/WsB-eSports`
- Stable branch: `main`

Do not develop directly on `main`.

## Standard workflow

1. Sync your fork's `main` with upstream.
2. Create a focused branch.
3. Make and test the change locally.
4. Review the diff in VS Code.
5. Push the branch to the fork.
6. Open a pull request to `adetrick7/WsB-eSports:main`.
7. Merge only after the change has been reviewed and tested.

## Sync before new work

```bash
git checkout main
git fetch upstream
git merge --ff-only upstream/main
git push origin main
```

If `--ff-only` refuses to merge, stop and resolve the branch state instead of forcing the update.

## Branch naming

Use one purpose per branch.

```text
feature/discord-integration
feature/member-profile-cards
fix/mobile-menu
fix/leaderboard-loading
chore/dev-workflow
docs/leaderboard-guide
```

## Commit messages

Use short, descriptive commit messages. Preferred prefixes:

```text
feat: add Discord recruitment link
fix: repair mobile navigation toggle
docs: explain local development workflow
chore: add pull request template
```

## Local testing

Run the site through a local HTTP server:

```bash
python -m http.server 8000
```

or on Windows:

```bash
py -m http.server 8000
```

Open `http://localhost:8000`.

Before opening a PR, check:

- affected pages load without obvious errors
- navigation still works
- links point to the intended destination
- images load
- desktop layout looks correct
- mobile/narrow layout looks correct
- the browser console has no new errors
- leaderboard JSON loads when the change touches stats/data code
- no API keys, tokens, passwords, or secrets were added to client-side files

## Scope discipline

Keep pull requests focused. A Discord-link change should not also contain an unrelated homepage redesign, leaderboard rewrite, and image cleanup.

Small PRs are easier to test, review, and roll back.

## Generated and automated data

The weekly GitHub Action updates:

```text
data/latest.json
data/previous.json
```

Do not manually overwrite automated snapshot data unless you are intentionally repairing or testing the stats pipeline.

## Secrets

The weekly stats workflow expects `FORTNITE_API_KEY` to be stored in GitHub Actions secrets.

Never place secret values in:

- HTML
- browser-side JavaScript
- CSS
- committed JSON files
- documentation
- commit messages

Anything delivered to a user's browser is public, even if it is difficult to find in the UI.
