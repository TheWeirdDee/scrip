import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createWalletClient, http, publicActions, getContract } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { createViemHandleClient } from "@iexec-nox/handle";

// Phase 0: prove ONE sealed value round-trips through the Nox TEE on Sepolia.
// encrypt(42) -> ConfidentialPiggyBank.deposit(handle, proof) -> TEE adds it to
// the sealed balance -> owner decrypts the new balance via ACL. Expect 42n back.

const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
if (!PRIVATE_KEY) {
  throw new Error("Set DEPLOYER_PRIVATE_KEY in hardhat/.env");
}

const RPC_URL =
  process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";

const { ConfidentialPiggyBank: contractAddress } = JSON.parse(
  readFileSync(path.join(import.meta.dirname, "..", "deployed.sepolia.json"), "utf-8")
) as { ConfidentialPiggyBank: `0x${string}` };

const abi = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "inputHandle", type: "bytes32" },
      { name: "inputProof", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "balance",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bytes32" }],
  },
] as const;

async function main() {
  const account = privateKeyToAccount(PRIVATE_KEY as `0x${string}`);
  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(RPC_URL),
  }).extend(publicActions);

  console.log("Deployer / owner:", account.address);
  console.log("ConfidentialPiggyBank:", contractAddress);

  const handleClient = await createViemHandleClient(walletClient);
  const contract = getContract({ address: contractAddress, abi, client: walletClient });

  const depositAmount = 42n;
  console.log(`\n1) Encrypting ${depositAmount} for ${contractAddress}...`);
  const { handle, handleProof } = await handleClient.encryptInput(
    depositAmount,
    "uint256",
    contractAddress
  );
  console.log("   handle:", handle);

  console.log("\n2) Submitting deposit() on-chain (TEE Runner will compute the add)...");
  const txHash = await contract.write.deposit([handle, handleProof]);
  console.log("   tx:", txHash);
  const receipt = await walletClient.waitForTransactionReceipt({ hash: txHash });
  console.log("   mined in block", receipt.blockNumber, "status:", receipt.status);

  console.log("\n3) Reading sealed balance handle and decrypting via ACL...");
  const balanceHandle = (await contract.read.balance()) as `0x${string}`;
  console.log("   balance handle:", balanceHandle);

  const maxAttempts = 12;
  const delayMs = 5000;
  let value: bigint | string | boolean | undefined;
  let solidityType: string | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await handleClient.decrypt(balanceHandle);
      value = result.value;
      solidityType = result.solidityType;
      console.log(`   decrypted balance (${solidityType}) on attempt ${attempt}:`, value);
      break;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`   attempt ${attempt}/${maxAttempts} not ready yet (${msg}); retrying in ${delayMs}ms...`);
      if (attempt === maxAttempts) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  if (value === depositAmount) {
    console.log("\nPHASE 0 PASS: sealed value round-tripped through Nox TEE on Sepolia.");
  } else {
    console.log(
      `\nPHASE 0 MISMATCH: expected ${depositAmount}, got ${value}. Round trip is NOT reliable.`
    );
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("\nPHASE 0 FAIL:", error);
  process.exitCode = 1;
});
