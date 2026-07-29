"use client";

import { useEffect, useState } from "react";
import type { WalletState } from "@/app/lib/useWallet";
import { SCRIP_DISTRIBUTOR_ADDRESS, scripDistributorAbi } from "@/app/lib/contracts";
import { fetchScripState, type ScripState } from "@/app/lib/events";
import { formatUsdc, formatDate, etherscanTx } from "@/app/lib/format";

export function DistributionsPanel({ wallet }: { wallet: WalletState }) {
  const [scripState, setScripState] = useState<ScripState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!wallet.walletClient || !wallet.address) return;
      setLoading(true);
      try {
        const count = await wallet.walletClient.readContract({
          address: SCRIP_DISTRIBUTOR_ADDRESS,
          abi: scripDistributorAbi,
          functionName: "capTableCount",
        });
        const state = await fetchScripState(wallet.walletClient, count);
        setScripState(state);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    };
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [wallet.walletClient, wallet.address]);

  if (!wallet.address) {
    return <p className="text-sm text-zinc-500">Connect a wallet to view distribution history.</p>;
  }

  if (loading && !scripState) {
    return <p className="text-sm text-zinc-500">Loading distribution history from Sepolia…</p>;
  }

  if (error) {
    return <p className="text-sm text-red-400">{error}</p>;
  }

  const myTableIds = new Set(
    (scripState?.capTables ?? [])
      .filter((t) => t.founder.toLowerCase() === wallet.address!.toLowerCase())
      .map((t) => t.id)
  );
  const rows = (scripState?.distributions ?? []).filter((d) => myTableIds.has(d.id));

  if (rows.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No distributions yet. Pool revenue and distribute from Overview or a cap table.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-zinc-500">
            <th className="pb-2 pr-4 font-medium">#</th>
            <th className="pb-2 pr-4 font-medium">Cap table</th>
            <th className="pb-2 pr-4 font-medium">Public total</th>
            <th className="pb-2 pr-4 font-medium">Timestamp</th>
            <th className="pb-2 pr-4 font-medium">Tx</th>
            <th className="pb-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d, i) => (
            <tr key={`${d.txHash}-${d.logIndex}`} className="border-t border-white/10">
              <td className="py-2 pr-4 text-zinc-500">{i + 1}</td>
              <td className="py-2 pr-4">#{d.id.toString()}</td>
              <td className="py-2 pr-4 font-mono">{formatUsdc(d.publicTotal)} USDC</td>
              <td className="py-2 pr-4 text-zinc-500">{formatDate(d.atMs)}</td>
              <td className="py-2 pr-4">
                <a href={etherscanTx(d.txHash)} target="_blank" rel="noreferrer" className="underline text-zinc-400">
                  {d.txHash.slice(0, 10)}…
                </a>
              </td>
              <td className="py-2 text-emerald-400">Confirmed</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
