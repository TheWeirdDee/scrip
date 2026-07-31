"use client";

import { useEffect, useState } from "react";
import type { WalletState } from "@/app/lib/useWallet";
import {
  SCRIP_WATERFALL_ADDRESS,
  USDC_ADDRESS,
  scripWaterfallAbi,
  splitAbi,
  WATERFALL_SPLIT_PARAMS,
} from "@/app/lib/contracts";
import { fetchWaterfallState, type WaterfallState } from "@/app/lib/waterfallEvents";
import { shortAddr, formatUsdc, formatDate, etherscanAddress, etherscanTx } from "@/app/lib/format";

type TxStatus = { state: "idle" | "pending" | "done" | "error"; hash?: string; message?: string };

type TierKind = "recoup" | "split";
type Gate = "always" | "onHit" | "onMiss";

interface TierRow {
  beneficiary: number; // index into owners[]
  kind: TierKind;
  amount: string; // recoup: whole USDC (e.g. "0.4"); split: bps (e.g. "7000" = 70%)
  gate: Gate;
}

const GATE_LABEL: Record<Gate, string> = {
  always: "Always",
  onHit: "Only if milestone met",
  onMiss: "Only if milestone NOT met",
};

export function FounderPanel({ wallet }: { wallet: WalletState }) {
  const [waterfallState, setWaterfallState] = useState<WaterfallState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [poolAmount, setPoolAmount] = useState<bigint | null>(null);
  const [splitAddr, setSplitAddr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeTableId, setActiveTableId] = useState<bigint | null>(null);
  const [poolTx, setPoolTx] = useState<TxStatus>({ state: "idle" });
  const [distributeTx, setDistributeTx] = useState<TxStatus>({ state: "idle" });
  const [routeTx, setRouteTx] = useState<TxStatus>({ state: "idle" });

  const [auditorAddr, setAuditorAddr] = useState("");
  const [auditorTableId, setAuditorTableId] = useState("1");
  const [grantTx, setGrantTx] = useState<TxStatus>({ state: "idle" });

  const [owners, setOwners] = useState(["", ""]);
  const [milestoneMet, setMilestoneMet] = useState(false);
  const [tiers, setTiers] = useState<TierRow[]>([
    { beneficiary: 0, kind: "split", amount: "10000", gate: "always" },
  ]);
  const [createTx, setCreateTx] = useState<TxStatus & { step?: string }>({ state: "idle" });

  const refresh = async () => {
    if (!wallet.walletClient || !wallet.address) return;
    setLoading(true);
    try {
      const count = await wallet.walletClient.readContract({
        address: SCRIP_WATERFALL_ADDRESS,
        abi: scripWaterfallAbi,
        functionName: "capTableCount",
      });

      const [state, split] = await Promise.all([
        fetchWaterfallState(wallet.walletClient, count),
        wallet.walletClient.readContract({
          address: SCRIP_WATERFALL_ADDRESS,
          abi: scripWaterfallAbi,
          functionName: "splitAddress",
        }),
      ]);

      setWaterfallState(state);
      setSplitAddr(split as string);
      setLoadError(null);

      const own = state.capTables.filter((t) => t.founder.toLowerCase() === wallet.address!.toLowerCase());
      const resolvedId =
        activeTableId !== null && own.some((t) => t.id === activeTableId)
          ? activeTableId
          : own.length > 0
            ? own[own.length - 1].id
            : null;
      if (resolvedId !== activeTableId) setActiveTableId(resolvedId);

      // Pooled-for-THIS-waterfall total (not the raw shared contract balance, which may also
      // include other founders' not-yet-pooled deposits — see pooledUnspent on the contract).
      if (resolvedId !== null) {
        const pooled = await wallet.walletClient.readContract({
          address: SCRIP_WATERFALL_ADDRESS,
          abi: scripWaterfallAbi,
          functionName: "pooledUnspent",
          args: [resolvedId],
        });
        setPoolAmount(pooled as bigint);
      } else {
        setPoolAmount(null);
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

  const routeSplit = async () => {
    if (!wallet.walletClient || !wallet.address || !splitAddr) return;
    setRouteTx({ state: "pending" });
    try {
      const hash = await wallet.walletClient.writeContract({
        address: splitAddr as `0x${string}`,
        abi: splitAbi,
        functionName: "distribute",
        args: [WATERFALL_SPLIT_PARAMS, USDC_ADDRESS, wallet.address],
        account: wallet.address,
        chain: wallet.walletClient.chain,
      });
      await wallet.walletClient.waitForTransactionReceipt({ hash });
      setRouteTx({ state: "done", hash });
      await refresh();
    } catch (err) {
      setRouteTx({ state: "error", message: err instanceof Error ? err.message : String(err) });
    }
  };

  const pool = async () => {
    if (!wallet.walletClient || !wallet.address || activeTableId === null) return;
    setPoolTx({ state: "pending" });
    try {
      const hash = await wallet.walletClient.writeContract({
        address: SCRIP_WATERFALL_ADDRESS,
        abi: scripWaterfallAbi,
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
        address: SCRIP_WATERFALL_ADDRESS,
        abi: scripWaterfallAbi,
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
        address: SCRIP_WATERFALL_ADDRESS,
        abi: scripWaterfallAbi,
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

  const moveTier = (index: number, dir: -1 | 1) => {
    const next = [...tiers];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setTiers(next);
  };

  const createWaterfall = async () => {
    if (!wallet.walletClient || !wallet.handleClient || !wallet.address) return;
    const validOwners = owners.filter((o) => o.trim());
    if (validOwners.length === 0 || tiers.length === 0) return;
    setCreateTx({ state: "pending", step: "encrypting deal terms in the browser…" });
    try {
      const gateBool = (gate: Gate) => (gate === "always" ? true : gate === "onHit" ? milestoneMet : !milestoneMet);

      const tierInputs = [];
      for (const tier of tiers) {
        const absCapUnits = tier.kind === "recoup" ? BigInt(Math.round(Number(tier.amount || "0") * 1_000_000)) : 0n;
        const ratioBpsUnits = tier.kind === "split" ? BigInt(tier.amount || "0") : 0n;

        const absCap = await wallet.handleClient.encryptInput(absCapUnits, "uint256", SCRIP_WATERFALL_ADDRESS);
        const ratioBps = await wallet.handleClient.encryptInput(ratioBpsUnits, "uint256", SCRIP_WATERFALL_ADDRESS);
        const milestone = await wallet.handleClient.encryptInput(gateBool(tier.gate), "bool", SCRIP_WATERFALL_ADDRESS);

        tierInputs.push({
          beneficiary: BigInt(tier.beneficiary),
          absCap: absCap.handle,
          absCapProof: absCap.handleProof,
          ratioBps: ratioBps.handle,
          ratioBpsProof: ratioBps.handleProof,
          milestone: milestone.handle,
          milestoneProof: milestone.handleProof,
        });
      }

      setCreateTx({ state: "pending", step: "creating the waterfall on-chain…" });
      const createHash = await wallet.walletClient.writeContract({
        address: SCRIP_WATERFALL_ADDRESS,
        abi: scripWaterfallAbi,
        functionName: "createCapTable",
        args: [validOwners as `0x${string}`[], tierInputs],
        account: wallet.address,
        chain: wallet.walletClient.chain,
      });
      await wallet.walletClient.waitForTransactionReceipt({ hash: createHash });

      const newId = (await wallet.walletClient.readContract({
        address: SCRIP_WATERFALL_ADDRESS,
        abi: scripWaterfallAbi,
        functionName: "capTableCount",
      })) as bigint;

      setCreateTx({ state: "pending", step: "locking the waterfall…" });
      const lockHash = await wallet.walletClient.writeContract({
        address: SCRIP_WATERFALL_ADDRESS,
        abi: scripWaterfallAbi,
        functionName: "lockWaterfall",
        args: [newId],
        account: wallet.address,
        chain: wallet.walletClient.chain,
      });
      await wallet.walletClient.waitForTransactionReceipt({ hash: lockHash });

      setCreateTx({ state: "done", hash: lockHash, step: `waterfall #${newId} locked` });
      await refresh();
    } catch (err) {
      setCreateTx({ state: "error", message: err instanceof Error ? err.message : String(err) });
    }
  };

  if (!wallet.address) {
    return <p className="text-sm text-zinc-500">Connect a wallet to manage a waterfall.</p>;
  }

  const myTables = waterfallState?.capTables.filter(
    (t) => t.founder.toLowerCase() === wallet.address!.toLowerCase()
  );
  const auditorsForEnteredId = waterfallState?.auditorGrants.filter(
    (a) => auditorTableId && a.id === BigInt(auditorTableId || "0")
  );

  return (
    <div className="flex flex-col gap-8 founder-panel">
      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Existing waterfalls
        </h3>
        {loadError && <p className="text-sm text-red-400">{loadError}</p>}
        {!waterfallState ? (
          <p className="text-sm text-zinc-500">{loading ? "Loading…" : "…"}</p>
        ) : !myTables || myTables.length === 0 ? (
          <p className="text-sm text-zinc-500">None yet — build one below.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {myTables.map((t) => {
              const distributed = waterfallState.distributions
                .filter((d) => d.id === t.id)
                .reduce((sum, d) => sum + d.publicTotal, 0n);
              return (
                <div key={t.id.toString()} className="rounded-lg border border-white/10 px-4 py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Waterfall #{t.id.toString()}</span>
                    <span className={t.locked ? "text-emerald-400 text-xs" : "text-amber-400 text-xs"}>
                      {t.locked ? "locked" : "unlocked"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    {t.owners.length} owner{t.owners.length === 1 ? "" : "s"} · {t.tierCount} tier
                    {t.tierCount === 1 ? "" : "s"} — order public, terms sealed
                  </p>
                  <ul className="mt-1 flex flex-col gap-1 text-zinc-500">
                    {t.owners.map((o) => (
                      <li key={o} className="font-mono text-xs">
                        {shortAddr(o)}
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
          Fund via 0xSplits
        </h3>
        <p className="mb-3 text-sm text-zinc-500">
          Three steps, in order — sending USDC to the Split alone does nothing yet; the Split has
          to actually route it here before it becomes your waterfall&apos;s pooled total.
        </p>
        <ol className="flex flex-col gap-3 text-sm text-zinc-400">
          <li>
            <span className="font-medium text-zinc-300">1. Send test USDC to this Split address</span>
            <div className="mt-1 flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-white/[.03] px-4 py-3">
              <span className="min-w-0 flex-1 truncate font-mono text-xs">{splitAddr ?? "…"}</span>
              <button
                onClick={copySplit}
                disabled={!splitAddr}
                className="rounded-full border border-white/15 px-3 py-1 text-xs font-medium hover:bg-white/[.06] disabled:opacity-50"
              >
                {copied ? "Copied" : "Copy"}
              </button>
              {splitAddr && (
                <a href={etherscanAddress(splitAddr)} target="_blank" rel="noreferrer" className="rounded-full border border-white/15 px-3 py-1 text-xs font-medium hover:bg-white/[.06]">
                  Etherscan ↗
                </a>
              )}
            </div>
          </li>
          <li>
            <span className="font-medium text-zinc-300">2. Route it — call the Split&apos;s own (unmodified) distribute()</span>
            <p className="mt-1 text-xs text-zinc-500">This is the step that actually forwards what you sent from the Split into ScripWaterfall. Nothing arrives here until this runs.</p>
            <button
              onClick={routeSplit}
              disabled={routeTx.state === "pending" || !splitAddr}
              className="mt-2 rounded-full border border-white/15 px-4 py-1.5 text-sm font-medium hover:bg-white/[.06] disabled:opacity-50"
            >
              {routeTx.state === "pending" ? "Routing…" : "Route via 0xSplits"}
            </button>
            {routeTx.state === "error" && <p className="mt-1 text-xs text-red-400">{routeTx.message}</p>}
          </li>
          <li>
            <span className="font-medium text-zinc-300">3. Pool revenue</span> — makes what actually
            arrived your waterfall&apos;s public, provable total (see below).
          </li>
        </ol>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Pool revenue &amp; distribute
          {activeTableId !== null && <span className="normal-case text-zinc-400"> (waterfall #{activeTableId.toString()})</span>}
        </h3>
        <p className="mb-3 text-sm text-zinc-500">
          Pooled for this waterfall:{" "}
          <span className="font-mono">{poolAmount === null ? "…" : formatUsdc(poolAmount)}</span> USDC
          {" "}(0 until you&apos;ve completed steps 1–3 above)
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
              ? "Evaluating the waterfall in the TEE…"
              : "Distribute (confidential waterfall payout)"}
          </button>
        </div>
        {distributeTx.state === "done" && (
          <p className="mt-2 text-sm text-emerald-400">
            Distributed ({" "}
            <a href={etherscanTx(distributeTx.hash!)} target="_blank" rel="noreferrer" className="underline">
              tx
            </a>{" "}
            ). Each owner can now decrypt their own computed payout in the Owner tab.
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
        <p className="mb-3 text-sm text-zinc-500">
          Let an investor or auditor verify a distribution privately — scoped, on-chain, revocable
          — without making the deal terms public.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            value={auditorTableId}
            onChange={(e) => setAuditorTableId(e.target.value)}
            placeholder="waterfall id"
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
            <p className="text-xs text-zinc-600">No auditors granted yet for waterfall #{auditorTableId || "?"}.</p>
          )}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Build a new sealed waterfall
        </h3>
        <p className="mb-3 text-sm text-zinc-500">
          Owner addresses and tier order are public; every dollar amount, percentage, and milestone
          flag below is encrypted in your browser before anything touches the chain.
        </p>

        <div className="mb-4 flex flex-col gap-2">
          <span className="text-xs uppercase tracking-wide text-zinc-500">Owners</span>
          {owners.map((addr, i) => (
            <input
              key={i}
              value={addr}
              onChange={(e) => {
                const next = [...owners];
                next[i] = e.target.value;
                setOwners(next);
              }}
              placeholder={`owner ${i} address (0x…)`}
              className="min-w-0 flex-1 rounded-md border border-white/15 bg-transparent px-3 py-1.5 font-mono text-sm"
            />
          ))}
          <button
            onClick={() => setOwners([...owners, ""])}
            className="w-fit rounded-full border border-white/15 px-3 py-1 text-xs font-medium hover:bg-white/[.06]"
          >
            + add owner
          </button>
        </div>

        <div className="mb-4 flex items-center gap-3 rounded-lg border border-white/10 bg-white/[.03] px-4 py-3">
          <label className="flex items-center gap-2 text-sm text-zinc-400">
            <input
              type="checkbox"
              checked={milestoneMet}
              onChange={(e) => setMilestoneMet(e.target.checked)}
            />
            Milestone was met (sealed — never shown, used only by tiers gated below)
          </label>
        </div>

        <div className="flex flex-col gap-2">
          {tiers.map((tier, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 px-3 py-2">
              <span className="w-5 text-center text-xs text-zinc-600">{i + 1}</span>
              <div className="flex flex-col">
                <button onClick={() => moveTier(i, -1)} disabled={i === 0} className="text-xs text-zinc-500 disabled:opacity-30">▲</button>
                <button onClick={() => moveTier(i, 1)} disabled={i === tiers.length - 1} className="text-xs text-zinc-500 disabled:opacity-30">▼</button>
              </div>
              <select
                value={tier.beneficiary}
                onChange={(e) => {
                  const next = [...tiers];
                  next[i] = { ...next[i], beneficiary: Number(e.target.value) };
                  setTiers(next);
                }}
                className="rounded-md border border-white/15 bg-transparent px-2 py-1.5 text-sm"
              >
                {owners.map((_, idx) => <option key={idx} value={idx}>owner {idx}</option>)}
              </select>
              <select
                value={tier.kind}
                onChange={(e) => {
                  const next = [...tiers];
                  next[i] = { ...next[i], kind: e.target.value as TierKind };
                  setTiers(next);
                }}
                className="rounded-md border border-white/15 bg-transparent px-2 py-1.5 text-sm"
              >
                <option value="recoup">recoups first $</option>
                <option value="split">then splits %</option>
              </select>
              <input
                value={tier.amount}
                onChange={(e) => {
                  const next = [...tiers];
                  next[i] = { ...next[i], amount: e.target.value };
                  setTiers(next);
                }}
                placeholder={tier.kind === "recoup" ? "USDC (e.g. 0.4)" : "bps (7000 = 70%)"}
                className="w-32 rounded-md border border-white/15 bg-transparent px-2 py-1.5 text-sm"
              />
              <select
                value={tier.gate}
                onChange={(e) => {
                  const next = [...tiers];
                  next[i] = { ...next[i], gate: e.target.value as Gate };
                  setTiers(next);
                }}
                className="rounded-md border border-white/15 bg-transparent px-2 py-1.5 text-sm"
              >
                {(Object.keys(GATE_LABEL) as Gate[]).map((g) => <option key={g} value={g}>{GATE_LABEL[g]}</option>)}
              </select>
              <button
                onClick={() => setTiers(tiers.filter((_, idx) => idx !== i))}
                disabled={tiers.length === 1}
                className="ml-auto text-xs text-zinc-600 hover:text-red-400 disabled:opacity-30"
              >
                remove
              </button>
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            onClick={() => setTiers([...tiers, { beneficiary: 0, kind: "split", amount: "0", gate: "always" }])}
            className="rounded-full border border-white/15 px-3 py-1 text-xs font-medium hover:bg-white/[.06]"
          >
            + add tier
          </button>
          <button
            onClick={createWaterfall}
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
