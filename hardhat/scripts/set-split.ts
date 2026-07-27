import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createWalletClient, http, publicActions, getContract, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;
const RPC_URL = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";

async function main() {
  const account = privateKeyToAccount(PRIVATE_KEY);
  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(RPC_URL),
  }).extend(publicActions);

  const deployed = JSON.parse(
    readFileSync(path.join(import.meta.dirname, "..", "deployed.sepolia.json"), "utf-8")
  ) as { ScripDistributor: `0x${string}`; Split: `0x${string}` };

  const distributor = getContract({
    address: deployed.ScripDistributor,
    abi: parseAbi(["function setSplit(address split_)"]),
    client: walletClient,
  });
  const tx = await distributor.write.setSplit([deployed.Split]);
  await walletClient.waitForTransactionReceipt({ hash: tx });
  console.log("setSplit tx:", tx, "-> Split", deployed.Split);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
