import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createWalletClient, http, publicActions, getContract, parseAbi, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

// Funds one waterfall cap table through the real, unmodified 0xSplits Split, pools the revenue,
// and runs distribute() -- the sealed waterfall evaluation. Usage:
//   npx tsx scripts/run-waterfall-scenario.ts <capTableId> <usdcAmount>

const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;
const RPC_URL = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const CAP_TABLE_ID = BigInt(process.argv[2] ?? "1");
const SEND_AMOUNT = process.argv[3] ?? "2";

const erc20Abi = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
]);
const splitAbi = parseAbi([
  "function distribute((address[] recipients, uint256[] allocations, uint256 totalAllocation, uint16 distributionIncentive) _split, address _token, address _distributor)",
]);
const waterfallAbi = parseAbi([
  "function poolRevenue(uint256 id) returns (uint256 publicTotal)",
  "function distribute(uint256 id, uint256 publicTotal)",
  "event RevenuePooled(uint256 indexed id, uint256 publicTotal)",
  "event DistributionTriggered(uint256 indexed id, uint256 publicTotal)",
]);

async function main() {
  const account = privateKeyToAccount(PRIVATE_KEY);
  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(RPC_URL),
  }).extend(publicActions);

  const deployed = JSON.parse(
    readFileSync(path.join(import.meta.dirname, "..", "deployed.sepolia.json"), "utf-8")
  ) as { USDC: `0x${string}`; WaterfallSplit: `0x${string}`; ScripWaterfall: `0x${string}` };

  const usdc = getContract({ address: deployed.USDC, abi: erc20Abi, client: walletClient });
  const decimals = await usdc.read.decimals();
  const amount = parseUnits(SEND_AMOUNT, decimals);

  console.log(`1) Sending ${SEND_AMOUNT} USDC to the unmodified 0xSplits Split ${deployed.WaterfallSplit}...`);
  const sendTx = await usdc.write.transfer([deployed.WaterfallSplit, amount]);
  await walletClient.waitForTransactionReceipt({ hash: sendTx });
  console.log("   tx:", sendTx);

  console.log("\n2) Calling the Split's own distribute() (unmodified 0xSplits logic)...");
  const splitParams = {
    recipients: [deployed.ScripWaterfall],
    allocations: [1n],
    totalAllocation: 1n,
    distributionIncentive: 0,
  };
  const split = getContract({ address: deployed.WaterfallSplit, abi: splitAbi, client: walletClient });
  const distributeTx = await split.write.distribute([splitParams, deployed.USDC, account.address]);
  const distReceipt = await walletClient.waitForTransactionReceipt({ hash: distributeTx });
  console.log("   Split distribute tx:", distributeTx, "status:", distReceipt.status);

  const pooledBalance = await usdc.read.balanceOf([deployed.ScripWaterfall]);
  console.log("   ScripWaterfall USDC balance after Split routing:", pooledBalance);

  console.log(`\n3) Calling ScripWaterfall.poolRevenue(${CAP_TABLE_ID})...`);
  const waterfall = getContract({ address: deployed.ScripWaterfall, abi: waterfallAbi, client: walletClient });
  const poolTx = await waterfall.write.poolRevenue([CAP_TABLE_ID]);
  const poolReceipt = await walletClient.waitForTransactionReceipt({ hash: poolTx });
  console.log("   poolRevenue tx:", poolTx, "status:", poolReceipt.status);

  console.log(
    `\n4) Calling ScripWaterfall.distribute(${CAP_TABLE_ID}, ${pooledBalance}) -- evaluating the sealed waterfall in the TEE...`
  );
  const distTx = await waterfall.write.distribute([CAP_TABLE_ID, pooledBalance]);
  const distTxReceipt = await walletClient.waitForTransactionReceipt({ hash: distTx });
  console.log("   distribute tx:", distTx, "status:", distTxReceipt.status, "gasUsed:", distTxReceipt.gasUsed);
}

main().catch((error) => {
  console.error("\nFAIL:", error);
  process.exitCode = 1;
});
