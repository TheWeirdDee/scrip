import "dotenv/config";
import { createWalletClient, http, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { createViemHandleClient } from "@iexec-nox/handle";

// Retries decrypting an already-known handle, to measure ACL/TEE propagation lag
// after a deposit() tx has already been mined (see roundtrip.ts attempt 1 failure).

const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;
const RPC_URL = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const balanceHandle = process.argv[2] as `0x${string}`;

if (!balanceHandle) {
  throw new Error("Usage: tsx scripts/decrypt-only.ts <handle>");
}

async function main() {
  const account = privateKeyToAccount(PRIVATE_KEY);
  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(RPC_URL),
  }).extend(publicActions);
  const handleClient = await createViemHandleClient(walletClient);

  const maxAttempts = 20;
  const delayMs = 5000;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const t = new Date().toISOString();
    try {
      const { value, solidityType } = await handleClient.decrypt(balanceHandle);
      console.log(`[${t}] attempt ${attempt}: SUCCESS decrypted (${solidityType}) =`, value);
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`[${t}] attempt ${attempt}/${maxAttempts}: FAIL - ${msg}`);
      if (attempt === maxAttempts) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
