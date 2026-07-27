"use client";
import { useState } from "react";
import Link from "next/link";
import { useWallet } from "@/app/lib/useWallet";
import { ConnectButton } from "@/app/components/ConnectButton";
import { FounderPanel } from "@/app/components/FounderPanel";
import { OwnerPanel } from "@/app/components/OwnerPanel";
import { AuditorPanel } from "@/app/components/AuditorPanel";
import { Logo } from "@/app/components/Logo";
import { SCRIP_DISTRIBUTOR_ADDRESS, CONFIDENTIAL_USDC_ADDRESS, SPLIT_ADDRESS, USDC_ADDRESS } from "@/app/lib/contracts";
type Tab = "founder" | "owner" | "auditor";
const TABS: { id: Tab; label: string; blurb: string }[] = [
  { id:"owner", label:"Owner", blurb:"View and decrypt the confidential balance assigned to your wallet." },
  { id:"founder", label:"Founder", blurb:"Manage ownership, route revenue, and authorize scoped audits." },
  { id:"auditor", label:"Auditor", blurb:"Review a cap table when the founder has granted access." },
];
const contracts = [["Scrip distributor",SCRIP_DISTRIBUTOR_ADDRESS],["Confidential USDC",CONFIDENTIAL_USDC_ADDRESS],["0xSplits rail",SPLIT_ADDRESS],["USDC",USDC_ADDRESS]] as const;
export default function AppPage(){
 const wallet=useWallet(); const [tab,setTab]=useState<Tab>("owner"); const active=TABS.find(t=>t.id===tab)!;
 return <div className="product-app"><header className="app-header"><Link href="/"><Logo/></Link><ConnectButton wallet={wallet}/></header><main className="app-workspace">
  <div className="app-intro"><div><div className="section-kicker"><span>Workspace</span> Sepolia network</div><h1>Ownership console</h1><p>Manage confidential allocations and distributions from one secure workspace.</p></div><Link href="/" className="text-link">← Back to Scrip</Link></div>
  <div className="privacy-note"><strong>Privacy at a glance:</strong> wallet addresses and distribution totals are visible on-chain. Ownership percentages, individual payouts, and allocation computation remain sealed.</div>
  <section className="app-card"><nav className="app-tabs" aria-label="Workspace roles">{TABS.map(t=><button key={t.id} onClick={()=>setTab(t.id)} className={`app-tab ${tab===t.id?"active":""}`}>{t.label}</button>)}</nav><p className="mb-8 text-sm text-zinc-500">{active.blurb}</p>{tab==="founder"&&<FounderPanel wallet={wallet}/>} {tab==="owner"&&<OwnerPanel wallet={wallet}/>} {tab==="auditor"&&<AuditorPanel wallet={wallet}/>}</section>
  <footer className="app-contracts"><div className="section-kicker mb-3"><span>Network</span> Contract registry</div>{contracts.map(([name,address])=><a key={name} href={`https://sepolia.etherscan.io/address/${address}`} target="_blank" rel="noreferrer"><span>{name}</span><code>{address.slice(0,8)}…{address.slice(-6)} ↗</code></a>)}</footer>
 </main></div>;
}
