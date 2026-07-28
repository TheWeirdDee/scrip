"use client";

import { useEffect, useState } from "react";
import type { WalletState } from "@/app/lib/useWallet";
import { CONFIDENTIAL_USDC_ADDRESS, confidentialUsdcAbi } from "@/app/lib/contracts";
import { DecryptField } from "@/app/components/DecryptField";

export function OwnerPanel({ wallet }: { wallet: WalletState }) {
  const [balanceHandle, setBalanceHandle] = useState<`0x${string}` | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!wallet.walletClient || !wallet.address) return;
    wallet.walletClient
      .readContract({
        address: CONFIDENTIAL_USDC_ADDRESS,
        abi: confidentialUsdcAbi,
        functionName: "confidentialBalanceOf",
        args: [wallet.address],
      })
      .then((handle) => setBalanceHandle(handle as `0x${string}`))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [wallet.walletClient, wallet.address]);

  if (!wallet.address) {
    return (
      <p className="text-sm text-zinc-500">
        Connect the wallet of an owner in the cap table to view your own confidential balance.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4 owner-panel">
      <p className="text-sm text-zinc-500">
        This decrypts <span className="font-mono">confidentialBalanceOf(you)</span> — only you can
        authorize this decryption; nobody else, including the founder, can see this number for your
        address.
      </p>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {balanceHandle ? (
        <DecryptField
          label="Your confidential cUSDC balance"
          handle={balanceHandle}
          handleClient={wallet.handleClient}
          formatAsUsdc
        />
      ) : (
        <p className="text-sm text-zinc-500">Loading your balance handle…</p>
      )}
    </div>
  );
}
