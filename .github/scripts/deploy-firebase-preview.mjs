import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";

const siteId = "wsb-esports";
const channelId = process.env.FIREBASE_HOSTING_CHANNEL ?? "firebase-preview";
const token = process.env.FIREBASE_HOSTING_ACCESS_TOKEN;

const dryRun = process.argv.includes("--dry-run");
if (!token && !dryRun) {
  throw new Error("A short-lived Firebase Hosting credential was not supplied.");
}

const ignoredNames = new Set([".git", ".github", ".firebase", "node_modules", "scripts", "templates"]);
const ignoredFiles = new Set(["firebase.json", ".firebaserc", "firestore.rules", "FIREBASE-MEMBER-SETUP.md"]);

async function listFiles(directory, relative = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryRelative = path.posix.join(relative, entry.name);
    const entryAbsolute = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (!ignoredNames.has(entry.name) && !entry.name.startsWith(".")) {
        files.push(...(await listFiles(entryAbsolute, entryRelative)));
      }
      continue;
    }

    if (
      entry.isFile() &&
      !entry.name.startsWith(".") &&
      !entry.name.startsWith("gha-creds-") &&
      !ignoredFiles.has(entryRelative) &&
      !entryRelative.endsWith(".md") &&
      /\.(?:html|css|js|json|xml|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|mp4|webm|txt)$/i.test(entry.name)
    ) {
      files.push({ absolute: entryAbsolute, relative: entryRelative });
    }
  }

  return files;
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`Firebase Hosting request failed (${response.status}): ${await response.text()}`);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function ensureChannel() {
  const base = `https://firebasehosting.googleapis.com/v1beta1/sites/${siteId}/channels`;
  const body = JSON.stringify({ ttl: "604800s" });

  const created = await fetch(`${base}?channelId=${channelId}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body,
  });

  if (created.ok) return created.json();
  if (created.status !== 409) {
    throw new Error(`Could not create Firebase preview channel (${created.status}): ${await created.text()}`);
  }

  return request(`${base}/${channelId}?updateMask=ttl`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

async function hostingConfig() {
  const config = JSON.parse(await readFile("firebase.json", "utf8"));
  return {
    headers: config.hosting.headers.map(({ source, headers }) => ({
      glob: source, headers: Object.fromEntries(headers.map(({ key, value }) => [key, value])),
    })),
  };
}

if (channelId !== "live" && !dryRun) {
  await ensureChannel();
}

const root = process.cwd();
const assets = await listFiles(root);
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const latest = JSON.parse(await readFile("data/latest.json", "utf8"));
const manifest = {
  sourceRepository: "adetrick7/WsB-eSports", sourceCommit,
  statsFetchedAt: latest.fetchedAt, publishedAt: new Date().toISOString(),
};
const contentByHash = new Map();
const files = {};

for (const asset of assets) {
  const compressed = gzipSync(await readFile(asset.absolute));
  const hash = createHash("sha256").update(compressed).digest("hex");
  files[`/${asset.relative}`] = hash;
  contentByHash.set(hash, compressed);
}

const manifestContent = gzipSync(JSON.stringify(manifest));
const manifestHash = createHash("sha256").update(manifestContent).digest("hex");
files["/deployment.json"] = manifestHash;
contentByHash.set(manifestHash, manifestContent);
if (dryRun) {
  console.log(JSON.stringify({ manifest, config: await hostingConfig(), files: Object.keys(files) }, null, 2));
  process.exit(0);
}

const version = await request(`https://firebasehosting.googleapis.com/v1beta1/sites/${siteId}/versions`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ config: await hostingConfig() }),
});

const populated = await request(`https://firebasehosting.googleapis.com/v1beta1/${version.name}:populateFiles`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ files }),
});

for (const hash of populated.uploadRequiredHashes ?? []) {
  const content = contentByHash.get(hash);
  if (!content) throw new Error(`Firebase requested an unknown asset (${hash}).`);

  await request(`${populated.uploadUrl}/${hash}`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: content,
  });
}

await request(`https://firebasehosting.googleapis.com/v1beta1/${version.name}?update_mask=status`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ status: "FINALIZED" }),
});

const releasePath = channelId === "live"
  ? `sites/${siteId}/releases`
  : `sites/${siteId}/channels/${channelId}/releases`;

const release = await request(
  `https://firebasehosting.googleapis.com/v1beta1/${releasePath}?versionName=${encodeURIComponent(version.name)}`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: `Firebase ${channelId} from canonical main ${sourceCommit}` }),
  },
);

console.log(`Firebase ${channelId} published: ${release.version.name}`);
if (channelId === "live") {
  let verified = false;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const response = await fetch(`https://${siteId}.web.app/deployment.json?release=${Date.now()}`, {
        cache: "no-store", signal: AbortSignal.timeout(20000),
      });
      const live = response.ok ? await response.json() : null;
      verified = live?.sourceCommit === sourceCommit && live?.statsFetchedAt === latest.fetchedAt;
      if (verified) break;
    } catch { /* CDN propagation may take a moment. */ }
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  if (!verified) throw new Error("Release created, but public code/stats verification failed. Check Firebase before considering this deployment complete.");
  console.log(`Verified live code ${sourceCommit} and stats ${latest.fetchedAt}.`);
}
