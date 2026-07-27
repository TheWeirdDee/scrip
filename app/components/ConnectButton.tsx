"use client";

import type { WalletState } from "@/app/lib/useWallet";

function short(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function ConnectButton({ wallet }: { wallet: WalletState }) {
  if (wallet.address) {
    return (
      <div className="flex items-center gap-2 rounded-full border border-black/10 bg-black/[.03] px-4 py-1.5 text-sm font-mono">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        {short(wallet.address)}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={wallet.connect}
        disabled={wallet.connecting}
        className="rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50"
      >
        {wallet.connecting ? "Connecting…" : "Connect wallet"}
      </button>
      {wallet.error && <span className="text-xs text-red-500">{wallet.error}</span>}
    </div>
  );
}
