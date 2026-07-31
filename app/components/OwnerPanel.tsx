"use client";

import { useEffect, useState } from "react";
import type { WalletState } from "@/app/lib/useWallet";
import { CONFIDENTIAL_USDC_ADDRESS, SCRIP_WATERFALL_ADDRESS, confidentialUsdcAbi, scripWaterfallAbi } from "@/app/lib/contracts";
import { DecryptField } from "@/app/components/DecryptField";
import { fetchWaterfallState, type WaterfallState } from "@/app/lib/waterfallEvents";
import { formatDate, formatUsdc, etherscanTx } from "@/app/lib/format";

export function OwnerPanel({ wallet, showHistory = false }: { wallet: WalletState; showHistory?: boolean }) {
  const [balanceHandle, setBalanceHandle] = useState<`0x${string}` | null>(null);
  const [waterfallState, setWaterfallState] = useState<WaterfallState | null>(null);
  const [payoutHandles, setPayoutHandles] = useState<Record<string, `0x${string}`>>({});
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
            address: SCRIP_WATERFALL_ADDRESS,
            abi: scripWaterfallAbi,
            functionName: "capTableCount",
          }),
        ]);
        const state = await fetchWaterfallState(wallet.walletClient!, count);
        if (cancelled) return;
        setBalanceHandle(handle as `0x${string}`);
        setWaterfallState(state);
        setError(null);

        const address = wallet.address!.toLowerCase();
        const mine = state.capTables.filter((table) => table.owners.some((o) => o.toLowerCase() === address));
        const entries = await Promise.all(
          mine.map(async (table) => {
            const ownerIndex = table.owners.findIndex((o) => o.toLowerCase() === address);
            const payoutHandle = await wallet.walletClient!.readContract({
              address: SCRIP_WATERFALL_ADDRESS,
              abi: scripWaterfallAbi,
              functionName: "sealedPayoutOf",
              args: [table.id, BigInt(ownerIndex)],
            });
            return [table.id.toString(), payoutHandle as `0x${string}`] as const;
          })
        );
        if (!cancelled) setPayoutHandles(Object.fromEntries(entries));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [wallet.walletClient, wallet.address]);

  if (!wallet.address) return <p className="text-sm text-zinc-500">Connect an owner wallet to view its confidential balance.</p>;

  const address = wallet.address.toLowerCase();
  const myTables = (waterfallState?.capTables ?? []).filter((table) =>
    table.owners.some((owner) => owner.toLowerCase() === address)
  );
  const ownerTableIds = new Set(myTables.map((table) => table.id));
  const distributions = (waterfallState?.distributions ?? []).filter((event) => ownerTableIds.has(event.id));

  return (
    <div className="flex flex-col gap-6 owner-panel">
      <div>
        <p className="text-sm text-zinc-500">
          Only you can see your share. Not other owners, not the founder, not the public — but the
          total is provable to everyone.
        </p>
        <p className="mt-2 text-xs text-zinc-600">
          This reads <span className="font-mono">confidentialBalanceOf(you)</span> — only this wallet can authorize decryption. Nox decryption on Sepolia may take 10–15 seconds while the TEE resolves the sealed handle.
        </p>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {balanceHandle ? (
        <DecryptField label="Your confidential cUSDC balance" handle={balanceHandle} handleClient={wallet.handleClient} formatAsUsdc />
      ) : (
        <p className="text-sm text-zinc-500">Loading your balance handle…</p>
      )}

      {showHistory && <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Your waterfalls</h3>
        {!waterfallState ? <p className="text-sm text-zinc-500">Loading from Sepolia…</p>
        : myTables.length === 0 ? <p className="text-sm text-zinc-500">This wallet is not listed as an owner on any waterfall.</p>
        : <div className="flex flex-col gap-3">
            {myTables.map((table) => {
              const payoutHandle = payoutHandles[table.id.toString()];
              return (
                <div key={table.id.toString()} className="rounded-lg border border-white/10 px-4 py-3">
                  <p className="mb-2 text-xs text-zinc-500">
                    Waterfall #{table.id.toString()} — {table.tierCount} tier{table.tierCount === 1 ? "" : "s"}, terms sealed
                  </p>
                  {payoutHandle ? (
                    <DecryptField
                      label="Your computed payout from this waterfall"
                      handle={payoutHandle}
                      handleClient={wallet.handleClient}
                      formatAsUsdc
                    />
                  ) : (
                    <p className="text-xs text-zinc-600">Not distributed yet.</p>
                  )}
                </div>
              );
            })}
          </div>}

        <h3 className="mb-3 mt-6 text-sm font-semibold uppercase tracking-wide text-zinc-500">Distribution activity</h3>
        {!waterfallState ? <p className="text-sm text-zinc-500">Loading distribution history from Sepolia…</p>
        : distributions.length === 0 ? <p className="text-sm text-zinc-500">No distributions have been triggered for a waterfall containing this wallet.</p>
        : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="text-xs uppercase tracking-wide text-zinc-500"><th className="pb-2 pr-4 font-medium">Waterfall</th><th className="pb-2 pr-4 font-medium">Public total</th><th className="pb-2 pr-4 font-medium">Timestamp</th><th className="pb-2 font-medium">Transaction</th></tr></thead><tbody>{distributions.map((event) => <tr key={`${event.txHash}-${event.logIndex}`} className="border-t border-white/10"><td className="py-3 pr-4">#{event.id.toString()}</td><td className="py-3 pr-4 font-mono">{formatUsdc(event.publicTotal)} USDC</td><td className="py-3 pr-4 text-zinc-500">{formatDate(event.atMs)}</td><td className="py-3"><a href={etherscanTx(event.txHash)} target="_blank" rel="noreferrer" className="underline text-zinc-400">{event.txHash.slice(0, 10)}…</a></td></tr>)}</tbody></table></div>}
        <p className="mt-3 text-xs text-zinc-600">Public totals prove that a distribution occurred. Your individual computed payout remains sealed and is reflected only in the decryptable fields above.</p>
      </section>}
    </div>
  );
}
