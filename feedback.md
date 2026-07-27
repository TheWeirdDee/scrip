# iExec Nox Integration Feedback — Scrip

> Required deliverable. Fill in HONESTLY from the actual build — real friction is more useful (and
> scores better) than praise. Update as you go.

## What we built
Scrip: a confidential revenue-sharing / cap-table layer wrapping an unmodified 0xSplits Split.
0xSplits routes revenue and provides a public provable total; Nox seals ownership percentages and
pays each owner a confidential ERC-7984 amount computed in the TEE; owners decrypt only their own;
auditors can be granted scoped disclosure. Deployed on ETH Sepolia.

## Developer experience
- **JS SDK (encryptInput / decrypt / ACL):** the two-call surface (`encryptInput` → handle+proof,
  `decrypt` → value) is genuinely simple and the handle model never leaked implementation detail we
  had to work around. The one real gap: decrypt failures are a single generic-looking error string
  ("not authorized to decrypt it" / "does not exist") that's used both for genuine access denial and
  for "ACL hasn't propagated yet" — see the async-lag point below, this ambiguity is the main thing
  that made building correct retry UX harder than it needed to be.
- **Solidity library (add / mul / div / comparisons / select):** did exactly what the docs said —
  sealed×public multiply and divide-by-public-constant (via `Nox.toEuint256` on the constant) worked
  first try, floor-correct, for real proportional payouts. The one real trap was ACL, not arithmetic
  — see the cross-contract `allow` finding below, which cost far more time than the math itself.
- **Hardhat starter + Sepolia deploy:** no NoxCompute address wiring needed at all for Sepolia — the
  JS SDK auto-detects it by chain ID (confirmed: Sepolia is a default-supported chain, no
  `smartContractAddress`/`gatewayUrl` config required). Actual friction was unrelated to Nox: this
  machine's pnpm was pointed at a slow/unreliable mirror for `@nomicfoundation/edr`'s native
  binaries — switched to `npm install` against `registry.npmjs.org`, unrelated to the Nox plugin
  itself. `nox-hardhat-plugin` compiled and deployed to a live testnet with zero plugin-specific
  friction beyond that.

## Friction points & suggestions (be specific)
- **Async compute lifecycle:** confirmed real in Phase 0. Calling `deposit()` (which does `Nox.add`
  then `Nox.allow`) and getting a `success` tx receipt does NOT mean the resulting handle is
  immediately decryptable — the first `handleClient.decrypt()` call right after the receipt returned
  `403 access_denied: not a viewer` even though the ACL grant is in the same transaction. A retry a
  couple minutes later succeeded; a second, later run succeeded on the very first attempt with no
  retry needed. So the lag is real but variable (looks like ACL/handle-gateway indexing catching up
  to the chain, not a fixed delay). **Suggestion:** document the expected p50/p99 lag between tx
  finality and decrypt-availability, and consider having the Handle Gateway return a distinguishable
  "not indexed yet" status instead of a bare 403 access_denied, so client code can tell "still
  propagating" apart from "actually not authorized."
- **Solc version requirement not surfaced early:** `Nox.sol` pragmas `^0.8.35`, but the Hello World
  doc snippet uses `pragma solidity ^0.8.27;` verbatim — pinning to 0.8.27 fails to compile against
  the library with a fairly generic Hardhat error (HHE909) that doesn't name the actual pragma
  mismatch clearly. Fixed by bumping to `^0.8.35`. Suggestion: fix the doc snippet, or have Nox.sol's
  pragma error surface more directly.
- **ERC-7984 ↔ existing ERC-20 protocols:** the ERC-7984-is-not-ERC-20 wall meant we couldn't route a
  confidential token through 0xSplits directly — had to make Scrip the Split's sole recipient of the
  *public* total, then wrap+pay confidential from inside Scrip. This composed cleanly in practice
  (0xSplits needed zero changes, zero awareness that a confidential layer exists downstream — see
  "what worked well" below) but it's a pattern every "wrap protocol X with a confidential token"
  project will independently rediscover. A documented recipe ("confidential token behind a public
  ERC-20-only protocol: make your contract the sole recipient, wrap after receipt") would save that
  rediscovery cost.
- **Naming collision with OpenZeppelin's Zama-based package is a real trap:** Nox's docs describe the
  confidential token as "ERC-7984 (OpenZeppelin-compliant)," and the general architecture pattern
  (`wrap()`, `ERC20...Wrapper`, `IERC7984`) reads almost identically to OpenZeppelin's own
  `@openzeppelin/confidential-contracts` package — except that package is Zama FHEVM-based, which this
  hackathon explicitly bans. It's easy to `npm install @openzeppelin/confidential-contracts` by
  reflex and end up with banned FHE code that even compiles fine on its own. The correct package is
  `@iexec-nox/nox-confidential-contracts`, and the wrapper class is named `ERC20ToERC7984Wrapper`
  (OZ's is `ERC7984ERC20Wrapper` — order swapped). **Suggestion:** a one-line callout in the Nox docs
  ("this is NOT `@openzeppelin/confidential-contracts`") would save real time/risk for exactly the
  hackathon's banned-tech rule.
- **ACL across transactions / auditor grants:** worked with zero friction (see "what worked well"),
  but worth flagging: `grantAuditor` only granted access to the sealed *percentages*, not the payout
  amounts — which is fine here because the pooled total is public, so an auditor can derive every
  payout themselves once they know the percentages. That derivation is implicit, not something the
  SDK/library helps compute — for a project where the total ISN'T public, "grant an auditor the
  percentages" wouldn't be enough on its own, and there's no built-in "grant access to a whole
  category of related handles" primitive; you loop `addViewer` per-handle by hand, which is fine at
  our scale (a handful of owners) but would want batching guidance at real cap-table sizes.
- **Confirmed live in Phase 3, and this was the single biggest friction point of the whole build:
  cross-contract handle handoff requires an explicit `allow` on the RECEIVING contract, and the
  failure mode is close to undebuggable.** Pattern: contract A (`ScripDistributor`) computes a handle
  via `Nox.mul`/`Nox.div` and passes it to contract B (`ConfidentialUSDC.confidentialTransfer`) to use
  in a further compute op. B internally calls `Nox.transfer(..., amount)` **as its own msg.sender** to
  the NoxCompute contract — so B itself needs `Nox.allow(handle, address(B))`, separate from and in
  addition to A's own `Nox.allowThis`. Granting the owner `addViewer` (decrypt rights) doesn't help
  either — that's a different permission (view/decrypt) from compute-use. Missing this reverted with
  a **raw, undecodable custom error** (`0xb87a12a9(bytes32,address)` — no matching entry in any ABI we
  had, including `Nox.sol`, `ERC7984Base`, or the wrapper; had to manually decode the raw revert bytes
  and infer the cause from which contract address appeared in the args). **Suggestions:** (1) document
  "who needs `allow` on a handle" as an explicit decision table — computing contract via `allowThis`,
  any other contract that will use it as an operand in ITS OWN compute call via `allow`, any account
  that should merely decrypt it via `addViewer` — because these three are easy to conflate; (2) surface
  NoxCompute's own custom errors' ABI/selectors somewhere (a reference page, or as part of the SDK
  package) so revert reasons are decodable instead of raw bytes.
- **Compute reliability/latency (sealed×public mul/div chains):** across every run this session
  (Phases 0, 1, 3, 4 — a dozen-plus real Sepolia transactions doing encrypt→compute→decrypt or
  encrypt→compute→transfer→decrypt), the compute itself (the mul/div/transfer/mint chain executing
  and producing a correct result) was 100% reliable — every value we could eventually decrypt was
  exactly the correct floor-safe answer, no exceptions. The only unreliability was the ACL/decrypt
  *availability* lag described above (0 to ~2 minutes after tx finality), never the computation
  correctness itself. `distribute()` for 2 recipients (wrap + 2×(mul, div, allow×2, addViewer,
  confidentialTransfer)) cost ~750-765k gas.

- **`@iexec-nox/handle`'s barrel export breaks bundling for viem-only consumers:** the package's
  `index.js` unconditionally re-exports `createEthersHandleClient` alongside `createViemHandleClient`,
  which statically imports `ethers`. A Next.js app that only uses the viem factory and never installs
  `ethers` fails to build (`Module not found: Can't resolve 'ethers'`) — `next dev` doesn't catch this
  (only `next build`'s webpack production bundling does), so it's easy to ship broken and not notice
  in local dev. Worked around by installing `ethers` as an unused dependency just to satisfy the
  resolver. **Suggestion:** split the ethers/viem factories into separate entry points (or make
  `ethers` a peerDependency with the import behind a dynamic/conditional import) so consumers of one
  don't need to install the other's SDK.

## What worked well
- **The Solidity library ergonomics are genuinely simple:** `Nox.toEuint256`, `Nox.fromExternal`,
  `Nox.add`, `Nox.allowThis`, `Nox.allow` read like plain Solidity — no FHE-style ceremony. The Hello
  World contract compiled and worked essentially as documented (once the solc version was corrected).
- **JS SDK is a clean two-call surface:** `encryptInput(value, type, contractAddress)` →
  `{handle, handleProof}`, and `decrypt(handle)` → `{value, solidityType}`. No manual key/ciphertext
  management on the client side.
- **The real ERC20→ERC7984 wrapper (Phase 1) worked exactly as designed, first try:** wrapped 5 real
  Sepolia USDC 1:1 into `ConfidentialUSDC` (`wrap(to, amount)`, plaintext amount — correct, since the
  ERC-20 leg is inherently public), and the recipient's decrypted confidential balance matched exactly
  (`5000000n`). Nice touch: `wrap()` uses `euint256` and true 1:1 conversion rather than OZ's
  `euint64`-with-compression-rate scheme, so no precision-loss bookkeeping for 6-decimal USDC.
- **Composability with an unmodified third-party protocol (0xSplits) worked exactly as designed:**
  routing a real 0xSplits v2 Push Split's public output into a Nox-sealed contract required zero
  changes to 0xSplits and zero special-casing on the Nox side — `ScripDistributor` is just a normal
  ERC-20 recipient as far as 0xSplits is concerned. The confidential layer only starts once funds are
  inside Scrip's own contract. This is a good sign for the "wrap a real protocol" pattern generally.
- **The payout math itself (`Nox.div(Nox.mul(sealedPct, encTotal), enc10000)`) worked exactly as the
  iExec team described, first try, once the ACL issue above was fixed:** floor-correct proportional
  splits (60%/40% of an odd, non-round pooled total), verified against hand-computed expected values.
  Real, chained sealed×public arithmetic across 2 recipients in one tx, 765k gas.
- **The confidentiality boundary denial is clean and doesn't leak anything on failure:** a wrong-owner
  decrypt attempt gets "not authorized to decrypt it" — no hint of the amount, no distinguishable
  error for "wrong owner" vs "handle doesn't exist," which is exactly the no-leak-on-error behavior
  you'd want for a payout system.
- **Selective disclosure (`addViewer`) mapped onto the auditor use case with zero friction:** looping
  `Nox.addViewer(handle, auditor)` over a batch of handles just worked, first try, no surprises unlike
  the cross-contract `allow` issue above. The distinction between `addViewer` (decrypt-only, what an
  auditor needs) and `allow` (compute-use, what a contract needs to operate on a handle further) is
  the right one — once you know it exists (see the friction point above about that not being obvious
  going in).
