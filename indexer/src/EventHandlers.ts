// Upside indexer: turns CallBook, VaultFactory, FollowVault and AttestedGate events into a queryable feed,
// caller records and per-follow settlement history.
import { indexer, type Caller } from "envio";

const emptyCaller = (id: string): Caller => ({
  id,
  verifiedUntil: 0n,
  posted: 0,
  scored: 0,
  wins: 0,
  sumReturnBps: 0n,
  feesEarned: 0n,
  followersPaid: 0,
});

indexer.onEvent({ contract: "CallBook", event: "CallPosted" }, async ({ event, context }) => {
  const callerId = event.params.caller.toLowerCase();
  const caller = (await context.Caller.get(callerId)) ?? emptyCaller(callerId);
  context.Caller.set({ ...caller, posted: caller.posted + 1 });
  context.Call.set({
    id: event.params.id.toString(),
    caller_id: callerId,
    side: Number(event.params.side),
    feeBps: Number(event.params.feeBps),
    verifiedAtPost: event.params.verified,
    postedAt: event.block.timestamp,
    postedBlock: event.block.number,
    postedTx: event.transaction.hash,
    expiry: event.params.expiry,
    entryMid: event.params.entryMid,
    targetMid: event.params.targetMid,
    stopMid: event.params.stopMid,
    scored: false,
    exitMid: undefined,
    returnBps: undefined,
    follows: 0,
    followedVolume: 0n,
  });
});

indexer.onEvent({ contract: "CallBook", event: "CallScored" }, async ({ event, context }) => {
  const call = await context.Call.get(event.params.id.toString());
  if (call) context.Call.set({ ...call, scored: true, exitMid: event.params.exitMid, returnBps: event.params.returnBps });
  const callerId = event.params.caller.toLowerCase();
  const caller = (await context.Caller.get(callerId)) ?? emptyCaller(callerId);
  context.Caller.set({
    ...caller,
    scored: caller.scored + 1,
    wins: caller.wins + (event.params.returnBps > 0n ? 1 : 0),
    sumReturnBps: caller.sumReturnBps + event.params.returnBps,
  });
});

indexer.contractRegister({ contract: "VaultFactory", event: "VaultCreated" }, ({ event, context }) => {
  context.chain.FollowVault.add(event.params.vault);
});

indexer.onEvent({ contract: "VaultFactory", event: "VaultCreated" }, async ({ event, context }) => {
  context.Vault.set({
    id: event.params.vault.toLowerCase(),
    owner: event.params.owner.toLowerCase(),
    maxExposure: event.params.maxExposure,
  });
});

indexer.onEvent({ contract: "FollowVault", event: "Followed" }, async ({ event, context }) => {
  const vault = event.srcAddress.toLowerCase();
  const callId = event.params.callId.toString();
  context.Follow.set({
    id: `${vault}-${event.params.positionId}`,
    vault_id: vault,
    call_id: callId,
    caller_id: event.params.caller.toLowerCase(),
    amountIn: event.params.amountIn,
    baseOut: event.params.baseOut,
    open: true,
    proceeds: undefined,
    pnl: undefined,
    callerFee: undefined,
    protocolFee: undefined,
    openedTx: event.transaction.hash,
    closedTx: undefined,
  });
  const call = await context.Call.get(callId);
  if (call)
    context.Call.set({ ...call, follows: call.follows + 1, followedVolume: call.followedVolume + event.params.amountIn });
});

indexer.onEvent({ contract: "FollowVault", event: "Closed" }, async ({ event, context }) => {
  const id = `${event.srcAddress.toLowerCase()}-${event.params.positionId}`;
  const follow = await context.Follow.get(id);
  if (follow)
    context.Follow.set({
      ...follow,
      open: false,
      proceeds: event.params.proceeds,
      pnl: event.params.pnl,
      callerFee: event.params.callerFee,
      protocolFee: event.params.protocolFee,
      closedTx: event.transaction.hash,
    });
  if (event.params.callerFee > 0n) {
    const callerId = event.params.caller.toLowerCase();
    const caller = (await context.Caller.get(callerId)) ?? emptyCaller(callerId);
    context.Caller.set({
      ...caller,
      feesEarned: caller.feesEarned + event.params.callerFee,
      followersPaid: caller.followersPaid + 1,
    });
  }
});

indexer.onEvent({ contract: "AttestedGate", event: "Attested" }, async ({ event, context }) => {
  const callerId = event.params.account.toLowerCase();
  const caller = (await context.Caller.get(callerId)) ?? emptyCaller(callerId);
  context.Caller.set({ ...caller, verifiedUntil: event.params.until });
});
