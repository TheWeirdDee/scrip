// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {Nox, euint256, externalEuint256} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";
import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20ToERC7984Wrapper} from "@iexec-nox/nox-confidential-contracts/contracts/interfaces/IERC20ToERC7984Wrapper.sol";

/**
 * ScripDistributor — confidential allocation + payout layer wrapping 0xSplits.
 *
 * Real, compiling implementation (see ../../ScripDistributor.sol at the repo root for the
 * original annotated spec this was built from; all `// VERIFY` marks there are now resolved).
 *
 * Role: this contract is the sole recipient of a 0xSplits Split (Split routes 100% of pooled
 * revenue here, unmodified). Scrip wraps the received USDC into a confidential ERC-7984 token
 * and distributes sealed per-owner amounts computed from sealed ownership percentages.
 */
contract ScripDistributor {
    using SafeERC20 for IERC20;

    struct CapTable {
        address founder;
        address[] owners; // recipient addresses (PUBLIC — only percentages/payouts are sealed)
        mapping(uint256 => euint256) sealedPct; // owner index => sealed ownership % (bps) handle
        euint256 sealedSum; // sealed sum of percentages, for the founder's own off-chain audit only
        uint256 ownerCount;
        bool locked; // percentages finalized
    }

    IERC20 public immutable usdc; // real Sepolia USDC (in)
    IERC20ToERC7984Wrapper public immutable cToken; // confidential ERC-7984 token (out)
    address public immutable owner; // deployer; may point this distributor at a Split
    address public splitAddress; // the 0xSplits Split routing revenue here (unmodified)

    mapping(uint256 => CapTable) private capTables;
    uint256 public capTableCount;

    event SplitSet(address indexed split);
    event CapTableCreated(uint256 indexed id, address indexed founder, address[] owners);
    event PercentagesLocked(uint256 indexed id);
    event RevenuePooled(uint256 indexed id, uint256 publicTotal);
    event DistributionTriggered(uint256 indexed id, uint256 publicTotal);
    event AuditorGranted(uint256 indexed id, address auditor);

    constructor(IERC20 usdc_, IERC20ToERC7984Wrapper cToken_) {
        usdc = usdc_;
        cToken = cToken_;
        owner = msg.sender;
    }

    /// Record the 0xSplits Split that routes revenue here (informational; poolRevenue() only
    /// ever reads this contract's own USDC balance, so this isn't load-bearing for correctness).
    function setSplit(address split_) external {
        require(msg.sender == owner, "owner");
        splitAddress = split_;
        emit SplitSet(split_);
    }

    // ---- 1. create the (sealed) cap table ----
    // Owner addresses are public; each owner's PERCENTAGE is a sealed handle (euint256 bps).
    function createCapTable(
        address[] calldata owners,
        externalEuint256[] calldata sealedPctHandles,
        bytes[] calldata proofs
    ) external returns (uint256 id) {
        require(owners.length == sealedPctHandles.length, "len");
        require(owners.length == proofs.length, "len");
        id = ++capTableCount;
        CapTable storage c = capTables[id];
        c.founder = msg.sender;
        c.ownerCount = owners.length;
        for (uint256 i = 0; i < owners.length; i++) {
            c.owners.push(owners[i]);
            euint256 pct = Nox.fromExternal(sealedPctHandles[i], proofs[i]);
            c.sealedPct[i] = pct;
            Nox.allowThis(pct);
        }
        emit CapTableCreated(id, msg.sender, owners);
    }

    // ---- 2. lock: finalize sealed percentages ----
    // Non-leaking guard: sum-to-100% is enforced at the setup UI, not by an on-chain comparison
    // (see BUILD_PHASES.md BLOCKERS) — a strict on-chain `Nox.eq` guard would either leak timing
    // info on failure or require a decrypt round-trip mid-transaction. The sealed sum is still
    // computed and kept viewer-accessible to the founder alone, so they can self-audit off-chain.
    function lockPercentages(uint256 id) external {
        CapTable storage c = capTables[id];
        require(msg.sender == c.founder, "founder");
        require(!c.locked, "locked");
        euint256 sum = c.sealedPct[0];
        for (uint256 i = 1; i < c.ownerCount; i++) {
            sum = Nox.add(sum, c.sealedPct[i]);
        }
        Nox.allowThis(sum);
        Nox.allow(sum, c.founder);
        c.sealedSum = sum;
        c.locked = true;
        emit PercentagesLocked(id);
    }

    // ---- views: handles are public pointers (safe to expose) — only the underlying value is
    // sealed. Lets an explorer or a JS client fetch a handle to decrypt without needing to already
    // know it out-of-band. ----
    function getOwners(uint256 id) external view returns (address[] memory) {
        return capTables[id].owners;
    }

    function sealedPercentage(uint256 id, uint256 index) external view returns (euint256) {
        return capTables[id].sealedPct[index];
    }

    // ---- 3. pool revenue: called after the 0xSplits Split routes USDC here ----
    // The Split (unmodified) distributes its balance to this contract as the sole recipient.
    // Public total is visible here (that's the provable-total trust anchor).
    function poolRevenue(uint256 id) external returns (uint256 publicTotal) {
        publicTotal = usdc.balanceOf(address(this)); // pooled, public
        emit RevenuePooled(id, publicTotal);
    }

    // ---- 4. distribute: pay each owner a sealed amount from their sealed % (ASYNC) ----
    // Pattern confirmed by the iExec team: wrap public constants once via Nox.toEuint256 (cached,
    // free to reuse per-tx), MUL BEFORE DIV (division floors), grant each recipient viewer access
    // to ONLY their own payout (never the batch — publicTotal is public, so payout + total would
    // reveal that recipient's %). Nox.mul/div do not implicitly grant the caller access to the
    // resulting handle (see ERC7984Base's own use of the primitives) — allowThis explicitly before
    // use. cToken must ALSO be an allowed user of the handle (not just ScripDistributor): inside
    // confidentialTransfer, cToken itself calls Nox.transfer(..., amount) as its own msg.sender to
    // NoxCompute, so it needs its own `allow`, separate from ScripDistributor's allowThis and the
    // owner's addViewer (confirmed empirically — reverted with an unauthorized-use error citing
    // cToken's address until this was added).
    function distribute(uint256 id, uint256 publicTotal) external {
        CapTable storage c = capTables[id];
        require(c.locked, "unlocked");
        require(msg.sender == c.founder, "founder");

        usdc.forceApprove(address(cToken), publicTotal);
        cToken.wrap(address(this), publicTotal);

        euint256 encTotal = Nox.toEuint256(publicTotal); // public handle, no proof/ACL needed
        euint256 enc10000 = Nox.toEuint256(10_000); // public handle, no proof/ACL needed

        for (uint256 i = 0; i < c.ownerCount; i++) {
            // payout_i = (sealedPct_i * publicTotal) / 10_000 — MUL BEFORE DIV (floor-safe)
            euint256 payout = Nox.div(Nox.mul(c.sealedPct[i], encTotal), enc10000);
            Nox.allowThis(payout);
            Nox.allow(payout, address(cToken));
            Nox.addViewer(payout, c.owners[i]);
            cToken.confidentialTransfer(c.owners[i], payout);
        }
        emit DistributionTriggered(id, publicTotal);
    }

    // ---- 5. selective disclosure: grant an auditor a scoped view of the whole batch ----
    function grantAuditor(uint256 id, address auditor) external {
        CapTable storage c = capTables[id];
        require(msg.sender == c.founder, "founder");
        for (uint256 i = 0; i < c.ownerCount; i++) {
            Nox.addViewer(c.sealedPct[i], auditor);
        }
        emit AuditorGranted(id, auditor);
    }

    // NOTE: owner addresses are intentionally public (that someone is an owner).
    // Sealed: each percentage, each payout, the allocation math. Public: the pooled total.
}
