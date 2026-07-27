import Link from "next/link";
import { Logo } from "@/app/components/Logo";
import { LetterGlitch } from "@/app/components/LetterGlitch";
import {
  SCRIP_DISTRIBUTOR_ADDRESS,
  CONFIDENTIAL_USDC_ADDRESS,
  SPLIT_ADDRESS,
  USDC_ADDRESS,
} from "@/app/lib/contracts";

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/[.04] px-3 py-1 text-xs font-medium text-zinc-300">
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
    <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[.03] p-5">
      <div className="flex items-center justify-between">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-50 text-xs font-semibold text-black">
          {step}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            sealed ? "bg-amber-500/15 text-amber-300" : "bg-emerald-500/15 text-emerald-300"
          }`}
        >
          {sealed ? "sealed" : "public"}
        </span>
      </div>
      <h3 className="font-semibold text-zinc-50">{title}</h3>
      <p className="text-sm leading-relaxed text-zinc-400">{body}</p>
    </div>
  );
}

function EtherscanLink({ label, address }: { label: string; address: string }) {
  return (
    <a
      href={`https://sepolia.etherscan.io/address/${address}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex justify-between gap-3 font-mono text-xs text-zinc-500 hover:text-zinc-200"
    >
      <span className="shrink-0 font-sans text-zinc-500">{label}</span>
      <span className="truncate">{address}</span>
    </a>
  );
}

export default function Landing() {
  return (
    <div className="flex flex-1 flex-col bg-background">
      <header className="border-b border-white/10 bg-black/40 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4 sm:px-8">
          <Logo />
          <nav className="flex items-center gap-6">
            <a href="#how-it-works" className="hidden text-sm font-medium text-zinc-400 hover:text-zinc-100 sm:inline">
              How it works
            </a>
            <a href="#privacy" className="hidden text-sm font-medium text-zinc-400 hover:text-zinc-100 sm:inline">
              Privacy
            </a>
            <a
              href="https://github.com/TheWeirdDee/scrip"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden text-sm font-medium text-zinc-400 hover:text-zinc-100 sm:inline"
            >
              GitHub
            </a>
            <Link
              href="/app"
              className="rounded-full bg-emerald-400 px-4 py-1.5 text-sm font-semibold text-black transition-colors hover:bg-emerald-300"
            >
              Launch app
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-[-220px] h-[620px] w-[620px] -translate-x-1/2 overflow-hidden rounded-full border border-emerald-400/20 opacity-60 shadow-[0_0_160px_40px_rgba(52,211,153,0.12)] sm:h-[820px] sm:w-[820px]"
          >
            <LetterGlitch outerVignette centerVignette smooth glitchSpeed={70} />
          </div>

          <div className="relative mx-auto flex max-w-5xl flex-col items-center px-6 pb-24 pt-24 text-center sm:px-8 sm:pt-32">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Pill>Built for iExec WTF</Pill>
              <Pill>Nox confidential layer (TEE, not FHE)</Pill>
              <Pill>Live on Ethereum Sepolia</Pill>
            </div>
            <h1 className="mt-6 max-w-2xl text-4xl font-semibold leading-tight tracking-tight text-zinc-50 sm:text-5xl">
              A cap table that pays out — with the ownership sealed.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-zinc-400">
              Scrip wraps{" "}
              <a
                href="https://splits.org"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-200 underline underline-offset-2"
              >
                0xSplits
              </a>{" "}
              — completely unmodified — so a company can share revenue among owners where every
              ownership percentage and every payout is confidential, while the total distributed
              stays publicly provable.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                href="/app"
                className="rounded-full bg-emerald-400 px-6 py-3 text-sm font-semibold text-black transition-colors hover:bg-emerald-300"
              >
                Launch the app →
              </Link>
              <a
                href="https://github.com/TheWeirdDee/scrip"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-zinc-200 transition-colors hover:bg-white/[.06]"
              >
                View source
              </a>
            </div>
          </div>
        </section>

        {/* Real, not mocked — trust strip */}
        <section className="border-y border-white/10 bg-white/[.02]">
          <div className="mx-auto max-w-5xl px-6 py-10 sm:px-8">
            <p className="text-center text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Real, live contracts on Ethereum Sepolia — not demo data
            </p>
            <div className="mt-5 grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
              <EtherscanLink label="ScripDistributor" address={SCRIP_DISTRIBUTOR_ADDRESS} />
              <EtherscanLink label="ConfidentialUSDC (ERC-7984)" address={CONFIDENTIAL_USDC_ADDRESS} />
              <EtherscanLink label="0xSplits Split (unmodified)" address={SPLIT_ADDRESS} />
              <EtherscanLink label="USDC (Circle, Sepolia)" address={USDC_ADDRESS} />
            </div>
          </div>
        </section>

        {/* Intro card */}
        <section className="mx-auto max-w-5xl px-6 py-16 sm:px-8">
          <div className="rounded-2xl border border-white/10 bg-white/[.03] p-8 sm:p-10">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-300">
              ● powered by nox
            </span>
            <p className="mt-5 max-w-2xl text-xl font-medium leading-snug text-zinc-100">
              0xSplits is a great, widely-used protocol for splitting revenue by ownership
              percentage — it even calls itself &ldquo;an equity instrument.&rdquo; But every
              percentage and every payout is public.
            </p>
            <p className="mt-4 max-w-2xl text-zinc-400">
              On-chain, your cap table and everyone&apos;s dividends are naked on a block explorer
              — worse than a traditional company, where shareholdings and payouts are private.
              That&apos;s why serious capital won&apos;t share revenue on-chain today. Scrip wraps
              0xSplits unmodified and seals only the part that matters.
            </p>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="mx-auto max-w-5xl scroll-mt-20 px-6 py-16 sm:px-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            How Scrip fixes it
          </h2>
          <p className="mt-2 max-w-2xl text-zinc-400">
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
        <section id="privacy" className="scroll-mt-20 border-y border-white/10 bg-white/[.02]">
          <div className="mx-auto max-w-5xl px-6 py-16 sm:px-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Honest privacy boundary
            </h2>
            <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="rounded-xl border border-amber-400/20 bg-amber-400/[.06] p-6">
                <h3 className="font-semibold text-amber-300">Sealed</h3>
                <ul className="mt-3 flex flex-col gap-2 text-sm text-amber-100/70">
                  <li>Each owner&apos;s ownership percentage</li>
                  <li>Each owner&apos;s payout amount</li>
                  <li>The allocation math itself</li>
                </ul>
              </div>
              <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[.06] p-6">
                <h3 className="font-semibold text-emerald-300">Public</h3>
                <ul className="mt-3 flex flex-col gap-2 text-sm text-emerald-100/70">
                  <li>That a split/cap table exists</li>
                  <li>Owner addresses (that someone participates)</li>
                  <li>The total revenue distributed (provable)</li>
                </ul>
              </div>
            </div>
            <p className="mt-6 max-w-2xl text-sm text-zinc-400">
              Scrip hides <em>how much</em> each owner holds and earns — never <em>that</em> they
              participate. Addresses are never hidden; the amounts are.
            </p>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto flex max-w-5xl flex-col items-start gap-4 px-6 py-16 sm:px-8">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-50">See it work.</h2>
          <p className="max-w-xl text-zinc-400">
            Connect a Sepolia wallet and try the founder, owner, and auditor views on the real,
            live cap table.
          </p>
          <Link
            href="/app"
            className="rounded-full bg-emerald-400 px-6 py-3 text-sm font-semibold text-black transition-colors hover:bg-emerald-300"
          >
            Launch the app →
          </Link>
        </section>
      </main>

      <footer className="border-t border-white/10 px-6 py-8 text-center text-xs text-zinc-500 sm:px-8">
        Scrip — built for iExec WTF (Write The Future) on the Nox confidential layer. Not FHE.
      </footer>
    </div>
  );
}
