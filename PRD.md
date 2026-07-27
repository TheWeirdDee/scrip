# SCRIP — Product Requirements

> **A cap table that pays out — with the ownership sealed.** Scrip wraps 0xSplits so a
> company can share revenue among owners where every ownership percentage and every
> payout is confidential, while the total distributed stays publicly provable.

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
  ownership percentages and payouts that 0xSplits exposes — which nobody has done. → satisfies (B).

0xSplits describes itself as "an equity instrument by letting you define the percent of future
value each recipient will earn." That's Scrip's use case in the wrapped protocol's own words.

---

## 2. The use case (who, and the wound)

**Who:** any entity that shares revenue/profit among owners on-chain — a tokenized fund, a
revenue-sharing DAO, a tokenized real-world asset paying holders, a cap table paying dividends,
a group-owned business splitting profit.

**The wound:** 0xSplits (and every on-chain revenue split) stores **ownership percentages and
payouts publicly**. Anyone reading the chain sees "this address owns 40%, that one 25%," and
sees exactly what each received. On-chain, your cap table and everyone's income are naked —
*worse* than a traditional company, where shareholdings and dividends are private. That public
cap table is the reason serious/institutional capital won't use on-chain revenue sharing.

**What Scrip changes:** the ownership allocation and the individual payouts are **sealed** via
Nox; each owner decrypts only their own; the **total distributed stays public and provable**
(so it's private, not unaccountable). The split rail (0xSplits) is untouched.

**One-sentence use case:** *Share revenue among owners on-chain where each owner's stake and
payout is private to them, the total is publicly provable, and the underlying split protocol is
never modified.*

---

## 3. Honest positioning

Creativity-strong, institutional use case. It's not the builder's lived domain — the edge here
is **execution + the "seal the split itself" wedge**, not lived authenticity. State the privacy
boundary honestly (below) rather than overclaiming.

---

## 4. What it is / isn't

- **Is:** a confidential **allocation + payout layer** wrapping an **unmodified 0xSplits**.
  0xSplits provides the public revenue-routing rail and the provable total; Nox seals the
  ownership percentages and the per-recipient payouts; recipients receive confidential
  ERC-7984 amounts.
- **Is not:** a fork/modification of 0xSplits, an FHE build (banned), a re-skin of Confide
  (this hackathon's rival — see §8), or a new splitter from scratch.

---

## 5. Dividend core + equity vision (how they blend)

- **Equity vision (the frame):** the sealed ownership percentages ARE a confidential cap table.
  Because 0xSplits is literally an equity instrument, sealing its percentages = a private cap
  table. This is the pitch and the North Star.
- **Dividend core (what you build deepest):** recurring confidential distributions — revenue
  flows into the Split, and each owner's share is paid out as a sealed amount, decryptable only
  by them. This is the working, demoable heart.

Build the dividend core solid; frame the equity/cap-table vision on top. They are one system:
sealed ownership → private proportional payouts.

---

## 6. Privacy boundary (state upfront — credibility)

- **Sealed:** each recipient's ownership percentage, each recipient's payout amount, the
  allocation computation.
- **Public:** that a Split/distribution exists, the recipient addresses (that someone is an
  owner, not how much), and **the total revenue distributed** (provable — 0xSplits balances are
  public; this is the trust anchor).
- **Honest claim:** *"The ownership and the payouts are sealed. The total is provable. Each
  owner sees only their own share."* Do NOT claim recipient identities are hidden — addresses
  are visible; the *amounts and percentages* are what's confidential.

---

## 7. The Nox primitives (all load-bearing)

1. **Encrypted inputs/handles** — ownership percentages / allocations sealed via JS SDK.
2. **Computation (TEE)** — each recipient's payout computed from their sealed share of the
   public total, inside the enclave. `mul`/`add` on sealed values. (NOT FHE — Nox TEE.)
3. **Selective disclosure (ACL)** — each owner decrypts own share+payout; an auditor/regulator
   can be granted a scoped batch view; the public sees only the total.

---

## 8. Borrow / avoid

- **Borrow (Zama winners — different arena, fair):** Veilflow's distribution-engine pattern;
  the ConfidentialBuybacks "private during, provable-total after" accountability mechanic;
  GhostLend's no-leak-on-error rigor; Cifra's one-screenshot thesis; Paayee's real-product polish.
- **Avoid (Confide — THIS hackathon's rival):** do not echo Confide's Safe-module +
  auditor-disclosure architecture. Scrip's provable-total comes from the 0xSplits balance being
  public + the buyback-pool pattern — framed as revenue-split total, NOT Confide's treasury model.
  **Wedge vs Confide:** Confide seals *decided payouts to known people from a Safe*; Scrip seals
  *ownership percentages and computes payouts from them, wrapping 0xSplits*. Different protocol,
  different mechanic.

---

## 9. Mapping to evaluation criteria

| Weight | Criterion | How Scrip scores | Where points are won |
|---|---|---|---|
| ⭐⭐⭐ | Creativity | Sealing a public equity/split protocol — both doors at once; nobody did it | The "seal the split itself" wedge |
| ⭐⭐⭐ | Works end-to-end, no mock data | Real 0xSplits + real ERC-7984 + real Sepolia | The confidential-payout path actually working |
| ⭐⭐ | Deployed ETH Sepolia | Nox + 0xSplits + ERC-7984 all on Sepolia | — |
| ⭐⭐ | feedback.md | Honest DX notes | Write from real build |
| ⭐⭐ | ≤4-min video | The one-frame reveal (DEMO_SCRIPT) | Sealed percentages + provable total |
| ⭐ | Leverages Nox | All three primitives load-bearing | Computation as centerpiece |
| ⭐ | UX | Owner portal; async-aware | "computing in the TEE" as intentional |

---

## 10. Non-goals / cuts

- No modifying 0xSplits (wrap only).
- No FHE anywhere (banned; Nox TEE only).
- No hiding recipient addresses (out of scope — needs stealth addresses).
- No LLM in the payout path — allocations computed deterministically in the TEE.
- Built demo = confidential revenue split. Equity/cap-table is the framing, one README line
  on generalization; not extra build surface.
