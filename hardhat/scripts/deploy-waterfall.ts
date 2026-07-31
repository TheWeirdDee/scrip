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

  const waterfall = await viem.deployContract("ScripWaterfall", [
    existing.USDC,
    existing.ConfidentialUSDC,
  ]);
  console.log("ScripWaterfall deployed to:", waterfall.address);

  writeFileSync(
    deployedPath,
    JSON.stringify({ ...existing, ScripWaterfall: waterfall.address }, null, 2)
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
