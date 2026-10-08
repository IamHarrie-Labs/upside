import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type PilotState = { version: 2; followed: number[]; spent: Record<string, string>; scan?: { day: string; next: string; total: string }; pending?: { day: string; amount: string; callId: number } };
export const emptyState = (): PilotState => ({ version: 2, followed: [], spent: {} });
export function loadLedger(path: string): PilotState {
  if (!existsSync(path)) return emptyState();
  let s: any;
  try { s = JSON.parse(readFileSync(path, "utf8")); } catch { throw new Error("LEDGER_INVALID: spend state cannot be read. Restore it or reconcile chain history; no trade was sent."); }
  if (!Array.isArray(s.followed) || s.followed.some((n: any) => !Number.isSafeInteger(n) || n < 0) || !s.spent || Object.entries(s.spent).some(([d,n]) => !/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^\d+$/.test(String(n)))) throw new Error("LEDGER_INVALID: malformed spend state; refusing to reset the budget.");
  if (s.version !== undefined && s.version !== 2) throw new Error("LEDGER_INVALID: unsupported version.");
  if (s.scan && (!/^\d+$/.test(s.scan.next) || !/^\d+$/.test(s.scan.total) || !/^\d{4}-\d{2}-\d{2}$/.test(s.scan.day))) throw new Error("LEDGER_INVALID: malformed chain cursor.");
  if (s.pending && (!/^\d+$/.test(s.pending.amount) || !/^\d{4}-\d{2}-\d{2}$/.test(s.pending.day) || !Number.isSafeInteger(s.pending.callId))) throw new Error("LEDGER_INVALID: malformed pending transaction.");
  return { ...s, version: 2 };
}
export function saveLedger(path: string, s: PilotState) {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(s, null, 2), {mode:0o600});
  renameSync(temp, path);
}
/** Exclusive across processes. No timed lock stealing while a wallet approval can remain pending. */
export async function withLedgerLock<T>(path: string, fn: () => Promise<T>): Promise<T> {
  mkdirSync(dirname(path), { recursive: true });
  let fd: number;
  try { fd = openSync(`${path}.lock`, "wx", 0o600); } catch (e: any) {
    if (e.code === "EEXIST") throw new Error("LEDGER_BUSY: another pass owns this wallet ledger. If a process crashed, verify pending transactions before manually removing its lock.");
    throw e;
  }
  try { writeFileSync(fd, JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()})); return await fn(); }
  finally { closeSync(fd); unlinkSync(`${path}.lock`); }
}
