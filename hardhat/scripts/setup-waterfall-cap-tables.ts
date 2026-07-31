import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createWalletClient, http, publicActions, getContract, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { createViemHandleClient } from "@iexec-nox/handle";

// Creates TWO ScripWaterfall cap tables with the IDENTICAL tier structure (same beneficiaries,
// same sealed absCap/ratioBps numbers) — the ONLY difference between them is which of tier 4/5's
// sealed milestone gate is true. This is what makes the milestone the genuine cause of the payout
// difference (not just "two cap tables with different numbers", which any static-split contract
// could already do).
//
// Deal (owners: 0 = founder/deployer, 1 = investor/OWNER_B), total T:
//   Tier 1: investor recoups first 0.4 USDC (absCap, always active)
//   Tier 2: founder gets 70% of what's left (always active)
//   Tier 3: investor gets 15% of what's left (always active)
//   Tier 4: founder gets +15% of what's left, ONLY if milestone hit
//   Tier 5: investor gets +15% of what's left, ONLY if milestone NOT hit
// milestone NOT hit -> founder 70%, investor 15%+15%=30% of the remainder (matches a plain 70/30 split)
// milestone HIT     -> founder 70%+15%=85%, investor 15% of the remainder (matches a plain 85/15 split)
// Same remainder either way -> same total payout out of the contract, different split.

const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;
const RPC_URL = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const OWNER_B = process.env.OWNER_B_ADDRESS as `0x${string}`;

const ABS_CAP = 100_000n; // 0.1 USDC, 6 decimals (rescaled to fit the deployer's remaining test USDC)
const FOUNDER_BASE_BPS = 7000n;
const INVESTOR_BASE_BPS = 1500n;
const BONUS_BPS = 1500n;

const waterfallAbi = parseAbi([
  "function createCapTable(address[] owners, (uint256 beneficiary, bytes32 absCap, bytes absCapProof, bytes32 ratioBps, bytes ratioBpsProof, bytes32 milestone, bytes milestoneProof)[] tiers) returns (uint256 id)",
  "function lockWaterfall(uint256 id)",
  "event CapTableCreated(uint256 indexed id, address indexed founder, address[] owners, uint256 tierCount)",
]);

async function main() {
  const account = privateKeyToAccount(PRIVATE_KEY);
  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(RPC_URL),
  }).extend(publicActions);

  const deployedPath = path.join(import.meta.dirname, "..", "deployed.sepolia.json");
  const deployed = JSON.parse(readFileSync(deployedPath, "utf-8")) as {
    ScripWaterfall: `0x${string}`;
  };

  const handleClient = await createViemHandleClient(walletClient);
  const owners = [account.address, OWNER_B] as const;
  const waterfall = getContract({
    address: deployed.ScripWaterfall,
    abi: waterfallAbi,
    client: walletClient,
  });

  async function encU256(value: bigint) {
    const { handle, handleProof } = await handleClient.encryptInput(value, "uint256", deployed.ScripWaterfall);
    return { handle, handleProof };
  }
  async function encBool(value: boolean) {
    const { handle, handleProof } = await handleClient.encryptInput(value, "bool", deployed.ScripWaterfall);
    return { handle, handleProof };
  }

  async function buildTiers(milestoneHit: boolean) {
    const alwaysOn = await encBool(true);
    const gateHit = await encBool(milestoneHit);
    const gateNotHit = await encBool(!milestoneHit);
    const zero = await encU256(0n);

    const tier1AbsCap = await encU256(ABS_CAP);
    const tier2Ratio = await encU256(FOUNDER_BASE_BPS);
    const tier3Ratio = await encU256(INVESTOR_BASE_BPS);
    const tier4Ratio = await encU256(BONUS_BPS);
    const tier5Ratio = await encU256(BONUS_BPS);

    return [
      { beneficiary: 1n, absCap: tier1AbsCap.handle, absCapProof: tier1AbsCap.handleProof, ratioBps: zero.handle, ratioBpsProof: zero.handleProof, milestone: alwaysOn.handle, milestoneProof: alwaysOn.handleProof },
      { beneficiary: 0n, absCap: zero.handle, absCapProof: zero.handleProof, ratioBps: tier2Ratio.handle, ratioBpsProof: tier2Ratio.handleProof, milestone: alwaysOn.handle, milestoneProof: alwaysOn.handleProof },
      { beneficiary: 1n, absCap: zero.handle, absCapProof: zero.handleProof, ratioBps: tier3Ratio.handle, ratioBpsProof: tier3Ratio.handleProof, milestone: alwaysOn.handle, milestoneProof: alwaysOn.handleProof },
      { beneficiary: 0n, absCap: zero.handle, absCapProof: zero.handleProof, ratioBps: tier4Ratio.handle, ratioBpsProof: tier4Ratio.handleProof, milestone: gateHit.handle, milestoneProof: gateHit.handleProof },
      { beneficiary: 1n, absCap: zero.handle, absCapProof: zero.handleProof, ratioBps: tier5Ratio.handle, ratioBpsProof: tier5Ratio.handleProof, milestone: gateNotHit.handle, milestoneProof: gateNotHit.handleProof },
    ];
  }

  async function createAndLock(label: string, milestoneHit: boolean) {
    console.log(`\n=== Creating cap table: ${label} (milestoneHit=${milestoneHit}) ===`);
    const tiers = await buildTiers(milestoneHit);
    const createTx = await waterfall.write.createCapTable([[...owners], tiers]);
    const receipt = await walletClient.waitForTransactionReceipt({ hash: createTx });
    console.log("createCapTable tx:", createTx, "status:", receipt.status);

    let id: bigint | undefined;
    for (const log of receipt.logs) {
      try {
        const decoded = await import("viem").then((v) =>
          v.decodeEventLog({ abi: waterfallAbi, data: log.data, topics: log.topics })
        );
        if (decoded.eventName === "CapTableCreated") {
          id = (decoded.args as { id: bigint }).id;
        }
      } catch {
        // not our event, skip
      }
    }
    if (id === undefined) throw new Error("CapTableCreated event not found");

    const lockTx = await waterfall.write.lockWaterfall([id]);
    await walletClient.waitForTransactionReceipt({ hash: lockTx });
    console.log(`lockWaterfall(${id}) tx:`, lockTx);
    return id;
  }

  const notHitId = await createAndLock("milestone NOT hit", false);
  const hitId = await createAndLock("milestone HIT", true);

  writeFileSync(
    deployedPath,
    JSON.stringify(
      {
        ...deployed,
        waterfallOwners: [...owners],
        waterfallCapTableNotHit: notHitId.toString(),
        waterfallCapTableHit: hitId.toString(),
      },
      null,
      2
    )
  );

  console.log("\nWATERFALL SETUP DONE.");
  console.log("Cap table (milestone NOT hit):", notHitId.toString());
  console.log("Cap table (milestone HIT):", hitId.toString());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
