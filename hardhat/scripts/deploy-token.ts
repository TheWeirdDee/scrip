import { network } from "hardhat";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

// Real Circle USDC on Ethereum Sepolia (verified: symbol "USDC", 6 decimals).
const SEPOLIA_USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";

async function main() {
  const { viem } = await network.connect({ network: "sepolia" });

  const confidentialUSDC = await viem.deployContract("ConfidentialUSDC", [SEPOLIA_USDC]);
  console.log("ConfidentialUSDC deployed to:", confidentialUSDC.address);

  const deployedPath = path.join(import.meta.dirname, "..", "deployed.sepolia.json");
  const existing = JSON.parse(readFileSync(deployedPath, "utf-8"));
  writeFileSync(
    deployedPath,
    JSON.stringify(
      { ...existing, USDC: SEPOLIA_USDC, ConfidentialUSDC: confidentialUSDC.address },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
