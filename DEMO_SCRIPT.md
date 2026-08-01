# SCRIP — Demo Script (< 3 min). Lead with the WATERFALL money shot (the thing no competitor has).

Everything real on Sepolia. The novelty: Nox COMPUTES a conditional split on sealed terms — the same
total distributes differently based on a sealed condition. Static-split projects can't do this.

## PRE-RECORDING CHECKLIST — do this before you hit record, or the demo stalls live

**1. Gas.** The wallet(s) you'll record with need Sepolia ETH — Create & lock, Route via 0xSplits,
Pool revenue, Distribute, and Grant auditor all cost gas; no gas = "insufficient funds" mid-take.
Faucets that don't require a mainnet balance: `sepolia-faucet.pk910.de` (PoW, mine in-browser) or
`cloud.google.com/application/web3/faucet/ethereum/sepolia`. Get 0.05+ ETH per wallet you'll use.

**2. The 3-step funding flow — don't skip step 2 on camera.** Sending USDC to the Split alone does
nothing: (1) send USDC to the Split address (waiting room, not in the deal yet), (2) **Route via
0xSplits** (the Split's own `distribute()` — this is what actually forwards funds into
ScripWaterfall; nothing arrives until this runs), (3) **Pool revenue** (marks it as the provable
total). If "Protocol pooled balance" reads 0.0, you've missed step 2 — that's expected, not a glitch
to cut around; just run step 2.

**3. Full run order** (rehearse once before recording): fund wallet with Sepolia ETH → build
waterfall → Create & lock → send USDC to Split → Route via 0xSplits → Pool revenue → Distribute →
decrypt as owner.

**4. Current addresses** (confirm these match what's on screen before recording — redeploys change
them): `ScripWaterfall` v2 `0xb9c64beb326ba50acc07bcb4bf1ce0b7f25c3478`; Split
`0xB97F83C034A97893f7F8BDD78b70C035b3C501Ee`; Confidential USDC
`0x081000dc72d13e472671f9a641c261cbb1a39101`; USDC `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`.
The pre-seeded demo founder/investor wallets (cap tables #1/#2, the milestone-flip proof already
run for real — see log.md) let you skip funding entirely and go straight to Distribute/decrypt if
you'd rather demo with existing state than build live.

## 0:00-0:30 — The gap (why every other Nox project is the same, and this isn't)
"Real revenue deals aren't flat splits. They're conditional: an investor gets paid back first, then
you split the rest, and the terms change if you hit a milestone. On-chain today you either publish
those deal terms for competitors to see, or you don't do it on-chain. Every confidential project this
hackathon seals a fixed number someone typed. Scrip is different — it lets Nox COMPUTE the deal
itself, privately."

## 0:30-1:15 — Build the sealed waterfall (real deal, on the unmodified 0xSplits rail)
- Founder builds a waterfall: "1) Investor recoups a fixed amount first. 2) Then split the rest —
  founder 70%, investor 30% baseline. 3) If the milestone is hit, founder gets +15% at investor's
  expense — 85%/15% instead."
- Show the amounts/ratios/milestone being ENCRYPTED IN THE BROWSER before submit. Order is public;
  terms are sealed. Create & lock. Confirm on Sepolia.
- "The deal STRUCTURE (the order) is public. The TERMS — the $1000, the 70/30, the milestone — are
  sealed. Nobody sees them, not even on Etherscan."

## 1:15-2:15 — THE MONEY SHOT: same total, different payout (real, on Sepolia)
- Send 1 USDC of revenue to the UNMODIFIED 0xSplits Split → click **Route via 0xSplits** (the
  Split's own distribute() forwarding it to ScripWaterfall) → **Pool revenue**. Total (1 USDC) is
  public and provable.
- Distribute. Show the "Evaluating the waterfall in the TEE…" state on the button — "the split is
  being COMPUTED confidentially, not just decrypted."
- Cap table #1 (milestone NOT met): founder decrypts 0.629999 USDC, investor decrypts 0.369998 USDC.
- Cap table #2 (milestone MET), same tiers, same 1 USDC total: founder decrypts 0.765 USDC, investor
  decrypts 0.235 USDC.
- "Same total. Different payouts. Because a SEALED condition changed the math — computed privately by
  Nox. A static sealed split literally cannot express this. That's the difference between hiding a
  number and computing on hidden ones." (Real tx hashes for both distributions are in log.md.)

## 2:15-2:45 — Privacy boundary + selective disclosure
- Each owner decrypts ONLY their own payout — not the other's, not the terms. The total is public.
- Founder grants an auditor scoped access → auditor sees the batch (intended disclosure), revocable.
- "Private during, provable after. The deal ran on-chain; the terms never leaked."

## 2:45-3:00 — Close
- "Scrip: real conditional revenue deals — investor recoupment, tiered splits, milestone bonuses —
  settled on an unmodified 0xSplits rail, with the terms and payouts sealed and computed by Nox.
  Not confidential storage. Confidential computation. Live on Sepolia."

## Notes: < 3:00 hard. The milestone flip (same total, different payout) is the thumbnail — it's the
## one thing the static-split crowd cannot do. Real Sepolia, no mock. Never show a sealed term/payout
## as a plaintext number on screen.
