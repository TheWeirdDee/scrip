"use client";

import { useDecrypt } from "@/app/lib/useDecrypt";
import { createViemHandleClient } from "@iexec-nox/handle";

type HandleClient = Awaited<ReturnType<typeof createViemHandleClient>>;

function formatUsdc(raw: bigint): string {
  const whole = raw / 1_000_000n;
  const frac = (raw % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "") || "0";
  return `${whole}.${frac}`;
}

export function DecryptField({
  label,
  handle,
  handleClient,
  formatAsUsdc = false,
  formatAsBps = false,
}: {
  label: string;
  handle: `0x${string}`;
  handleClient: HandleClient | null;
  formatAsUsdc?: boolean;
  formatAsBps?: boolean;
}) {
  const { status, value, attempt, message, run } = useDecrypt();

  const formatted =
    value === null
      ? null
      : formatAsUsdc
        ? `${formatUsdc(value)} USDC`
        : formatAsBps
          ? `${Number(value) / 100}%`
          : value.toString();

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-white/[.03] px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-xs uppercase tracking-wide text-zinc-500">
          {label}
        </div>
        <div className="truncate font-mono text-xs text-zinc-500">{handle}</div>
      </div>

      {status === "idle" && (
        <button
          onClick={() => handleClient && run(handleClient, handle)}
          disabled={!handleClient}
          className="shrink-0 rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background transition-colors hover:bg-zinc-200 disabled:opacity-40"
        >
          Decrypt
        </button>
      )}

      {status === "computing" && (
        <div className="flex shrink-0 items-center gap-2 text-sm text-amber-400">
          <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
          computing in the TEE… (attempt {attempt}/12)
        </div>
      )}

      {status === "done" && (
        <div className="shrink-0 font-mono text-sm font-semibold text-emerald-400">
          {formatted}
        </div>
      )}

      {status === "denied" && (
        <div
          className="shrink-0 text-sm text-zinc-500"
          title={message ?? undefined}
        >
          sealed — access denied
        </div>
      )}

      {status === "error" && (
        <div className="shrink-0 text-sm text-red-400" title={message ?? undefined}>
          error decrypting
        </div>
      )}
    </div>
  );
}
