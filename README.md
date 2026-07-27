# Scrip

**A cap table that pays out — with the ownership sealed.** Scrip wraps [0xSplits](https://splits.org)
(unmodified) so a company can share revenue among owners where every ownership percentage and every
payout is confidential, while the total distributed stays publicly provable.

Built for **iExec WTF (Write The Future)** on the **Nox** confidential layer (TEE-based, not FHE).
Deployed and verified real end-to-end on **Ethereum Sepolia** — no mock data.

---

## The problem

0xSplits is a great, widely-used protocol for splitting revenue among owners by ownership percentage
— it even calls itself "an equity instrument." But every percentage and every payout is **public**.
On-chain, your cap table and everyone's dividends are naked on a block explorer — worse than a
traditional company, where shareholdings and payouts are private. That public cap table is why
serious capital won't share revenue on-chain.

## What Scrip does

Scrip wraps 0xSplits **unmodified** and seals the part that matters. 0xSplits routes the revenue and
gives a **public, provable total**. Nox seals the **ownership percentages** and computes each owner's
**payout confidentially** inside a TEE. Each owner decrypts only their own share; an auditor can be
granted a scoped view; the public sees only the total. Private ownership, private dividends, provable
accountability — layered onto a real protocol without touching it.

## Why it's a real integration (both brief doors)

- **Wraps an existing protocol (unmodified):** 0xSplits — real, live, open-source. It routes revenue
  and anchors the provable total.
- **Truly innovative with Nox:** it makes a *public equity/split protocol confidential* — sealing the
  percentages and payouts 0xSplits exposes — which nobody has done.

## Honest privacy boundary

- **Sealed:** each owner's percentage, each payout, the allocation math.
- **Public:** that a split exists, the recipient addresses (that someone is an owner), and the total
  distributed (provable — 0xSplits' balance is public, that's the trust anchor).
- Scrip hides *how much each owner holds and earns*, not *that* they participate — identities/
  addresses are never hidden.

## How it fits together

- **[0xSplits](https://splits.org)** (unmodified, v2 Push Split) — public revenue routing + provable
  total in. ERC-7984 isn't ERC-20, so a confidential token can't flow through Splits' distribute path
  directly — Splits routes the *public total* to Scrip (as sole recipient), and Scrip does the
  confidential per-owner payout itself.
- **[Nox](https://docs.noxprotocol.io)** (TEE, not FHE) — seals ownership %, computes payouts
  (`payout = pct × total / 10_000`, entirely on encrypted handles), manages selective disclosure (ACL).
- **ERC-7984** — Nox's own TEE-based confidential token implementation
  (`@iexec-nox/nox-confidential-contracts`, **not** OpenZeppelin's `confidential-contracts` package,
  which is Zama FHEVM-based and out of scope here). Real Sepolia USDC wraps in 1:1 via
  `ERC20ToERC7984Wrapper` — no mock money anywhere in this build.

## Deployed on Ethereum Sepolia (real, live)

| Contract | Address |
|---|---|
| `ScripDistributor` | [`0x3b323cee5cc1dc3fead35c74b45062aa43f45ede`](https://sepolia.etherscan.io/address/0x3b323cee5cc1dc3fead35c74b45062aa43f45ede) |
| `ConfidentialUSDC` (ERC-7984 wrapper) | [`0x081000dc72d13e472671f9a641c261cbb1a39101`](https://sepolia.etherscan.io/address/0x081000dc72d13e472671f9a641c261cbb1a39101) |
| 0xSplits Split (unmodified) | [`0x7eD52bCCa0C0d6f7F86c73CB5A4106e33764557f`](https://sepolia.etherscan.io/address/0x7eD52bCCa0C0d6f7F86c73CB5A4106e33764557f) |
| USDC (Circle, Sepolia) | [`0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`](https://sepolia.etherscan.io/address/0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238) |

Cap table #1 on `ScripDistributor` is the live demo: two owners, 60%/40%, sealed on-chain.
`log.md` has every real transaction hash from building this, phase by phase.

## Run it

**Frontend (owner portal — founder / owner / auditor views):**
```bash
npm install
npm run dev      # next dev --webpack — never Turbopack, per project rules
```
Connect a Sepolia wallet. As the demo owner (see `hardhat/.env` after running the setup scripts) you
can decrypt your own confidential balance; as the founder you can pool revenue, distribute, grant an
auditor, or set up a brand-new sealed cap table (percentages are encrypted in your browser before
anything touches the chain).

**Contracts (already deployed to the addresses above; scripts to redeploy/reset the demo):**
```bash
cd hardhat
npm install
npm run compile
npx hardhat run scripts/deploy-token.ts --network sepolia       # ConfidentialUSDC
npx hardhat run scripts/deploy-distributor.ts --network sepolia # ScripDistributor
npx tsx scripts/create-split.ts        # real 0xSplits v2 Push Split, 100% -> ScripDistributor
npx tsx scripts/setup-cap-table.ts     # sealed cap table, 60%/40%
npx tsx scripts/route-revenue.ts 3     # real USDC through the unmodified Split
npx tsx scripts/distribute.ts          # confidential proportional payouts
npx tsx scripts/decrypt-payouts.ts     # each owner decrypts only their own
npx tsx scripts/grant-auditor.ts && npx tsx scripts/auditor-decrypt.ts
```
Needs a Sepolia RPC URL + a funded private key in `hardhat/.env` (see `hardhat/.env.example`).

## Docs

- [`PRD.md`](PRD.md) — product + positioning
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — the 0xSplits wrap, ERC-7984 interface wall, clean path
- [`BUILD_PHASES.md`](BUILD_PHASES.md) — phased build checklist, all phases done and verified real
- [`DEMO_SCRIPT.md`](DEMO_SCRIPT.md) — the ≤4-min video script
- [`log.md`](log.md) — append-only build log: every real finding, bug, and tx hash, phase by phase
- [`feedback.md`](feedback.md) — required iExec DX feedback, written from the real build
