"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, ArrowUpRight, Check } from "lucide-react";
import { useWallet } from "@/app/lib/useWallet";
import { ConnectButton } from "@/app/components/ConnectButton";
import { FounderPanel } from "@/app/components/FounderPanel";
import { CapTablesPanel } from "@/app/components/CapTablesPanel";
import { DistributionsPanel } from "@/app/components/DistributionsPanel";
import { OwnerPanel } from "@/app/components/OwnerPanel";
import { AuditorPanel } from "@/app/components/AuditorPanel";
import { Logo } from "@/app/components/Logo";
import { CONFIDENTIAL_USDC_ADDRESS, SCRIP_WATERFALL_ADDRESS, USDC_ADDRESS, erc20Abi, scripWaterfallAbi } from "@/app/lib/contracts";
import { shortAddr, etherscanAddress, formatUsdc } from "@/app/lib/format";
import { fetchWaterfallState } from "@/app/lib/waterfallEvents";

type Role = "owner" | "founder" | "auditor";
type FounderView = "overview" | "capTables" | "distributions";
type OwnerView = "overview" | "balance";
type IconName = "grid" | "wallet" | "table" | "send" | "audit" | "shield" | "help" | "switch";

const ROLES: Record<Role, { label: string; noun: string; description: string }> = {
  owner: { label: "Owner", noun: "My ownership", description: "Only you can see your share. Not other owners, not the founder, not the public — but the total is provable to everyone." },
  founder: { label: "Founder", noun: "Distribution desk", description: "Pay your owners and prove the total — without publishing who earns what." },
  auditor: { label: "Auditor", noun: "Audit workspace", description: "Review cap tables that have been explicitly shared with your wallet." },
};

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
    wallet: <><path d="M4 7h15a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a3 3 0 0 1 3-3h12"/><path d="M16 12h5v4h-5a2 2 0 0 1 0-4Z"/></>,
    table: <><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 10h18M9 10v10"/></>,
    send: <><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></>,
    audit: <><path d="M9 11h6M9 15h4"/><path d="M17 21H7a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3h7l4 4v5"/><circle cx="18" cy="17" r="3"/><path d="m20.5 19.5 2 2"/></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></>,
    help: <><circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.3 2.3 0 1 1 3.4 2c-.8.5-1.2 1-1.2 2M12 17h.01"/></>,
    switch: <><path d="m7 7 3-3m-3 3 3 3M17 17l-3 3m3-3-3-3"/><path d="M10 4H7a4 4 0 0 0-4 4v2M14 20h3a4 4 0 0 0 4-4v-2"/></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden>{paths[name]}</svg>;
}

const FOUNDER_VIEW_META: Record<FounderView, { noun: string; description: string }> = {
  overview: { noun: ROLES.founder.noun, description: ROLES.founder.description },
  capTables: { noun: "Cap tables", description: "Every sealed waterfall you've created — owners, tier count and order, lock status. Terms stay sealed." },
  distributions: { noun: "Distributions", description: "Full history of confidential waterfall payouts — each one evaluated from your sealed terms in the Nox TEE." },
};

export default function AppPage() {
  const wallet = useWallet();
  const [role, setRole] = useState<Role | null>(null);
  const [availableRoles, setAvailableRoles] = useState<Role[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [rolesError, setRolesError] = useState<string | null>(null);
  const [roleMenu, setRoleMenu] = useState(false);
  const [founderView, setFounderView] = useState<FounderView>("overview");
  const [ownerView, setOwnerView] = useState<OwnerView>("overview");
  const [splitAddr, setSplitAddr] = useState<string | null>(null);
  const [fundedBalance, setFundedBalance] = useState<bigint | null>(null);
  const current = role ? ROLES[role] : null;
  const ownerMeta = ownerView === "balance" ? { noun: "Private balance", description: "Decrypt your balance and review public distribution activity for cap tables that include your wallet." } : ROLES.owner;
  const { noun: activeNoun, description: activeDescription } =
    role === "founder" ? FOUNDER_VIEW_META[founderView] : role === "owner" ? ownerMeta : current ?? { noun: "Wallet access", description: "Checking your on-chain permissions." };

  useEffect(() => {
    let cancelled = false;
    if (!wallet.walletClient || !wallet.address) {
      queueMicrotask(() => {
        if (cancelled) return;
        setAvailableRoles([]);
        setRole(null);
      });
      return () => { cancelled = true; };
    }
    // Loading mirrors an external wallet/RPC synchronization cycle.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRolesLoading(true);
    setRolesError(null);
    (async () => {
      try {
        const count = await wallet.walletClient!.readContract({
          address: SCRIP_WATERFALL_ADDRESS,
          abi: scripWaterfallAbi,
          functionName: "capTableCount",
        });
        const state = await fetchWaterfallState(wallet.walletClient!, count);
        if (cancelled) return;
        const address = wallet.address!.toLowerCase();
        const detected: Role[] = [];
        if (state.capTables.some((table) => table.founder.toLowerCase() === address)) detected.push("founder");
        if (state.capTables.some((table) => table.owners.some((owner) => owner.toLowerCase() === address))) detected.push("owner");
        if (state.auditorGrants.some((grant) => grant.auditor.toLowerCase() === address)) detected.push("auditor");
        setAvailableRoles(detected);
        setRole((previous) => previous && detected.includes(previous) ? previous : detected[0] ?? null);
      } catch (err) {
        if (!cancelled) {
          setAvailableRoles([]);
          setRole(null);
          setRolesError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setRolesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [wallet.address, wallet.walletClient]);
  useEffect(() => {
    if (!wallet.walletClient) return;
    wallet.walletClient
      .readContract({
        address: SCRIP_WATERFALL_ADDRESS,
        abi: scripWaterfallAbi,
        functionName: "splitAddress",
      })
      .then((v) => setSplitAddr(v as string))
      .catch(() => {});
  }, [wallet.walletClient]);
  useEffect(() => {
    if (!wallet.walletClient) return;
    let cancelled = false;
    const poll = () => {
      wallet.walletClient!
        .readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [SCRIP_WATERFALL_ADDRESS] })
        .then((v) => { if (!cancelled) setFundedBalance(v as bigint); })
        .catch(() => {});
    };
    poll();
    const interval = setInterval(poll, 15_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [wallet.walletClient]);

  const switchRole = (next: Role) => { if (!availableRoles.includes(next)) return; setRole(next); setRoleMenu(false); setFounderView("overview"); setOwnerView("overview"); };
  // Anyone with a connected wallet can become a founder by creating their first waterfall —
  // createCapTable has no allowlist. Founder only shows up in availableRoles AFTER they've
  // created one, so the entry point into that flow can't be gated behind availableRoles too,
  // or a brand-new wallet would have no way to ever get there.
  const startFounding = () => { setRole("founder"); setFounderView("overview"); setRoleMenu(false); };
  const canFound = Boolean(wallet.address) && !rolesLoading;

  return <div className="dashboard-shell">
    <aside className="dashboard-sidebar">
      <Link href="/" className="dashboard-logo"><Logo /></Link>
      {canFound && <button className="sidebar-primary" onClick={() => { if (role === "founder") { setFounderView("overview"); document.getElementById("role-content")?.scrollIntoView(); } else if (availableRoles.includes("founder")) { switchRole("founder"); } else { startFounding(); } }}><Plus size={17} /> New waterfall</button>}
      <nav className="sidebar-nav" aria-label="Dashboard">
        <span className="sidebar-label">Workspace</span>
        <button
          className={(role === "founder" && founderView === "overview") || (role === "owner" && ownerView === "overview") || role === "auditor" ? "active" : ""}
          onClick={() => { setFounderView("overview"); setOwnerView("overview"); }}
        ><Icon name="grid"/>Overview</button>
        {role === "owner" && <button className={ownerView === "balance" ? "active" : ""} onClick={() => setOwnerView("balance")}><Icon name="wallet"/>Private balance</button>}
        {role === "founder" && <>
          <button className={founderView === "capTables" ? "active" : ""} onClick={() => setFounderView("capTables")}><Icon name="table"/>Cap tables</button>
          <button className={founderView === "distributions" ? "active" : ""} onClick={() => setFounderView("distributions")}><Icon name="send"/>Distributions</button>
        </>}
        {role === "auditor" && <button><Icon name="audit"/>Audit requests</button>}
        <span className="sidebar-label sidebar-label-spaced">Network</span>
        <a href={`https://sepolia.etherscan.io/address/${SCRIP_WATERFALL_ADDRESS}`} target="_blank" rel="noreferrer"><Icon name="shield"/>Contracts <ArrowUpRight size={13} /></a>
      </nav>
      <div className="sidebar-foot"><Link href="/#how-it-works"><Icon name="help"/>Product guide</Link><div className="network-chip"><i/>Sepolia <span>Live</span></div></div>
    </aside>

    <div className="dashboard-main">
      <header className="dashboard-topbar">
        <div className="mobile-brand"><Logo withWordmark={false}/></div>
        <div className="crumbs"><span>Scrip</span><b>/</b><strong>{activeNoun}</strong></div>
        <div className="topbar-actions">
          {role && availableRoles.length > 1 && <div className="role-switcher">
            <button className="role-trigger" onClick={() => setRoleMenu(!roleMenu)} aria-expanded={roleMenu}><span className={`role-symbol ${role}`}>{role.slice(0,1).toUpperCase()}</span><span>{current!.label}</span><Icon name="switch"/></button>
            {roleMenu && <div className="role-menu"><span>Switch workspace</span>{availableRoles.map(item => <button className={role===item?"selected":""} key={item} onClick={()=>switchRole(item)}><span className={`role-symbol ${item}`}>{item.slice(0,1).toUpperCase()}</span><div><strong>{ROLES[item].label}</strong><small>{ROLES[item].description}</small></div>{role===item&&<Check size={14} />}</button>)}</div>}
          </div>}
          <ConnectButton wallet={wallet}/>
        </div>
      </header>

      <main className="dashboard-content">
        {!wallet.address && wallet.restoring ? <section className="onboarding"><div className="onboarding-copy"><span className="dashboard-eyebrow">Welcome back</span><h1>Restoring your session…</h1><p>Reconnecting your wallet — your role and permissions will load automatically.</p></div></section>
        : !wallet.address ? <section className="onboarding">
          <div className="onboarding-copy"><span className="dashboard-eyebrow">Welcome to Scrip</span><h1>Your private ownership workspace.</h1><p>Connect a Sepolia wallet, choose how you&apos;re using Scrip, and we&apos;ll take you directly to the tools you need.</p></div>
          <div className="onboarding-grid">
            <div className="onboarding-steps"><div className="onboarding-step done"><span>1</span><div><strong>Choose a workspace</strong><p>Switch roles at any time from the top bar.</p></div><b>Done</b></div><div className="onboarding-step current"><span>2</span><div><strong>Connect your wallet</strong><p>Scrip works with your existing Ethereum wallet.</p></div></div><div className="onboarding-step"><span>3</span><div><strong>Open your private view</strong><p>Your available tools and permissions load automatically.</p></div></div></div>
            <div className="onboarding-action"><div className="secure-mark"><Icon name="shield"/></div><span>Step 2 of 3</span><h2>Connect to continue</h2><p>Use a wallet on Ethereum Sepolia. Scrip never takes custody of your assets or keys.</p><ConnectButton wallet={wallet}/><small><i/>Encrypted inputs are prepared locally in your browser.</small></div>
          </div>
        </section> : rolesLoading ? <section className="onboarding"><div className="onboarding-copy"><span className="dashboard-eyebrow">Verifying access</span><h1>Reading wallet roles from Sepolia…</h1><p>Founder, owner, and auditor access is derived from the waterfall contract.</p></div></section>
        : !role ? <section className="onboarding">
          <div className="onboarding-copy"><span className="dashboard-eyebrow">No on-chain role yet</span><h1>This wallet isn&apos;t on a waterfall yet.</h1><p>{rolesError ? `Role detection failed: ${rolesError}` : "You're not listed as an owner and haven't been granted auditor access on any waterfall — but anyone can start one."}</p></div>
          <div className="onboarding-action"><div className="secure-mark"><Icon name="shield"/></div><h2>Build your first waterfall</h2><p>Become a founder by creating a sealed waterfall — owners, tier order, recoup caps, and milestones, encrypted in your browser.</p><button className="button button-primary" onClick={startFounding}><Plus size={15}/> New waterfall</button></div>
        </section>
        : <>
          <section className="dashboard-heading"><div><span className="dashboard-eyebrow">{current!.label} workspace</span><h1>{activeNoun}</h1><p>{activeDescription}</p></div><div className="heading-status"><i/>Connected to Sepolia</div></section>
          <section className="metric-grid">
            <article><div><span>Funded balance</span><Icon name="wallet"/></div><strong>{fundedBalance === null ? "…" : `${formatUsdc(fundedBalance)} USDC`}</strong><p>{splitAddr ? <>Funded via 0xSplits Split <a href={etherscanAddress(splitAddr)} target="_blank" rel="noreferrer">{shortAddr(splitAddr)} <ArrowUpRight size={11} style={{display:"inline"}}/></a></> : "Provable pooled total"}</p></article>
            <article><div><span>Privacy status</span><Icon name="shield"/></div><strong>Protected</strong><p>Terms and payouts remain sealed</p></article>
            <article><div><span>Settlement asset</span><Icon name="wallet"/></div><strong>cUSDC</strong><p>Confidential ERC-7984</p></article>
          </section>
          <section className="role-workspace" id="role-content">
            <header><div><span className={`role-symbol ${role}`}>{role.slice(0,1).toUpperCase()}</span><div><h2>{activeNoun}</h2><p>{activeDescription}</p></div></div><span className="sealed-badge"><Icon name="shield"/>Confidential</span></header>
            <div className="role-content">
              {role === "founder" && founderView === "overview" && <FounderPanel wallet={wallet}/>}
              {role === "founder" && founderView === "capTables" && <CapTablesPanel wallet={wallet}/>}
              {role === "founder" && founderView === "distributions" && <DistributionsPanel wallet={wallet}/>}
              {role === "owner" && <OwnerPanel wallet={wallet} showHistory={ownerView === "balance"}/>}
              {role === "auditor" && <AuditorPanel wallet={wallet}/>}
            </div>
          </section>
          <section className="dashboard-info"><div><Icon name="shield"/><p><strong>Your privacy boundary</strong><span>Addresses and total distributions are public. Waterfall terms (caps, ratios, milestones) and individual payouts stay sealed.</span></p></div><a href={`https://sepolia.etherscan.io/address/${CONFIDENTIAL_USDC_ADDRESS}`} target="_blank" rel="noreferrer">View confidential token <ArrowUpRight size={13} /></a></section>
        </>}
      </main>
    </div>
  </div>;
}
