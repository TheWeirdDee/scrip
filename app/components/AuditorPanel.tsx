"use client";

import { useState } from "react";
import type { WalletState } from "@/app/lib/useWallet";
import { SCRIP_DISTRIBUTOR_ADDRESS, scripDistributorAbi } from "@/app/lib/contracts";
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
        address: SCRIP_DISTRIBUTOR_ADDRESS,
        abi: scripDistributorAbi,
        functionName: "getOwners",
        args: [BigInt(tableId)],
      })) as string[];

      const next: { owner: string; handle: `0x${string}` }[] = [];
      for (let i = 0; i < owners.length; i++) {
        const handle = (await wallet.walletClient.readContract({
          address: SCRIP_DISTRIBUTOR_ADDRESS,
          abi: scripDistributorAbi,
          functionName: "sealedPercentage",
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
        Connect a granted auditor wallet to view a scoped cap table.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-zinc-500">
        If the founder has granted this wallet auditor access to a cap table, every owner&apos;s
        sealed percentage below will decrypt. If not, every one of them will be denied — same as
        anyone else on the public internet.
      </p>
      <div className="flex gap-2">
        <input
          value={tableId}
          onChange={(e) => setTableId(e.target.value)}
          placeholder="cap table id"
          className="w-32 rounded-md border border-white/15 bg-transparent px-3 py-1.5 text-sm"
        />
        <button
          onClick={load}
          disabled={loading}
          className="rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background hover:bg-zinc-200 disabled:opacity-50"
        >
          {loading ? "Loading…" : "Load sealed cap table"}
        </button>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {rows && (
        <div className="flex flex-col gap-2">
          {rows.map((row) => (
            <div key={row.owner}>
              <div className="mb-1 font-mono text-xs text-zinc-500">{short(row.owner)}</div>
              <DecryptField
                label="sealed ownership %"
                handle={row.handle}
                handleClient={wallet.handleClient}
                formatAsBps
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
