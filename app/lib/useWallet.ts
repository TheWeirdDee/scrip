"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createWalletClient, custom, publicActions, type Address, type EIP1193Provider } from "viem";
import { sepolia } from "viem/chains";
import { createViemHandleClient } from "@iexec-nox/handle";

export type ViemWalletClient = ReturnType<typeof createWalletClient> & ReturnType<typeof publicActions>;
type HandleClient = Awaited<ReturnType<typeof createViemHandleClient>>;

type EventedProvider = EIP1193Provider & {
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};

export interface WalletOption {
  rdns: string;
  name: string;
}

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
  // Populated only when more than one wallet extension is installed and none has been chosen yet.
  // The UI should offer these instead of calling connect() directly.
  walletChoices: WalletOption[];
  chooseWallet: (rdns: string) => Promise<void>;
}

interface EIP6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}
interface EIP6963ProviderDetail {
  info: EIP6963ProviderInfo;
  provider: EventedProvider;
}

// localStorage only remembers "the wallet was connected last time" / "which wallet extension the
// user picked", purely so the UI can decide whether to show a restoring/picker state vs. the
// first-visit connect prompt. The actual session restore is still the wallet's own eth_accounts
// permission memory, not these flags.
const SESSION_HINT_KEY = "scrip.wallet.session";
const PROVIDER_HINT_KEY = "scrip.wallet.providerRdns";

// How long to wait for EIP-6963 wallet announcements before deciding. When more than one wallet
// extension is installed (e.g. MetaMask + Phantom), they all contest the single window.ethereum
// slot, and some browsers (Brave) show a "which wallet?" arbitration popup on every single
// request through it — including a silent restore check on every page refresh. Talking directly
// to a specific EIP-6963-announced provider object instead of window.ethereum sidesteps that
// arbitration entirely, which is the whole point of the standard.
const DISCOVERY_WINDOW_MS = 250;
const LEGACY_INJECT_WAIT_MS = 1750;

export function useWallet(): WalletState {
  const [address, setAddress] = useState<Address | null>(null);
  const [walletClient, setWalletClient] = useState<ViemWalletClient | null>(null);
  const [handleClient, setHandleClient] = useState<HandleClient | null>(null);
  const [connecting, setConnecting] = useState(false);
  // Starts false to match SSR (no hydration mismatch); flipped true synchronously in the mount
  // effect below, before the restore attempt, whenever a prior session is on record.
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [walletChoices, setWalletChoices] = useState<WalletOption[]>([]);
  const requestId = useRef(0);
  const handleClientRequestId = useRef(0);
  const discovered = useRef(new Map<string, EIP6963ProviderDetail>());
  const listenersCleanup = useRef<(() => void) | null>(null);

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

  // Runs connect/restore against one specific EIP-1193 provider object — never the shared,
  // contestable window.ethereum — so a multi-wallet browser never has to arbitrate the request.
  // Holds its own latest reference (rather than closing over its own useCallback binding) so the
  // accountsChanged/chainChanged listeners below can call back into it without a self-reference.
  const runWithRef = useRef<(provider: EventedProvider, requestAccess: boolean) => Promise<void>>(async () => {});
  const runWith = useCallback(async (provider: EventedProvider, requestAccess: boolean) => {
    const currentRequest = ++requestId.current;
    setError(null);
    if (requestAccess) setConnecting(true);

    listenersCleanup.current?.();
    const onAccountsChanged = (accounts: unknown) => {
      if (!Array.isArray(accounts) || accounts.length === 0) clearWallet();
      else void runWithRef.current(provider, false);
    };
    const onChainChanged = () => void runWithRef.current(provider, false);
    provider.on?.("accountsChanged", onAccountsChanged);
    provider.on?.("chainChanged", onChainChanged);
    provider.on?.("disconnect", clearWallet);
    listenersCleanup.current = () => {
      provider.removeListener?.("accountsChanged", onAccountsChanged);
      provider.removeListener?.("chainChanged", onChainChanged);
      provider.removeListener?.("disconnect", clearWallet);
    };

    try {
      const client = createWalletClient({ chain: sepolia, transport: custom(provider) }).extend(publicActions);
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
  useEffect(() => { runWithRef.current = runWith; }, [runWith]);

  // Decides which provider to talk to: a remembered choice, the only one installed, or — if
  // genuinely ambiguous — surfaces walletChoices instead of guessing.
  const resolveAndRun = useCallback(async (requestAccess: boolean) => {
    const known = Array.from(discovered.current.values());
    const storedRdns = window.localStorage.getItem(PROVIDER_HINT_KEY);
    const preferred = storedRdns ? known.find((d) => d.info.rdns === storedRdns) : undefined;

    if (preferred) {
      setWalletChoices([]);
      await runWith(preferred.provider, requestAccess);
      return;
    }
    if (known.length === 1) {
      setWalletChoices([]);
      await runWith(known[0].provider, requestAccess);
      return;
    }
    if (known.length > 1) {
      setWalletChoices(known.map((d) => ({ rdns: d.info.rdns, name: d.info.name })));
      setConnecting(false);
      setRestoring(false);
      return;
    }

    // No EIP-6963 announcements at all — fall back to legacy window.ethereum for wallets that
    // don't yet support the discovery standard. Some extensions inject it slightly after mount.
    let legacy = window.ethereum as EventedProvider | undefined;
    if (!legacy) {
      legacy = await new Promise<EventedProvider | undefined>((resolve) => {
        const onInit = () => resolve(window.ethereum as EventedProvider | undefined);
        window.addEventListener("ethereum#initialized", onInit, { once: true });
        setTimeout(() => {
          window.removeEventListener("ethereum#initialized", onInit);
          resolve(window.ethereum as EventedProvider | undefined);
        }, LEGACY_INJECT_WAIT_MS);
      });
    }
    if (legacy) {
      await runWith(legacy, requestAccess);
    } else if (requestAccess) {
      setError("No browser wallet found. Install MetaMask (or similar) and reload.");
      setConnecting(false);
    } else {
      setRestoring(false);
    }
  }, [runWith]);

  const connect = useCallback(async () => {
    setConnecting(true);
    await resolveAndRun(true);
  }, [resolveAndRun]);

  const chooseWallet = useCallback(async (rdns: string) => {
    const detail = discovered.current.get(rdns);
    if (!detail) return;
    window.localStorage.setItem(PROVIDER_HINT_KEY, rdns);
    setWalletChoices([]);
    setConnecting(true);
    await runWith(detail.provider, true);
  }, [runWith]);

  useEffect(() => {
    let disposed = false;
    const onAnnounce = (event: Event) => {
      const detail = (event as CustomEvent<EIP6963ProviderDetail>).detail;
      if (!detail?.info?.rdns) return;
      discovered.current.set(detail.info.rdns, detail);
    };
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    // Seeds UI from a synchronous external read (localStorage) before the async restore kicks off.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (window.localStorage.getItem(SESSION_HINT_KEY) === "1") setRestoring(true);

    const timer = setTimeout(() => { if (!disposed) void resolveAndRun(false); }, DISCOVERY_WINDOW_MS);

    return () => {
      disposed = true;
      requestId.current += 1;
      clearTimeout(timer);
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
      listenersCleanup.current?.();
    };
  }, [resolveAndRun]);

  return { address, walletClient, handleClient, connecting, restoring, error, connect, walletChoices, chooseWallet };
}

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}
