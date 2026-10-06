// Follower counts and volume per call, served at GET /flow.
//
// Public Monad RPCs cap eth_getLogs at 100 blocks, so apps can't count follows themselves. The keeper scans in
// 100-block chunks from the deployment's start block, keeps a cursor, and saves its state to FLOW_STATE (a file on
// a volume) so restarts resume instead of rescanning. Only Followed events from vaults created by Upside's
// VaultFactory count, so another contract emitting the same event can't inflate a call's numbers.
// The Envio indexer (indexer/) serves the same data and more at scale.
import { readFileSync, writeFileSync } from "node:fs";
import { decodeEventLog, parseAbi, toEventSelector, type Address } from "viem";
import { deployment, publicClient } from "./env.js";

const ABI = parseAbi([
  "event VaultCreated(address indexed owner, address vault, uint256 maxExposure)",
  "event Followed(uint256 indexed positionId, uint256 indexed callId, address indexed caller, uint256 amountIn, uint256 baseOut)",
]);
const VAULT_CREATED = toEventSelector(ABI[0]);
const FOLLOWED = toEventSelector(ABI[1]);
const CHUNK = BigInt(process.env.LOGS_CHUNK ?? 100);
const STATE_FILE = process.env.FLOW_STATE;

type State = { cursor: string; vaults: string[]; flow: Record<string, { followers: number; volume: string }> };
let state: State = { cursor: String(deployment.startBlock), vaults: [], flow: {} };
try {
  if (STATE_FILE) {
    const saved = JSON.parse(readFileSync(STATE_FILE, "utf8"));
    if (saved.chainId === deployment.chainId && saved.factory === deployment.factory) state = saved.state;
  }
} catch {
  // no saved state yet
}
const vaults = new Set(state.vaults);

function save() {
  if (!STATE_FILE) return;
  try {
    writeFileSync(STATE_FILE, JSON.stringify({ chainId: deployment.chainId, factory: deployment.factory, state }));
  } catch (e) {
    console.error("flow: could not save state:", (e as Error).message);
  }
}

let busy = false;
/** Scans new blocks up to the chain head, at most `maxChunks` chunks per call. */
export async function syncFlow(maxChunks = 50) {
  if (busy) return;
  busy = true;
  try {
    const head = await publicClient.getBlockNumber();
    let from = BigInt(state.cursor);
    for (let i = 0; i < maxChunks && from <= head; i++) {
      const to = from + CHUNK - 1n > head ? head : from + CHUNK - 1n;
      const logs = await publicClient.getLogs({ fromBlock: from, toBlock: to } as any).catch(async () =>
        // some RPCs reject address-less queries; fall back to the two event topics
        publicClient.request({
          method: "eth_getLogs",
          params: [{ fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}`, topics: [[VAULT_CREATED, FOLLOWED]] }],
        } as any),
      );
      for (const l of logs as any[]) {
        const topic = l.topics?.[0];
        if (topic === VAULT_CREATED && l.address.toLowerCase() === deployment.factory.toLowerCase()) {
          const ev = decodeEventLog({ abi: ABI, data: l.data, topics: l.topics }) as any;
          vaults.add((ev.args.vault as Address).toLowerCase());
        } else if (topic === FOLLOWED && vaults.has(l.address.toLowerCase())) {
          const ev = decodeEventLog({ abi: ABI, data: l.data, topics: l.topics }) as any;
          const id = String(ev.args.callId);
          const cur = state.flow[id] ?? { followers: 0, volume: "0" };
          state.flow[id] = { followers: cur.followers + 1, volume: (BigInt(cur.volume) + ev.args.amountIn).toString() };
        }
      }
      from = to + 1n;
      state.cursor = from.toString();
    }
    state.vaults = [...vaults];
    save();
  } catch (e) {
    console.error("flow sync failed:", (e as Error).message);
  } finally {
    busy = false;
  }
}

export function flowSnapshot() {
  return { cursor: Number(state.cursor), vaults: vaults.size, flow: state.flow };
}
