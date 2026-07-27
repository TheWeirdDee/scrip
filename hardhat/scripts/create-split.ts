import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createWalletClient, http, publicActions, getContract, parseAbi, getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

// Phase 2: create a real, UNMODIFIED 0xSplits v2 Push Split on Sepolia, routing 100% of whatever
// it receives to the ScripDistributor contract (the sole recipient). Deterministic factory address
// is the same across all chains 0xSplits v2 supports, incl. Sepolia (confirmed via @0xsplits/splits-sdk
// constants: PUSH_SPLIT_V2o2_FACTORY_ADDRESS).
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
    ScripDistributor: `0x${string}`;
  };

  const splitParams = {
    recipients: [deployed.ScripDistributor],
    allocations: [1n],
    totalAllocation: 1n,
    distributionIncentive: 0,
  };

  console.log("Creating 0xSplits Push Split, 100% ->", deployed.ScripDistributor);
  const factory = getContract({
    address: PUSH_SPLIT_V2o2_FACTORY_ADDRESS,
    abi: factoryAbi,
    client: walletClient,
  });
  const txHash = await factory.write.createSplit([splitParams, account.address, account.address]);
  const receipt = await walletClient.waitForTransactionReceipt({ hash: txHash });
  console.log("tx:", txHash, "status:", receipt.status);

  // The factory's SplitCreated event indexes `split` as its only indexed field: pull it straight
  // from the topic rather than ABI-decoding, since the exact SplitCreated struct layout differs
  // slightly across 0xSplits v2 factory revisions (v2 / v2o1 / v2o2) and isn't worth pinning here.
  let splitAddress: `0x${string}` | undefined;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() === PUSH_SPLIT_V2o2_FACTORY_ADDRESS.toLowerCase() && log.topics[1]) {
      splitAddress = getAddress(`0x${log.topics[1].slice(-40)}`);
      break;
    }
  }
  if (!splitAddress) throw new Error("SplitCreated event not found in receipt logs");
  console.log("Split deployed to:", splitAddress);

  writeFileSync(deployedPath, JSON.stringify({ ...deployed, Split: splitAddress }, null, 2));

  console.log("\nPointing ScripDistributor.setSplit(...) at the new Split...");
  const distributorAbi = parseAbi(["function setSplit(address split_)"]);
  const distributor = getContract({
    address: deployed.ScripDistributor,
    abi: distributorAbi,
    client: walletClient,
  });
  const setSplitTx = await distributor.write.setSplit([splitAddress]);
  await walletClient.waitForTransactionReceipt({ hash: setSplitTx });
  console.log("setSplit tx:", setSplitTx);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
