import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Logo } from "@/app/components/Logo";
import {
  SCRIP_WATERFALL_ADDRESS,
  CONFIDENTIAL_USDC_ADDRESS,
  WATERFALL_SPLIT_ADDRESS,
  USDC_ADDRESS,
} from "@/app/lib/contracts";

export const metadata = {
  title: "Scrip — Product guide",
  description: "How Scrip's confidential waterfall works, and how to use it end to end.",
};

const Arrow = () => <ArrowUpRight size={13} aria-hidden />;

const onThisPage = [
  ["#what", "What Scrip is"],
  ["#waterfall", "How the waterfall works"],
  ["#roles", "Founder, owner, auditor"],
  ["#usage", "Step by step"],
  ["#privacy", "Privacy boundary"],
  ["#contracts", "Deployed contracts"],
] as const;

export default function DocsPage() {
  return (
    <div className="site-shell docs-shell">
      <header className="site-header">
        <Link href="/" aria-label="Scrip home"><Logo /></Link>
        <nav className="desktop-nav">
          <a href="#what">Guide</a>
          <Link href="/#comparison">Privacy</Link>
          <Link href="/#faq">FAQ</Link>
        </nav>
        <Link className="button button-small button-outline" href="/app">Open Scrip <Arrow /></Link>
      </header>

      <main className="docs-main section-pad">
        <div className="docs-layout">
          <aside className="docs-toc">
            <span className="section-kicker">On this page</span>
            <nav>
              {onThisPage.map(([href, label]) => (
                <a key={href} href={href}>{label}</a>
              ))}
            </nav>
            <Link href="/app" className="button button-primary docs-toc-cta">Open the app <Arrow /></Link>
          </aside>

          <div className="docs-content">
            <div className="docs-eyebrow">Product guide</div>
            <h1>Everything Scrip does, in one page.</h1>
            <p className="docs-lede">
              Scrip runs a real conditional revenue deal on-chain — recoup caps, split ratios, and
              milestone gates sealed by Nox — wrapping the real 0xSplits protocol, unmodified. This
              guide covers what it is, how the waterfall actually computes a payout, and the exact
              steps to run one yourself on Sepolia.
            </p>

            <section id="what">
              <h2>What Scrip is</h2>
              <p>
                Real revenue deals aren&apos;t flat splits. An investor gets paid back first, then
                the founder and investor split what&apos;s left, and the terms change if a
                milestone is hit. On-chain today, you either publish that whole deal structure on a
                block explorer for anyone — including your next investor — to read, or you don&apos;t
                run the deal on-chain at all.
              </p>
              <p>
                Scrip seals the deal terms (recoup caps, split ratios, milestone gates) and every
                individual payout, while <strong>0xSplits keeps routing the revenue exactly as it
                already does</strong> — unmodified, real, live on Sepolia. Nox doesn&apos;t just
                encrypt a number here: it <em>computes</em> each owner&apos;s payout from the sealed
                terms against the public total, inside a TEE. That&apos;s the whole novelty —
                confidential computation, not confidential storage.
              </p>
            </section>

            <section id="waterfall">
              <h2>How the waterfall works</h2>
              <p>
                A waterfall is an ordered list of tiers. Each tier is one of:
              </p>
              <ul>
                <li><strong>Recoup first $X</strong> — this tier takes up to a sealed absolute cap
                  from whatever revenue is left, before anything else in this tier runs.</li>
                <li><strong>Then split N%</strong> — this tier takes a sealed percentage of
                  whatever&apos;s left after the recoup tiers above it.</li>
                <li><strong>Milestone gate</strong> — any tier can additionally be sealed to apply
                  only if a milestone condition (also sealed) holds.</li>
              </ul>
              <p>
                Tier <em>order</em> and which owner each tier can pay are public. The dollar
                amounts, percentages, and milestone flags are sealed handles, encrypted in your
                browser before they ever touch the chain.
              </p>
              <p>
                <strong>The proof this is real computation:</strong> two waterfalls on Sepolia,
                identical tiers, funded with the same 1 USDC — the only difference is one sealed
                milestone bit.
              </p>
              <div className="docs-proof">
                <div><span className="card-tag">Milestone NOT met</span><b>founder 0.629999 USDC</b><span>investor 0.369998 USDC</span></div>
                <div><span className="card-tag">Milestone MET</span><b>founder 0.765 USDC</b><span>investor 0.235 USDC</span></div>
              </div>
              <p>
                Same total, different real decrypted payout — driven by a rule Nox evaluated
                privately, not a number someone typed twice.
              </p>
            </section>

            <section id="roles">
              <h2>Founder, owner, auditor</h2>
              <p>
                Scrip detects your role from what the connected wallet has actually done on-chain —
                there&apos;s no signup or allowlist.
              </p>
              <ul>
                <li><strong>Founder</strong> — any wallet that has created a waterfall. Can fund it,
                  distribute, and grant auditor access. Anyone can become a founder by building a
                  first waterfall from the app. Every waterfall shares one contract&apos;s USDC
                  balance, but a per-cap-table ledger means pooling or distributing on your
                  waterfall can never claim funds already attributed to someone else&apos;s.</li>
                <li><strong>Owner</strong> — a wallet listed as a beneficiary on a waterfall.
                  Decrypts only their own computed payout — never another owner&apos;s, never the
                  founder&apos;s view of the terms.</li>
                <li><strong>Auditor</strong> — a wallet a founder has explicitly granted scoped
                  access to. Sees the batch of payouts for that waterfall (that&apos;s the point of
                  an audit), but never the sealed terms, and never anything on a waterfall they
                  weren&apos;t granted.</li>
              </ul>
            </section>

            <section id="usage">
              <h2>Step by step</h2>
              <ol>
                <li><strong>Connect a wallet</strong> on Sepolia from <Link href="/app">/app</Link>.
                  A wallet with no history lands on &quot;No on-chain role yet&quot; — that&apos;s
                  expected for a brand-new address, not an error.</li>
                <li><strong>Become a founder</strong> by clicking <strong>New waterfall</strong>.
                  Add owner addresses, then build the waterfall tier by tier — beneficiary, recoup
                  cap or split ratio, and an optional milestone gate.</li>
                <li><strong>Create &amp; lock</strong> — every term is encrypted in your browser
                  first; locking finalizes the tiers on-chain.</li>
                <li><strong>Fund it — three steps</strong>: send Sepolia USDC to the 0xSplits Split
                  address shown on your founder Overview; click <strong>Route via 0xSplits</strong>
                  (the Split&apos;s own unmodified <code>distribute()</code>, which is what actually
                  forwards your funds into ScripWaterfall — sending USDC to the Split alone does
                  nothing until this runs); then click <strong>Pool revenue</strong> to make what
                  arrived your waterfall&apos;s public, provable total.</li>
                <li><strong>Distribute</strong> — evaluates the sealed waterfall against the pooled
                  total inside the Nox TEE and settles every owner&apos;s confidential payout in one
                  transaction.</li>
                <li><strong>Decrypt as an owner</strong> — connect the owner&apos;s wallet and open
                  the Owner view to decrypt that wallet&apos;s own computed payout.</li>
                <li><strong>Grant an auditor</strong> (optional) — from the founder view, grant a
                  specific address scoped, revocable access to the batch of payouts.</li>
              </ol>
            </section>

            <section id="privacy">
              <h2>Privacy boundary</h2>
              <div className="docs-boundary">
                <div>
                  <h3>Sealed</h3>
                  <ul><li>Recoup caps, split ratios, milestone gates</li><li>Individual payout amounts</li><li>The waterfall evaluation itself</li></ul>
                </div>
                <div>
                  <h3>Public</h3>
                  <ul><li>Owner wallet addresses</li><li>Tier count and order (the deal structure, not its terms)</li><li>Total revenue distributed</li></ul>
                </div>
              </div>
              <p>
                Scrip hides <em>the deal terms and how much each owner earns</em>, not <em>that</em>
                they participate — addresses are never hidden.
              </p>
            </section>

            <section id="contracts">
              <h2>Deployed contracts (Ethereum Sepolia)</h2>
              <ul className="docs-contracts">
                <li><span>ScripWaterfall</span><a href={`https://sepolia.etherscan.io/address/${SCRIP_WATERFALL_ADDRESS}`} target="_blank" rel="noreferrer">{SCRIP_WATERFALL_ADDRESS} <Arrow /></a></li>
                <li><span>Confidential USDC (ERC-7984)</span><a href={`https://sepolia.etherscan.io/address/${CONFIDENTIAL_USDC_ADDRESS}`} target="_blank" rel="noreferrer">{CONFIDENTIAL_USDC_ADDRESS} <Arrow /></a></li>
                <li><span>0xSplits Split (unmodified)</span><a href={`https://sepolia.etherscan.io/address/${WATERFALL_SPLIT_ADDRESS}`} target="_blank" rel="noreferrer">{WATERFALL_SPLIT_ADDRESS} <Arrow /></a></li>
                <li><span>USDC (Circle, Sepolia)</span><a href={`https://sepolia.etherscan.io/address/${USDC_ADDRESS}`} target="_blank" rel="noreferrer">{USDC_ADDRESS} <Arrow /></a></li>
              </ul>
              <p>
                Full source, every real transaction hash from building this, and the iExec Nox
                developer-experience writeup are all in the{" "}
                <a href="https://github.com/TheWeirdDee/scrip" target="_blank" rel="noreferrer">GitHub repo <Arrow /></a>.
              </p>
            </section>
          </div>
        </div>
      </main>

      <footer className="site-footer">
        <div className="footer-brand"><Logo/><p>A confidential conditional-distribution layer for unmodified 0xSplits revenue flows.</p><span>Ethereum · 0xSplits · Nox</span></div>
        <div className="footer-column"><strong>Product</strong><Link href="/#wrap">The wrap</Link><Link href="/#faq">FAQ</Link><Link href="/app">Live app</Link></div>
        <div className="footer-bottom"><span>© 2026 Scrip</span><span>Unmodified rail. Confidential settlement.</span></div>
      </footer>
    </div>
  );
}
