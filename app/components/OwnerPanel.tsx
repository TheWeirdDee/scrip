"use client";

import { useEffect, useState } from "react";
import type { WalletState } from "@/app/lib/useWallet";
import { CONFIDENTIAL_USDC_ADDRESS, SCRIP_DISTRIBUTOR_ADDRESS, confidentialUsdcAbi, scripDistributorAbi } from "@/app/lib/contracts";
import { DecryptField } from "@/app/components/DecryptField";
import { fetchScripState, type ScripState } from "@/app/lib/events";
import { formatDate, formatUsdc, etherscanTx } from "@/app/lib/format";

export function OwnerPanel({ wallet, showHistory = false }: { wallet: WalletState; showHistory?: boolean }) {
  const [balanceHandle, setBalanceHandle] = useState<`0x${string}` | null>(null);
  const [scripState, setScripState] = useState<ScripState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!wallet.walletClient || !wallet.address) return;
    let cancelled = false;
    const load = async () => {
      try {
        const [handle, count] = await Promise.all([
          wallet.walletClient!.readContract({
            address: CONFIDENTIAL_USDC_ADDRESS,
            abi: confidentialUsdcAbi,
            functionName: "confidentialBalanceOf",
            args: [wallet.address!],
          }),
          wallet.walletClient!.readContract({
            address: SCRIP_DISTRIBUTOR_ADDRESS,
            abi: scripDistributorAbi,
            functionName: "capTableCount",
          }),
        ]);
        const state = await fetchScripState(wallet.walletClient!, count);
        if (cancelled) return;
        setBalanceHandle(handle as `0x${string}`);
        setScripState(state);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [wallet.walletClient, wallet.address]);

  if (!wallet.address) return <p className="text-sm text-zinc-500">Connect an owner wallet to view its confidential balance.</p>;

  const address = wallet.address.toLowerCase();
  const ownerTableIds = new Set(
    (scripState?.capTables ?? [])
      .filter((table) => table.owners.some((owner) => owner.toLowerCase() === address))
      .map((table) => table.id)
  );
  const distributions = (scripState?.distributions ?? []).filter((event) => ownerTableIds.has(event.id));

  return (
    <div className="flex flex-col gap-6 owner-panel">
      <div>
        <p className="text-sm text-zinc-500">
          This reads <span className="font-mono">confidentialBalanceOf(you)</span>. Only this wallet can authorize decryption; the founder and other owners cannot reveal it.
        </p>
        <p className="mt-2 text-xs text-zinc-600">Nox decryption on Sepolia may take 10–15 seconds while the TEE resolves the sealed handle.</p>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {balanceHandle ? (
        <DecryptField label="Your confidential cUSDC balance" handle={balanceHandle} handleClient={wallet.handleClient} formatAsUsdc />
      ) : (
        <p className="text-sm text-zinc-500">Loading your balance handle…</p>
      )}

      {showHistory && <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Payout activity for your cap tables</h3>
        {!scripState ? <p className="text-sm text-zinc-500">Loading distribution history from Sepolia…</p>
        : distributions.length === 0 ? <p className="text-sm text-zinc-500">No distributions have been triggered for a cap table containing this wallet.</p>
        : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="text-xs uppercase tracking-wide text-zinc-500"><th className="pb-2 pr-4 font-medium">Cap table</th><th className="pb-2 pr-4 font-medium">Public total</th><th className="pb-2 pr-4 font-medium">Timestamp</th><th className="pb-2 font-medium">Transaction</th></tr></thead><tbody>{distributions.map((event) => <tr key={`${event.txHash}-${event.logIndex}`} className="border-t border-white/10"><td className="py-3 pr-4">#{event.id.toString()}</td><td className="py-3 pr-4 font-mono">{formatUsdc(event.publicTotal)} USDC</td><td className="py-3 pr-4 text-zinc-500">{formatDate(event.atMs)}</td><td className="py-3"><a href={etherscanTx(event.txHash)} target="_blank" rel="noreferrer" className="underline text-zinc-400">{event.txHash.slice(0, 10)}…</a></td></tr>)}</tbody></table></div>}
        <p className="mt-3 text-xs text-zinc-600">Public totals prove that a distribution occurred. Your individual share remains sealed and is reflected only in the decryptable balance above.</p>
      </section>}
    </div>
  );
}