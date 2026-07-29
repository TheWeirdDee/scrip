"use client";

import { useEffect, useState } from "react";
import type { WalletState } from "@/app/lib/useWallet";
import {
  SCRIP_DISTRIBUTOR_ADDRESS,
  USDC_ADDRESS,
  scripDistributorAbi,
  erc20Abi,
} from "@/app/lib/contracts";
import { fetchScripState, type ScripState } from "@/app/lib/events";
import { shortAddr, formatUsdc, formatDate, etherscanAddress, etherscanTx } from "@/app/lib/format";

type TxStatus = { state: "idle" | "pending" | "done" | "error"; hash?: string; message?: string };

export function FounderPanel({ wallet }: { wallet: WalletState }) {
  const [scripState, setScripState] = useState<ScripState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [poolAmount, setPoolAmount] = useState<bigint | null>(null);
  const [splitAddr, setSplitAddr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeTableId, setActiveTableId] = useState<bigint | null>(null);
  const [poolTx, setPoolTx] = useState<TxStatus>({ state: "idle" });
  const [distributeTx, setDistributeTx] = useState<TxStatus>({ state: "idle" });

  const [auditorAddr, setAuditorAddr] = useState("");
  const [auditorTableId, setAuditorTableId] = useState("1");
  const [grantTx, setGrantTx] = useState<TxStatus>({ state: "idle" });

  const [rows, setRows] = useState([
    { owner: "", pct: "" },
    { owner: "", pct: "" },
  ]);
  const [createTx, setCreateTx] = useState<TxStatus & { step?: string }>({ state: "idle" });

  const refresh = async () => {
    if (!wallet.walletClient || !wallet.address) return;
    setLoading(true);
    try {
      const count = await wallet.walletClient.readContract({
        address: SCRIP_DISTRIBUTOR_ADDRESS,
        abi: scripDistributorAbi,
        functionName: "capTableCount",
      });

      const [state, split, balance] = await Promise.all([
        fetchScripState(wallet.walletClient, count),
        wallet.walletClient.readContract({
          address: SCRIP_DISTRIBUTOR_ADDRESS,
          abi: scripDistributorAbi,
          functionName: "splitAddress",
        }),
        wallet.walletClient.readContract({
          address: USDC_ADDRESS,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [SCRIP_DISTRIBUTOR_ADDRESS],
        }),
      ]);

      setScripState(state);
      setSplitAddr(split as string);
      setPoolAmount(balance);
      setLoadError(null);

      const own = state.capTables.filter((t) => t.founder.toLowerCase() === wallet.address!.toLowerCase());
      if (own.length > 0 && (activeTableId === null || !own.some((t) => t.id === activeTableId))) {
        setActiveTableId(own[own.length - 1].id);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.walletClient]);

  const copySplit = async () => {
    if (!splitAddr) return;
    await navigator.clipboard.writeText(splitAddr);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const pool = async () => {
    if (!wallet.walletClient || !wallet.address || activeTableId === null) return;
    setPoolTx({ state: "pending" });
    try {
      const hash = await wallet.walletClient.writeContract({
        address: SCRIP_DISTRIBUTOR_ADDRESS,
        abi: scripDistributorAbi,
        functionName: "poolRevenue",
        args: [activeTableId],
        account: wallet.address,
        chain: wallet.walletClient.chain,
      });
      await wallet.walletClient.waitForTransactionReceipt({ hash });
      setPoolTx({ state: "done", hash });
      await refresh();
    } catch (err) {
      setPoolTx({ state: "error", message: err instanceof Error ? err.message : String(err) });
    }
  };

  const distribute = async () => {
    if (!wallet.walletClient || !wallet.address || poolAmount === null || activeTableId === null) return;
    setDistributeTx({ state: "pending" });
    try {
      const hash = await wallet.walletClient.writeContract({
        address: SCRIP_DISTRIBUTOR_ADDRESS,
        abi: scripDistributorAbi,
        functionName: "distribute",
        args: [activeTableId, poolAmount],
        account: wallet.address,
        chain: wallet.walletClient.chain,
      });
      await wallet.walletClient.waitForTransactionReceipt({ hash });
      setDistributeTx({ state: "done", hash });
      await refresh();
    } catch (err) {
      setDistributeTx({ state: "error", message: err instanceof Error ? err.message : String(err) });
    }
  };

  const grantAuditor = async () => {
    if (!wallet.walletClient || !wallet.address || !auditorAddr) return;
    setGrantTx({ state: "pending" });
    try {
      const hash = await wallet.walletClient.writeContract({
        address: SCRIP_DISTRIBUTOR_ADDRESS,
        abi: scripDistributorAbi,
        functionName: "grantAuditor",
        args: [BigInt(auditorTableId), auditorAddr as `0x${string}`],
        account: wallet.address,
        chain: wallet.walletClient.chain,
      });
      await wallet.walletClient.waitForTransactionReceipt({ hash });
      setGrantTx({ state: "done", hash });
      await refresh();
    } catch (err) {
      setGrantTx({ state: "error", message: err instanceof Error ? err.message : String(err) });
    }
  };

  const createCapTable = async () => {
    if (!wallet.walletClient || !wallet.handleClient || !wallet.address) return;
    const valid = rows.filter((r) => r.owner && r.pct);
    if (valid.length === 0) return;
    setCreateTx({ state: "pending", step: "encrypting percentages in the browser…" });
    try {
      const handles: `0x${string}`[] = [];
      const proofs: `0x${string}`[] = [];
      for (const row of valid) {
        const { handle, handleProof } = await wallet.handleClient.encryptInput(
          BigInt(row.pct),
          "uint256",
          SCRIP_DISTRIBUTOR_ADDRESS
        );
        handles.push(handle);
        proofs.push(handleProof);
      }

      setCreateTx({ state: "pending", step: "creating cap table on-chain…" });
      const createHash = await wallet.walletClient.writeContract({
        address: SCRIP_DISTRIBUTOR_ADDRESS,
        abi: scripDistributorAbi,
        functionName: "createCapTable",
        args: [valid.map((r) => r.owner as `0x${string}`), handles, proofs],
        account: wallet.address,
        chain: wallet.walletClient.chain,
      });
      await wallet.walletClient.waitForTransactionReceipt({ hash: createHash });

      const newId = (await wallet.walletClient.readContract({
        address: SCRIP_DISTRIBUTOR_ADDRESS,
        abi: scripDistributorAbi,
        functionName: "capTableCount",
      })) as bigint;

      setCreateTx({ state: "pending", step: "locking percentages…" });
      const lockHash = await wallet.walletClient.writeContract({
        address: SCRIP_DISTRIBUTOR_ADDRESS,
        abi: scripDistributorAbi,
        functionName: "lockPercentages",
        args: [newId],
        account: wallet.address,
        chain: wallet.walletClient.chain,
      });
      await wallet.walletClient.waitForTransactionReceipt({ hash: lockHash });

      setCreateTx({ state: "done", hash: lockHash, step: `cap table #${newId} locked` });
      await refresh();
    } catch (err) {
      setCreateTx({ state: "error", message: err instanceof Error ? err.message : String(err) });
    }
  };

  if (!wallet.address) {
    return <p className="text-sm text-zinc-500">Connect a wallet to manage a cap table.</p>;
  }

  const myTables = scripState?.capTables.filter(
    (t) => t.founder.toLowerCase() === wallet.address!.toLowerCase()
  );
  const auditorsForEnteredId = scripState?.auditorGrants.filter(
    (a) => auditorTableId && a.id === BigInt(auditorTableId || "0")
  );

  return (
    <div className="flex flex-col gap-8 founder-panel">
      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Existing cap tables
        </h3>
        {loadError && <p className="text-sm text-red-400">{loadError}</p>}
        {!scripState ? (
          <p className="text-sm text-zinc-500">{loading ? "Loading…" : "…"}</p>
        ) : !myTables || myTables.length === 0 ? (
          <p className="text-sm text-zinc-500">None yet — create one below.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {myTables.map((t) => {
              const distributed = scripState.distributions
                .filter((d) => d.id === t.id)
                .reduce((sum, d) => sum + d.publicTotal, 0n);
              return (
                <div key={t.id.toString()} className="rounded-lg border border-white/10 px-4 py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Cap table #{t.id.toString()}</span>
                    <span className={t.locked ? "text-emerald-400 text-xs" : "text-amber-400 text-xs"}>
                      {t.locked ? "locked" : "unlocked"}
                    </span>
                  </div>
                  <ul className="mt-1 flex flex-col gap-1 text-zinc-500">
                    {t.owners.map((o) => (
                      <li key={o} className="font-mono text-xs">
                        {shortAddr(o)} — percentage sealed
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-zinc-500">
                    created {formatDate(t.createdAtMs)} · distributed to date: {formatUsdc(distributed)} USDC
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Fund the distributor (0xSplits)
        </h3>
        <p className="mb-3 text-sm text-zinc-500">
          Send test USDC to the Split below; 0xSplits routes it here unmodified. Then hit{" "}
          <span className="font-medium text-zinc-400">Pool revenue</span> to make it the public total.
        </p>
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-white/[.03] px-4 py-3">
          <span className="min-w-0 flex-1 truncate font-mono text-xs">
            {splitAddr ?? "…"}
          </span>
          <button
            onClick={copySplit}
            disabled={!splitAddr}
            className="rounded-full border border-white/15 px-3 py-1 text-xs font-medium hover:bg-white/[.06] disabled:opacity-50"
          >
            {copied ? "Copied" : "Copy"}
          </button>
          {splitAddr && (
            <a
              href={etherscanAddress(splitAddr)}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-white/15 px-3 py-1 text-xs font-medium hover:bg-white/[.06]"
            >
              Etherscan ↗
            </a>
          )}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Pool revenue &amp; distribute
          {activeTableId !== null && <span className="normal-case text-zinc-400"> (cap table #{activeTableId.toString()})</span>}
        </h3>
        <p className="mb-3 text-sm text-zinc-500">
          Pooled public total in ScripDistributor:{" "}
          <span className="font-mono">{poolAmount === null ? "…" : formatUsdc(poolAmount)}</span> USDC
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={pool}
            disabled={poolTx.state === "pending" || activeTableId === null}
            className="rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background hover:bg-zinc-200 disabled:opacity-50"
          >
            {poolTx.state === "pending" ? "Pooling…" : "Pool revenue"}
          </button>
          <button
            onClick={distribute}
            disabled={distributeTx.state === "pending" || !poolAmount || activeTableId === null}
            className="rounded-full border border-white/15 px-4 py-1.5 text-sm font-medium hover:bg-white/[.06] disabled:opacity-50"
          >
            {distributeTx.state === "pending"
              ? "Computing sealed payouts in the TEE…"
              : "Distribute (confidential payout)"}
          </button>
        </div>
        {distributeTx.state === "done" && (
          <p className="mt-2 text-sm text-emerald-400">
            Distributed ({" "}
            <a href={etherscanTx(distributeTx.hash!)} target="_blank" rel="noreferrer" className="underline">
              tx
            </a>{" "}
            ). Each owner can now decrypt their own payout in the Owner tab.
          </p>
        )}
        {(poolTx.state === "error" || distributeTx.state === "error") && (
          <p className="mt-2 text-sm text-red-400">{poolTx.message ?? distributeTx.message}</p>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Grant auditor
        </h3>
        <div className="flex flex-wrap gap-2">
          <input
            value={auditorTableId}
            onChange={(e) => setAuditorTableId(e.target.value)}
            placeholder="cap table id"
            className="w-28 rounded-md border border-white/15 bg-transparent px-3 py-1.5 text-sm"
          />
          <input
            value={auditorAddr}
            onChange={(e) => setAuditorAddr(e.target.value)}
            placeholder="auditor address (0x…)"
            className="min-w-0 flex-1 rounded-md border border-white/15 bg-transparent px-3 py-1.5 font-mono text-sm"
          />
          <button
            onClick={grantAuditor}
            disabled={grantTx.state === "pending"}
            className="rounded-full border border-white/15 px-4 py-1.5 text-sm font-medium hover:bg-white/[.06] disabled:opacity-50"
          >
            {grantTx.state === "pending" ? "Granting…" : "Grant"}
          </button>
        </div>
        {grantTx.state === "done" && (
          <p className="mt-2 text-sm text-emerald-400">Auditor granted.</p>
        )}
        {grantTx.state === "error" && <p className="mt-2 text-sm text-red-400">{grantTx.message}</p>}

        <div className="mt-3">
          {auditorsForEnteredId && auditorsForEnteredId.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {auditorsForEnteredId.map((a) => (
                <li key={`${a.txHash}-${a.logIndex}`} className="font-mono text-xs text-zinc-500">
                  {shortAddr(a.auditor)} — granted {formatDate(a.atMs)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-zinc-600">No auditors granted yet for cap table #{auditorTableId || "?"}.</p>
          )}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Create a new sealed cap table
        </h3>
        <p className="mb-3 text-sm text-zinc-500">
          Owner addresses are public; percentages are encrypted in your browser before anything
          touches the chain.
        </p>
        <div className="flex flex-col gap-2">
          {rows.map((row, i) => (
            <div key={i} className="flex gap-2">
              <input
                value={row.owner}
                onChange={(e) => {
                  const next = [...rows];
                  next[i] = { ...next[i], owner: e.target.value };
                  setRows(next);
                }}
                placeholder="owner address (0x…)"
                className="min-w-0 flex-1 rounded-md border border-white/15 bg-transparent px-3 py-1.5 font-mono text-sm"
              />
              <input
                value={row.pct}
                onChange={(e) => {
                  const next = [...rows];
                  next[i] = { ...next[i], pct: e.target.value };
                  setRows(next);
                }}
                placeholder="bps (6000 = 60%)"
                className="w-40 rounded-md border border-white/15 bg-transparent px-3 py-1.5 text-sm"
              />
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            onClick={() => setRows([...rows, { owner: "", pct: "" }])}
            className="rounded-full border border-white/15 px-3 py-1 text-xs font-medium hover:bg-white/[.06]"
          >
            + add owner
          </button>
          <button
            onClick={createCapTable}
            disabled={createTx.state === "pending"}
            className="rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background hover:bg-zinc-200 disabled:opacity-50"
          >
            {createTx.state === "pending" ? createTx.step ?? "Working…" : "Create & lock"}
          </button>
        </div>
        {createTx.state === "done" && (
          <p className="mt-2 text-sm text-emerald-400">{createTx.step}</p>
        )}
        {createTx.state === "error" && (
          <p className="mt-2 text-sm text-red-400">{createTx.message}</p>
        )}
      </section>
    </div>
  );
}
