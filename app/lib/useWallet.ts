"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

type EventedProvider = EIP1193Provider & {
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};

// Browser wallet connect (window.ethereum) + the Nox handle client, built on the same wallet.
export function useWallet(): WalletState {
  const [address, setAddress] = useState<Address | null>(null);
  const [walletClient, setWalletClient] = useState<ViemWalletClient | null>(null);
  const [handleClient, setHandleClient] = useState<HandleClient | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const clearWallet = useCallback(() => {
    requestId.current += 1;
    setAddress(null);
    setWalletClient(null);
    setHandleClient(null);
  }, []);

  const initialise = useCallback(async (requestAccess: boolean) => {
    const currentRequest = ++requestId.current;
    setError(null);
    if (typeof window === "undefined" || !window.ethereum) {
      if (requestAccess) setError("No browser wallet found. Install MetaMask (or similar) and reload.");
      return;
    }
    if (requestAccess) setConnecting(true);
    try {
      const client = createWalletClient({ chain: sepolia, transport: custom(window.ethereum) }).extend(publicActions);
      const accounts = requestAccess ? await client.requestAddresses() : await client.getAddresses();
      const [account] = accounts;
      if (!account) {
        clearWallet();
        return;
      }
      const chainId = await client.getChainId();
      if (chainId !== sepolia.id) {
        if (requestAccess) {
          try {
            await client.switchChain({ id: sepolia.id });
          } catch {
            setError("Please switch your wallet to Sepolia and reconnect.");
            return;
          }
        } else {
          clearWallet();
          setError("Switch your wallet to Sepolia to restore this session.");
          return;
        }
      }
      const hClient = await createViemHandleClient(client);
      if (currentRequest !== requestId.current) return;
      setWalletClient(client as ViemWalletClient);
      setHandleClient(hClient);
      setAddress(account);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (requestAccess && currentRequest === requestId.current) setConnecting(false);
    }
  }, [clearWallet]);

  const connect = useCallback(() => initialise(true), [initialise]);

  useEffect(() => {
    const provider = window.ethereum as EventedProvider | undefined;
    if (!provider) return;
    // eth_accounts silently restores a connection the wallet has already authorized.
    queueMicrotask(() => void initialise(false));
    const onAccountsChanged = (accounts: unknown) => {
      if (!Array.isArray(accounts) || accounts.length === 0) clearWallet();
      else void initialise(false);
    };
    const onChainChanged = () => void initialise(false);
    provider.on?.("accountsChanged", onAccountsChanged);
    provider.on?.("chainChanged", onChainChanged);
    provider.on?.("disconnect", clearWallet);
    return () => {
      requestId.current += 1;
      provider.removeListener?.("accountsChanged", onAccountsChanged);
      provider.removeListener?.("chainChanged", onChainChanged);
      provider.removeListener?.("disconnect", clearWallet);
    };
  }, [clearWallet, initialise]);

  return { address, walletClient, handleClient, connecting, error, connect };
}

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}
