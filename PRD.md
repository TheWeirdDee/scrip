# SCRIP — Product Requirements

> **A confidential revenue waterfall on an unmodified 0xSplits rail.** Real deals aren't flat
> splits — they're conditional waterfalls ("investor paid back first, then split the rest, better
> terms if a milestone hits"). Scrip lets that settle on-chain with the DEAL TERMS and the PAYOUTS
> sealed, the total publicly provable, computed confidentially by Nox. Everyone else seals a static
> number the founder typed; Scrip has Nox COMPUTE the split from sealed rules — confidential
> computation, not confidential storage.

*Name: **Scrip** — the historical word for a certificate of ownership/shares. Short,
evocative, unused in this space.*

Hackathon: iExec WTF (Write The Future). Confidential layer: **Nox** (TEE-based, NOT FHE).
Deploy on **ETH Sepolia**. Community partner: DeVinci Blockchain (ESILV) — academic/research
crowd that rewards clean, correct, well-scoped work.

---

## 1. Which door — and why it's BOTH

The brief offers two paths: (A) "add privacy to a real open-source protocol without modifying
it," or (B) "build/merge something truly innovative with Nox." Scrip does both in one build:

- **Wraps 0xSplits** (real, famous, live, open-source revenue-splitting protocol) — **unmodified**. → satisfies (A).
- **The innovation:** makes a *public equity/revenue-split protocol confidential* — sealing the
  deal terms and payouts that 0xSplits exposes — which nobody has done. → satisfies (B).

0xSplits describes itself as "an equity instrument by letting you define the percent of future
value each recipient will earn." That's Scrip's use case in the wrapped protocol's own words.

---

## 2. The use case (who, and the wound) — CONDITIONAL deals

**Who:** anyone whose revenue split is *conditional and confidential* — a startup with an
investor revenue-share ("pay me back first, then we split"), a royalty deal with tiered rates,
a profit waterfall with performance milestones, a fund with a hurdle/carry structure, a
group-owned business with "first recoup costs, then split." These are the deals that REAL money
runs on, and they are never flat.

**The wound (two layers):**
1. On-chain revenue splits expose **who owns how much and what they earn** (the base leak).
2. Worse — they can only express **flat, static splits**. Real deals are **conditional
   waterfalls** ("investor recouped first, then 70/30, better if we hit target"), and the DEAL
   TERMS themselves are commercially sensitive — you don't want your next investor to see the
   last one's terms. On-chain today you must either publish your deal structure or not do it
   on-chain at all.

**What Scrip changes:** the founder defines a **sealed waterfall** — ordered tiers with sealed
recoup caps, ratios, and milestone gates. When revenue arrives via the unmodified 0xSplits rail,
**Nox COMPUTES each owner's payout by evaluating the waterfall on the public total against the
sealed terms.** The deal terms stay sealed, the individual payouts stay sealed (each owner
decrypts only their own), the total stays publicly provable. The split protocol is never modified.

**One-sentence use case:** *Run a real conditional revenue deal on-chain — investor recoupment,
tiered splits, milestone bonuses — with the terms and payouts sealed and the total provable,
computed confidentially by Nox on an unmodified 0xSplits rail.*

---

## 3. Why this wins on novelty (the differentiation)

Most confidential-distribution projects in this space seal a **static number the founder typed**
— enter a split, encrypt it, decrypt your share. That's Nox used as *encryption*.

Scrip is the one where **the split is DECIDED by a rule Nox evaluates on sealed data** —
confidential COMPUTATION, which is what Nox actually is (a TEE compute layer, not just an
encryptor). The proof: the SAME public total distributes DIFFERENTLY based on a sealed milestone
— something a static split literally cannot express.

- Static-split projects: `seal(number)` → hide a typed split.
- Scrip: `compute(waterfall, sealed_terms, public_total)` → the deal logic runs privately.

This also aligns with 0xSplits (a *splitting-logic* protocol) — Scrip makes the splitting logic
itself confidential and conditional, without touching 0xSplits.

**Real proof, on Sepolia (`ScripWaterfall` v2 at `0xb9c64beb326ba50acc07bcb4bf1ce0b7f25c3478`):** two
waterfalls with identical tier structure, funded with the same 1 USDC, differing only in one
sealed milestone bit —
- milestone NOT met (cap table 1): founder decrypts **0.629999 USDC**, investor decrypts
  **0.369998 USDC** (`distribute` tx `0x24e593cf2f44725d749613a734992f51f765b1635d3f8bf20a7af368d3678a2b`).
- milestone MET (cap table 2): founder decrypts **0.765 USDC**, investor decrypts **0.235 USDC**
  (`distribute` tx `0x25aa91d8ff6b69abd5e513aa1944fd082ee3a11896eea176f5809bd17eec2988`).

Same total, different real decrypted payout, from one sealed bit. See `log.md` for the full trace
(every tx hash, every script, including the v1→v2 fund-safety fix) and
`hardhat/contracts/ScripWaterfall.sol` for the contract.

---

## 4. Honest positioning

Creativity-strong, institutional use case. The edge is the **confidential-computation wedge**
(Nox computes a conditional waterfall on sealed terms) — genuinely differentiated from a static
sealed-percentage split, and a real financial-infra problem (real deals are conditional and
private). State the privacy boundary honestly (below) rather than overclaiming.

---

## 5. What it is / isn't

- **Is:** a confidential **allocation + payout layer** wrapping an **unmodified 0xSplits**.
  0xSplits provides the public revenue-routing rail and the provable total; Nox seals the
  waterfall's recoup caps, ratios, and milestone gates, and computes each owner's payout;
  recipients receive confidential ERC-7984 amounts.
- **Is not:** a fork/modification of 0xSplits, an FHE build (banned), or a new splitter from
  scratch. Not an async request/callback system either — see §7: every Nox compute call in
  `distribute()` runs synchronously in the same transaction; the only async step is decrypting a
  handle afterward.

---

## 6. Privacy boundary (state upfront — credibility)

- **Sealed:** each tier's recoup cap, split ratio, and milestone gate; each recipient's payout
  amount; the waterfall evaluation itself.
- **Public:** that a Split/distribution exists, the recipient addresses (that someone is an
  owner, not how much), the tier count and order (the deal *structure*, not its terms), and
  **the total revenue distributed** (provable — 0xSplits balances are public; this is the trust
  anchor).
- **Honest claim:** *"The deal terms and the payouts are sealed. The total is provable. Each
  owner sees only their own share."* Do NOT claim recipient identities are hidden — addresses
  are visible; the *terms and amounts* are what's confidential.

---

## 7. The Nox primitives (all load-bearing)

1. **Encrypted inputs/handles** — recoup caps, ratios, and milestone gates sealed via JS SDK
   (`encryptInput(value, 'uint256' | 'bool', contractAddress)`).
2. **Computation (TEE)** — `Nox.add/sub/mul/div/lt/select`, called directly and synchronously in
   `distribute()`, evaluate the two-pass waterfall (abs-caps in order, then ratio splits of the
   remainder) entirely on sealed handles. `select` implements both `min(remaining, cap)` and the
   milestone gate without ever branching control flow on a sealed value. (NOT FHE — Nox TEE.)
3. **Selective disclosure (ACL)** — each owner decrypts only their own computed payout
   (`Nox.addViewer`); an auditor can be granted a scoped batch view (`grantAuditor`); the public
   sees only the total.

---

## 8. Mapping to evaluation criteria

| Weight | Criterion | How Scrip scores | Where points are won |
|---|---|---|---|
| ⭐⭐⭐ | Creativity | Nox COMPUTES a conditional split from sealed terms, not just sealing a typed number | The waterfall + milestone-flip proof |
| ⭐⭐⭐ | Works end-to-end, no mock data | Real 0xSplits + real ERC-7984 + real Sepolia, both milestone scenarios decrypted | §3's real tx hashes and decrypted numbers |
| ⭐⭐ | Deployed ETH Sepolia | Nox + 0xSplits + ERC-7984 all on Sepolia | `0xb9c64beb326ba50acc07bcb4bf1ce0b7f25c3478` |
| ⭐⭐ | feedback.md | Honest DX notes | Written from the real build |
| ⭐⭐ | ≤4-min video | The milestone-flip money shot (DEMO_SCRIPT) | Same total, different sealed payout |
| ⭐ | Leverages Nox | select/lt/add/sub/mul/div all load-bearing | Computation as centerpiece |
| ⭐ | UX | Waterfall builder; async-aware decrypt | "Evaluating in the TEE" as intentional |

---

## 9. Non-goals / cuts

- No modifying 0xSplits (wrap only).
- No FHE anywhere (banned; Nox TEE only).
- No hiding recipient addresses (out of scope — needs stealth addresses).
- No LLM in the payout path — the waterfall is evaluated deterministically in the TEE.
- No live re-resolution of a milestone after cap-table creation — the founder attests the
  milestone's (sealed) truth value at creation time; a given cap table's terms are then locked.
