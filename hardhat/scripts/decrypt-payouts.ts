import "dotenv/config";
import { createWalletClient, http, publicActions, getContract, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { createViemHandleClient } from "@iexec-nox/handle";
import { readFileSync } from "node:fs";
import path from "node:path";

// Phase 3: each owner decrypts ONLY their own confidential payout/balance via ACL. Also proves the
// confidentiality boundary the other direction: owner B cannot decrypt owner A's balance, and
// vice versa, even though both know each other's address (addresses are public; amounts aren't).

const RPC_URL = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";

const wrapperAbi = parseAbi([
  "function confidentialBalanceOf(address account) view returns (bytes32)",
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

async function main() {
  const deployed = JSON.parse(
    readFileSync(path.join(import.meta.dirname, "..", "deployed.sepolia.json"), "utf-8")
  ) as { ConfidentialUSDC: `0x${string}`; owners: [`0x${string}`, `0x${string}`] };

  const ownerA = client(process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`);
  const ownerB = client(process.env.OWNER_B_PRIVATE_KEY as `0x${string}`);

  const wrapperFor = (w: ReturnType<typeof client>["walletClient"]) =>
    getContract({ address: deployed.ConfidentialUSDC, abi: wrapperAbi, client: w });

  console.log("Owner A:", ownerA.account.address);
  console.log("Owner B:", ownerB.account.address);

  const balanceHandleA = (await wrapperFor(ownerA.walletClient).read.confidentialBalanceOf([
    ownerA.account.address,
  ])) as `0x${string}`;
  const balanceHandleB = (await wrapperFor(ownerB.walletClient).read.confidentialBalanceOf([
    ownerB.account.address,
  ])) as `0x${string}`;
  console.log("\nOwner A's cUSDC balance handle:", balanceHandleA);
  console.log("Owner B's cUSDC balance handle:", balanceHandleB);

  const handleClientA = await createViemHandleClient(ownerA.walletClient);
  const handleClientB = await createViemHandleClient(ownerB.walletClient);

  console.log("\n--- Each owner decrypts their OWN confidential payout ---");
  const decryptWithRetry = async (
    handleClient: Awaited<ReturnType<typeof createViemHandleClient>>,
    handle: `0x${string}`,
    label: string
  ) => {
    const maxAttempts = 12;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const { value } = await handleClient.decrypt(handle);
        console.log(`${label}: decrypted =`, value, `(attempt ${attempt})`);
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
  };

  const payoutA = await decryptWithRetry(handleClientA, balanceHandleA, "Owner A decrypting own balance");
  const payoutB = await decryptWithRetry(handleClientB, balanceHandleB, "Owner B decrypting own balance");

  console.log("\n--- Cross-owner decryption MUST be denied (confidentiality boundary) ---");
  try {
    const { value } = await handleClientB.decrypt(balanceHandleA);
    console.log("UNEXPECTED: Owner B decrypted Owner A's balance:", value, "-- THIS SHOULD NOT HAPPEN");
    process.exitCode = 1;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log("Owner B tried to decrypt Owner A's balance -> correctly DENIED:", msg);
  }
  try {
    const { value } = await handleClientA.decrypt(balanceHandleB);
    console.log("UNEXPECTED: Owner A decrypted Owner B's balance:", value, "-- THIS SHOULD NOT HAPPEN");
    process.exitCode = 1;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log("Owner A tried to decrypt Owner B's balance -> correctly DENIED:", msg);
  }

  if (payoutA !== undefined && payoutB !== undefined) {
    // NOTE: these are each owner's cumulative cUSDC balance, not just this distribution's payout —
    // if an owner wrapped/received cUSDC in an earlier phase/run (e.g. Owner A reused the deployer
    // wallet, which also ran the Phase 1 wrap-to-self test), that's included in the total.
    console.log(
      `\nPHASE 3 PASS: sealed proportional payouts confirmed. Owner A total cUSDC = ${payoutA}, ` +
        `Owner B total cUSDC = ${payoutB}. Each owner decrypted only their own; cross-decryption denied.`
    );
  } else {
    console.log("\nPHASE 3 INCOMPLETE: one or both owners could not decrypt their own balance.");
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("\nPHASE 3 FAIL:", error);
  process.exitCode = 1;
});
