import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createWalletClient, http, publicActions, getContract, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { createViemHandleClient } from "@iexec-nox/handle";

// Phase 1: wrap real Sepolia USDC 1:1 into the Nox-confidential ERC-7984 token, then
// have the recipient (the deployer, here) decrypt their own new confidential balance via ACL.

const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;
const RPC_URL = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const WRAP_AMOUNT = process.argv[2] ?? "1"; // USDC, human units

const { USDC: usdcAddress, ConfidentialUSDC: cUsdcAddress } = JSON.parse(
  readFileSync(path.join(import.meta.dirname, "..", "deployed.sepolia.json"), "utf-8")
) as { USDC: `0x${string}`; ConfidentialUSDC: `0x${string}` };

const erc20Abi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;

const wrapperAbi = [
  {
    type: "function",
    name: "wrap",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "function",
    name: "confidentialBalanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "bytes32" }],
  },
] as const;

async function main() {
  const account = privateKeyToAccount(PRIVATE_KEY);
  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(RPC_URL),
  }).extend(publicActions);

  console.log("Owner:", account.address);
  console.log("USDC:", usdcAddress);
  console.log("ConfidentialUSDC:", cUsdcAddress);

  const usdc = getContract({ address: usdcAddress, abi: erc20Abi, client: walletClient });
  const wrapper = getContract({ address: cUsdcAddress, abi: wrapperAbi, client: walletClient });
  const handleClient = await createViemHandleClient(walletClient);

  const decimals = await usdc.read.decimals();
  const amount = parseUnits(WRAP_AMOUNT, decimals);
  const usdcBalance = await usdc.read.balanceOf([account.address]);
  console.log(`\nUSDC balance: ${usdcBalance} (need ${amount})`);
  if (usdcBalance < amount) {
    throw new Error("Not enough Sepolia USDC. Fund the deployer from faucet.circle.com first.");
  }

  console.log(`\n1) Approving wrapper for ${WRAP_AMOUNT} USDC...`);
  const approveTx = await usdc.write.approve([cUsdcAddress, amount]);
  await walletClient.waitForTransactionReceipt({ hash: approveTx });
  console.log("   approve tx:", approveTx);

  console.log(`\n2) Wrapping ${WRAP_AMOUNT} USDC -> confidential balance...`);
  const wrapTx = await wrapper.write.wrap([account.address, amount]);
  const receipt = await walletClient.waitForTransactionReceipt({ hash: wrapTx });
  console.log("   wrap tx:", wrapTx, "status:", receipt.status);

  console.log("\n3) Reading + decrypting confidential balance via ACL...");
  const balanceHandle = (await wrapper.read.confidentialBalanceOf([
    account.address,
  ])) as `0x${string}`;
  console.log("   balance handle:", balanceHandle);

  const maxAttempts = 12;
  const delayMs = 5000;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { value, solidityType } = await handleClient.decrypt(balanceHandle);
      console.log(`   decrypted confidential balance (${solidityType}) on attempt ${attempt}:`, value);
      if (value === amount) {
        console.log("\nPHASE 1 PASS: real USDC wrapped 1:1 into the confidential token.");
      } else {
        console.log(`\nPHASE 1 MISMATCH: expected ${amount}, got ${value}.`);
        process.exitCode = 1;
      }
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`   attempt ${attempt}/${maxAttempts} not ready yet (${msg}); retrying in ${delayMs}ms...`);
      if (attempt === maxAttempts) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

main().catch((error) => {
  console.error("\nPHASE 1 FAIL:", error);
  process.exitCode = 1;
});
