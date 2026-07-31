# SCRIP — Build Log

Append-only. Newest on top. One entry per session: found / built / rule earned.

---

## [WATERFALL SHIPPED — real contract, real deploy, real on-chain proof]
- **Built hardhat/contracts/ScripWaterfall.sol for real** (not the async-callback design in the
  root spec draft — see correction below), modeled directly on the proven ScripDistributor.sol
  pattern. Compiles clean first try against the real `@iexec-nox/nox-protocol-contracts` Nox.sol.
- **CORRECTION to the original ScripWaterfall.sol/PRD draft:** Nox compute is NOT async
  request/callback. Every `Nox.mul/div/add/sub/lt/select` call is a normal, synchronous Solidity
  library call — it returns a sealed handle in the SAME transaction, exactly like the already-proven
  `ScripDistributor.distribute()`. The only genuinely async step anywhere in this system is
  DECRYPTING a handle afterward (the Handle Gateway's ACL index catching up — same retry pattern
  already in `app/lib/useDecrypt.ts`). The draft's `fulfillWaterfall()` callback and `onlyNox` guard
  don't exist and were never needed.
- **The milestone gate uses `Nox.select(ebool, euint256, euint256)`**, confirmed present in Nox.sol
  alongside `lt/le/gt/ge/eq/ne` comparisons — `min(remaining, absCap)` is
  `Nox.select(Nox.lt(remaining, absCap), remaining, absCap)`, and the milestone gate is
  `Nox.select(milestone, take, zero)`. No sealed value ever branches control flow (every tier runs
  the same formula), so which tiers are "active" isn't observable from gas/execution path.
- **Deployed to Sepolia:** `ScripWaterfall` at `0x137077d0c4ef8179b7e405a19ee4e62210e5ae43`; a new
  unmodified 0xSplits Split at `0x75720eBbBe8a92A21D420A4C6d240dC7299100b5` routing 100% to it
  (tx `0x6192c1c214af064b5dad81f1f69cd1c77efe34ca1e6882170c77ee9a6621edc3`), kept separate from the
  original ScripDistributor deployment so the old demo stays intact.
- **THE PROOF, run for real (not simulated):** two waterfalls, IDENTICAL tier structure (investor
  recoups first 0.4 USDC; founder 70% base; investor 15% base; a 15% bonus tier gated on a sealed
  milestone bit, one way for founder, the opposite way for investor) — only the sealed milestone
  bit differs between them. Both funded with 2 USDC through the real Split, both distributed
  on-chain, both decrypted:
  - Cap table 1 (milestone NOT met) — `distribute` tx
    `0x899c5899338810c323337db9a9e2a13c455d2986de491b8cd71d2b6a4db297a5` — decrypted: founder
    1.119999 USDC, investor 0.879998 USDC.
  - Cap table 2 (milestone MET) — `distribute` tx
    `0xe0c77184ee5201aef964f5734518366ee291b9c891ae5bec1ad2fa3fa801cdae` — decrypted: founder
    1.36 USDC, investor 0.64 USDC.
  - Same 2 USDC total, different real decrypted payout, driven by one sealed bit. This is the
    money shot, and it's real, not the hypothetical $3000 example in the original PRD/demo draft
    (those numbers are illustrative of the same mechanic at a different scale; the numbers above
    are what actually happened on Sepolia this session).
- **Frontend rewired end-to-end:** FounderPanel replaced with a waterfall tier builder (ordered
  tiers, each a beneficiary + recoup-cap/split-ratio + milestone gate, all encrypted client-side);
  CapTablesPanel/DistributionsPanel/OwnerPanel/AuditorPanel all switched from ScripDistributor to
  ScripWaterfall; Overview now shows the funded balance and the Split address it came from; the
  distribute button now reads "Evaluating the waterfall in the TEE…"; owner view decrypts the
  waterfall-computed payout via `sealedPayoutOf`, not just the cumulative token balance.
- **Not done, needs the human:** re-recording the demo video for the waterfall pivot (the old video
  script's numbers are superseded above) and the update video note. Everything else in this entry
  is real, verified, and pushed.

## [SEED] Project decided
- **What:** Scrip — confidential revenue-sharing / cap table wrapping unmodified 0xSplits. 0xSplits
  routes revenue + provable total; Nox seals ownership % and payouts; owners decrypt only their own;
  auditor selective disclosure. Dividend core, equity/cap-table vision.
- **Why this shape:** satisfies BOTH brief doors — wraps a real protocol (0xSplits, unmodified) AND
  is innovative (sealing a public equity/split protocol, nobody did it). 0xSplits calls itself "an
  equity instrument," which hands us the cap-table framing.
- **Verified:** ERC-7984 is NOT ERC-20, so a confidential token can't flow through Splits'
  distributeERC20. Design around it: Splits routes the public total to Scrip (as sole recipient);
  Scrip wraps to confidential + pays sealed shares. (ARCH §3-4.)
- **Rules earned:** no FHE (banned); real no-mock on Sepolia; 0xSplits unmodified; async TEE;
  honest privacy boundary; wedge vs Confide (seal ownership vs seal decided payouts).
- **Open risk:** Phase-3 sealed×public payout math on async TEE. Fallback = sealed pre-set allocations.

<!-- New entries ABOVE this line -->

## [iExec team confirmation — composability + async math] 
Source: iExec team reply in support ticket.
- **CONFIRMED — the ERC-7984 ≠ ERC-20 wall:** an unmodified Sablier-style contract CANNOT stream/handle a Nox ERC-7984 token. Two reasons: (1) interface — ERC-7984 has no `transfer(address,uint256)`/`balanceOf()->uint256`; balances are `euint256` handles, transfers via `confidentialTransfer(to, euint256)` / `confidentialTransfer(to, externalEuint256, proof)`; stock ERC-20-ABI contracts won't even compile against it. (2) amounts are encrypted — value math must go through NoxCompute (`Nox.mul`, `Nox.add`, ...) and is ASYNC; you cannot do plaintext `rate*elapsed` math or a `uint256` transfer.
- **VALIDATES Scrip's design:** Scrip never pushes a confidential token through 0xSplits. 0xSplits handles only the PUBLIC total (plain USDC/ERC-20, which it's built for); Scrip does the confidential payout itself via `confidentialTransfer` + NoxCompute. So Reason 1 does not bite us.
- **GREEN-LIT — the disclosure layer:** team confirmed "a recipient can decrypt their own streamed/claimed balance handle via ACL (contract grants allow/addViewer; read via gateway SDK) — that part composes cleanly." → Scrip's owner-decrypts-own-payout + auditor-scoped-view (Phase 4) is validated as clean.
- **RE-FLAGGED — async:** payout math (`sealedPct * publicTotal / 10_000`) is async NoxCompute. This is exactly why Phase 3 is the go/no-go and the fallback (sealed pre-set allocations) exists. Unchanged; now confirmed by the team.
- **OPEN (asked as follow-up):** does NoxCompute support encrypted-handle × plaintext-constant and encrypted-handle ÷ plaintext-constant directly (vs. both operands encrypted)? And how many async ops chain practically per distribution (~10–20 recipients)? → determines clean proportional path vs. fallback.

<!-- New entries ABOVE the seed, below this line as they come -->

## [iExec team — payout math CONFIRMED, clean path locked]
Source: iExec team reply.
- **CLEAN PATH WORKS — no fallback needed.** mul/div take TWO encrypted handles (no scalar variant).
  Wrap plaintext constants into public handles ONCE via `Nox.toEuint256(...)` (deterministic, no
  proof/ACL — constant isn't secret), reuse for every recipient (runner caches within the tx → free).
- **Confirmed pattern:** `payout_i = Nox.div(Nox.mul(sealedPct_i, encTotal), enc10000)`. Same shape
  the reference **ConfidentialAuction** uses for fees: `Nox.div(Nox.mul(bid, feeRate), Nox.toEuint256(100))`.
  → Model against ConfidentialAuction.
- **Rule: MUL BEFORE DIV.** Division floors (integer); dividing first floors pct/10_000 to 0.
- **Scale confirmed:** ~10-20 recipients per distribution fine. No protocol cap on chained ops;
  limits are per-tx gas + resolution time, comfortable here. ~2 arith ops + confidentialTransfer per
  recipient, bundled into one runner job. If gas tight at the high end, batch ~10 recipients per tx.
- **CRITICAL privacy rule:** publicTotal is public, so anyone who can decrypt payout_i can back out
  sealedPct_i = payout_i * 10_000 / publicTotal. → grant each RECIPIENT viewer access to ONLY their
  own payout, never the batch. (Auditor MAY see the batch — intended; they can derive the cap table,
  which is the point of an audit.)
- **Contract updated:** distribute() now uses the confirmed pattern (cached constant handles,
  mul-before-div, own-payout-only ACL); lockPercentages() uses Nox.toEuint256 for the constant.
- **STATUS: all Phase-3 unknowns closed. Clean proportional path is the build. Fallback retired.**

## [Phase 0 — sealed value round-trips through Nox on Sepolia] PASS
- **Built:** `hardhat/` — Hardhat 3 project (`@iexec-nox/nox-hardhat-plugin`, `@iexec-nox/nox-protocol-contracts`,
  `@iexec-nox/handle`). `ConfidentialPiggyBank.sol` (the docs Hello World contract, verbatim) deployed
  to Sepolia at `0x585410f18f11fddbf8603fc4a972df087a48ca99`. `scripts/roundtrip.ts` encrypts 42 via
  `handleClient.encryptInput`, calls `deposit(handle, proof)`, TEE computes `Nox.add`, ACL-grants the
  owner, then `handleClient.decrypt(balanceHandle)` returns `42n`. Round-trip confirmed correct.
- **Real tx:** `0xd5694cefab9e1e8b494ce0e7b21c624d6d0d00938d6eba0ecf7f8419ee551734` on Sepolia, block
  11361050. Deployer/owner `0x5bd8e236b39C4Fb48F4eA534584f2858c2B923E3`.
- **VERIFY resolved:** Nox library import path is `@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol`
  (confirmed working). Nox contracts require **solc ^0.8.35** minimum (not ^0.8.27 as the
  ScripDistributor.sol spec assumed) — bump the pragma when Phase 2/3 build on that spec file.
- **Async lag is real, and matters for UX (confirms standing rule #2):** the very first decrypt attempt
  immediately after the deposit tx was mined failed with `403 access_denied: not a viewer`, even though
  the tx succeeded and the contract had already called `Nox.allow`. Retrying ~2 minutes later succeeded
  first try; a second full run (fresh contract) succeeded on attempt 1 (no retry needed). Read: ACL/handle
  indexing lags tx confirmation by a variable, sub-few-minutes window — build the "computing in the TEE"
  UI state around polling decrypt with backoff, not a single attempt right after the tx receipt.
  `roundtrip.ts` now retries decrypt every 5s up to 12 attempts.
- **Verdict: the async pipe is RELIABLE.** Both runs eventually returned the exact correct sealed value
  (42). Proceed to Phase 1.
- **Environment note (not a Nox issue):** this machine's default pnpm registry was pointed at a mirror
  that couldn't serve the `@nomicfoundation/edr` native binaries reliably; switching to `npm install`
  against `registry.npmjs.org` with a per-project `.npmrc` fixed it. Unrelated to Nox.

## [Process correction] Stop committing without being asked
- **What happened:** I committed Phase 0 unprompted, citing AGENTS.md's "commit after every phase" as
  standing authorization, and included the default `Co-Authored-By: Claude <...>` trailer. User was
  upset on both counts and had me `git reset --soft HEAD~1` to undo it (safe — nothing was ever
  pushed; no remote is configured on this repo).
- **Rule going forward:** do NOT commit unless explicitly asked in the moment, regardless of what
  AGENTS.md says about committing after every phase. If/when a commit is requested, leave off the
  Claude co-authorship trailer for this repo.

## [Phase 1 — real USDC wraps to confidential token] PASS
- **Built:** `hardhat/contracts/ConfidentialUSDC.sol`, a thin wrapper around Nox's own
  `ERC20ToERC7984Wrapper` (from `@iexec-nox/nox-confidential-contracts`), constructed over the real
  Circle USDC on Sepolia (`0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`, verified: symbol `USDC`,
  6 decimals). Deployed to `0x081000dc72d13e472671f9a641c261cbb1a39101`.
- **VERIFY resolved — important correction to ARCHITECTURE.md/ScripDistributor.sol:** the spec assumed
  `@openzeppelin/contracts confidential-contracts` and a contract named `ERC7984ERC20Wrapper`. That
  OZ package is **Zama FHEVM-based** (`euint64`, FHE) — explicitly the banned tech. The correct,
  Nox-native (TEE-based) implementation lives in **`@iexec-nox/nox-confidential-contracts`**, and the
  wrapper class is named **`ERC20ToERC7984Wrapper`** (args reversed from what the name suggests: ERC20
  is the input, ERC7984 the output). It depends on `@openzeppelin/contracts` (plain, non-confidential)
  only for `IERC20`/`SafeERC20`/`IERC1363Receiver` plumbing — that part is fine and unrelated to FHE.
  Uses `euint256` (arbitrary ERC-20 decimals, 1:1 conversion), not OZ's `euint64`-with-rate scheme.
  ScripDistributor.sol's `// VERIFY` comments about `ERC7984ERC20Wrapper`/`wrap()` should be updated to
  this package + contract name before Phase 2/3 build on it.
- **Real tx:** approve `0xe74207fb...`, wrap `0x762877be5ed2719360a82ab3c74b246cdd0e81289a433ad21ebcbab019cecf6b`
  on Sepolia. Wrapped 5 USDC (5,000,000 base units); decrypted confidential balance matched exactly,
  **first decrypt attempt succeeded** (no retry needed this time — consistent with Phase 0's read that
  the lag is variable, not fixed).
- **`wrap(to, amount)` takes a plaintext `uint256` amount** (not encrypted) — correct and expected: the
  ERC-20 leg of the transfer is inherently public (visible on the USDC Transfer log); only the
  resulting ERC-7984 balance representation is sealed. This matches Scrip's design (Splits' public
  total → Scrip wraps it → confidential balance).
- **Verdict: PROCEED to Phase 2** (wrap 0xSplits, sealed cap table).

## [Phase 2 — 0xSplits routes to Scrip, sealed cap table set] PASS
- **Built:** `hardhat/contracts/ScripDistributor.sol` is now a real, compiling contract (not just the
  annotated spec) — `createCapTable`/`lockPercentages`/`poolRevenue`/`distribute`/`grantAuditor` all
  use the confirmed real Nox types (`euint256`/`externalEuint256`) and the confirmed
  `@iexec-nox/nox-confidential-contracts` wrapper interface. Deployed to
  `0x088a574703a96a9652aac15666779000daee539b` (constructor takes real USDC + `ConfidentialUSDC`).
  The original annotated spec at the repo root (`ScripDistributor.sol`) is kept as historical
  reference; the hardhat one is what's actually live.
- **Real, unmodified 0xSplits v2 Push Split** at `0x1acd6c19e294b5f8e942428734345aa50ee87749`, created
  via the deterministic factory `PushSplitFactory` v2.2 (`0x8E8eB0cC6AE34A38B67D5Cf91ACa38f60bc3Ecf4`
  — same address on every chain 0xSplits v2 supports, incl. Sepolia; sourced from `@0xsplits/splits-sdk`'s
  own constants since `docs.splits.org` has since been redirected to a different, unrelated product
  and no longer documents the protocol — see feedback.md). Single recipient = `ScripDistributor`,
  100% allocation (`recipients=[ScripDistributor], allocations=[1], totalAllocation=1`).
- **Sealed cap table set:** two owners, 60%/40%, each percentage encrypted client-side
  (`handleClient.encryptInput(bps, 'uint256', ScripDistributor)`) and passed through
  `createCapTable` → `Nox.fromExternal` → stored as `euint256`. `lockPercentages` locked. Explorer
  shows sealed handles for the percentages, not numbers.
- **Real revenue routing, real tx chain:** sent 3 USDC to the Split, called the Split's own
  (unmodified) `distribute(...)`, `ScripDistributor` ended up holding 2999999 units (not 3000000) —
  **this is 0xSplits' own well-documented 1-unit gas-optimization dust** (SplitMain/SplitV2 leaves a
  tiny non-zero balance after distributing so the next distribution's SSTORE isn't a cold
  zero→nonzero write). Confirmed via 0xSplits' own `SplitMain.sol` source — not a Scrip bug, not
  something we can or should "fix" since 0xSplits is unmodified by design. `poolRevenue()` correctly
  reads and emits the real, exact total Scrip received (2999999) — that IS the honest provable total.
- **VERIFY resolved:** `lockPercentages`'s sum==100% guard took the already-approved fallback —
  trust-the-founder / enforce-at-setup-UI, no strict on-chain comparison (avoids a leaking revert or
  a mid-tx decrypt round-trip). The sealed sum is still computed and viewer-granted to the founder
  alone for their own off-chain audit, so nothing is silently unenforced, just not blocking on-chain.
- **Nox.mul/div do not implicitly grant caller access to the result handle** — confirmed by reading
  Nox.sol's own source (`mul`/`div` just wrap the compute-contract call, no `allow`/`allowThis`
  inside). `ERC7984Base` always pairs its own `Nox.mint`/`transfer`/`burn` calls with an explicit
  `Nox.allowThis(...)` afterward — same pattern now applied in `distribute()` before
  `confidentialTransfer`, otherwise Phase 3's payout would revert on `Nox.isAllowed` inside
  `confidentialTransfer`. Not yet exercised live (that's Phase 3), but the pattern is now consistent
  with every other confirmed real usage in this codebase.
- **Verdict: PROCEED to Phase 3** (confidential proportional payouts — the actual GO/NO-GO for the
  sealed×public payout math, now that everything upstream of it is real and verified).

## [Phase 3 — confidential proportional payouts] GO — real bug found and fixed
- **First real attempt reverted** with an undecodable custom error `0xb87a12a9(bytes32, address)`.
  Manually decoded the raw revert data (no ABI for it — the error lives on the deployed NoxCompute
  system contract, not in any published source): args were a payout handle and **`ConfidentialUSDC`'s
  own address** (not ScripDistributor's). That address is the tell: it means the unauthorized caller
  the compute contract rejected was `ConfidentialUSDC` itself, not our contract.
- **Root cause:** `confidentialTransfer(owner, payout)` internally has `ConfidentialUSDC` call
  `Nox.transfer(fromBalance, toBalance, amount)` **as its own `msg.sender`** to NoxCompute (this
  happens inside `ERC7984Base._updateWithOptimizedPrimitives`, which runs in `ConfidentialUSDC`'s own
  contract context). `Nox.transfer`'s `amount` operand was our computed `payout` handle. We had
  granted `ScripDistributor` access (`Nox.allowThis`) and the owner viewer/decrypt access
  (`Nox.addViewer`) — but never granted **`ConfidentialUSDC` itself** compute-use access to `payout`.
  Fix: `Nox.allow(payout, address(cToken))` before calling `confidentialTransfer`.
- **The general rule this reveals (not documented anywhere we found):** when contract A computes a
  handle and hands it to contract B to use as an operand in a further Nox compute call (not just to
  decrypt/view), **B itself needs an explicit `allow` on that handle** — same as how `ERC7984Base`
  always `allowThis`s its own results, generalized to cross-contract handoffs. `allowThis` only
  covers the computing contract itself; `addViewer` only covers decrypt, not further compute. Filed
  under feedback.md as a real DX trap (silent-ish, undecodable custom error, easy to lose an hour on).
- **Redeployed clean** after the fix: new `ScripDistributor` (`0x77ff5132ae57ff1e3154b9e9d7fb81c0f6bd496d`),
  new 0xSplits Split (`0x698Ae81bA80354bA4F7e9a3C4f15c41969560E12`, since the old Split's recipient was
  immutably the old, broken ScripDistributor address), cap table re-locked (60%/40%, sealed), 3 USDC
  routed through the Split (2999999 pooled, same expected 0xSplits dust).
- **`distribute()` succeeded**, tx `0x10cb8f46936af7a101d18a5a1dbb200292d2fb773c708d087926e964b254e2be`,
  765376 gas for 2 recipients (2 mul/div/allow/addViewer/confidentialTransfer chains + 1 wrap).
- **Payout math verified correct:** 60% owner should get `floor(2999999 * 6000 / 10000)` = 1799999;
  40% owner should get `floor(2999999 * 4000 / 10000)` = 1199999. Owner B (fresh wallet, no prior
  balance) decrypted exactly `1199999n`. Owner A reused the deployer wallet from the Phase 1 wrap
  test (already held 5000000 cUSDC) and decrypted `6799999n` = `5000000 + 1799999` — exactly matches
  once you account for the pre-existing balance. **Both floor-correct, both exact.**
  `1799999 + 1199999 = 2999998`, 1 unit short of `2999999` pooled — expected floor-rounding dust, held
  (sealed) in `ScripDistributor`'s own cUSDC balance, not lost.
- **Confidentiality boundary verified live, both directions:** Owner B tried to decrypt Owner A's
  balance handle → denied ("not authorized to decrypt it", no leak of amount or reason). Owner A tried
  Owner B's → same. Each owner successfully decrypted only their own, first attempt, no retry needed.
- **Verdict: Phase 3 is a GO**, fully verified real on Sepolia. Same async-lag caveat as Phase 0/1
  applies (build UX with a poll/backoff, not a single decrypt attempt) but no reliability issue found
  across this session's several live runs.

## [Phase 4 — auditor selective disclosure] PASS
- **Added two on-chain getters** to `ScripDistributor.sol` — `getOwners(id)` and
  `sealedPercentage(id, index)` — neither existed before; `capTables` is a private mapping and the
  handles weren't emitted anywhere, so there was no way for a client/explorer to fetch a sealed %
  handle without already knowing it out-of-band. Handles are just public pointers (safe to expose;
  only the underlying value is protected), so this is a pure read-only addition. Redeployed once more
  for this (`ScripDistributor` now at `0x3b323cee5cc1dc3fead35c74b45062aa43f45ede`, Split at
  `0x7eD52bCCa0C0d6f7F86c73CB5A4106e33764557f`) and re-ran the full Phase 2/3 chain clean on it —
  same results as before (2999999 pooled, `distribute()` succeeded, 750840 gas).
- **`grantAuditor(id, auditor)` worked exactly as written, no surprises:** loops `Nox.addViewer` over
  every owner's sealed percentage handle for the given auditor address. Real tx, succeeded.
- **Auditor decrypted the full cap table:** 6000 and 4000 (bps) for the two owners — sums to exactly
  10000 (100%), which is itself a nice side-effect: the auditor grant is a genuine, real check on the
  founder's sum-to-100% claim (recall Phase 2 chose to enforce that at the UI, not on-chain — the
  auditor path is the actual after-the-fact verification mechanism for that trust).
- **A fresh, never-granted "outsider" wallet was denied on both handles**, same clean no-leak error as
  Phase 3's cross-owner test. Combined with Phase 3 (owners see only their own) and the public-total
  being provable on-chain, all three tiers of the privacy boundary (owner / auditor / public) are now
  verified live, not just designed.
- **Verdict: Phase 4 PASS.** Core confidential mechanics (Phases 0–4) are now fully real and verified
  end-to-end on Sepolia. Remaining: Phase 5 (frontend, video, submission polish).

## [Phase 5 — frontend, docs, deliverables] mostly done
- **Built the owner portal:** single-page Next.js app under `app/`, three tabs (Founder / Owner /
  Auditor), wallet connect via a plain browser-injected-provider + viem client (skipped
  wagmi/RainbowKit — one chain, one connect flow, not worth the dependency weight). Talks directly to
  the real deployed contracts (addresses in `app/lib/contracts.ts`, matching
  `hardhat/deployed.sepolia.json`). Founder can pool+distribute, grant an auditor, or spin up a brand
  new sealed cap table (percentages encrypted client-side via `handleClient.encryptInput` before
  anything touches the chain). Owner/Auditor tabs decrypt via a shared `useDecrypt` hook that polls
  with backoff and surfaces "computing in the TEE… (attempt n/12)" as an intentional state — the
  async-lag finding from Phase 0 baked directly into the UX, per the standing rule.
- **Added two on-chain getters mid-Phase-4** (`getOwners`, `sealedPercentage`) so the frontend
  (or any explorer/client) can discover sealed handles without needing them out-of-band — required
  one more `ScripDistributor`/Split/cap-table redeploy cycle, already covered in the Phase 4 entry.
- **Fixed a standing-rule violation:** root `package.json`'s `dev`/`build` scripts were plain
  `next dev`/`next build`, which Next 16 defaults to Turbopack — violates "Next.js --webpack, never
  Turbopack." Added `--webpack` to both.
- **Real bug caught by `next build` that `next dev`/`tsc` both missed:** `@iexec-nox/handle`'s barrel
  `index.js` unconditionally re-exports the ethers-based factory alongside the viem one, which
  statically imports `ethers`. This app only uses viem and never installed `ethers` — `next dev`
  doesn't bundle for production so it never surfaced there, and `tsc --noEmit` doesn't do module
  resolution the same way webpack does, so it passed too. Only `next build --webpack`'s actual
  production bundling caught `Module not found: Can't resolve 'ethers'`. Fixed by installing `ethers`
  (unused, just satisfies the resolver). **Lesson reinforced: `next build` is a real, distinct
  verification step from typecheck + dev-server-boots — don't skip it.**
- **Verification performed:** clean `tsc --noEmit` (after fixing a `target: ES2017` vs. BigInt-literal
  incompatibility and excluding `hardhat/` — a separate project with its own tsconfig — from the
  root's typecheck scope), and a clean `next build --webpack` (compiles, typechecks, and statically
  prerenders the page — Next actually executes the component tree server-side to generate the initial
  HTML, which exercises real render logic, not just syntax).
- **Verification NOT performed, stated honestly:** could not click through the running app in an
  actual browser. Tried headless Chromium via `playwright-core` against the installed system Edge
  (avoided downloading a ~150MB browser binary given this session's earlier slow-network pain with
  large binaries), and separately tried plain `curl`/PowerShell `Invoke-WebRequest` against the dev
  server's own port — all three timed out, even though `netstat` confirmed the dev server was
  genuinely `LISTENING` on the port. This looks like the sandbox deliberately blocks loopback network
  access from tool-invoked processes (a plausible SSRF-prevention boundary), not a bug in the app —
  external HTTPS requests (npm registry, docs sites, Sepolia RPC, Etherscan) all worked fine
  throughout this session, only `localhost`/`127.0.0.1` connections hung. Recommend the user run
  `npm run dev` and click through themselves before recording the demo video.
- **Rewrote README.md:** fixed stale `docs/*.md` links (files are actually at repo root, not under a
  `docs/` folder that never existed), corrected the ERC-7984 provenance claim (Nox's own TEE
  implementation, not OpenZeppelin's FHE-based package — same correction as the Phase 1 finding),
  added the real deployed Sepolia addresses, and rewrote "Run it" to match the actual repo structure
  (root Next app + `hardhat/` scripts, not the placeholder instructions from the original scaffold).
- **`feedback.md` finalized:** filled in every remaining placeholder section with real findings from
  the actual build (JS SDK DX, Solidity library DX, Hardhat/Sepolia setup, ACL-across-transactions,
  compute reliability/latency numbers) — nothing marked `[fill in]` remains.
- **Not done, needs the human:** the ≤4-min demo video and the @iEx_ec X post — outside what an agent
  can do (screen recording, posting to social media as the user). `DEMO_SCRIPT.md` is ready and its
  addresses match what's actually deployed.
- **Verdict: Phase 5 is essentially done.** Every phase's core mechanics (0-4) are real and verified
  on Sepolia; the frontend is real, builds clean, and is wired to the real contracts. Only the video
  and the social post remain, and neither is committable work.
