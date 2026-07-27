import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createWalletClient, http, publicActions, getContract, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

// Phase 3 (GO/NO-GO): distribute() wraps the pooled public USDC into the confidential token and
// pays each owner a sealed amount computed from their sealed percentage, entirely inside the Nox
// TEE: payout_i = (sealedPct_i * publicTotal) / 10_000.

const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;
const RPC_URL = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";

const erc20Abi = parseAbi(["function balanceOf(address account) view returns (uint256)"]);
const distributorAbi = parseAbi([
  "function distribute(uint256 id, uint256 publicTotal)",
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
  ) as { USDC: `0x${string}`; ScripDistributor: `0x${string}`; capTableId: string };

  const usdc = getContract({ address: deployed.USDC, abi: erc20Abi, client: walletClient });
  const publicTotal = await usdc.read.balanceOf([deployed.ScripDistributor]);
  console.log("Pooled public total in ScripDistributor:", publicTotal);

  const distributor = getContract({
    address: deployed.ScripDistributor,
    abi: distributorAbi,
    client: walletClient,
  });

  console.log(
    `\nCalling distribute(id=${deployed.capTableId}, publicTotal=${publicTotal})...\n` +
      "(wraps USDC -> confidential, computes sealed per-owner payouts in the Nox TEE, confidentialTransfers each)"
  );
  const tx = await distributor.write.distribute([BigInt(deployed.capTableId), publicTotal]);
  const receipt = await walletClient.waitForTransactionReceipt({ hash: tx });
  console.log("distribute tx:", tx, "status:", receipt.status, "gasUsed:", receipt.gasUsed);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
