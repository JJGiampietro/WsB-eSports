// Runs weekly via GitHub Actions (.github/workflows/weekly-stats.yml).
// Fetches current lifetime stats for every player in data/roster.json,
// then rotates the snapshot files so the site can show week-over-week deltas:
//   data/latest.json   -> becomes data/previous.json
//   fresh fetch         -> becomes the new data/latest.json
//
// The API key is read from an environment variable (set as a GitHub Actions
// secret, FORTNITE_API_KEY) so it is never committed to the repo or exposed
// in the public site — unlike the client-side live-fetch on the Members page,
// this one runs server-side inside GitHub's infrastructure.

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const ROSTER_PATH = path.join(DATA_DIR, "roster.json");
const LATEST_PATH = path.join(DATA_DIR, "latest.json");
const PREVIOUS_PATH = path.join(DATA_DIR, "previous.json");

const API_KEY = process.env.FORTNITE_API_KEY;
if (!API_KEY) {
  console.error("Missing FORTNITE_API_KEY environment variable.");
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickStats(json) {
  try {
    const overall = json.data.stats.all.overall;
    if (!overall) return null;
    const winRateRaw = parseFloat(overall.winRate);
    return {
      kd: parseFloat(overall.kd) || 0,
      winrate: winRateRaw <= 1 ? winRateRaw * 100 : winRateRaw,
      wins: parseFloat(overall.wins) || 0,
      kills: parseFloat(overall.kills) || 0,
      matches: parseFloat(overall.matches) || 0
    };
  } catch (e) {
    return null;
  }
}

async function fetchPlayerStats(username, platform) {
  const url =
    "https://fortnite-api.com/v2/stats/br/v2?name=" +
    encodeURIComponent(username) +
    "&accountType=" +
    encodeURIComponent(platform);

  try {
    const res = await fetch(url, { headers: { Authorization: API_KEY } });
    if (!res.ok) {
      console.warn(`  -> HTTP ${res.status} for "${username}"`);
      return null;
    }
    const json = await res.json();
    return pickStats(json);
  } catch (e) {
    console.warn(`  -> fetch failed for "${username}": ${e.message}`);
    return null;
  }
}

async function main() {
  const roster = JSON.parse(fs.readFileSync(ROSTER_PATH, "utf8"));

  // Rotate: whatever was "latest" becomes "previous" before we overwrite it.
  if (fs.existsSync(LATEST_PATH)) {
    fs.copyFileSync(LATEST_PATH, PREVIOUS_PATH);
  }

  const results = {};
  for (const player of roster) {
    console.log(`Fetching ${player.displayName} ("${player.username}")...`);
    const stats = await fetchPlayerStats(player.username, player.platform);
    if (stats) {
      results[player.id] = {
        displayName: player.displayName,
        ...stats
      };
      console.log("  -> OK");
    } else {
      console.log("  -> skipped (fetch failed, will not appear this week)");
    }
    // Stay well under the rate limit between requests.
    await sleep(1300);
  }

  const snapshot = {
    fetchedAt: new Date().toISOString(),
    players: results
  };

  fs.writeFileSync(LATEST_PATH, JSON.stringify(snapshot, null, 2));
  console.log(`\nWrote ${Object.keys(results).length} player snapshots to data/latest.json`);
}

main();
