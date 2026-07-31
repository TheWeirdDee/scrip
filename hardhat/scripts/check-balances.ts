import "dotenv/config";
import { createPublicClient, http, parseAbi, formatEther, formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { readFileSync } from "node:fs";
import path from "node:path";

const RPC_URL = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const account = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`);
const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
]);

async function main() {
  const client = createPublicClient({ chain: sepolia, transport: http(RPC_URL) });
  const deployed = JSON.parse(
    readFileSync(path.join(import.meta.dirname, "..", "deployed.sepolia.json"), "utf-8")
  ) as { USDC: `0x${string}` };

  const ethBal = await client.getBalance({ address: account.address });
  const usdcBal = await client.readContract({
    address: deployed.USDC,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  });

  console.log("Deployer:", account.address);
  console.log("Sepolia ETH:", formatEther(ethBal));
  console.log("Sepolia USDC:", formatUnits(usdcBal, 6));
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
