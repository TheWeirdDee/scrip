import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createWalletClient, http, publicActions, getContract, parseAbi } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { sepolia } from "viem/chains";
import { createViemHandleClient } from "@iexec-nox/handle";

// Phase 4: the auditor decrypts every owner's sealed percentage (the whole cap table) via the
// scoped grant from grantAuditor(). A random, ungranted address (the "public") must NOT be able to.
// Owners already proved (Phase 3) they can only decrypt their own payout, not each other's.

const RPC_URL = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";

const distributorAbi = parseAbi([
  "function getOwners(uint256 id) view returns (address[])",
  "function sealedPercentage(uint256 id, uint256 index) view returns (bytes32)",
]);

function client(privateKey: `0x${string}`) {
  const account = privateKeyToAccount(privateKey);
  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(RPC_URL),
  }).extend(publicActions);
  return { account, walletClient };
}

async function decryptWithRetry(
  handleClient: Awaited<ReturnType<typeof createViemHandleClient>>,
  handle: `0x${string}`,
  label: string
) {
  const maxAttempts = 12;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { value } = await handleClient.decrypt(handle);
      console.log(`${label}: SUCCESS decrypted =`, value, `(attempt ${attempt})`);
      return value as bigint;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt === maxAttempts) {
        console.log(`${label}: FAILED after ${maxAttempts} attempts (${msg})`);
        return undefined;
      }
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

async function main() {
  const deployed = JSON.parse(
    readFileSync(path.join(import.meta.dirname, "..", "deployed.sepolia.json"), "utf-8")
  ) as { ScripDistributor: `0x${string}`; capTableId: string };

  const auditor = client(process.env.AUDITOR_PRIVATE_KEY as `0x${string}`);
  // A throwaway address that was never granted anything, standing in for "the public."
  const outsiderPk = generatePrivateKey();
  const outsider = client(outsiderPk);

  console.log("Auditor:", auditor.account.address);
  console.log("Outsider (public, ungranted):", outsider.account.address);

  const distributorFor = (w: ReturnType<typeof client>["walletClient"]) =>
    getContract({ address: deployed.ScripDistributor, abi: distributorAbi, client: w });

  const owners = await distributorFor(auditor.walletClient).read.getOwners([
    BigInt(deployed.capTableId),
  ]);
  console.log("\nCap table owners (public):", owners);

  const handles: `0x${string}`[] = [];
  for (let i = 0; i < owners.length; i++) {
    const handle = (await distributorFor(auditor.walletClient).read.sealedPercentage([
      BigInt(deployed.capTableId),
      BigInt(i),
    ])) as `0x${string}`;
    handles.push(handle);
    console.log(`  owner[${i}] = ${owners[i]}: sealed % handle ${handle}`);
  }

  const handleClientAuditor = await createViemHandleClient(auditor.walletClient);
  const handleClientOutsider = await createViemHandleClient(outsider.walletClient);

  console.log("\n--- Auditor decrypts the WHOLE cap table (scoped grant) ---");
  const decrypted: (bigint | undefined)[] = [];
  for (let i = 0; i < handles.length; i++) {
    const value = await decryptWithRetry(handleClientAuditor, handles[i], `Auditor: owner[${i}]`);
    decrypted.push(value);
  }

  console.log("\n--- Outsider (public) must be DENIED on every handle ---");
  let publicLeaked = false;
  for (let i = 0; i < handles.length; i++) {
    try {
      const { value } = await handleClientOutsider.decrypt(handles[i]);
      console.log(`UNEXPECTED: outsider decrypted owner[${i}]:`, value, "-- THIS SHOULD NOT HAPPEN");
      publicLeaked = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`Outsider tried owner[${i}] -> correctly DENIED: ${msg}`);
    }
  }

  const allDecrypted = decrypted.every((v) => v !== undefined);
  const sum = decrypted.reduce((a, b) => (a ?? 0n) + (b ?? 0n), 0n);
  if (allDecrypted && !publicLeaked) {
    console.log(
      `\nPHASE 4 PASS: auditor decrypted the full sealed cap table (sum = ${sum} bps = ` +
        `${Number(sum) / 100}%); the public/outsider was denied on every handle; owners' own-only ` +
        `boundary already confirmed in Phase 3.`
    );
  } else {
    console.log("\nPHASE 4 FAIL: either auditor couldn't decrypt everything, or the public leaked.");
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("\nPHASE 4 FAIL:", error);
  process.exitCode = 1;
});
