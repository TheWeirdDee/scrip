"use client";
import { ChevronDown, ArrowUpRight } from "lucide-react";
import type { WalletState } from "@/app/lib/useWallet";
function short(addr: string) { return `${addr.slice(0, 6)}…${addr.slice(-4)}`; }
export function ConnectButton({ wallet }: { wallet: WalletState }) {
  if (wallet.address) return <div className="wallet-control"><span className="wallet-identicon">{wallet.address.slice(2,4).toUpperCase()}</span><span>{short(wallet.address)}</span><ChevronDown size={14} /></div>;
  if (wallet.walletChoices.length > 0) return <div className="connect-wrap wallet-picker">
    <span className="wallet-picker-label">Multiple wallets found — choose one</span>
    <div className="wallet-picker-list">
      {wallet.walletChoices.map((option) => <button key={option.rdns} onClick={() => wallet.chooseWallet(option.rdns)} className="wallet-picker-option">
        <span className="wallet-identicon">{option.name.slice(0, 2).toUpperCase()}</span>{option.name}
      </button>)}
    </div>
  </div>;
  return <div className="connect-wrap"><button onClick={wallet.connect} disabled={wallet.connecting} className="connect-control">{wallet.connecting ? "Connecting…" : "Connect wallet"}<ArrowUpRight size={15} /></button>{wallet.error && <span className="connect-error">{wallet.error}</span>}</div>;
}