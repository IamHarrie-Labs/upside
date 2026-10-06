// Follow rules as command inputs, shared by `mm upside follow` and `mm upside autopilot`.
import { CommandError, InputFieldType } from "@metamask/agent-wallet/plugin";
import { isAddress, type Address } from "viem";
import { DEFAULT_RULES, fmtQuote, parseQuote, type Rules } from "./core.js";

const text = (flag: string, message: string) =>
  ({ type: InputFieldType.Text, flag, message, required: false, prompt: false }) as const;

export const ruleInputs = {
  maxFeePct: text("max-fee-pct", `Refuse calls whose profit share is above this percent (default ${DEFAULT_RULES.maxFeeBps / 100})`),
  minScored: text("min-scored", `Caller needs at least this many scored calls (default ${DEFAULT_RULES.minScored})`),
  minWinRate: text("min-win-rate", `Caller's minimum win rate in percent (default ${DEFAULT_RULES.minWinRate * 100})`),
  minAvgReturnPct: text("min-avg-return-pct", "Caller's minimum average return per scored call in percent (default 0)"),
  maxAgeMin: text("max-age-min", `Only follow calls posted within this many minutes (default ${DEFAULT_RULES.maxAgeSec / 60})`),
  callers: text("callers", "Only follow these callers (comma-separated addresses)"),
  smartMoneyOnly: {
    type: InputFieldType.Boolean,
    flag: "smart-money-only",
    message: "Only follow callers Nansen labels Smart Money on Monad (paid lookup: $0.05 USDC per pass via x402)",
    required: false,
    prompt: false,
  },
  maxPrice: text("max-price", "Most USD to pay per x402 request (default 0.10)"),
  allowUnverified: {
    type: InputFieldType.Boolean,
    flag: "allow-unverified",
    message: "Also follow callers without an active Cleanverse A-Pass (they earn no fee either way)",
    required: false,
    prompt: false,
  },
} as const;

function num(v: unknown, name: string, fallback: number): number {
  if (v === undefined || v === null || v === "") return fallback;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new CommandError("INVALID_INPUT", `--${name} must be a non-negative number; got ${v}.`, `Pass a number, e.g. --${name} 5.`);
  return n;
}

export function amountFrom(v: unknown, name: string, fallback?: string): bigint {
  const s = v === undefined || v === "" ? fallback : String(v);
  if (!s) throw new CommandError("MISSING_INPUT", `Missing --${name}.`, `Pass --${name} <AUSD amount>, e.g. --${name} 10.`);
  try {
    const n = parseQuote(s);
    if (n <= 0n) throw new Error();
    return n;
  } catch {
    throw new CommandError("INVALID_AMOUNT", `--${name} must be a positive AUSD amount; got ${s}.`, `Example: --${name} 10`);
  }
}

export function rulesFrom(i: Record<string, unknown>, perCall: bigint): Rules {
  const callers = i.callers
    ? String(i.callers)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;
  if (callers?.some((c) => !isAddress(c)))
    throw new CommandError("INVALID_INPUT", "--callers must be comma-separated 0x addresses.", "Example: --callers 0xabc...,0xdef...");
  return {
    ...DEFAULT_RULES,
    perCall,
    maxFeeBps: Math.round(num(i.maxFeePct, "max-fee-pct", DEFAULT_RULES.maxFeeBps / 100) * 100),
    minScored: Math.floor(num(i.minScored, "min-scored", DEFAULT_RULES.minScored)),
    minWinRate: num(i.minWinRate, "min-win-rate", DEFAULT_RULES.minWinRate * 100) / 100,
    minAvgReturnBps: Math.round(num(i.minAvgReturnPct, "min-avg-return-pct", 0) * 100),
    maxAgeSec: Math.round(num(i.maxAgeMin, "max-age-min", DEFAULT_RULES.maxAgeSec / 60) * 60),
    verifiedOnly: i.allowUnverified !== true,
    callers: callers as Address[] | undefined,
    requireSmartMoney: i.smartMoneyOnly === true,
  };
}

export const maxPriceFrom = (i: Record<string, unknown>) => num(i.maxPrice, "max-price", 0.1);

/** The rules as published in an ERC-8004 registration (human units). */
export function mandateOf(rules: Rules, dailyBudget: bigint) {
  return {
    perCall: fmtQuote(rules.perCall),
    dailyBudget: fmtQuote(dailyBudget),
    maxFeePct: rules.maxFeeBps / 100,
    minScored: rules.minScored,
    minWinRatePct: rules.minWinRate * 100,
    minAvgReturnPct: rules.minAvgReturnBps / 100,
    maxAgeMin: rules.maxAgeSec / 60,
    verifiedOnly: rules.verifiedOnly,
    ...(rules.requireSmartMoney ? { nansenSmartMoneyOnly: true } : {}),
    ...(rules.callers?.length ? { callers: rules.callers } : {}),
  };
}

