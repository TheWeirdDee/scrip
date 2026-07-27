"use client";

import { useCallback, useRef, useState } from "react";
import { createViemHandleClient } from "@iexec-nox/handle";

type HandleClient = Awaited<ReturnType<typeof createViemHandleClient>>;

export type DecryptStatus = "idle" | "computing" | "done" | "denied" | "error";

export interface DecryptState {
  status: DecryptStatus;
  value: bigint | null;
  attempt: number;
  message: string | null;
  run: (handleClient: HandleClient, handle: `0x${string}`) => Promise<void>;
  reset: () => void;
}

const MAX_ATTEMPTS = 12;
const DELAY_MS = 5000;

// The Nox pipe is async: a handle that was just written on-chain can 403 ("not authorized" /
// "does not exist") for anywhere from zero to a couple of minutes while the Handle Gateway's ACL
// index catches up to the chain (confirmed repeatedly across Phase 0-4 testing). This hook makes
// that an explicit, intentional "computing in the TEE..." UI state instead of a single failed call.
export function useDecrypt(): DecryptState {
  const [status, setStatus] = useState<DecryptStatus>("idle");
  const [value, setValue] = useState<bigint | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const cancelled = useRef(false);

  const reset = useCallback(() => {
    cancelled.current = true;
    setStatus("idle");
    setValue(null);
    setAttempt(0);
    setMessage(null);
  }, []);

  const run = useCallback(async (handleClient: HandleClient, handle: `0x${string}`) => {
    cancelled.current = false;
    setStatus("computing");
    setValue(null);
    setMessage(null);

    for (let i = 1; i <= MAX_ATTEMPTS; i++) {
      if (cancelled.current) return;
      setAttempt(i);
      try {
        const { value: decrypted } = await handleClient.decrypt(handle);
        if (cancelled.current) return;
        setValue(decrypted as bigint);
        setStatus("done");
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const denied = /not authorized|access.?denied|does not exist/i.test(msg);
        if (i === MAX_ATTEMPTS) {
          if (cancelled.current) return;
          setStatus(denied ? "denied" : "error");
          setMessage(msg);
          return;
        }
        // A denial this early is very likely just ACL propagation lag, not an actual denial —
        // keep retrying with backoff either way, the loop bails after MAX_ATTEMPTS regardless.
        await new Promise((r) => setTimeout(r, DELAY_MS));
      }
    }
  }, []);

  return { status, value, attempt, message, run, reset };
}
