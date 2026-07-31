// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {Nox, ebool, euint256, externalEbool, externalEuint256} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";
import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20ToERC7984Wrapper} from "@iexec-nox/nox-confidential-contracts/contracts/interfaces/IERC20ToERC7984Wrapper.sol";

/**
 * ScripWaterfall — confidential CONDITIONAL distribution wrapping 0xSplits.
 *
 * Real, compiling implementation (see ../../ScripWaterfall.sol at the repo root for the original
 * annotated spec this was built from).
 *
 * The split is not a static sealed percentage. It is an ordered, sealed WATERFALL: each tier has a
 * sealed absolute cap ("first $X to A"), a sealed ratio ("then split the rest N%"), and a sealed
 * milestone gate. Nox evaluates the whole waterfall on the PUBLIC pooled total against the SEALED
 * terms, inside the TEE, in one distribute() call — there is no separate async request/callback:
 * every Nox.* op below (add/sub/mul/div/lt/select) executes synchronously in this transaction,
 * exactly like the proven ScripDistributor.distribute(). The only genuinely async step in this
 * whole system is DECRYPTING a resulting handle afterwards (the Handle Gateway's ACL index catching
 * up — see app/lib/useDecrypt.ts), same as every other sealed value in this app.
 *
 * Evaluation mirrors ../../waterfall-eval.ts's evaluateWaterfall() exactly:
 *   PASS 1 (tier order): take = milestone ? min(remaining, absCap) : 0; payout[i] += take; remaining -= take
 *   PASS 2 (tier order): take = milestone ? (remaining * ratioBps) / 10_000 : 0; payout[i] += take
 * MUL BEFORE DIV always (division floors). Every tier runs the same uniform formula regardless of
 * whether its absCap/ratioBps is sealed-zero — branching control flow on a sealed value's zero-ness
 * would leak it, so a no-op tier just naturally computes a take of 0 through the same select/min.
 */
contract ScripWaterfall {
    using SafeERC20 for IERC20;

    // ---- types ----

    /// Input for one waterfall tier at cap-table creation time — sealed terms, proven with a proof.
    struct TierInput {
        uint256 beneficiary; // owner index this tier can pay (PUBLIC — only the terms are sealed)
        externalEuint256 absCap;
        bytes absCapProof;
        externalEuint256 ratioBps;
        bytes ratioBpsProof;
        externalEbool milestone;
        bytes milestoneProof;
    }

    /// Stored tier — sealed handles only, order preserved from creation.
    struct Tier {
        uint256 beneficiary;
        euint256 absCap;
        euint256 ratioBps;
        ebool milestone;
    }

    struct CapTable {
        address founder;
        address[] owners; // recipient addresses (PUBLIC — only tier terms/payouts are sealed)
        Tier[] tiers; // the sealed waterfall, in order (order is PUBLIC; terms are not)
        mapping(uint256 => euint256) sealedPayout; // owner index => last computed sealed payout
        uint256 ownerCount;
        bool locked;
        bool distributed;
    }

    IERC20 public immutable usdc; // real Sepolia USDC (in)
    IERC20ToERC7984Wrapper public immutable cToken; // confidential ERC-7984 token (out)
    address public immutable owner; // deployer; may point this waterfall at a Split
    address public splitAddress; // the 0xSplits Split routing revenue here (unmodified)

    mapping(uint256 => CapTable) private capTables;
    uint256 public capTableCount;

    event SplitSet(address indexed split);
    event CapTableCreated(uint256 indexed id, address indexed founder, address[] owners, uint256 tierCount);
    event WaterfallLocked(uint256 indexed id);
    event RevenuePooled(uint256 indexed id, uint256 publicTotal);
    event DistributionTriggered(uint256 indexed id, uint256 publicTotal);
    event AuditorGranted(uint256 indexed id, address auditor);

    constructor(IERC20 usdc_, IERC20ToERC7984Wrapper cToken_) {
        usdc = usdc_;
        cToken = cToken_;
        owner = msg.sender;
    }

    /// Record the 0xSplits Split that routes revenue here (informational; poolRevenue() only ever
    /// reads this contract's own USDC balance, so this isn't load-bearing for correctness).
    function setSplit(address split_) external {
        require(msg.sender == owner, "owner");
        splitAddress = split_;
        emit SplitSet(split_);
    }

    // ---- 1. create the sealed waterfall cap table ----
    // Owner addresses and tier ORDER are public. Each tier's abs cap, ratio, and milestone gate are
    // sealed handles, encrypted in the browser before submission (same seal-in-browser pattern as
    // ScripDistributor's percentages — encryptInput('uint256'/'bool', ...) client-side).
    function createCapTable(
        address[] calldata owners,
        TierInput[] calldata tiers
    ) external returns (uint256 id) {
        require(owners.length > 0, "no owners");
        require(tiers.length > 0, "no tiers");
        id = ++capTableCount;
        CapTable storage c = capTables[id];
        c.founder = msg.sender;
        c.ownerCount = owners.length;
        for (uint256 i = 0; i < owners.length; i++) c.owners.push(owners[i]);

        for (uint256 t = 0; t < tiers.length; t++) {
            require(tiers[t].beneficiary < owners.length, "bad beneficiary");
            euint256 absCap = Nox.fromExternal(tiers[t].absCap, tiers[t].absCapProof);
            euint256 ratioBps = Nox.fromExternal(tiers[t].ratioBps, tiers[t].ratioBpsProof);
            ebool milestone = Nox.fromExternal(tiers[t].milestone, tiers[t].milestoneProof);
            Nox.allowThis(absCap);
            Nox.allowThis(ratioBps);
            Nox.allowThis(milestone);
            c.tiers.push(Tier(tiers[t].beneficiary, absCap, ratioBps, milestone));
        }

        emit CapTableCreated(id, msg.sender, owners, tiers.length);
    }

    // ---- 2. lock the waterfall (no term changes after) ----
    // Unlike a static split, tiers are not required to sum to 100% up front — the waterfall
    // consumes whatever the actual pooled total turns out to be at distribute() time (see
    // ../../ScripWaterfall.sol's spec note; a real deal's tiers rarely partition the total exactly).
    function lockWaterfall(uint256 id) external {
        CapTable storage c = capTables[id];
        require(msg.sender == c.founder, "not founder");
        require(!c.locked, "locked");
        c.locked = true;
        emit WaterfallLocked(id);
    }

    // ---- views: handles are public pointers (safe to expose) — only the underlying value is
    // sealed. Deliberately no getter returns a sealed threshold/ratio/milestone/payout as a number. ----
    function getOwners(uint256 id) external view returns (address[] memory) {
        return capTables[id].owners;
    }

    function tierCount(uint256 id) external view returns (uint256) {
        return capTables[id].tiers.length;
    }

    function tierBeneficiary(uint256 id, uint256 index) external view returns (uint256) {
        return capTables[id].tiers[index].beneficiary;
    }

    function isLocked(uint256 id) external view returns (bool) {
        return capTables[id].locked;
    }

    function sealedPayoutOf(uint256 id, uint256 ownerIndex) external view returns (euint256) {
        return capTables[id].sealedPayout[ownerIndex];
    }

    // ---- 3. pool revenue (0xSplits routed public USDC here, unmodified) ----
    function poolRevenue(uint256 id) external returns (uint256 publicTotal) {
        publicTotal = usdc.balanceOf(address(this)); // pooled, public — the provable-total anchor
        emit RevenuePooled(id, publicTotal);
    }

    // ---- 4. distribute: evaluate the sealed waterfall on the public total (the core innovation) ----
    // Mirrors waterfall-eval.ts's evaluateWaterfall() exactly, on sealed handles instead of bigints.
    // No sealed value ever branches control flow (every tier runs the same formula), so which tiers
    // are "active" is never observable from gas usage or execution path — only the total is public.
    function distribute(uint256 id, uint256 publicTotal) external {
        CapTable storage c = capTables[id];
        require(c.locked, "unlocked");
        require(msg.sender == c.founder, "founder");
        require(!c.distributed, "already distributed");
        c.distributed = true;

        usdc.forceApprove(address(cToken), publicTotal);
        cToken.wrap(address(this), publicTotal);

        euint256 enc10000 = Nox.toEuint256(10_000);
        euint256 zero = Nox.toEuint256(0);
        euint256 remaining = Nox.toEuint256(publicTotal);

        euint256[] memory payout = new euint256[](c.ownerCount);
        for (uint256 i = 0; i < c.ownerCount; i++) payout[i] = zero;

        uint256 n = c.tiers.length;

        // PASS 1 — absolute caps ("first $X to A"), in tier order, gated by the sealed milestone.
        for (uint256 t = 0; t < n; t++) {
            Tier storage tier = c.tiers[t];
            euint256 capped = Nox.select(Nox.lt(remaining, tier.absCap), remaining, tier.absCap); // min(remaining, absCap)
            euint256 take = Nox.select(tier.milestone, capped, zero); // sealed conditional gate
            payout[tier.beneficiary] = Nox.add(payout[tier.beneficiary], take);
            remaining = Nox.sub(remaining, take); // safe: take <= capped <= remaining, always
        }

        // PASS 2 — ratio split of what's left after pass 1 ("then split the rest N%"), same gate.
        // All ratio tiers read the SAME post-pass-1 `remaining` (matches waterfall-eval.ts: ratio
        // tiers are independent shares of one remainder, not sequential consumption).
        for (uint256 t = 0; t < n; t++) {
            Tier storage tier = c.tiers[t];
            euint256 ratioTake = Nox.div(Nox.mul(remaining, tier.ratioBps), enc10000); // MUL BEFORE DIV
            euint256 take = Nox.select(tier.milestone, ratioTake, zero);
            payout[tier.beneficiary] = Nox.add(payout[tier.beneficiary], take);
        }

        for (uint256 i = 0; i < c.ownerCount; i++) {
            Nox.allowThis(payout[i]);
            Nox.allow(payout[i], address(cToken));
            // Owner decrypts ONLY their own payout — never the batch. publicTotal is public, so
            // payout_i + total would let anyone back out that owner's effective share of the deal.
            Nox.addViewer(payout[i], c.owners[i]);
            cToken.confidentialTransfer(c.owners[i], payout[i]);
            c.sealedPayout[i] = payout[i];
        }

        emit DistributionTriggered(id, publicTotal);
    }

    // ---- 5. auditor selective disclosure (batch view, only when granted) ----
    function grantAuditor(uint256 id, address auditor) external {
        CapTable storage c = capTables[id];
        require(msg.sender == c.founder, "founder");
        for (uint256 i = 0; i < c.ownerCount; i++) {
            Nox.addViewer(c.sealedPayout[i], auditor);
        }
        emit AuditorGranted(id, auditor);
    }
}
