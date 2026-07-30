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
  // True while a previously-authorized session is being silently re-verified on load —
  // lets the UI show "restoring session" instead of flashing the disconnected/onboarding state.
  restoring: boolean;
  error: string | null;
  connect: () => Promise<void>;
}

type EventedProvider = EIP1193Provider & {
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};

// localStorage only remembers "the wallet was connected last time", purely so the UI can decide
// whether to show a "restoring session" state vs. the first-visit connect prompt. The actual
// session restore is still the wallet's own eth_accounts permission memory, not this flag.
const SESSION_HINT_KEY = "scrip.wallet.session";

// Browser wallet connect (window.ethereum) + the Nox handle client, built on the same wallet.
export function useWallet(): WalletState {
  const [address, setAddress] = useState<Address | null>(null);
  const [walletClient, setWalletClient] = useState<ViemWalletClient | null>(null);
  const [handleClient, setHandleClient] = useState<HandleClient | null>(null);
  const [connecting, setConnecting] = useState(false);
  // Starts false to match SSR (no hydration mismatch); flipped true synchronously in the mount
  // effect below, before the restore attempt, whenever a prior session is on record.
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const handleClientRequestId = useRef(0);

  const clearWallet = useCallback(() => {
    requestId.current += 1;
    handleClientRequestId.current += 1;
    setAddress(null);
    setWalletClient(null);
    setHandleClient(null);
    window.localStorage.removeItem(SESSION_HINT_KEY);
  }, []);

  // The Nox handle client needs its own gateway/subgraph round-trip to spin up. It is only needed
  // for encrypt/decrypt calls (already null-checked everywhere it's consumed) — it must never gate
  // "is the wallet connected" (address/walletClient), or a slow/flaky gateway makes a perfectly
  // connected wallet look disconnected on every refresh.
  const attachHandleClient = useCallback((client: ViemWalletClient) => {
    const currentRequest = ++handleClientRequestId.current;
    void createViemHandleClient(client).then(
      (hClient) => {
        if (currentRequest === handleClientRequestId.current) setHandleClient(hClient);
      },
      () => {
        // Confidential features stay disabled (consumers already null-check handleClient) but the
        // wallet connection and role-gated UI — which only need walletClient — are unaffected.
      }
    );
  }, []);

  const initialise = useCallback(async (requestAccess: boolean) => {
    const currentRequest = ++requestId.current;
    setError(null);
    if (typeof window === "undefined" || !window.ethereum) {
      if (requestAccess) setError("No browser wallet found. Install MetaMask (or similar) and reload.");
      else setRestoring(false);
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
          setError("Switch your wallet to Sepolia to restore this session.");
          return;
        }
      }
      if (currentRequest !== requestId.current) return;
      // Connected state is set immediately — the handle client attaches separately and can't
      // delay or break it.
      setWalletClient(client as ViemWalletClient);
      setAddress(account);
      window.localStorage.setItem(SESSION_HINT_KEY, "1");
      attachHandleClient(client as ViemWalletClient);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (currentRequest === requestId.current) {
        if (requestAccess) setConnecting(false);
        else setRestoring(false);
      }
    }
  }, [clearWallet, attachHandleClient]);

  const connect = useCallback(() => initialise(true), [initialise]);

  useEffect(() => {
    let disposed = false;
    const attempt = () => void initialise(false);

    // Seeds UI from a synchronous external read (localStorage) before the async restore kicks off.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (window.localStorage.getItem(SESSION_HINT_KEY) === "1") setRestoring(true);

    const provider = window.ethereum as EventedProvider | undefined;
    if (!provider) {
      // Some wallet extensions inject window.ethereum slightly after React mounts (especially on
      // a hard refresh). Wait briefly for it instead of giving up and looking "disconnected".
      const onInit = () => { if (!disposed) attempt(); };
      window.addEventListener("ethereum#initialized", onInit, { once: true });
      const timeout = setTimeout(() => { if (!disposed) setRestoring(false); }, 2000);
      return () => {
        disposed = true;
        window.removeEventListener("ethereum#initialized", onInit);
        clearTimeout(timeout);
      };
    }

    // eth_accounts silently restores a connection the wallet has already authorized.
    queueMicrotask(attempt);
    const onAccountsChanged = (accounts: unknown) => {
      if (!Array.isArray(accounts) || accounts.length === 0) clearWallet();
      else void initialise(false);
    };
    const onChainChanged = () => void initialise(false);
    provider.on?.("accountsChanged", onAccountsChanged);
    provider.on?.("chainChanged", onChainChanged);
    provider.on?.("disconnect", clearWallet);
    return () => {
      disposed = true;
      requestId.current += 1;
      provider.removeListener?.("accountsChanged", onAccountsChanged);
      provider.removeListener?.("chainChanged", onChainChanged);
      provider.removeListener?.("disconnect", clearWallet);
    };
  }, [clearWallet, initialise]);

  return { address, walletClient, handleClient, connecting, restoring, error, connect };
}

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}
