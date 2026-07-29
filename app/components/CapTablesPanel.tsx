"use client";

import { useEffect, useState } from "react";
import type { WalletState } from "@/app/lib/useWallet";
import { SCRIP_DISTRIBUTOR_ADDRESS, scripDistributorAbi } from "@/app/lib/contracts";
import { fetchScripState, type ScripState } from "@/app/lib/events";
import { shortAddr, formatUsdc, formatDate, etherscanAddress, etherscanTx } from "@/app/lib/format";

type TxStatus = { state: "idle" | "pending" | "done" | "error"; hash?: string; message?: string };

export function CapTablesPanel({ wallet }: { wallet: WalletState }) {
  const [scripState, setScripState] = useState<ScripState | null>(null);
  const [splitAddr, setSplitAddr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<bigint | null>(null);

  const [auditorAddr, setAuditorAddr] = useState("");
  const [grantTx, setGrantTx] = useState<TxStatus>({ state: "idle" });

  const load = async () => {
    if (!wallet.walletClient || !wallet.address) return;
    setLoading(true);
    try {
      const count = await wallet.walletClient.readContract({
        address: SCRIP_DISTRIBUTOR_ADDRESS,
        abi: scripDistributorAbi,
        functionName: "capTableCount",
      });
      const [state, split] = await Promise.all([
        fetchScripState(wallet.walletClient, count),
        wallet.walletClient.readContract({
          address: SCRIP_DISTRIBUTOR_ADDRESS,
          abi: scripDistributorAbi,
          functionName: "splitAddress",
        }),
      ]);
      setScripState(state);
      setSplitAddr(split as string);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.walletClient, wallet.address]);

  const grantAuditor = async (id: bigint) => {
    if (!wallet.walletClient || !wallet.address || !auditorAddr) return;
    setGrantTx({ state: "pending" });
    try {
      const hash = await wallet.walletClient.writeContract({
        address: SCRIP_DISTRIBUTOR_ADDRESS,
        abi: scripDistributorAbi,
        functionName: "grantAuditor",
        args: [id, auditorAddr as `0x${string}`],
        account: wallet.address,
        chain: wallet.walletClient.chain,
      });
      await wallet.walletClient.waitForTransactionReceipt({ hash });
      setGrantTx({ state: "done", hash });
      setAuditorAddr("");
      await load();
    } catch (err) {
      setGrantTx({ state: "error", message: err instanceof Error ? err.message : String(err) });
    }
  };

  if (!wallet.address) {
    return <p className="text-sm text-zinc-500">Connect a wallet to view cap tables.</p>;
  }

  if (loading && !scripState) {
    return <p className="text-sm text-zinc-500">Loading cap tables from Sepolia…</p>;
  }

  if (error) {
    return <p className="text-sm text-red-400">{error}</p>;
  }

  const myTables = (scripState?.capTables ?? []).filter(
    (t) => t.founder.toLowerCase() === wallet.address!.toLowerCase()
  );

  if (myTables.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No cap tables yet. Create one from Overview.
      </p>
    );
  }

  const table = selected !== null ? myTables.find((t) => t.id === selected) : null;

  if (table) {
    const pooled = (scripState?.pooled ?? []).filter((p) => p.id === table.id);
    const distributions = (scripState?.distributions ?? []).filter((d) => d.id === table.id);
    const totalDistributed = distributions.reduce((sum, d) => sum + d.publicTotal, 0n);
    const auditors = (scripState?.auditorGrants ?? []).filter((a) => a.id === table.id);

    return (
      <div className="flex flex-col gap-6">
        <button
          onClick={() => setSelected(null)}
          className="w-fit text-xs text-zinc-500 hover:text-zinc-300"
        >
          ← all cap tables
        </button>

        <div className="rounded-lg border border-white/10 px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="font-medium">Cap table #{table.id.toString()}</span>
            <span className={table.locked ? "text-xs text-emerald-400" : "text-xs text-amber-400"}>
              {table.locked ? "locked" : "unlocked"}
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            created {formatDate(table.createdAtMs)}
            {table.lockedAtMs ? ` · locked ${formatDate(table.lockedAtMs)}` : ""}
          </p>
          {splitAddr && (
            <p className="mt-2 text-xs text-zinc-500">
              routed via 0xSplits:{" "}
              <a href={etherscanAddress(splitAddr)} target="_blank" rel="noreferrer" className="font-mono underline">
                {shortAddr(splitAddr)}
              </a>
            </p>
          )}
          <p className="mt-2 text-xs text-zinc-500">total distributed to date: {formatUsdc(totalDistributed)} USDC</p>
        </div>

        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Owners</h4>
          <ul className="flex flex-col gap-1">
            {table.owners.map((o) => (
              <li key={o} className="font-mono text-xs text-zinc-500">
                {o} — percentage sealed
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Revenue pooled ({pooled.length})
          </h4>
          {pooled.length === 0 ? (
            <p className="text-xs text-zinc-600">None yet.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {pooled.map((p) => (
                <li key={`${p.txHash}-${p.logIndex}`} className="text-xs text-zinc-500">
                  {formatUsdc(p.publicTotal)} USDC pooled · {formatDate(p.atMs)} ·{" "}
                  <a href={etherscanTx(p.txHash)} target="_blank" rel="noreferrer" className="underline">
                    tx
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Distributions ({distributions.length})
          </h4>
          {distributions.length === 0 ? (
            <p className="text-xs text-zinc-600">None yet.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {distributions.map((d) => (
                <li key={`${d.txHash}-${d.logIndex}`} className="text-xs text-zinc-500">
                  {formatUsdc(d.publicTotal)} USDC distributed · {formatDate(d.atMs)} ·{" "}
                  <a href={etherscanTx(d.txHash)} target="_blank" rel="noreferrer" className="underline">
                    tx
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Grant auditor</h4>
          <div className="flex flex-wrap gap-2">
            <input
              value={auditorAddr}
              onChange={(e) => setAuditorAddr(e.target.value)}
              placeholder="auditor address (0x…)"
              className="min-w-0 flex-1 rounded-md border border-white/15 bg-transparent px-3 py-1.5 font-mono text-sm"
            />
            <button
              onClick={() => grantAuditor(table.id)}
              disabled={grantTx.state === "pending"}
              className="rounded-full border border-white/15 px-4 py-1.5 text-sm font-medium hover:bg-white/[.06] disabled:opacity-50"
            >
              {grantTx.state === "pending" ? "Granting…" : "Grant"}
            </button>
          </div>
          {grantTx.state === "error" && <p className="mt-2 text-xs text-red-400">{grantTx.message}</p>}
          <div className="mt-3">
            {auditors.length === 0 ? (
              <p className="text-xs text-zinc-600">No auditors granted yet.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {auditors.map((a) => (
                  <li key={`${a.txHash}-${a.logIndex}`} className="font-mono text-xs text-zinc-500">
                    {shortAddr(a.auditor)} — granted {formatDate(a.atMs)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {myTables.map((t) => {
        const distributed = (scripState?.distributions ?? [])
          .filter((d) => d.id === t.id)
          .reduce((sum, d) => sum + d.publicTotal, 0n);
        return (
          <button
            key={t.id.toString()}
            onClick={() => setSelected(t.id)}
            className="w-full rounded-lg border border-white/10 px-4 py-3 text-left text-sm hover:bg-white/[.03]"
          >
            <div className="flex items-center justify-between">
              <span className="font-medium">Cap table #{t.id.toString()}</span>
              <span className={t.locked ? "text-xs text-emerald-400" : "text-xs text-amber-400"}>
                {t.locked ? "locked" : "unlocked"}
              </span>
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              {t.owners.length} owner{t.owners.length === 1 ? "" : "s"} · created {formatDate(t.createdAtMs)} ·
              {" "}distributed {formatUsdc(distributed)} USDC
              {splitAddr && <> · split {shortAddr(splitAddr)}</>}
            </p>
          </button>
        );
      })}
    </div>
  );
}
