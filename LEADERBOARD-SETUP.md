# Setting up the automatic weekly leaderboard

This site includes a `leaderboards.html` page that shows weekly and lifetime stat rankings for the roster. The stats workflow runs on GitHub Actions every Monday, fetches Fortnite stats server-side, and saves public JSON snapshots that the website can safely read.

## One-time setup

1. **Add the Fortnite API key as a GitHub Actions secret**
   - In the repository, go to **Settings → Secrets and variables → Actions**
   - Click **New repository secret**
   - Name it `FORTNITE_API_KEY`
   - Use the API key from dash.fortnite-api.com as the value
   - Save it

2. **Enable GitHub Pages if the site is hosted there**
   - Go to **Settings → Pages**
   - Under **Build and deployment**, choose **Deploy from a branch**
   - Select `main` and `/ (root)`
   - Save

3. **Run the first snapshot manually**
   - Open the **Actions** tab
   - Choose **Weekly Fortnite Stats Snapshot**
   - Click **Run workflow**
   - Wait for the run to finish successfully
   - The workflow updates `data/latest.json`

4. **Build week-over-week history**
   - On each later run, the old `data/latest.json` is copied to `data/previous.json`
   - A fresh `data/latest.json` is then generated
   - Once both snapshots exist, the leaderboard can calculate weekly changes

## How the secure stats flow works

- `.github/workflows/weekly-stats.yml` runs on GitHub Actions.
- `scripts/fetch-weekly-stats.js` reads `FORTNITE_API_KEY` from the Actions environment.
- The API key is never written into the public website JavaScript.
- The workflow writes the safe stat results to `data/latest.json` and `data/previous.json`.
- `leaderboards.html` reads those snapshots for rankings.
- The Members page also reads `data/latest.json` to refresh player cards without exposing an API credential to visitors.

## Local testing

Do not double-click the HTML files directly because browsers may block JSON requests from `file://` pages. Run a local web server instead.

From the project directory:

```bash
python -m http.server 8000
```

On Windows, if `python` is unavailable:

```bash
py -m http.server 8000
```

Then open `http://localhost:8000` in the browser.

## Important security note

A Fortnite API key was previously embedded in `script.js`. Because the repository and website are public, that value should be considered exposed even after it is removed from the current code. Revoke or rotate that old key in the Fortnite API dashboard and store the replacement only in the `FORTNITE_API_KEY` GitHub Actions secret.

If a player's stats fail to fetch during a weekly run because of an incorrect username, API outage, or rate limit, that player is skipped for that snapshot instead of causing the full workflow to fail.