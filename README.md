# WsB eSports Website

Website for the WsB Fortnite clan and esports community.

This repository is a static website built with HTML, CSS, and JavaScript. It also contains a GitHub Actions workflow that creates weekly Fortnite stat snapshots for the leaderboard.

## Pages

- `index.html` — home page
- `members.html` — member roster and player information
- `leaderboards.html` — weekly and lifetime statistics
- `announcements.html` — clan announcements
- `events.html` — clan events
- `styles.css` — shared site styling
- `script.js` — shared browser-side JavaScript
- `data/` — roster and leaderboard snapshot data
- `scripts/` — server-side maintenance scripts used by GitHub Actions
- `.github/workflows/weekly-stats.yml` — weekly Fortnite stats automation

## Local development in VS Code

Do not edit the live `main` branch directly. Create a branch for each feature or fix.

### 1. Clone your fork

```bash
git clone https://github.com/JJGiampietro/WsB-eSports.git
cd WsB-eSports
code .
```

### 2. Add the original repository as `upstream`

Run this once after cloning:

```bash
git remote add upstream https://github.com/adetrick7/WsB-eSports.git
git remote -v
```

Expected remotes:

```text
origin    https://github.com/JJGiampietro/WsB-eSports.git
upstream  https://github.com/adetrick7/WsB-eSports.git
```

### 3. Start from the latest upstream `main`

Before starting new work:

```bash
git checkout main
git fetch upstream
git merge --ff-only upstream/main
git push origin main
```

### 4. Create a working branch

Examples:

```bash
git checkout -b feature/discord-integration
```

```bash
git checkout -b fix/mobile-navigation
```

Recommended prefixes:

- `feature/` for new functionality
- `fix/` for bug fixes
- `chore/` for repository/tooling work
- `docs/` for documentation-only changes

### 5. Preview the site locally

Because the site reads JSON files, use a local HTTP server instead of opening the HTML files directly with `file://`.

If Python is installed:

```bash
python -m http.server 8000
```

On Windows, if `python` is unavailable:

```bash
py -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

Stop the server with `Ctrl+C` in the terminal.

### 6. Review and commit

Use VS Code's Source Control panel to inspect every changed file before committing.

```bash
git status
git add <files-you-intend-to-commit>
git commit -m "feat: describe the change"
git push -u origin YOUR-BRANCH-NAME
```

Avoid using `git add .` without reviewing the changes first.

### 7. Pull request workflow

For normal website work:

```text
JJGiampietro/WsB-eSports:feature-branch
                  ↓
        review and local testing
                  ↓
adetrick7/WsB-eSports:main
```

Open a pull request from the branch in the fork to `adetrick7/WsB-eSports:main`. Do not merge unfinished work.

## Before opening a pull request

Check all affected pages on desktop and a narrow/mobile browser width. Verify navigation, images, external links, browser console errors, and leaderboard/data loading where relevant.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full branch and review rules.

## Weekly leaderboard automation

`.github/workflows/weekly-stats.yml` runs every Monday at 08:00 UTC and can also be started manually from GitHub Actions. It executes `scripts/fetch-weekly-stats.js`, which rotates the previous snapshot and writes a new `data/latest.json` snapshot.

The workflow expects a repository Actions secret named:

```text
FORTNITE_API_KEY
```

Do not commit API keys or other secrets to the repository.

See [LEADERBOARD-SETUP.md](LEADERBOARD-SETUP.md) for leaderboard-specific setup details.

## Security note

The scheduled stats script correctly reads its API key from a GitHub Actions secret. Existing browser-side code should also be reviewed for any API credentials or secrets. Anything shipped in HTML, CSS, or JavaScript to the browser must be considered public.
