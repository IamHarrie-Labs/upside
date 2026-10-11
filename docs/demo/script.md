# Upside: demo video script (3:00)

Target length 2:50–3:00 · about 400 words of narration at a calm pace · screen recording plus voice-over.
Record at 1440×900 for desktop scenes and a phone mirror (or 390 px browser) for the mobile scene.

**Rule for the whole video:** keep the "test tokens / demo venue" label visible whenever the testnet app is on screen. Never claim market profits.

---

## Scene 1 — Hook (0:00–0:15)

**Screen:** black, then fade into the landing page hero: *Good calls. Shared upside.* Let the clouds drift for a beat.

**Narration:**
> "Trading signal groups get paid whether you win or lose. Their losers get deleted, their winners get screenshotted, and you carry all the risk.
> Upside flips that: a caller only earns when *you* actually profit."

**Caption:** `Upside · built on Monad`

---

## Scene 2 — The idea in one breath (0:15–0:35)

**Screen:** scroll the landing page slowly through "How it works" and the fee stages.

**Narration:**
> "Every call is committed onchain *before* the move: entry, target, stop, fee and expiry. It can't be edited or deleted, and it gets scored, losers included.
> You follow through your own vault, and the caller earns a share of your realized gains, only after your earlier losses with them are recovered."

---

## Scene 3 — A record you can't fake (0:35–1:05)

**Screen:** click **Explore the calls**, then go to the Calls workspace.
1. Hover over **@sarah**, marked *Verified*: **3 wins of 7 scored, average +3.3%**. Point out that the losses are still listed.
2. Scroll to **@sybil_farm**, marked *Unverified · earns $0*: **7 followers · $700**. Open the call; it's scored at **+0.25%**.

**Narration:**
> "Here's Sarah. Seven scored calls, three wins, and every loss is still on the record.
> And here's a Sybil farm: seven fresh wallets piled seven hundred dollars into its call. Its score? Plus zero point two five percent, exactly what the market did. Followers aren't an input, so you can't buy a reputation. And it's unverified, so it earns nothing either way."

**Caption:** `Score = market move from post to scoring. Follower money is not an input.`

---

## Scene 4 — Follow, with nothing hidden (1:05–1:35)

**Screen (signed in as the demo follower):**
1. Pick an open **@sarah** call, choose **$50**, and click **Follow**.
2. The **Review your follow** sheet opens. Pause on: *You commit*, *Minimum received*, *Exposure after*, *Venue: DemoRouter · simulated fills*, *Performance fee: 20% of new realized gains*.
3. Click **Cancel**, and note that nothing was sent. Reopen it and click **Confirm follow**. Show the passkey prompt and the confirmation.

**Narration:**
> "Following opens a review before anything is signed: the amount, the minimum you'll receive, your exposure against your own limit, and the exact fee rule. Cancel, and nothing is sent.
> Confirm, and your passkey signs it. No seed phrase: your Monad account is derived on your device with Mera. The trade happens inside *your* vault; the caller never touches your funds."

**Caption:** `Testnet · test AUSD · demo venue`

---

## Scene 5 — The receipt (1:35–2:05)

**Screen:** open **Vault → Closed** and expand a settlement receipt.
- **Preferred:** use the labelled local example (`docs/demo/round-trip-local.webm` or a fresh local run): *Principal 50 → Proceeds 60 → New gain above previous peak 10 → Fee 2.00 → Caller 1.80 · Protocol 0.20*.
- Then cut briefly to **@femi**'s testnet receipt: a small loss, **fee 0**.

**Narration:**
> "Closing gives you a receipt read straight from the vault's settlement event. In this local example, fifty becomes sixty. Ten is new gain above your previous peak, so the twenty percent fee is two: one-eighty to the caller, twenty cents to the protocol.
> And on testnet, Femi closed slightly down with Sarah, so Sarah earned exactly nothing. Losses carry forward; a caller has to win them back before earning again."

**Caption (over the local example):** `Local example · controlled prices`

---

## Scene 6 — Let an agent do it, within your limits (2:05–2:35)

**Screen:** a terminal with MetaMask Agent Wallet (`mm`), signed in.

```bash
mm upside agent register --name "Sarah follower" --per-call 10 --daily-budget 50
mm upside autopilot --dry-run --per-call 10 --daily-budget 50 --min-scored 3
```

Show the output: the agent's ERC-8004 id, then *followed @sarah…* and *skipped @sybil_farm: caller is not verified*.

**Narration:**
> "You can also hand this to an AI agent. Our MetaMask Agent Wallet plugin registers the agent with an onchain ERC-8004 identity that publishes its mandate: ten dollars a call, fifty a day.
> Then it follows only what passes your rules. Sarah passes; the Sybil farm is refused. And every transaction still goes through your MetaMask policy, under a hard exposure cap enforced by your vault's contract."

**If `mm login` isn't available on the day:** show `npm run test:local` in `mm-plugin/` (the 13 checks passing, including *skips Sybil Farm's call: unverified*), with the caption `Plugin core on a local chain · MetaMask host approval pending`.

---

## Scene 7 — Everywhere you trade (2:35–2:50)

**Screen:** a quick montage, about 3 seconds each:
1. The Android app: onboarding and then the calls feed.
2. A Perpl "skin in the game" badge on a caller.
3. The explorer: the hosted follow → close → withdraw transactions (call 11).
4. The GitHub README.

**Narration:**
> "It runs on web and as a native Android app. It shows whether a caller has skin in the game on Perpl, and on mainnet it executes through Kuru with AUSD. Everything you just saw is onchain on Monad, and open source."

---

## Scene 8 — Close (2:50–3:00)

**Screen:** back to the landing hero, with the logo and URL.

**Narration:**
> "Upside. Good calls, shared upside."

**End card:**
```
upside-monad.vercel.app
github.com/IamHarrie-Labs/upside
Monad Metropolis 2026 · Track 03
```

---

## Before you record (15 minutes)

- [ ] **Keeper awake.** Open the site a minute early so a fresh price is posted. Check that `https://keeper.38.49.210.22.sslip.io/poke` returns `"capped": false`.
- [ ] **Follower account ready.** Create (or restore) the passkey account on `upside-monad.vercel.app` and send it about **0.5 testnet MON** for gas. Use the **Funding** page faucet for test AUSD. Wait about 30 seconds for the balance to show.
- [ ] **A fresh @sarah call is open.** Sarah's longer calls may have expired by recording time. If none is live, post a 30-minute call from the demo persona with `seed-demo` or the Create page, so Scene 4 has something to follow.
- [ ] **Raise the keeper cap for the session** if you'll be on the site a long time: `MAX_DAILY_MON=3` (redeploy the keeper), then set it back.
- [ ] **MetaMask:** `mm login`, install the plugin (`mm-plugin/README.md`), and run the Scene 6 commands once before recording.
- [ ] **Hide secrets.** No `.env.deploy`, `.env.demo`, private keys, Expo passwords or recovery phrases on screen. Close the terminal history before filming.
- [ ] **Labels visible.** The "test tokens / demo venue" marker stays on screen during the testnet scenes.

## Recording tips

- Record each scene as its own clip, then cut. Narration is easier to re-take than screen actions.
- Slow the cursor down; pause for half a second on every number you mention.
- If a transaction is slow, cut on the confirmation, not the spinner.
- Export at 1080p. Keep it under 3:00; judges skip long videos.
