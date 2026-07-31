import type { Address } from "viem";
import type { ViemWalletClient } from "@/app/lib/useWallet";
import { SCRIP_WATERFALL_ADDRESS, scripWaterfallAbi } from "@/app/lib/contracts";

// Same rationale as app/lib/events.ts: ScripWaterfall exposes no isLocked-by-list or createdAt
// getter across all cap tables — these events are the only source of truth for the founder UI's
// history/state, indexed client-side from Sepolia logs.

export interface WaterfallCapTableInfo {
  id: bigint;
  founder: Address;
  owners: Address[];
  tierCount: number;
  createdAtMs: number;
  createdTxHash: `0x${string}`;
  locked: boolean;
  lockedAtMs?: number;
  lockedTxHash?: `0x${string}`;
}

export interface WaterfallRevenuePooledEvent {
  id: bigint;
  publicTotal: bigint;
  blockNumber: bigint;
  logIndex: number;
  txHash: `0x${string}`;
  atMs: number;
}

export interface WaterfallDistributionEvent {
  id: bigint;
  publicTotal: bigint;
  blockNumber: bigint;
  logIndex: number;
  txHash: `0x${string}`;
  atMs: number;
}

export interface WaterfallAuditorGrantEvent {
  id: bigint;
  auditor: Address;
  blockNumber: bigint;
  logIndex: number;
  txHash: `0x${string}`;
  atMs: number;
}

export interface WaterfallState {
  capTables: WaterfallCapTableInfo[];
  pooled: WaterfallRevenuePooledEvent[];
  distributions: WaterfallDistributionEvent[];
  auditorGrants: WaterfallAuditorGrantEvent[];
}

const EMPTY_STATE: WaterfallState = { capTables: [], pooled: [], distributions: [], auditorGrants: [] };

const INITIAL_CHUNK = 45_000n;
const MIN_CHUNK = 500n;
const MAX_LOOKBACK = 3_000_000n;

type EventName = "CapTableCreated" | "WaterfallLocked" | "RevenuePooled" | "DistributionTriggered" | "AuditorGranted";

async function getEvents(client: ViemWalletClient, eventName: EventName, fromBlock: bigint, toBlock: bigint) {
  return client.getContractEvents({
    address: SCRIP_WATERFALL_ADDRESS,
    abi: scripWaterfallAbi,
    eventName,
    fromBlock,
    toBlock,
  });
}

async function scanBackward(
  client: ViemWalletClient,
  eventName: EventName,
  latest: bigint,
  shouldStop: (found: unknown[]) => boolean
) {
  const collected: Awaited<ReturnType<typeof getEvents>> = [];
  const floor = latest > MAX_LOOKBACK ? latest - MAX_LOOKBACK : 0n;
  let to = latest;
  let chunk = INITIAL_CHUNK;

  while (to >= floor) {
    const from = to - chunk + 1n > floor ? to - chunk + 1n : floor;
    try {
      const logs = await getEvents(client, eventName, from, to);
      collected.unshift(...logs);
      if (shouldStop(collected)) break;
      if (from === floor) break;
      to = from - 1n;
    } catch {
      if (chunk <= MIN_CHUNK) throw new Error(`RPC rejected ${eventName} log range even at minimum chunk size`);
      chunk = chunk / 5n > MIN_CHUNK ? chunk / 5n : MIN_CHUNK;
    }
  }
  return collected;
}

async function scanForward(client: ViemWalletClient, eventName: EventName, fromBlock: bigint, toBlock: bigint) {
  const collected: Awaited<ReturnType<typeof getEvents>> = [];
  let from = fromBlock;
  let chunk = INITIAL_CHUNK;

  while (from <= toBlock) {
    const to = from + chunk - 1n < toBlock ? from + chunk - 1n : toBlock;
    try {
      const logs = await getEvents(client, eventName, from, to);
      collected.push(...logs);
      from = to + 1n;
    } catch {
      if (chunk <= MIN_CHUNK) throw new Error(`RPC rejected ${eventName} log range even at minimum chunk size`);
      chunk = chunk / 5n > MIN_CHUNK ? chunk / 5n : MIN_CHUNK;
    }
  }
  return collected;
}

const blockTimestampMs = new Map<string, number>();

async function timestampOf(client: ViemWalletClient, blockNumber: bigint): Promise<number> {
  const key = blockNumber.toString();
  const cached = blockTimestampMs.get(key);
  if (cached !== undefined) return cached;
  const block = await client.getBlock({ blockNumber });
  const ms = Number(block.timestamp) * 1000;
  blockTimestampMs.set(key, ms);
  return ms;
}

export async function fetchWaterfallState(client: ViemWalletClient, capTableCount: bigint): Promise<WaterfallState> {
  if (capTableCount === 0n) return EMPTY_STATE;

  const latest = await client.getBlockNumber();

  const createdLogs = await scanBackward(client, "CapTableCreated", latest, (found) => found.length >= Number(capTableCount));

  let earliestBlock = latest;
  for (const log of createdLogs) {
    if (log.blockNumber !== null && log.blockNumber < earliestBlock) earliestBlock = log.blockNumber;
  }

  const [lockedLogs, pooledLogs, distributedLogs, auditorLogs] = await Promise.all([
    scanForward(client, "WaterfallLocked", earliestBlock, latest),
    scanForward(client, "RevenuePooled", earliestBlock, latest),
    scanForward(client, "DistributionTriggered", earliestBlock, latest),
    scanForward(client, "AuditorGranted", earliestBlock, latest),
  ]);

  const blockNumbers = new Set<bigint>();
  for (const log of [...createdLogs, ...lockedLogs, ...pooledLogs, ...distributedLogs, ...auditorLogs]) {
    if (log.blockNumber !== null) blockNumbers.add(log.blockNumber);
  }
  await Promise.all([...blockNumbers].map((bn) => timestampOf(client, bn)));

  const capTables: WaterfallCapTableInfo[] = createdLogs.map((log) => {
    const args = log.args as { id: bigint; founder: Address; owners: readonly Address[]; tierCount: bigint };
    const lockLog = lockedLogs.find((l) => (l.args as { id: bigint }).id === args.id);
    return {
      id: args.id,
      founder: args.founder,
      owners: [...(args.owners ?? [])],
      tierCount: Number(args.tierCount),
      createdAtMs: blockTimestampMs.get(log.blockNumber!.toString())!,
      createdTxHash: log.transactionHash!,
      locked: Boolean(lockLog),
      lockedAtMs: lockLog ? blockTimestampMs.get(lockLog.blockNumber!.toString()) : undefined,
      lockedTxHash: lockLog?.transactionHash,
    };
  });

  const pooled: WaterfallRevenuePooledEvent[] = pooledLogs.map((log) => {
    const args = log.args as { id: bigint; publicTotal: bigint };
    return {
      id: args.id,
      publicTotal: args.publicTotal,
      blockNumber: log.blockNumber!,
      logIndex: log.logIndex!,
      txHash: log.transactionHash!,
      atMs: blockTimestampMs.get(log.blockNumber!.toString())!,
    };
  });

  const distributions: WaterfallDistributionEvent[] = distributedLogs
    .map((log) => {
      const args = log.args as { id: bigint; publicTotal: bigint };
      return {
        id: args.id,
        publicTotal: args.publicTotal,
        blockNumber: log.blockNumber!,
        logIndex: log.logIndex!,
        txHash: log.transactionHash!,
        atMs: blockTimestampMs.get(log.blockNumber!.toString())!,
      };
    })
    .sort((a, b) => (a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1));

  const auditorGrants: WaterfallAuditorGrantEvent[] = auditorLogs.map((log) => {
    const args = log.args as { id: bigint; auditor: Address };
    return {
      id: args.id,
      auditor: args.auditor,
      blockNumber: log.blockNumber!,
      logIndex: log.logIndex!,
      txHash: log.transactionHash!,
      atMs: blockTimestampMs.get(log.blockNumber!.toString())!,
    };
  });

  return { capTables, pooled, distributions, auditorGrants };
}
