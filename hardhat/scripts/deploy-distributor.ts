import { network } from "hardhat";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

async function main() {
  const { viem } = await network.connect({ network: "sepolia" });

  const deployedPath = path.join(import.meta.dirname, "..", "deployed.sepolia.json");
  const existing = JSON.parse(readFileSync(deployedPath, "utf-8")) as {
    USDC: `0x${string}`;
    ConfidentialUSDC: `0x${string}`;
  };

  const distributor = await viem.deployContract("ScripDistributor", [
    existing.USDC,
    existing.ConfidentialUSDC,
  ]);
  console.log("ScripDistributor deployed to:", distributor.address);

  writeFileSync(
    deployedPath,
    JSON.stringify({ ...existing, ScripDistributor: distributor.address }, null, 2)
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
