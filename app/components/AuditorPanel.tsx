"use client";

import { useState } from "react";
import type { WalletState } from "@/app/lib/useWallet";
import { SCRIP_WATERFALL_ADDRESS, scripWaterfallAbi } from "@/app/lib/contracts";
import { DecryptField } from "@/app/components/DecryptField";

function short(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function AuditorPanel({ wallet }: { wallet: WalletState }) {
  const [tableId, setTableId] = useState("1");
  const [rows, setRows] = useState<{ owner: string; handle: `0x${string}` }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!wallet.walletClient) return;
    setLoading(true);
    setError(null);
    try {
      const owners = (await wallet.walletClient.readContract({
        address: SCRIP_WATERFALL_ADDRESS,
        abi: scripWaterfallAbi,
        functionName: "getOwners",
        args: [BigInt(tableId)],
      })) as string[];

      const next: { owner: string; handle: `0x${string}` }[] = [];
      for (let i = 0; i < owners.length; i++) {
        const handle = (await wallet.walletClient.readContract({
          address: SCRIP_WATERFALL_ADDRESS,
          abi: scripWaterfallAbi,
          functionName: "sealedPayoutOf",
          args: [BigInt(tableId), BigInt(i)],
        })) as `0x${string}`;
        next.push({ owner: owners[i], handle });
      }
      setRows(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  if (!wallet.address) {
    return (
      <p className="text-sm text-zinc-500">
        Connect a granted auditor wallet to view a scoped waterfall&apos;s payouts.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4 auditor-panel">
      <p className="text-sm text-zinc-500">
        If the founder has granted this wallet auditor access to a waterfall, every owner&apos;s
        computed payout below will decrypt. If not, every one of them will be denied — same as
        anyone else on the public internet.
      </p>
      <div className="flex gap-2">
        <input
          value={tableId}
          onChange={(e) => setTableId(e.target.value)}
          placeholder="waterfall id"
          className="w-32 rounded-md border border-white/15 bg-transparent px-3 py-1.5 text-sm"
        />
        <button
          onClick={load}
          disabled={loading}
          className="rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background hover:bg-zinc-200 disabled:opacity-50"
        >
          {loading ? "Loading…" : "Load sealed waterfall"}
        </button>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {rows && (
        <div className="flex flex-col gap-2">
          {rows.map((row) => (
            <div key={row.owner}>
              <div className="mb-1 font-mono text-xs text-zinc-500">{short(row.owner)}</div>
              <DecryptField
                label="computed payout"
                handle={row.handle}
                handleClient={wallet.handleClient}
                formatAsUsdc
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
