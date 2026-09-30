import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";

const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
let current = false;
try {
  const response = await fetch(`https://wsb-esports.web.app/deployment.json?check=${Date.now()}`, {
    cache: "no-store", signal: AbortSignal.timeout(20000),
  });
  current = response.ok && (await response.json()).sourceCommit === commit;
} catch {
  console.log("Could not confirm the live release; publishing the current source as recovery.");
}
const changed = !current;
console.log(current ? "Firebase already serves the current main commit." : "Firebase needs the latest main commit.");
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
