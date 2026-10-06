// Shares one source of truth between the web app and the Expo app:
//   app/src/lib/upside.ts  -> mobile/src/lib/upside.ts   (contract reads/writes)
//   app/src/abi.ts         -> mobile/src/abi.ts
//   contracts/deployments  -> mobile/src/deployments.ts  (Metro can't glob outside the project)
//   app/src/abi.ts + public deployments -> mm-plugin/src/ (MetaMask Agent Wallet plugin)
// Run after deploying or editing app/src/lib/upside.ts:  node scripts/sync-mobile.mjs
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const header = (src) => `// GENERATED from ${src} by scripts/sync-mobile.mjs. Edit the source, then re-run the script.\n`;
mkdirSync(join(root, "mobile/src/lib"), { recursive: true });

for (const [src, dst] of [
  ["app/src/lib/upside.ts", "mobile/src/lib/upside.ts"],
  ["app/src/lib/perpl.ts", "mobile/src/lib/perpl.ts"],
  ["app/src/lib/nansen.ts", "mobile/src/lib/nansen.ts"],
  ["app/src/abi.ts", "mobile/src/abi.ts"],
]) {
  writeFileSync(join(root, dst), header(src) + readFileSync(join(root, src), "utf8"));
  console.log("synced", dst);
}

const dir = join(root, "contracts/deployments");
const all = {};
for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
  all[f.replace(".json", "")] = JSON.parse(readFileSync(join(dir, f), "utf8"));
}
writeFileSync(
  join(root, "mobile/src/deployments.ts"),
  header("contracts/deployments/*.json") + `export const deployments: Record<string, any> = ${JSON.stringify(all, null, 2)};\n`,
);
console.log("synced mobile/src/deployments.ts with chains", Object.keys(all).join(", "));

// The MetaMask Agent Wallet plugin (mm-plugin/) ships the same ABIs and the public deployments only.
const LOCAL = new Set(["31337", "31338"]);
const published = Object.fromEntries(Object.entries(all).filter(([id]) => !LOCAL.has(id)));
mkdirSync(join(root, "mm-plugin/src"), { recursive: true });
writeFileSync(join(root, "mm-plugin/src/abi.ts"), header("app/src/abi.ts") + readFileSync(join(root, "app/src/abi.ts"), "utf8"));
writeFileSync(
  join(root, "mm-plugin/src/deployments.ts"),
  header("contracts/deployments/*.json (public chains only)") +
    `export const deployments: Record<string, any> = ${JSON.stringify(published, null, 2)};\n`,
);
console.log("synced mm-plugin/src/{abi,deployments}.ts with chains", Object.keys(published).join(", ") || "(none yet)");
