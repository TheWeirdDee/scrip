# SCRIP — Build Phases

Each phase ends demoable + committed. Deploy target: ETH Sepolia. Nox compute is async — Phase 0
and the Phase-3 gate exist to find out early. NO FHE anywhere (banned) — Nox TEE only.

## Phase-0 decisions (make first)
- [ ] Lock the name (Scrip) and the wrap target (0xSplits).
- [ ] Confirm the ERC-7984 confidential transfer + ERC20→7984 wrap signatures against live docs.
- [ ] Accept the interface wall: ERC-7984 ≠ ERC-20, so Splits routes the total to Scrip; Scrip
      does the confidential payout. (ARCHITECTURE §3–4.)

---

## Phase 0 — Prove the Nox pipe — DONE
**Goal:** one sealed value round-trips through the Nox TEE on Sepolia.
- [x] Nox Hardhat starter deployed to Sepolia; deploy a trivial confidential contract.
      `hardhat/contracts/ConfidentialPiggyBank.sol` at `0x585410f18f11fddbf8603fc4a972df087a48ca99`.
- [x] JS SDK `encryptInput` → handle; contract does one op (`Nox.add` by a sealed input);
      TEE Runner computes; decrypt result via ACL. Tx `0xd5694cef...`, decrypted value `42n` matches.
- [x] Commit: `phase-0: sealed value round-trips through Nox on Sepolia`.

**Demoable:** encrypt → compute → decrypt works — verified with a real Sepolia tx. Reliable, with a
caveat: decrypt right after the tx mines can 403 for up to ~a couple minutes while ACL indexing
catches up; poll with backoff (see `hardhat/scripts/roundtrip.ts`). See log.md for detail. PROCEED.

---

## Phase 1 — Confidential token + real USDC on-ramp — DONE
- [x] Deploy an ERC-7984 confidential token on Sepolia. `ConfidentialUSDC` (extends Nox's
      `ERC20ToERC7984Wrapper`) at `0x081000dc72d13e472671f9a641c261cbb1a39101`.
- [x] ERC20→ERC7984 wrapper: wrap real Sepolia test-USDC into the confidential token. Real Circle
      USDC (`0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`) — wrapped 5 USDC 1:1, tx `0x762877be...`.
- [x] Recipient decrypts their own confidential balance via ACL. Decrypted `5000000n` (matches
      exactly, 6 decimals) on the first attempt.
- [ ] Commit: `phase-1: real USDC wraps to confidential token`. (Not committed — commit only on
      explicit request now; see log.md.)

---

## Phase 2 — Wrap 0xSplits (unmodified) + sealed cap table — DONE
- [x] Create a real 0xSplits Split on Sepolia routing 100% to the Scrip distributor contract.
      0xSplits v2 Push Split at `0x1acd6c19e294b5f8e942428734345aa50ee87749` (via the deterministic
      `PushSplitFactory` v2.2, unmodified), single recipient = `ScripDistributor`, 100% allocation.
- [x] `createCapTable`: owners public, each ownership % a sealed handle. Two owners (60%/40%,
      sealed). `lockPercentages`: locked. (Sum-to-100% is enforced at setup, not on-chain — see the
      resolved BLOCKER below.)
- [x] Send test USDC into the Split; distribute the Split (unmodified) → funds pool in Scrip;
      `poolRevenue` reads the public total. Sent 3 USDC, `ScripDistributor` received 2999999 (0xSplits'
      own well-known 1-unit gas-optimization dust — confirmed real, unmodified protocol behavior, not
      a Scrip issue). `poolRevenue()` correctly reads and emits that exact public total.
- [ ] Commit: `phase-2: 0xSplits routes to Scrip, sealed cap table set`. (Not committed — commit only
      on explicit request; see log.md.)

**Demoable:** a real, unmodified 0xSplits Split feeding Scrip; the cap table percentages are
sealed on-chain (explorer shows handles, not percentages). Verified on Sepolia.

**BLOCKERS resolved:**
- `ERC20→ERC7984Wrapper` wrap() signature: confirmed in Phase 1 (`wrap(address to, uint256 amount)`,
  plaintext amount, real package `@iexec-nox/nox-confidential-contracts`).
- `lockPercentages` sum==10_000 guard: went with the already-approved fallback — enforced at the
  setup UI, founder trusted, not a strict on-chain comparison (would otherwise leak timing or need a
  mid-tx decrypt). The sealed sum is still computed and kept viewer-accessible to the founder alone
  for their own off-chain audit.

---

## Phase 3 — Confidential distribution (CLEAN PATH CONFIRMED by iExec team) — DONE, GO
- [x] `distribute`: wrap public constants once — `encTotal = Nox.toEuint256(publicTotal)`,
      `enc10000 = Nox.toEuint256(10_000)` — reuse for all recipients (cached, free).
- [x] Per owner: `payout = Nox.div(Nox.mul(sealedPct_i, encTotal), enc10000)` — **MUL BEFORE DIV**
      (division floors; dividing first floors to 0). Real Sepolia run: 60%/40% of 2999999 pooled →
      1799999 / 1199999 (floor-correct in both cases).
- [x] `confidentialTransfer` the sealed payout (euint256) to each owner. Real tx, succeeded.
- [x] Grant each owner viewer access to **ONLY their own** payout — never the batch. Verified: each
      owner decrypted their own cUSDC balance; cross-owner decryption attempts were both cleanly
      denied by the Handle Gateway ("not authorized to decrypt it" — no leak of why/what).
- [x] Owner decrypts only their own; others sealed; total public. Confirmed live.
- [ ] Commit: `phase-3: confidential proportional payouts from sealed cap table`. (Not committed —
      commit only on explicit request; see log.md.)

**GO. The team's pattern works end-to-end on real Sepolia — with one real fix needed, not present
in the original guidance: see log.md for the `Nox.allow(payout, address(cToken))` finding.**

---

## Phase 4 — Selective disclosure (the accountability beat) — DONE
- [x] `grantAuditor`: founder grants an auditor a scoped view of the sealed cap table / a batch.
      Added on-chain getters (`getOwners`, `sealedPercentage`) so an explorer/client can fetch the
      handles without needing them out-of-band.
- [x] Show: auditor decrypts; public still cannot; owners still see only their own. Auditor decrypted
      both sealed percentages (6000 / 4000 bps, summing to exactly 10000 = 100%, confirming the
      founder's off-UI sum-to-100% claim after the fact); a fresh ungranted "outsider" wallet was
      denied on both handles; owners' own-only boundary already verified live in Phase 3.
- [ ] Commit: `phase-4: auditor selective disclosure`. (Not committed — commit only on explicit
      request; see log.md.)

**Demoable:** founder grants scoped auditor access; auditor derives the full cap table (and, since
the pooled total is public, every payout); public sees only the total; owners see only their own.
All four visibility tiers (owner / auditor / founder / public) now verified live on Sepolia.

---

## Phase 5 — Frontend, video, deliverables — MOSTLY DONE (2 steps need the human)
- [x] Owner portal: founder sets cap table, owners view own share/payout, auditor view. Single-page
      Next.js app (`app/`), tabbed Founder/Owner/Auditor, wallet connect via browser injected
      provider + viem (no wagmi/RainbowKit needed for one chain), talks to the real deployed
      contracts above.
- [x] Async-aware UX ("computing allocations in the TEE…" intentional, not hanging). `useDecrypt`
      hook polls with backoff and surfaces "computing in the TEE… (attempt n/12)" as an explicit
      state, not a spinner-then-fail.
- [x] README (privacy boundary stated), full docs, functional frontend. Verified: clean
      `tsc --noEmit`, and a clean `next build --webpack` (compiles, typechecks, and statically
      prerenders the page — this actually executes the component tree, catching real render errors).
      **Caveat, stated honestly:** could not click through the app live in a browser — this sandbox
      blocks loopback network access from tool-invoked processes (curl/PowerShell/headless-Chromium
      all timed out reaching the dev server's own port, despite it listening). Recommend running
      `npm run dev` and clicking through yourself before recording the video.
- [x] `feedback.md` in repo root (honest DX notes). Fully written from the real build across all
      phases — no placeholders left.
- [ ] ≤4-min video (DEMO_SCRIPT); tag @iEx_ec on X. **Needs you** — recording/posting isn't something
      I can do. `DEMO_SCRIPT.md` is ready; addresses in it match the real deployed contracts above.
- [ ] Commit: `phase-5: submission-ready`. (Not committed — commit only on explicit request.)

---

## Cut order under time pressure (from the bottom)
1. Keep: Phase 0–3 (sealed cap table + confidential payout, real, on Sepolia, wrapping 0xSplits).
2. Then: Phase 4 auditor disclosure (high-value accountability beat — keep if possible).
3. First to cut: live proportional math (use fallback sealed pre-set allocations), owner-count
   beyond 3, UX polish beyond intentional async states.

Never cut: real 0xSplits wrap + real confidential payout working (the whole thesis), or the
honest privacy boundary (credibility).
