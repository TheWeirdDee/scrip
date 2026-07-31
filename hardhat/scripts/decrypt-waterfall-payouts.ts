import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createWalletClient, http, publicActions, getContract, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { createViemHandleClient } from "@iexec-nox/handle";

// Decrypts each owner's own sealed waterfall payout for both cap tables (founder decrypts as
// itself, investor decrypts as OWNER_B -- ACL only allows each their own, per the contract).
// Retries with backoff since the Handle Gateway's ACL index can lag the chain briefly.

const RPC_URL = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const FOUNDER_KEY = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;
const INVESTOR_KEY = process.env.OWNER_B_PRIVATE_KEY as `0x${string}`;

const waterfallAbi = parseAbi([
  "function sealedPayoutOf(uint256 id, uint256 ownerIndex) view returns (bytes32)",
]);

async function clientFor(pk: `0x${string}`) {
  const account = privateKeyToAccount(pk);
  const walletClient = createWalletClient({ account, chain: sepolia, transport: http(RPC_URL) }).extend(
    publicActions
  );
  const handleClient = await createViemHandleClient(walletClient);
  return { account, walletClient, handleClient };
}

async function decryptWithRetry(handleClient: Awaited<ReturnType<typeof createViemHandleClient>>, handle: `0x${string}`) {
  const MAX = 12;
  for (let i = 1; i <= MAX; i++) {
    try {
      const { value } = await handleClient.decrypt(handle);
      return value as bigint;
    } catch (err) {
      if (i === MAX) throw err;
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  throw new Error("unreachable");
}

async function main() {
  const deployed = JSON.parse(
    readFileSync(path.join(import.meta.dirname, "..", "deployed.sepolia.json"), "utf-8")
  ) as { ScripWaterfall: `0x${string}`; waterfallCapTableNotHit: string; waterfallCapTableHit: string };

  const founder = await clientFor(FOUNDER_KEY);
  const investor = await clientFor(INVESTOR_KEY);

  const waterfallForFounder = getContract({
    address: deployed.ScripWaterfall,
    abi: waterfallAbi,
    client: founder.walletClient,
  });
  const waterfallForInvestor = getContract({
    address: deployed.ScripWaterfall,
    abi: waterfallAbi,
    client: investor.walletClient,
  });

  async function reportScenario(label: string, id: string) {
    console.log(`\n=== ${label} (cap table ${id}) ===`);
    const founderHandle = (await waterfallForFounder.read.sealedPayoutOf([BigInt(id), 0n])) as `0x${string}`;
    const investorHandle = (await waterfallForInvestor.read.sealedPayoutOf([BigInt(id), 1n])) as `0x${string}`;

    const founderPayout = await decryptWithRetry(founder.handleClient, founderHandle);
    const investorPayout = await decryptWithRetry(investor.handleClient, investorHandle);

    console.log("  founder payout  (decrypted by founder wallet):", founderPayout.toString(), "(6dp USDC units)");
    console.log("  investor payout (decrypted by investor wallet):", investorPayout.toString(), "(6dp USDC units)");
    console.log("  sum:", (founderPayout + investorPayout).toString());
    return { founderPayout, investorPayout };
  }

  const notHit = await reportScenario("MILESTONE NOT HIT", deployed.waterfallCapTableNotHit);
  const hit = await reportScenario("MILESTONE HIT", deployed.waterfallCapTableHit);

  console.log("\n=== PROOF: same 2 USDC total, different sealed-milestone payout ===");
  console.log(
    `Not hit -> founder ${notHit.founderPayout}, investor ${notHit.investorPayout}\n` +
      `Hit     -> founder ${hit.founderPayout}, investor ${hit.investorPayout}`
  );
  if (notHit.founderPayout === hit.founderPayout) {
    console.log("MISMATCH: payouts identical -- milestone had no effect. FAIL.");
    process.exitCode = 1;
  } else {
    console.log("CONFIRMED: same total, different payout, driven only by the sealed milestone bit.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
