// Runs every hour via GitHub Actions (.github/workflows/weekly-stats.yml).
// Fetches current lifetime stats for every player in data/roster.json,
// then keeps a short timestamped history so the site can compare a current
// snapshots against the ones closest to 24 hours and 7 days earlier.
//
// The API key is read from an environment variable (set as a GitHub Actions
// secret, FORTNITE_API_KEY) so it is never committed to the repo or exposed
// in the public site — unlike the client-side live-fetch on the Members page,
// this one runs server-side inside GitHub's infrastructure.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.join(__dirname, "..", "data");
const ROSTER_PATH = path.join(DATA_DIR, "roster.json");
const LATEST_PATH = path.join(DATA_DIR, "latest.json");
const HISTORY_PATH = path.join(DATA_DIR, "history.json");
const STATS_DIR = path.join(__dirname, "..", "stats");
const STATS_TEMPLATE_PATH = path.join(STATS_DIR, "barrelroll", "index.html");
const HISTORY_RETENTION_MS = 8 * 24 * 60 * 60 * 1000;

const API_KEY = process.env.FORTNITE_API_KEY;
const FIREBASE_SERVICE_ACCOUNT = process.env.FIREBASE_SERVICE_ACCOUNT;
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

function firestoreString(fields, name) {
  const field = fields && fields[name];
  return field && typeof field.stringValue === "string" ? field.stringValue : "";
}

function base64Url(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

async function firebaseAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = base64Url({ alg: "RS256", typ: "JWT" }) + "." + base64Url({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  });
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsigned);
  const assertion = unsigned + "." + signer.sign(serviceAccount.private_key, "base64url");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });
  if (!response.ok) throw new Error("Could not authenticate the Firebase sync account (HTTP " + response.status + ").");
  const payload = await response.json();
  if (!payload.access_token) throw new Error("Firebase sync account did not return an access token.");
  return payload.access_token;
}

async function loadPendingRosterMembers() {
  if (!FIREBASE_SERVICE_ACCOUNT) {
    console.log("Firebase roster sync is not configured yet; continuing with the existing roster.");
    return { pending: [], markSynced: async () => {} };
  }
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT);
  } catch (_) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT must contain a valid service-account JSON secret.");
  }
  const token = await firebaseAccessToken(serviceAccount);
  const endpoint = "https://firestore.googleapis.com/v1/projects/" + encodeURIComponent(serviceAccount.project_id) + "/databases/(default)/documents/memberAccess?pageSize=500";
  const response = await fetch(endpoint, { headers: { Authorization: "Bearer " + token } });
  if (!response.ok) throw new Error("Could not read the Firebase member queue (HTTP " + response.status + ").");
  const payload = await response.json();
  const pending = (payload.documents || []).map((document) => {
    const fields = document.fields || {};
    return {
      id: document.name.split("/").pop(),
      displayName: firestoreString(fields, "displayName"),
      username: firestoreString(fields, "fortniteUsername"),
      rosterStatus: firestoreString(fields, "rosterStatus")
    };
  }).filter((member) => member.rosterStatus === "pending" && /^[a-z0-9-]+$/.test(member.id) && member.displayName && member.username);
  async function markSynced(id) {
    const documentPath = "https://firestore.googleapis.com/v1/projects/" + encodeURIComponent(serviceAccount.project_id) + "/databases/(default)/documents/memberAccess/" + encodeURIComponent(id) + "?updateMask.fieldPaths=rosterStatus&updateMask.fieldPaths=rosterSyncedAt";
    const saved = await fetch(documentPath, {
      method: "PATCH",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ fields: {
        rosterStatus: { stringValue: "active" },
        rosterSyncedAt: { timestampValue: new Date().toISOString() }
      } })
    });
    if (!saved.ok) console.warn("  -> could not mark " + id + " as roster synced (HTTP " + saved.status + ").");
  }
  console.log("Firebase member queue: " + pending.length + " pending member" + (pending.length === 1 ? "" : "s") + ".");
  return { pending, markSynced };
}

function createStatsProfilePage(memberId) {
  const profileDir = path.join(STATS_DIR, memberId);
  const profilePath = path.join(profileDir, "index.html");
  if (fs.existsSync(profilePath)) return;
  const template = fs.readFileSync(STATS_TEMPLATE_PATH, "utf8");
  const page = template
    .replace(/<title>[\s\S]*?<\/title>/, "<title>WsB | Player Stats</title>")
    .replace(/https:\/\/wsb-esports\.web\.app\/stats\/barrelroll\//g, "https://wsb-esports.web.app/stats/" + memberId + "/")
    .replace(/(<meta property="og:title" content=")[^"]*"/, '$1WsB | Player Stats"')
    .replace('data-member-id="barrelroll"', 'data-member-id="' + memberId + '"');
  fs.mkdirSync(profileDir, { recursive: true });
  fs.writeFileSync(profilePath, page);
  console.log("Created stats profile page for " + memberId + ".");
}

function accountDetails(json) {
  const account = json && json.data && json.data.account ? json.data.account : {};
  return {
    accountId: typeof account.id === "string" && account.id ? account.id : null,
    username: typeof account.name === "string" && account.name ? account.name : null
  };
}

async function fetchPlayerStats(player) {
  const usesAccountId = Boolean(player.accountId);
  const url = usesAccountId
    ? "https://fortnite-api.com/v2/stats/br/v2/" + encodeURIComponent(player.accountId)
    : "https://fortnite-api.com/v2/stats/br/v2?name=" +
      encodeURIComponent(player.username) +
      "&accountType=" +
      encodeURIComponent(player.platform);
  const lookup = usesAccountId ? "account ID" : 'name "' + player.username + '"';

  try {
    const res = await fetch(url, { headers: { Authorization: API_KEY } });
    if (!res.ok) {
      console.warn(`  -> HTTP ${res.status} for ${lookup}`);
      return null;
    }
    const json = await res.json();
    const stats = pickStats(json);
    if (!stats) return null;
    return { stats, ...accountDetails(json) };
  } catch (e) {
    console.warn(`  -> fetch failed for ${lookup}: ${e.message}`);
    return null;
  }
}

async function main() {
  const roster = JSON.parse(fs.readFileSync(ROSTER_PATH, "utf8"));
  const queue = await loadPendingRosterMembers();
  const pendingRosterIds = new Set(queue.pending.map((member) => member.id));
  const newRosterIds = new Set();
  for (const member of queue.pending) {
    if (roster.some((player) => player.id === member.id)) continue;
    roster.push({
      id: member.id,
      displayName: member.displayName,
      username: member.username,
      platform: "epic",
      profileImage: null
    });
    createStatsProfilePage(member.id);
    newRosterIds.add(member.id);
    console.log("Added pending member " + member.displayName + " to the roster.");
  }

  const results = {};
  let rosterChanged = newRosterIds.size > 0;
  for (const player of roster) {
    const lookup = player.accountId ? "saved account ID" : 'name "' + player.username + '"';
    console.log(`Fetching ${player.displayName} by ${lookup}...`);
    const fetched = await fetchPlayerStats(player);
    if (fetched) {
      if (!player.accountId && fetched.accountId) {
        player.accountId = fetched.accountId;
        rosterChanged = true;
        console.log("  -> saved stable Epic account ID");
      }
      results[player.id] = {
        displayName: player.displayName,
        username: fetched.username || player.username,
        ...fetched.stats
      };
      if (pendingRosterIds.has(player.id)) await queue.markSynced(player.id);
      console.log("  -> OK");
    } else {
      console.log("  -> skipped (fetch failed, will not appear today)");
    }
    // Stay well under the rate limit between requests.
    await sleep(1300);
  }

  if (rosterChanged) {
    fs.writeFileSync(ROSTER_PATH, JSON.stringify(roster, null, 2) + "\n");
    console.log("Saved newly discovered Epic account IDs to data/roster.json.");
  }
  const snapshot = {
    fetchedAt: new Date().toISOString(),
    players: results
  };

  const existingHistory = fs.existsSync(HISTORY_PATH)
    ? JSON.parse(fs.readFileSync(HISTORY_PATH, "utf8"))
    : { snapshots: [] };
  const snapshots = Array.isArray(existingHistory.snapshots) ? existingHistory.snapshots : [];

  // One-time migration: preserve the two legacy snapshots when history starts.
  if (!snapshots.length) {
    for (const legacyPath of [path.join(DATA_DIR, "previous.json"), LATEST_PATH]) {
      if (!fs.existsSync(legacyPath)) continue;
      const legacy = JSON.parse(fs.readFileSync(legacyPath, "utf8"));
      if (legacy && legacy.fetchedAt && legacy.players) snapshots.push(legacy);
    }
  }

  snapshots.push(snapshot);
  const deduped = new Map();
  snapshots.forEach((item) => {
    if (item && item.fetchedAt && item.players) deduped.set(item.fetchedAt, item);
  });
  const cutoff = Date.now() - HISTORY_RETENTION_MS;
  const history = Array.from(deduped.values())
    .filter((item) => Date.parse(item.fetchedAt) >= cutoff)
    .sort((a, b) => Date.parse(a.fetchedAt) - Date.parse(b.fetchedAt));

  fs.writeFileSync(LATEST_PATH, JSON.stringify(snapshot, null, 2));
  fs.writeFileSync(HISTORY_PATH, JSON.stringify({ snapshots: history }, null, 2));
  console.log(`\nWrote ${Object.keys(results).length} player snapshots to data/latest.json and retained ${history.length} history snapshots.`);
}

main();
