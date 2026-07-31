import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createWalletClient, http, publicActions, getContract, parseAbi, getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

// Real, UNMODIFIED 0xSplits v2 Push Split on Sepolia, routing 100% of whatever it receives to the
// ScripWaterfall contract (the sole recipient) — the same pattern as create-split.ts for
// ScripDistributor, kept as a separate Split so the existing ScripDistributor demo is untouched.
const PUSH_SPLIT_V2o2_FACTORY_ADDRESS = "0x8E8eB0cC6AE34A38B67D5Cf91ACa38f60bc3Ecf4" as const;

const factoryAbi = parseAbi([
  "function createSplit((address[] recipients, uint256[] allocations, uint256 totalAllocation, uint16 distributionIncentive) _splitParams, address _owner, address _creator) returns (address split)",
]);

const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;
const RPC_URL = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";

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

  const splitParams = {
    recipients: [deployed.ScripWaterfall],
    allocations: [1n],
    totalAllocation: 1n,
    distributionIncentive: 0,
  };

  console.log("Creating 0xSplits Push Split, 100% ->", deployed.ScripWaterfall);
  const factory = getContract({
    address: PUSH_SPLIT_V2o2_FACTORY_ADDRESS,
    abi: factoryAbi,
    client: walletClient,
  });
  const txHash = await factory.write.createSplit([splitParams, account.address, account.address]);
  const receipt = await walletClient.waitForTransactionReceipt({ hash: txHash });
  console.log("tx:", txHash, "status:", receipt.status);

  let splitAddress: `0x${string}` | undefined;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() === PUSH_SPLIT_V2o2_FACTORY_ADDRESS.toLowerCase() && log.topics[1]) {
      splitAddress = getAddress(`0x${log.topics[1].slice(-40)}`);
      break;
    }
  }
  if (!splitAddress) throw new Error("SplitCreated event not found in receipt logs");
  console.log("Split deployed to:", splitAddress);

  writeFileSync(deployedPath, JSON.stringify({ ...deployed, WaterfallSplit: splitAddress }, null, 2));

  console.log("\nPointing ScripWaterfall.setSplit(...) at the new Split...");
  const waterfallAbi = parseAbi(["function setSplit(address split_)"]);
  const waterfall = getContract({
    address: deployed.ScripWaterfall,
    abi: waterfallAbi,
    client: walletClient,
  });
  const setSplitTx = await waterfall.write.setSplit([splitAddress]);
  await walletClient.waitForTransactionReceipt({ hash: setSplitTx });
  console.log("setSplit tx:", setSplitTx);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
