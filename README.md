# Scrip

**Pay your owners. Prove the total. Hide who gets what.** Scrip runs a real conditional revenue
deal — investor recoupment, tiered splits, milestone bonuses — on an unmodified
[0xSplits](https://splits.org) rail, where the deal terms and every payout are confidential and
the total distributed stays publicly provable.

Built for **iExec WTF (Write The Future)** on the **Nox** confidential layer (TEE-based, not FHE).
Deployed and verified real end-to-end on **Ethereum Sepolia** — no mock data.

---

## Who it's for, and the wound

For a startup and its investor, a royalty deal, or a profit-share agreement: real deal terms —
who recoups first, how the rest splits, what a milestone changes — are commercially sensitive.
On-chain today you either publish the whole structure for anyone (including your next investor,
or a competitor) to read on a block explorer, or you don't run the deal on-chain at all. Worse,
every on-chain split today can only express a **flat, static percentage** — real deals are
**conditional waterfalls**, and no confidential-split project lets that condition live on-chain
without either leaking it or hard-coding it in the clear.

## What Scrip does

Scrip wraps 0xSplits **unmodified** and seals the part that matters. 0xSplits routes the revenue
and gives a **public, provable total**. Nox seals the waterfall's **recoup caps, split ratios, and
milestone gates**, and *computes* each owner's payout from them inside a TEE — not just decrypts a
number someone typed. Each owner decrypts only their own payout; an auditor can be granted a
scoped view; the public sees only the total.

**The proof this is computation, not storage:** two waterfalls, identical structure, funded with
the same 2 USDC — the only difference is one sealed milestone bit. Real, decrypted, on Sepolia:
milestone not met → founder 1.119999 USDC / investor 0.879998 USDC; milestone met → founder 1.36
USDC / investor 0.64 USDC. Same total, different payout, from a rule Nox evaluated privately. A
static sealed percentage cannot express this.

## Why it's a real integration (both brief doors)

- **Wraps an existing protocol (unmodified):** 0xSplits — real, live, open-source. It routes
  revenue and anchors the provable total; Scrip never forks or modifies it, and 0xSplits keeps
  doing exactly what it's built for (public revenue routing) on top of every distribution here.
- **Truly innovative with Nox:** it makes the *splitting logic itself* confidential and
  conditional — Nox COMPUTES the split from sealed terms, rather than sealing a typed number,
  which nobody else building on Nox does.

## Honest privacy boundary

- **Sealed:** each tier's recoup cap, split ratio, and milestone gate; each owner's payout; the
  waterfall evaluation itself.
- **Public:** that a waterfall exists, the recipient addresses (that someone is an owner), the
  tier count and order (the deal *structure*), and the total distributed (provable — 0xSplits'
  balance is public, that's the trust anchor).
- Scrip hides *the deal terms and how much each owner earns*, not *that* they participate —
  identities/addresses are never hidden.

## How it fits together

- **[0xSplits](https://splits.org)** (unmodified, v2 Push Split) — public revenue routing +
  provable total in. ERC-7984 isn't ERC-20, so a confidential token can't flow through Splits'
  distribute path directly — Splits routes the *public total* to Scrip (as sole recipient), and
  Scrip does the confidential waterfall payout itself.
- **[Nox](https://docs.noxprotocol.io)** (TEE, not FHE) — seals every tier's terms, evaluates the
  two-pass waterfall (`Nox.add/sub/mul/div/lt/select`, entirely on sealed handles — see
  `hardhat/contracts/ScripWaterfall.sol`), manages selective disclosure (ACL). Every Nox call here
  is a normal synchronous Solidity call, resolved in the same transaction — the only async step
  anywhere is decrypting a handle afterward.
- **ERC-7984** — Nox's own TEE-based confidential token implementation
  (`@iexec-nox/nox-confidential-contracts`, **not** OpenZeppelin's `confidential-contracts` package,
  which is Zama FHEVM-based and out of scope here). Real Sepolia USDC wraps in 1:1 via
  `ERC20ToERC7984Wrapper` — no mock money anywhere in this build.

## Deployed on Ethereum Sepolia (real, live)

| Contract | Address |
|---|---|
| `ScripWaterfall` | [`0x137077d0c4ef8179b7e405a19ee4e62210e5ae43`](https://sepolia.etherscan.io/address/0x137077d0c4ef8179b7e405a19ee4e62210e5ae43) |
| `ConfidentialUSDC` (ERC-7984 wrapper, shared with the original demo) | [`0x081000dc72d13e472671f9a641c261cbb1a39101`](https://sepolia.etherscan.io/address/0x081000dc72d13e472671f9a641c261cbb1a39101) |
| 0xSplits Split (unmodified, routes to ScripWaterfall) | [`0x75720eBbBe8a92A21D420A4C6d240dC7299100b5`](https://sepolia.etherscan.io/address/0x75720eBbBe8a92A21D420A4C6d240dC7299100b5) |
| USDC (Circle, Sepolia) | [`0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`](https://sepolia.etherscan.io/address/0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238) |
| `ScripDistributor` (earlier static-split demo, kept live, superseded by ScripWaterfall) | [`0x3b323cee5cc1dc3fead35c74b45062aa43f45ede`](https://sepolia.etherscan.io/address/0x3b323cee5cc1dc3fead35c74b45062aa43f45ede) |

Cap tables #1 and #2 on `ScripWaterfall` are the live milestone-flip demo (see above). `log.md` has
every real transaction hash from building this, phase by phase.

## Prerequisites

- Node.js 18+ and npm.
- A browser wallet (MetaMask or similar) with an account on **Ethereum Sepolia**.
- Sepolia test ETH for gas — a public faucet (e.g. the one built into most wallets, or
  `sepoliafaucet.com`) is enough; the frontend itself never asks you to fund anything to try it,
  since the contracts above are already deployed and live.
- Only needed if you want to redeploy or run the setup scripts yourself: a Sepolia RPC URL and a
  funded private key in `hardhat/.env` (see `hardhat/.env.example`), plus some Sepolia test USDC
  (Circle's faucet at `usdcfaucet.com` supports Sepolia).

## Install and run

**Frontend (owner portal — founder / owner / auditor views):**
```bash
npm install
npm run dev      # next dev --webpack — never Turbopack, per project rules
```
Open `http://localhost:3000`, click **Launch the Sepolia app**, and connect a wallet on Sepolia.
No environment variables are needed for the frontend — the deployed contract addresses are already
committed in `app/lib/contracts.ts`, pointing at the live Sepolia deployment above.

## Using the dApp

1. **Connect a wallet** on Sepolia from `/app`. A wallet with no history yet lands on "No on-chain
   role yet" — that's expected for a brand-new address, not an error.
2. **Become a founder** by clicking **New waterfall** (available to any connected wallet — there's
   no allowlist). Add owner addresses, then build the waterfall: each tier is a beneficiary, a
   "recoups first $X" or "then splits N%" rule, and an optional milestone gate. Every dollar
   amount, percentage, and milestone flag is encrypted in your browser before **Create & lock**
   submits it on-chain.
3. **Fund it**: send Sepolia USDC to the 0xSplits Split address shown on the founder Overview (the
   unmodified 0xSplits rail), then click **Pool revenue** to make the total public and provable.
4. **Distribute**: click **Distribute** — this evaluates the sealed waterfall against the pooled
   total inside the Nox TEE and settles each owner's confidential payout in one transaction.
5. **Decrypt as an owner**: switch to (or connect as) an owner wallet listed on that waterfall —
   the Owner view decrypts that wallet's own computed payout. No other owner, the founder, or the
   public can see it.
6. **Grant an auditor** (optional): from the founder view, grant a specific address scoped
   decrypt access to the whole batch of payouts — recorded on-chain, revocable, without making the
   deal terms public to anyone else.

To see this without funding anything yourself, connect as the pre-seeded demo founder or investor
wallet (see `hardhat/.env` after running the setup scripts below) against cap tables #1/#2 on
`ScripWaterfall` — the real milestone-flip proof described above.

## Redeploy or reset the demo (optional — contracts above are already live)

```bash
cd hardhat
npm install
npm run compile
npx hardhat run scripts/deploy-token.ts --network sepolia       # ConfidentialUSDC
npx hardhat run scripts/deploy-waterfall.ts --network sepolia   # ScripWaterfall
npx tsx scripts/create-waterfall-split.ts        # real 0xSplits v2 Push Split, 100% -> ScripWaterfall
npx tsx scripts/setup-waterfall-cap-tables.ts    # two sealed waterfalls, same terms, opposite milestone bit
npx tsx scripts/run-waterfall-scenario.ts 1 2    # fund + distribute cap table 1 (milestone not met)
npx tsx scripts/run-waterfall-scenario.ts 2 2    # fund + distribute cap table 2 (milestone met)
npx tsx scripts/decrypt-waterfall-payouts.ts     # each owner decrypts only their own, both scenarios
```
Needs a Sepolia RPC URL + a funded private key in `hardhat/.env` (see `hardhat/.env.example`).

## Docs

- [`PRD.md`](PRD.md) — product + positioning
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — the 0xSplits wrap, ERC-7984 interface wall, clean path
- [`BUILD_PHASES.md`](BUILD_PHASES.md) — phased build checklist for the original static-split build
- [`DEMO_SCRIPT.md`](DEMO_SCRIPT.md) — the demo video script, led by the milestone-flip money shot
- [`log.md`](log.md) — append-only build log: every real finding, bug, and tx hash, phase by phase
- [`feedback.md`](feedback.md) — required iExec DX feedback, written from the real build
