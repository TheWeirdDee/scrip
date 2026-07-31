import { parseAbi } from "viem";

// Real, deployed Sepolia addresses (hardhat/deployed.sepolia.json). Cap table #1 there is the
// live demo cap table: two owners, 60%/40%, sealed.
export const USDC_ADDRESS = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as const;
export const CONFIDENTIAL_USDC_ADDRESS = "0x081000dc72d13e472671f9a641c261cbb1a39101" as const;
export const SCRIP_DISTRIBUTOR_ADDRESS = "0x3b323cee5cc1dc3fead35c74b45062aa43f45ede" as const;
export const SPLIT_ADDRESS = "0x7eD52bCCa0C0d6f7F86c73CB5A4106e33764557f" as const;
export const DEMO_CAP_TABLE_ID = 1n;
export const DEMO_FOUNDER_ADDRESS = "0x5bd8e236b39C4Fb48F4eA534584f2858c2B923E3" as const;

// ScripWaterfall — the confidential conditional distribution engine (see hardhat/deployed.sepolia.json).
// Cap table #1 = the "milestone NOT hit" demo scenario, #2 = "milestone HIT" — same 2 USDC total,
// different sealed-milestone payout (the money-shot proof; see DEMO_SCRIPT.md).
export const SCRIP_WATERFALL_ADDRESS = "0x137077d0c4ef8179b7e405a19ee4e62210e5ae43" as const;
export const WATERFALL_SPLIT_ADDRESS = "0x75720eBbBe8a92A21D420A4C6d240dC7299100b5" as const;
export const WATERFALL_DEMO_NOT_HIT_ID = 1n;
export const WATERFALL_DEMO_HIT_ID = 2n;

export const SEPOLIA_CHAIN_ID = 11155111;

export const erc20Abi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

export const scripDistributorAbi = parseAbi([
  "function capTableCount() view returns (uint256)",
  "function getOwners(uint256 id) view returns (address[])",
  "function sealedPercentage(uint256 id, uint256 index) view returns (bytes32)",
  "function splitAddress() view returns (address)",
  "function createCapTable(address[] owners, bytes32[] sealedPctHandles, bytes[] proofs) returns (uint256 id)",
  "function lockPercentages(uint256 id)",
  "function poolRevenue(uint256 id) returns (uint256 publicTotal)",
  "function distribute(uint256 id, uint256 publicTotal)",
  "function grantAuditor(uint256 id, address auditor)",
  "event SplitSet(address indexed split)",
  "event CapTableCreated(uint256 indexed id, address indexed founder, address[] owners)",
  "event PercentagesLocked(uint256 indexed id)",
  "event RevenuePooled(uint256 indexed id, uint256 publicTotal)",
  "event DistributionTriggered(uint256 indexed id, uint256 publicTotal)",
  "event AuditorGranted(uint256 indexed id, address auditor)",
]);

export const confidentialUsdcAbi = parseAbi([
  "function confidentialBalanceOf(address account) view returns (bytes32)",
]);

// TierInput mirrors ScripWaterfall.sol's struct exactly (externalEuint256/externalEbool are
// bytes32 at the ABI level). beneficiary + tier order are public; absCap/ratioBps/milestone are
// sealed handles encrypted client-side before submission.
export const scripWaterfallAbi = parseAbi([
  "function capTableCount() view returns (uint256)",
  "function getOwners(uint256 id) view returns (address[])",
  "function tierCount(uint256 id) view returns (uint256)",
  "function tierBeneficiary(uint256 id, uint256 index) view returns (uint256)",
  "function isLocked(uint256 id) view returns (bool)",
  "function sealedPayoutOf(uint256 id, uint256 ownerIndex) view returns (bytes32)",
  "function splitAddress() view returns (address)",
  "function createCapTable(address[] owners, (uint256 beneficiary, bytes32 absCap, bytes absCapProof, bytes32 ratioBps, bytes ratioBpsProof, bytes32 milestone, bytes milestoneProof)[] tiers) returns (uint256 id)",
  "function lockWaterfall(uint256 id)",
  "function poolRevenue(uint256 id) returns (uint256 publicTotal)",
  "function distribute(uint256 id, uint256 publicTotal)",
  "function grantAuditor(uint256 id, address auditor)",
  "event SplitSet(address indexed split)",
  "event CapTableCreated(uint256 indexed id, address indexed founder, address[] owners, uint256 tierCount)",
  "event WaterfallLocked(uint256 indexed id)",
  "event RevenuePooled(uint256 indexed id, uint256 publicTotal)",
  "event DistributionTriggered(uint256 indexed id, uint256 publicTotal)",
  "event AuditorGranted(uint256 indexed id, address auditor)",
]);

export type WaterfallTierKind = "recoup" | "split";

export interface WaterfallTierDraft {
  beneficiary: number; // owner index
  kind: WaterfallTierKind;
  amountOrBps: string; // recoup: whole USDC units the user types; split: bps (7000 = 70%)
  milestoneGroup: "always" | "onHit" | "onMiss";
}
