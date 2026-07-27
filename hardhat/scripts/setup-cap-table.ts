import "dotenv/config";
import { readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createWalletClient, http, publicActions, getContract, parseAbi } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { sepolia } from "viem/chains";
import { createViemHandleClient } from "@iexec-nox/handle";

// Phase 2: sealed cap table. Two owners: the founder wallet itself (60%) and a second, generated
// demo wallet (40%) — its private key is persisted to .env as OWNER_B_PRIVATE_KEY so Phase 3/4 can
// have that owner decrypt their own payout (decrypt is gas-free EIP-712, so it needs no ETH).

const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;
const RPC_URL = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const envPath = path.join(import.meta.dirname, "..", ".env");

function getOrCreateOwnerB(): `0x${string}` {
  if (process.env.OWNER_B_PRIVATE_KEY) {
    return privateKeyToAccount(process.env.OWNER_B_PRIVATE_KEY as `0x${string}`).address;
  }
  const pk = generatePrivateKey();
  const address = privateKeyToAccount(pk).address;
  appendFileSync(envPath, `\nOWNER_B_PRIVATE_KEY=${pk}\nOWNER_B_ADDRESS=${address}\n`);
  console.log("Generated demo OWNER_B:", address, "(private key saved to hardhat/.env)");
  return address;
}

const distributorAbi = parseAbi([
  "function createCapTable(address[] owners, bytes32[] sealedPctHandles, bytes[] proofs) returns (uint256 id)",
  "function lockPercentages(uint256 id)",
  "event CapTableCreated(uint256 indexed id, address indexed founder, address[] owners)",
]);

async function main() {
  const account = privateKeyToAccount(PRIVATE_KEY);
  const ownerB = getOrCreateOwnerB();
  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(RPC_URL),
  }).extend(publicActions);

  const deployedPath = path.join(import.meta.dirname, "..", "deployed.sepolia.json");
  const deployed = JSON.parse(readFileSync(deployedPath, "utf-8")) as {
    ScripDistributor: `0x${string}`;
  };

  const handleClient = await createViemHandleClient(walletClient);
  const owners = [account.address, ownerB] as const;
  const pctBps = [6000n, 4000n]; // 60% / 40%, sealed

  console.log("Owners:", owners);
  console.log("Encrypting sealed ownership percentages...");
  const handles: `0x${string}`[] = [];
  const proofs: `0x${string}`[] = [];
  for (let i = 0; i < owners.length; i++) {
    const { handle, handleProof } = await handleClient.encryptInput(
      pctBps[i],
      "uint256",
      deployed.ScripDistributor
    );
    console.log(`  owner[${i}] = ${owners[i]}: sealed handle ${handle}`);
    handles.push(handle);
    proofs.push(handleProof);
  }

  const distributor = getContract({
    address: deployed.ScripDistributor,
    abi: distributorAbi,
    client: walletClient,
  });

  console.log("\nCalling createCapTable(...)...");
  const createTx = await distributor.write.createCapTable([[...owners], handles, proofs]);
  const receipt = await walletClient.waitForTransactionReceipt({ hash: createTx });
  console.log("createCapTable tx:", createTx, "status:", receipt.status);

  // capTableCount increments from 0, so this is the 1st (and here, only) cap table.
  const id = 1n;

  console.log("\nCalling lockPercentages(id)...");
  const lockTx = await distributor.write.lockPercentages([id]);
  await walletClient.waitForTransactionReceipt({ hash: lockTx });
  console.log("lockPercentages tx:", lockTx);

  writeFileSync(
    deployedPath,
    JSON.stringify({ ...deployed, capTableId: id.toString(), owners: [...owners] }, null, 2)
  );
  console.log("\nPHASE 2 cap table set: owners public, percentages sealed on-chain.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
