// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/**
 * ScripWaterfall — CONFIDENTIAL CONDITIONAL DISTRIBUTION wrapping 0xSplits.
 *
 * ORIGINAL ANNOTATED SPEC. The real, compiling, deployed implementation lives at
 * hardhat/contracts/ScripWaterfall.sol — that file is what's actually built and deployed to
 * Sepolia (0x137077d0c4ef8179b7e405a19ee4e62210e5ae43). This file is kept as the annotated
 * historical spec/reference, same convention as ../ScripDistributor.sol.
 *
 * CORRECTION vs. the draft below: Nox compute is NOT an async request/callback pair. Every
 * `Nox.mul/div/add/sub/lt/select` call is a normal synchronous Solidity library call — it returns
 * a sealed handle in the SAME transaction, exactly like the already-proven
 * ScripDistributor.distribute(). There is no `fulfillWaterfall()` callback and no `onlyNox` guard
 * in the real contract — every `// VERIFY` mark below about an async result lifecycle was wrong;
 * see log.md's "[WATERFALL SHIPPED]" entry. The only genuinely async step anywhere in this system
 * is DECRYPTING a handle afterward (the Handle Gateway's ACL index catching up — see
 * app/lib/useDecrypt.ts), same as every other sealed value in this app.
 *
 * THE TWIST (what no other Nox project does): the split is NOT a set of static sealed percentages
 * typed by the founder. It is a SEALED WATERFALL — ordered tiers with sealed thresholds, sealed
 * ratios, and optional sealed milestone gates. When revenue arrives, Nox COMPUTES each owner's
 * payout by evaluating the waterfall on the public total against the sealed terms — inside the TEE.
 * Nobody sees the deal terms (thresholds/ratios/milestones) OR the individual payouts. Only the
 * total is public. This is confidential COMPUTATION (Nox's real purpose), not confidential storage.
 *
 * Role vs 0xSplits (UNMODIFIED): this contract is the sole recipient of a 0xSplits Split. The Split
 * routes 100% of pooled revenue here unchanged (public, provable total). Scrip then evaluates the
 * sealed waterfall and settles confidential per-owner payouts in ERC-7984.
 *
 * NO FHE anywhere (banned) — Nox TEE primitives only.
 */

import {Nox} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";        // VERIFY path
import {ACL} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/ACL.sol";        // VERIFY path
import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol"; // VERIFY

contract ScripWaterfall {
    using SafeERC20 for IERC20;

    // ---- types ----

    /**
     * A waterfall TIER, all financial terms SEALED (euint handles):
     *  - beneficiary: which owner index this tier pays (PUBLIC — only the terms are sealed)
     *  - sealedCapBps: how much of the running remainder this tier can take, in sealed bps
     *      (e.g. "first $X" is modeled as a sealed absolute cap; "then 70/30" as sealed ratio bps)
     *  - sealedAbsCap: sealed absolute cap for "first $X to A" style tiers (0 handle => no abs cap)
     *  - sealedMilestoneGate: optional sealed boolean handle — tier only applies if milestone true
     *      (a zero/absent handle => ungated, always applies)
     * Tiers are evaluated IN ORDER; each consumes from the remaining public total per its sealed rule.
     */
    struct Tier {
        uint256 beneficiary;      // owner index (public)
        bytes32 sealedAbsCap;     // sealed absolute cap (euint) — "first $X"; 0 => none   // VERIFY euint repr
        bytes32 sealedRatioBps;   // sealed ratio in bps (euint) — share of remainder after abs caps
        bytes32 sealedMilestone;  // sealed bool (euint) gate; 0 => ungated
    }

    struct CapTable {
        address founder;
        address[] owners;                       // PUBLIC addresses
        uint256 ownerCount;
        Tier[] tiers;                           // the SEALED waterfall (ordered)
        mapping(uint256 => bytes32) sealedPayout; // owner index => last computed sealed payout handle
        bool locked;                            // waterfall finalized
        bool computed;                          // last distribution computed
    }

    IERC20  public usdc;                 // real Sepolia USDC (in, via 0xSplits)
    IERC7984 public cToken;              // confidential ERC-7984 token (out)
    address public splitAddress;         // the UNMODIFIED 0xSplits Split routing revenue here

    mapping(uint256 => CapTable) private capTables;
    uint256 public capTableCount;

    event CapTableCreated(uint256 indexed id, address indexed founder, address[] owners, uint256 tierCount);
    event WaterfallLocked(uint256 indexed id);
    event RevenuePooled(uint256 indexed id, uint256 publicTotal);
    event WaterfallComputed(uint256 indexed id, uint256 publicTotal);   // async result landed
    event AuditorGranted(uint256 indexed id, address auditor);

    // ---- 1. create the SEALED WATERFALL cap table ----
    // Owner addresses are public. Each tier's terms (abs cap, ratio, milestone) are SEALED handles,
    // encrypted in the browser before submission. The ORDER of tiers is public; the TERMS are not.
    function createCapTable(
        address[] calldata owners,
        Tier[] calldata tiers
    ) external returns (uint256 id) {
        require(owners.length > 0, "no owners");
        require(tiers.length > 0, "no tiers");
        id = ++capTableCount;
        CapTable storage c = capTables[id];
        c.founder = msg.sender;
        c.ownerCount = owners.length;
        for (uint256 i = 0; i < owners.length; i++) c.owners.push(owners[i]);
        for (uint256 t = 0; t < tiers.length; t++) c.tiers.push(tiers[t]);
        emit CapTableCreated(id, msg.sender, owners, tiers.length);
    }

    // ---- 2. lock the waterfall (no term changes after) ----
    function lockWaterfall(uint256 id) external {
        CapTable storage c = capTables[id];
        require(msg.sender == c.founder, "not founder");
        require(!c.locked, "locked");
        // NOTE: unlike static percentages, we do NOT require tiers to sum to 100% up front — the
        // waterfall consumes the ACTUAL total at compute time (a remainder tier catches the rest).
        // VERIFY: optionally assert (in Nox, on sealed values) that ratio tiers' sealed bps <= 10000.
        c.locked = true;
        emit WaterfallLocked(id);
    }

    // ---- 3. pool revenue (0xSplits routed public USDC here, unmodified) ----
    function poolRevenue(uint256 id) external {
        CapTable storage c = capTables[id];
        require(c.locked, "unlocked");
        uint256 bal = usdc.balanceOf(address(this)); // public, provable total from the Split
        emit RevenuePooled(id, bal);
    }

    // ---- 4. COMPUTE THE WATERFALL (the core innovation) — ASYNC via Nox TEE ----
    /**
     * Nox evaluates the sealed waterfall on the PUBLIC total, in order, inside the TEE:
     *   remaining = publicTotal (public)
     *   for each tier (public order):
     *     applies   = tier.sealedMilestone ? sealed-bool : true         // sealed gate
     *     absTake   = min(remaining, tier.sealedAbsCap) if absCap set    // "first $X to A"
     *     ratioTake = (remaining_after_abs * tier.sealedRatioBps) / 10000 // "then split the rest"
     *     take      = applies ? (absTake + ratioTake) : 0               // sealed conditional
     *     sealedPayout[tier.beneficiary] += take                        // accrue sealed
     *     remaining -= take                                             // sealed subtract
     * The MATH runs on sealed terms; only publicTotal is public. Result = per-owner SEALED payout.
     * This is why it's confidential COMPUTATION, not storage: the split is DECIDED privately by a rule.
     *
     * MUL-BEFORE-DIV always (division floors). ~10-20 tiers/owners per distribution is fine.
     * ASYNC: this kicks off the TEE run; the sealed results land in `fulfillWaterfall` (callback).
     */
    function distribute(uint256 id) external {
        CapTable storage c = capTables[id];
        require(c.locked, "unlocked");
        uint256 publicTotal = usdc.balanceOf(address(this)); // public
        // VERIFY: exact Nox async-compute request API. Pass: publicTotal (public), the sealed tiers,
        // the owner count. The Nox TEE Runner evaluates the waterfall (pseudo-code above) and returns
        // one sealed payout handle per owner. Wire the request id -> (id) so the callback can resolve.
        // Nox.requestCompute(WATERFALL_PROGRAM, publicTotal, c.tiers, c.ownerCount);   // VERIFY
        emit WaterfallComputed(id, publicTotal); // NOTE: emit in the real CALLBACK, not here. // VERIFY
    }

    /**
     * Nox async callback: receives the computed SEALED payout per owner, stores handles, and grants
     * each owner ACL to decrypt ONLY THEIR OWN payout.
     * CRITICAL PRIVACY RULE (same as static Scrip, still applies): publicTotal is public, so grant
     * each owner ACL to ONLY their own sealed payout — never the vector. Revealing payout + public
     * total would leak their effective %. The auditor MAY be granted the batch (intended disclosure).
     */
    function fulfillWaterfall(uint256 id, bytes32[] calldata sealedPayouts) external /* onlyNox VERIFY */ {
        CapTable storage c = capTables[id];
        require(sealedPayouts.length == c.ownerCount, "len");
        for (uint256 i = 0; i < c.ownerCount; i++) {
            c.sealedPayout[i] = sealedPayouts[i];
            // ACL.allow(sealedPayouts[i], c.owners[i]);   // owner decrypts ONLY their own  // VERIFY
            // settle confidential ERC-7984 to owner using the sealed payout handle:
            // cToken.confidentialTransfer(c.owners[i], sealedPayouts[i]);                   // VERIFY
        }
        c.computed = true;
        emit WaterfallComputed(id, usdc.balanceOf(address(this)));
    }

    // ---- 5. auditor selective disclosure (batch view, only when granted) ----
    function grantAuditor(uint256 id, address auditor) external {
        CapTable storage c = capTables[id];
        require(msg.sender == c.founder, "not founder");
        // for (uint256 i=0;i<c.ownerCount;i++) ACL.allow(c.sealedPayout[i], auditor);       // VERIFY
        emit AuditorGranted(id, auditor);
    }

    // ---- views (never expose sealed terms or payouts in plaintext) ----
    function ownersOf(uint256 id) external view returns (address[] memory) { return capTables[id].owners; }
    function tierCount(uint256 id) external view returns (uint256) { return capTables[id].tiers.length; }
    function isLocked(uint256 id) external view returns (bool) { return capTables[id].locked; }
    // NOTE: there is deliberately NO getter that returns a sealed threshold/ratio/payout as a number.
}
