import "dotenv/config";
import { readFileSync } from "node:fs";
import { appendFileSync } from "node:fs";
import path from "node:path";
import { createWalletClient, http, publicActions, getContract, parseAbi } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { sepolia } from "viem/chains";

// Phase 4: founder grants an auditor a scoped view of the sealed cap table (each owner's sealed
// percentage). The auditor can then derive the whole cap table + every payout (percentages x the
// public total) off-chain — that's the intended accountability mechanism. Public still sees only
// the total; owners still see only their own.

const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;
const RPC_URL = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const envPath = path.join(import.meta.dirname, "..", ".env");

function getOrCreateAuditor(): `0x${string}` {
  if (process.env.AUDITOR_PRIVATE_KEY) {
    return privateKeyToAccount(process.env.AUDITOR_PRIVATE_KEY as `0x${string}`).address;
  }
  const pk = generatePrivateKey();
  const address = privateKeyToAccount(pk).address;
  appendFileSync(envPath, `\nAUDITOR_PRIVATE_KEY=${pk}\nAUDITOR_ADDRESS=${address}\n`);
  console.log("Generated demo AUDITOR:", address, "(private key saved to hardhat/.env)");
  return address;
}

const distributorAbi = parseAbi([
  "function grantAuditor(uint256 id, address auditor)",
  "event AuditorGranted(uint256 indexed id, address auditor)",
]);

async function main() {
  const account = privateKeyToAccount(PRIVATE_KEY);
  const auditor = getOrCreateAuditor();
  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(RPC_URL),
  }).extend(publicActions);

  const deployed = JSON.parse(
    readFileSync(path.join(import.meta.dirname, "..", "deployed.sepolia.json"), "utf-8")
  ) as { ScripDistributor: `0x${string}`; capTableId: string };

  console.log("Founder:", account.address);
  console.log("Auditor:", auditor);

  const distributor = getContract({
    address: deployed.ScripDistributor,
    abi: distributorAbi,
    client: walletClient,
  });

  const tx = await distributor.write.grantAuditor([BigInt(deployed.capTableId), auditor]);
  const receipt = await walletClient.waitForTransactionReceipt({ hash: tx });
  console.log("grantAuditor tx:", tx, "status:", receipt.status);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
