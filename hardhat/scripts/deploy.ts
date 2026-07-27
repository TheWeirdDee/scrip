import { network } from "hardhat";
import { writeFileSync } from "node:fs";
import path from "node:path";

async function main() {
  const { viem } = await network.connect({ network: "sepolia" });

  const piggyBank = await viem.deployContract("ConfidentialPiggyBank", []);
  console.log("ConfidentialPiggyBank deployed to:", piggyBank.address);

  writeFileSync(
    path.join(import.meta.dirname, "..", "deployed.sepolia.json"),
    JSON.stringify({ ConfidentialPiggyBank: piggyBank.address }, null, 2)
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
