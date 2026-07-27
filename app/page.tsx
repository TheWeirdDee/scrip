import Link from "next/link";
import {
  SCRIP_DISTRIBUTOR_ADDRESS,
  CONFIDENTIAL_USDC_ADDRESS,
  SPLIT_ADDRESS,
  USDC_ADDRESS,
} from "@/app/lib/contracts";

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-medium text-zinc-600">
      {children}
    </span>
  );
}

function StepCard({
  step,
  title,
  body,
  sealed,
}: {
  step: string;
  title: string;
  body: string;
  sealed: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-black/10 bg-white p-5">
      <div className="flex items-center justify-between">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold text-white">
          {step}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            sealed ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
          }`}
        >
          {sealed ? "sealed" : "public"}
        </span>
      </div>
      <h3 className="font-semibold">{title}</h3>
      <p className="text-sm leading-relaxed text-zinc-600">{body}</p>
    </div>
  );
}

function EtherscanLink({ label, address }: { label: string; address: string }) {
  return (
    <a
      href={`https://sepolia.etherscan.io/address/${address}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex justify-between gap-3 font-mono text-xs text-zinc-500 hover:text-zinc-800"
    >
      <span className="shrink-0 font-sans text-zinc-400">{label}</span>
      <span className="truncate">{address}</span>
    </a>
  );
}

export default function Landing() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50">
      <header className="border-b border-black/10 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4 sm:px-8">
          <span className="text-lg font-semibold tracking-tight">Scrip</span>
          <nav className="flex items-center gap-3">
            <a
              href="https://github.com/TheWeirdDee/scrip"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden text-sm font-medium text-zinc-600 hover:text-zinc-900 sm:inline"
            >
              GitHub
            </a>
            <Link
              href="/app"
              className="rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background transition-colors hover:bg-[#383838]"
            >
              Launch app
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-5xl px-6 pb-16 pt-20 sm:px-8 sm:pt-28">
          <div className="flex flex-wrap gap-2">
            <Pill>Built for iExec WTF</Pill>
            <Pill>Nox confidential layer (TEE, not FHE)</Pill>
            <Pill>Live on Ethereum Sepolia</Pill>
          </div>
          <h1 className="mt-6 max-w-2xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            A cap table that pays out — with the ownership sealed.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-zinc-600">
            Scrip wraps{" "}
            <a href="https://splits.org" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              0xSplits
            </a>{" "}
            — completely unmodified — so a company can share revenue among owners where every
            ownership percentage and every payout is confidential, while the total distributed
            stays publicly provable.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/app"
              className="rounded-full bg-foreground px-6 py-3 text-sm font-semibold text-background transition-colors hover:bg-[#383838]"
            >
              Launch the app →
            </Link>
            <a
              href="https://github.com/TheWeirdDee/scrip"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-black/15 px-6 py-3 text-sm font-semibold text-zinc-800 transition-colors hover:bg-black/[.04]"
            >
              View source
            </a>
          </div>
        </section>

        {/* Problem */}
        <section className="border-y border-black/10 bg-white">
          <div className="mx-auto max-w-5xl px-6 py-16 sm:px-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              The problem
            </h2>
            <p className="mt-3 max-w-2xl text-2xl font-medium leading-snug tracking-tight">
              0xSplits is a great, widely-used protocol for splitting revenue by ownership
              percentage — it even calls itself &ldquo;an equity instrument.&rdquo; But every
              percentage and every payout is public.
            </p>
            <p className="mt-4 max-w-2xl text-zinc-600">
              On-chain, your cap table and everyone&apos;s dividends are naked on a block explorer
              — worse than a traditional company, where shareholdings and payouts are private.
              That&apos;s why serious capital won&apos;t share revenue on-chain today.
            </p>
          </div>
        </section>

        {/* How it works */}
        <section className="mx-auto max-w-5xl px-6 py-16 sm:px-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            How Scrip fixes it
          </h2>
          <p className="mt-2 max-w-2xl text-zinc-600">
            0xSplits keeps doing exactly what it already does, unmodified. Scrip sits on top and
            seals only the part that matters.
          </p>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StepCard
              step="1"
              title="Revenue routes in"
              body="Real USDC flows into an unmodified 0xSplits Split, which routes 100% to Scrip. The total is public and provable — that's the trust anchor."
              sealed={false}
            />
            <StepCard
              step="2"
              title="Ownership is sealed"
              body="The founder sets each owner's percentage. It's encrypted in the browser before it ever touches the chain — the contract only ever sees a Nox handle."
              sealed
            />
            <StepCard
              step="3"
              title="Payout, computed confidentially"
              body="Scrip wraps the pooled USDC into a confidential ERC-7984 token and computes each owner's cut — percentage × total — entirely inside a Nox TEE."
              sealed
            />
            <StepCard
              step="4"
              title="Selective disclosure"
              body="Each owner decrypts only their own payout. An auditor can be granted a scoped view of the whole cap table. The public sees only the total."
              sealed
            />
          </div>
        </section>

        {/* Privacy boundary */}
        <section className="border-y border-black/10 bg-white">
          <div className="mx-auto max-w-5xl px-6 py-16 sm:px-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Honest privacy boundary
            </h2>
            <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
                <h3 className="font-semibold text-amber-900">Sealed</h3>
                <ul className="mt-3 flex flex-col gap-2 text-sm text-amber-900/80">
                  <li>Each owner&apos;s ownership percentage</li>
                  <li>Each owner&apos;s payout amount</li>
                  <li>The allocation math itself</li>
                </ul>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6">
                <h3 className="font-semibold text-emerald-900">Public</h3>
                <ul className="mt-3 flex flex-col gap-2 text-sm text-emerald-900/80">
                  <li>That a split/cap table exists</li>
                  <li>Owner addresses (that someone participates)</li>
                  <li>The total revenue distributed (provable)</li>
                </ul>
              </div>
            </div>
            <p className="mt-6 max-w-2xl text-sm text-zinc-600">
              Scrip hides <em>how much</em> each owner holds and earns — never <em>that</em> they
              participate. Addresses are never hidden; the amounts are.
            </p>
          </div>
        </section>

        {/* Stack */}
        <section className="mx-auto max-w-5xl px-6 py-16 sm:px-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Real, not mocked
          </h2>
          <p className="mt-2 max-w-2xl text-zinc-600">
            Every piece below is a real, live contract on Sepolia — no demo data, no simulated
            transactions.
          </p>
          <div className="mt-6 flex flex-col gap-1.5 rounded-xl border border-black/10 bg-white p-6">
            <EtherscanLink label="ScripDistributor" address={SCRIP_DISTRIBUTOR_ADDRESS} />
            <EtherscanLink label="ConfidentialUSDC (ERC-7984)" address={CONFIDENTIAL_USDC_ADDRESS} />
            <EtherscanLink label="0xSplits Split (unmodified)" address={SPLIT_ADDRESS} />
            <EtherscanLink label="USDC (Circle, Sepolia)" address={USDC_ADDRESS} />
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-black/10 bg-white">
          <div className="mx-auto flex max-w-5xl flex-col items-start gap-4 px-6 py-16 sm:px-8">
            <h2 className="text-2xl font-semibold tracking-tight">See it work.</h2>
            <p className="max-w-xl text-zinc-600">
              Connect a Sepolia wallet and try the founder, owner, and auditor views on the real,
              live cap table.
            </p>
            <Link
              href="/app"
              className="rounded-full bg-foreground px-6 py-3 text-sm font-semibold text-background transition-colors hover:bg-[#383838]"
            >
              Launch the app →
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-black/10 px-6 py-8 text-center text-xs text-zinc-500 sm:px-8">
        Scrip — built for iExec WTF (Write The Future) on the Nox confidential layer. Not FHE.
      </footer>
    </div>
  );
}
