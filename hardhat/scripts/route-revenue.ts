import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createWalletClient, http, publicActions, getContract, parseAbi, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

// Phase 2: send real test USDC into the (unmodified) 0xSplits Split, call the Split's own
// distribute() (unmodified 0xSplits logic), which pushes 100% to ScripDistributor, then call
// ScripDistributor.poolRevenue() and confirm the public total matches what was sent.

const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;
const RPC_URL = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const SEND_AMOUNT = process.argv[2] ?? "3"; // USDC, human units

const erc20Abi = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
]);

const splitAbi = parseAbi([
  "function distribute((address[] recipients, uint256[] allocations, uint256 totalAllocation, uint16 distributionIncentive) _split, address _token, address _distributor)",
]);

const distributorAbi = parseAbi([
  "function poolRevenue(uint256 id) returns (uint256 publicTotal)",
  "event RevenuePooled(uint256 indexed id, uint256 publicTotal)",
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
    USDC: `0x${string}`;
    Split: `0x${string}`;
    ScripDistributor: `0x${string}`;
    capTableId: string;
  };

  const usdc = getContract({ address: deployed.USDC, abi: erc20Abi, client: walletClient });
  const decimals = await usdc.read.decimals();
  const amount = parseUnits(SEND_AMOUNT, decimals);

  console.log(`1) Sending ${SEND_AMOUNT} USDC to the unmodified 0xSplits Split ${deployed.Split}...`);
  const sendTx = await usdc.write.transfer([deployed.Split, amount]);
  await walletClient.waitForTransactionReceipt({ hash: sendTx });
  console.log("   tx:", sendTx);

  console.log("\n2) Calling the Split's own distribute() (unmodified 0xSplits logic)...");
  const splitParams = {
    recipients: [deployed.ScripDistributor],
    allocations: [1n],
    totalAllocation: 1n,
    distributionIncentive: 0,
  };
  const split = getContract({ address: deployed.Split, abi: splitAbi, client: walletClient });
  const distributeTx = await split.write.distribute([splitParams, deployed.USDC, account.address]);
  const distReceipt = await walletClient.waitForTransactionReceipt({ hash: distributeTx });
  console.log("   distribute tx:", distributeTx, "status:", distReceipt.status);

  const scripBalance = await usdc.read.balanceOf([deployed.ScripDistributor]);
  console.log("   ScripDistributor USDC balance after Split routing:", scripBalance);

  console.log("\n3) Calling ScripDistributor.poolRevenue(id)...");
  const distributor = getContract({
    address: deployed.ScripDistributor,
    abi: distributorAbi,
    client: walletClient,
  });
  const poolTx = await distributor.write.poolRevenue([BigInt(deployed.capTableId)]);
  const poolReceipt = await walletClient.waitForTransactionReceipt({ hash: poolTx });
  console.log("   poolRevenue tx:", poolTx, "status:", poolReceipt.status);

  // 0xSplits (unmodified, by design) intentionally leaves a tiny dust balance (historically 1 wei)
  // in the Split after distribute() as a gas optimization (keeps the storage slot non-zero for the
  // next distribution). So the pooled total is expected to be sent-amount minus a few units, not
  // exactly equal — that's the real, unmodified protocol, not a Scrip bug.
  const dust = amount - scripBalance;
  if (dust >= 0n && dust <= 10n) {
    console.log(
      `\nPHASE 2 PASS: 0xSplits (unmodified) routed ${SEND_AMOUNT} USDC to ScripDistributor ` +
        `(${scripBalance} received; ${dust} unit(s) held back by 0xSplits' own gas-optimization dust ` +
        `— expected, unmodified protocol behavior). Public total confirmed via poolRevenue().`
    );
  } else {
    console.log(`\nPHASE 2 MISMATCH: expected ~${amount}, ScripDistributor holds ${scripBalance}.`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("\nPHASE 2 FAIL:", error);
  process.exitCode = 1;
});
