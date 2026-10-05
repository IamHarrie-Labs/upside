// Fills indexer/config.yaml with the chain id, start block and addresses from a deployment.
// Usage: node scripts/indexer-config.mjs 10143
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const chainId = process.argv[2] ?? "10143";
const d = JSON.parse(readFileSync(join(root, "contracts/deployments", `${chainId}.json`), "utf8"));
const path = join(root, "indexer/config.yaml");
let y = readFileSync(path, "utf8");

// [^\r\n]* keeps this working with both LF and CRLF files
y = y.replace(/- id: \d+[^\r\n]*/, `- id: ${chainId}`);
y = y.replace(/start_block: \d+[^\r\n]*/, `start_block: ${d.startBlock}`);
for (const [name, key] of [
  ["CallBook", "callBook"],
  ["VaultFactory", "factory"],
  ["AttestedGate", "gate"],
]) {
  y = y.replace(new RegExp(`(- name: ${name}\\r?\\n\\s+address: \\[")0x[0-9a-fA-F]{40}`), `$1${d[key]}`);
}
writeFileSync(path, y);
console.log(`indexer/config.yaml -> chain ${chainId}, start ${d.startBlock}`);
