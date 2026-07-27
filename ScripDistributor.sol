// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35; // Nox.sol requires solc >=0.8.35 (confirmed Phase 0)

/**
 * ScripDistributor — confidential allocation + payout layer wrapping 0xSplits.
 *
 * ORIGINAL ANNOTATED SPEC. As of Phase 2, all `// VERIFY` marks below are resolved (see log.md) and
 * the real, compiling, deployed implementation lives at hardhat/contracts/ScripDistributor.sol —
 * that file is the one actually built and deployed to Sepolia. This file is kept as the annotated
 * historical spec/reference.
 * NO FHE anywhere (banned by the hackathon) — Nox TEE primitives only.
 *
 * Role: this contract is a RECIPIENT of a 0xSplits Split (Split routes 100% of pooled revenue
 * here, unmodified). Scrip then wraps the received USDC into a confidential ERC-7984 token and
 * distributes sealed per-owner amounts computed from sealed ownership percentages.
 */

import {Nox, euint256, externalEuint256} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol"; // CONFIRMED Phase 0
import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC7984} from "@iexec-nox/nox-confidential-contracts/contracts/interfaces/IERC7984.sol"; // CONFIRMED Phase 1
// NOT @openzeppelin/confidential-contracts — that package is Zama FHEVM-based (banned). Nox's own
// ERC-7984 implementation (TEE-based) lives in @iexec-nox/nox-confidential-contracts.
//
// CONFIRMED Phase 1: the wrapper is `ERC20ToERC7984Wrapper` (not `ERC7984ERC20Wrapper`), at
// "@iexec-nox/nox-confidential-contracts/contracts/token/extensions/ERC20ToERC7984Wrapper.sol".
// Constructor: (string name, string symbol, string contractURI, IERC20 underlying).
// wrap(address to, uint256 amount) -> euint256: plaintext amount (the ERC-20 leg is public by
// nature), pulls via safeTransferFrom (caller must approve first), mints 1:1 as euint256, ACL-grants
// `to`. No ACL.sol module exists in Nox — access control is Nox.allow/allowThis/addViewer directly
// on the Nox library (see ACL calls below), there is no separate ACL contract to import.

contract ScripDistributor {
    using SafeERC20 for IERC20;

    // ---- types ----
    struct CapTable {
        address founder;
        address[] owners;              // recipient addresses (PUBLIC — only amounts are sealed)
        mapping(uint256 => bytes32) sealedPct; // owner index => sealed ownership % (bps) handle
        uint256 ownerCount;
        bool locked;                   // percentages finalized
    }

    IERC20 public usdc;                 // real Sepolia USDC (in)
    IERC7984 public cToken;             // confidential ERC-7984 token (out)
    address public splitAddress;        // the 0xSplits Split routing revenue here (unmodified)

    mapping(uint256 => CapTable) private capTables;
    uint256 public capTableCount;

    event CapTableCreated(uint256 indexed id, address indexed founder, address[] owners);
    event PercentagesLocked(uint256 indexed id);
    event RevenuePooled(uint256 indexed id, uint256 publicTotal);
    event DistributionTriggered(uint256 indexed id, uint256 publicTotal);
    event AuditorGranted(uint256 indexed id, address auditor);

    // ---- 1. create the (sealed) cap table ----
    // Owner addresses are public; each owner's PERCENTAGE is a sealed handle (euint bps).
    function createCapTable(address[] calldata owners, bytes32[] calldata sealedPctHandles)
        external returns (uint256 id)
    {
        require(owners.length == sealedPctHandles.length, "len");
        id = ++capTableCount;
        CapTable storage c = capTables[id];
        c.founder = msg.sender;
        c.ownerCount = owners.length;
        for (uint256 i = 0; i < owners.length; i++) {
            c.owners.push(owners[i]);
            // VERIFY: validate handle proof (Nox.fromExternal) + persist ACL for this contract
            c.sealedPct[i] = sealedPctHandles[i];
            Nox.allow(sealedPctHandles[i], address(this)); // CONFIRMED Nox.allow signature; still VERIFY the fromExternal/proof flow for this handle type in Phase 2
        }
        emit CapTableCreated(id, msg.sender, owners);
    }

    // ---- 2. lock: enforce sealed percentages sum to 100% (10_000 bps) ----
    function lockPercentages(uint256 id) external {
        CapTable storage c = capTables[id];
        require(msg.sender == c.founder, "founder");
        // Sum sealed percentages and compare to public 10_000. Constants must be wrapped into
        // public handles via Nox.toEuint256 (mul/div/compare take two encrypted handles).
        bytes32 sum = c.sealedPct[0];
        for (uint256 i = 1; i < c.ownerCount; i++) {
            sum = Nox.add(sum, c.sealedPct[i]);               // VERIFY add sig
        }
        // bytes32 enc10000 = Nox.toEuint256(10_000);
        // ebool ok = Nox.eq(sum, enc10000);                  // VERIFY eq returns ebool
        // Enforce via a NON-LEAKING pattern (do NOT revert in a way that reveals the sealed sum).
        // VERIFY the recommended guard with the team if strict on-chain enforcement is needed.
        c.locked = true;
        emit PercentagesLocked(id);
    }

    // ---- 3. pool revenue: called after the 0xSplits Split routes USDC here ----
    // The Split (unmodified) distributes its balance to this contract as the sole recipient.
    // Public total is visible here (that's the provable-total trust anchor).
    function poolRevenue(uint256 id) external returns (uint256 publicTotal) {
        publicTotal = usdc.balanceOf(address(this)); // pooled, public
        emit RevenuePooled(id, publicTotal);
    }

    // ---- 4. distribute: pay each owner a sealed amount from their sealed % (ASYNC) ----
    //
    // CLEAN PATH CONFIRMED WORKING by iExec team. No fallback needed.
    // NoxCompute mul/div take TWO encrypted handles (no scalar/plaintext variant), so wrap the
    // public constants into public handles ONCE with Nox.toEuint256 (deterministic, no proof/ACL
    // since the constant isn't secret) and reuse them for every recipient (runner caches within
    // the tx, so reuse is free).
    //
    // Reference: this is the pattern ConfidentialAuction uses for fees —
    //   Nox.div(Nox.mul(bid, feeRate), Nox.toEuint256(100)).
    //
    // RULES (from the team — do not reorder or loosen):
    //  - mul BEFORE div. Division is integer/floor; dividing first floors pct/10_000 to 0.
    //  - grant each recipient viewer access to ONLY their own payout. Because publicTotal is public,
    //    anyone who can decrypt payout_i can back out sealedPct_i = payout_i * 10_000 / publicTotal.
    //    So never give a recipient the batch. (An auditor MAY see the batch — that's the point of an
    //    audit, and yes they can derive the cap table; that's intended. See grantAuditor.)
    //  - ~10-20 recipients per tx is fine; if gas gets tight, batch ~10 per tx.
    function distribute(uint256 id, uint256 publicTotal) external {
        CapTable storage c = capTables[id];
        require(c.locked, "unlocked");
        require(msg.sender == c.founder, "founder");

        // Wrap the pooled public USDC into the confidential token (VERIFY wrap() sig on the starter):
        // usdc.approve(address(cToken), publicTotal); cToken.wrap(address(this), publicTotal);

        // Public constant handles — compute ONCE, reuse for every recipient (runner caches within tx).
        bytes32 encTotal = Nox.toEuint256(publicTotal); // public handle, no proof/ACL needed
        bytes32 enc10000 = Nox.toEuint256(10_000);      // public handle, no proof/ACL needed

        for (uint256 i = 0; i < c.ownerCount; i++) {
            // payout_i = (sealedPct_i * publicTotal) / 10_000   — MUL BEFORE DIV (floor-safe)
            bytes32 payout = Nox.div(Nox.mul(c.sealedPct[i], encTotal), enc10000);

            // Owner decrypts ONLY their own payout (team-confirmed clean; NEVER grant the batch to a recipient).
            Nox.addViewer(payout, c.owners[i]); // CONFIRMED: Nox.addViewer(euint256, address) exists directly on Nox

            // CONFIRMED transfer sig; amount is a euint256 handle (not uint256):
            //   cToken.confidentialTransfer(c.owners[i], payout);

            // No-leak-on-error: never revert in a way that reveals a sealed value — clamp/handle silently.
        }
        emit DistributionTriggered(id, publicTotal);
    }

    // ---- 5. selective disclosure: grant an auditor a scoped view of the whole batch ----
    function grantAuditor(uint256 id, address auditor) external {
        CapTable storage c = capTables[id];
        require(msg.sender == c.founder, "founder");
        for (uint256 i = 0; i < c.ownerCount; i++) {
            Nox.addViewer(c.sealedPct[i], auditor); // CONFIRMED signature; scoped, recorded on-chain
        }
        emit AuditorGranted(id, auditor);
    }

    // NOTE: owner addresses are intentionally public (that someone is an owner).
    // Sealed: each percentage, each payout, the allocation math. Public: the pooled total.
}
