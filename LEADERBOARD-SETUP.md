# Setting up the automatic weekly leaderboard

This site now includes a `leaderboards.html` page that shows weekly and
lifetime stat rankings for the roster. To make the "weekly" part actually
work automatically, the site needs to move to GitHub (free), which lets us
run a scheduled task every Monday that fetches everyone's stats and saves
a snapshot.

## One-time setup

1. **Create a free GitHub account** at github.com if you don't have one.

2. **Create a new repository**
   - Click the "+" in the top right → "New repository"
   - Name it whatever you like (e.g. `wsb-esports`)
   - Set it to **Public** (required for free GitHub Pages)
   - Don't add a README, .gitignore, or license — we already have files

3. **Upload all the site files** into that repo. Easiest way: on the repo
   page, click "uploading an existing file" and drag in everything from
   the extracted zip — including the `.github` folder, `data` folder, and
   `scripts` folder (these might be hidden in some file browsers — make
   sure they come along).

4. **Add your API key as a secret** (this keeps it out of the public repo):
   - In the repo, go to **Settings → Secrets and variables → Actions**
   - Click **New repository secret**
   - Name: `FORTNITE_API_KEY`
   - Value: your key from dash.fortnite-api.com
   - Save

5. **Enable GitHub Pages**:
   - Go to **Settings → Pages**
   - Under "Build and deployment", set Source to **Deploy from a branch**
   - Branch: `main`, folder: `/ (root)`
   - Save. GitHub gives you a live URL like
     `https://yourusername.github.io/wsb-esports/`

6. **Run the first snapshot manually** (don't wait for Monday):
   - Go to the **Actions** tab in the repo
   - Click "Weekly Fortnite Stats Snapshot" in the left sidebar
   - Click **Run workflow** → **Run workflow** button
   - Wait a minute or two, refresh — you should see a green checkmark
   - This commits `data/latest.json` with everyone's current stats

7. **Run it again a week later** (or manually trigger it again anytime) to
   get a second snapshot — that's when the "This Week" deltas on the
   leaderboard page will actually have something to compare against.
   After that, it runs completely on its own, every Monday, forever.

## Important notes

- **The leaderboard page only works when actually hosted** (via GitHub
  Pages or similar) — it can't read the JSON snapshot files if you just
  double-click `leaderboards.html` from a folder on your computer, since
  browsers block that kind of local file access for security reasons.
- The API key lives in GitHub's encrypted secrets, not in any file you
  can see in the repo — this is actually *more* secure than the
  client-side key already sitting in `script.js` for the Members page's
  live stats.
- If a player's stats fail to fetch on a given week (wrong username, API
  hiccup, etc.), that player is just skipped for that week's snapshot
  rather than breaking the whole run — they'll reappear once a fetch
  succeeds again.
