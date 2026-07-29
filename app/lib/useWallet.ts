"use client";

import { useCallback, useState } from "react";
import { createWalletClient, custom, publicActions, type Address, type EIP1193Provider } from "viem";
import { sepolia } from "viem/chains";
import { createViemHandleClient } from "@iexec-nox/handle";

export type ViemWalletClient = ReturnType<typeof createWalletClient> & ReturnType<typeof publicActions>;
type HandleClient = Awaited<ReturnType<typeof createViemHandleClient>>;

export interface WalletState {
  address: Address | null;
  walletClient: ViemWalletClient | null;
  handleClient: HandleClient | null;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
}

// Browser wallet connect (window.ethereum) + the Nox handle client, built on the same wallet
// client. No wagmi/RainbowKit — this app only ever needs one chain (Sepolia) and one connect flow.
export function useWallet(): WalletState {
  const [address, setAddress] = useState<Address | null>(null);
  const [walletClient, setWalletClient] = useState<ViemWalletClient | null>(null);
  const [handleClient, setHandleClient] = useState<HandleClient | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setError(null);
    if (typeof window === "undefined" || !window.ethereum) {
      setError("No browser wallet found. Install MetaMask (or similar) and reload.");
      return;
    }
    setConnecting(true);
    try {
      const client = createWalletClient({
        chain: sepolia,
        transport: custom(window.ethereum),
      }).extend(publicActions);

      const [account] = await client.requestAddresses();
      const chainId = await client.getChainId();
      if (chainId !== sepolia.id) {
        try {
          await client.switchChain({ id: sepolia.id });
        } catch {
          setError("Please switch your wallet to Sepolia and reconnect.");
          setConnecting(false);
          return;
        }
      }

      const hClient = await createViemHandleClient(client);

      setWalletClient(client as ViemWalletClient);
      setHandleClient(hClient);
      setAddress(account);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setConnecting(false);
    }
  }, []);

  return { address, walletClient, handleClient, connecting, error, connect };
}

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}
