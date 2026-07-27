"use client";

import { useState } from "react";
import { useWallet } from "@/app/lib/useWallet";
import { ConnectButton } from "@/app/components/ConnectButton";
import { FounderPanel } from "@/app/components/FounderPanel";
import { OwnerPanel } from "@/app/components/OwnerPanel";
import { AuditorPanel } from "@/app/components/AuditorPanel";
import {
  SCRIP_DISTRIBUTOR_ADDRESS,
  CONFIDENTIAL_USDC_ADDRESS,
  SPLIT_ADDRESS,
  USDC_ADDRESS,
} from "@/app/lib/contracts";

type Tab = "founder" | "owner" | "auditor";

const TABS: { id: Tab; label: string; blurb: string }[] = [
  { id: "founder", label: "Founder", blurb: "Set up the sealed cap table, pool & distribute revenue, grant audits." },
  { id: "owner", label: "Owner", blurb: "Decrypt only your own confidential balance." },
  { id: "auditor", label: "Auditor", blurb: "If granted, decrypt the whole sealed cap table." },
];

function EtherscanLink({ label, address }: { label: string; address: string }) {
  return (
    <a
      href={`https://sepolia.etherscan.io/address/${address}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex justify-between gap-3 font-mono text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
    >
      <span className="shrink-0 font-sans text-zinc-400 dark:text-zinc-500">{label}</span>
      <span className="truncate">{address}</span>
    </a>
  );
}

export default function Home() {
  const wallet = useWallet();
  const [tab, setTab] = useState<Tab>("owner");

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-12 sm:px-8">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Scrip</h1>
            <p className="mt-1 max-w-md text-sm text-zinc-500">
              A cap table that pays out — with the ownership sealed. Wraps{" "}
              <a
                href="https://splits.org"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                0xSplits
              </a>{" "}
              (unmodified); Nox seals percentages &amp; payouts.
            </p>
          </div>
          <ConnectButton wallet={wallet} />
        </header>

        <div className="rounded-lg border border-black/10 bg-white px-4 py-3 text-sm dark:border-white/10 dark:bg-white/[.03]">
          <span className="font-semibold">Privacy boundary:</span>{" "}
          <span className="text-zinc-600 dark:text-zinc-400">
            sealed = each owner&apos;s percentage, each payout, the allocation math. Public = that a
            split exists, owner addresses, and the total revenue distributed (provable — 0xSplits&apos;
            balance is public). Nobody&apos;s identity is hidden; the amounts are.
          </span>
        </div>

        <nav className="flex gap-1 border-b border-black/10 dark:border-white/10">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                tab === t.id
                  ? "border-foreground text-foreground"
                  : "border-transparent text-zinc-500 hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <p className="-mt-6 text-xs text-zinc-500">{TABS.find((t) => t.id === tab)?.blurb}</p>

        <main className="flex-1">
          {tab === "founder" && <FounderPanel wallet={wallet} />}
          {tab === "owner" && <OwnerPanel wallet={wallet} />}
          {tab === "auditor" && <AuditorPanel wallet={wallet} />}
        </main>

        <footer className="mt-auto flex flex-col gap-1.5 border-t border-black/10 pt-6 dark:border-white/10">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Deployed on Ethereum Sepolia
          </p>
          <EtherscanLink label="ScripDistributor" address={SCRIP_DISTRIBUTOR_ADDRESS} />
          <EtherscanLink label="ConfidentialUSDC" address={CONFIDENTIAL_USDC_ADDRESS} />
          <EtherscanLink label="0xSplits Split" address={SPLIT_ADDRESS} />
          <EtherscanLink label="USDC" address={USDC_ADDRESS} />
        </footer>
      </div>
    </div>
  );
}
