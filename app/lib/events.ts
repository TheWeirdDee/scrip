import type { Address } from "viem";
import type { ViemWalletClient } from "@/app/lib/useWallet";
import { SCRIP_DISTRIBUTOR_ADDRESS, scripDistributorAbi } from "@/app/lib/contracts";

// ScripDistributor emits no per-cap-table creation timestamp or lock status getter — the events
// below are the only source of truth for the founder UI's history/state (per the contract's own
// comments: "views: handles are public pointers"; there is no isLocked()/createdAt() view). We
// index them client-side from Sepolia logs rather than inventing contract reads that don't exist.

export interface CapTableInfo {
  id: bigint;
  founder: Address;
  owners: Address[];
  createdAtMs: number;
  createdTxHash: `0x${string}`;
  locked: boolean;
  lockedAtMs?: number;
  lockedTxHash?: `0x${string}`;
}

export interface RevenuePooledEvent {
  id: bigint;
  publicTotal: bigint;
  blockNumber: bigint;
  logIndex: number;
  txHash: `0x${string}`;
  atMs: number;
}

export interface DistributionEvent {
  id: bigint;
  publicTotal: bigint;
  blockNumber: bigint;
  logIndex: number;
  txHash: `0x${string}`;
  atMs: number;
}

export interface AuditorGrantEvent {
  id: bigint;
  auditor: Address;
  blockNumber: bigint;
  logIndex: number;
  txHash: `0x${string}`;
  atMs: number;
}

export interface ScripState {
  capTables: CapTableInfo[];
  pooled: RevenuePooledEvent[];
  distributions: DistributionEvent[];
  auditorGrants: AuditorGrantEvent[];
}

const EMPTY_STATE: ScripState = { capTables: [], pooled: [], distributions: [], auditorGrants: [] };

// Most public RPC providers cap eth_getLogs to a block-range window (10k-50k blocks depending on
// provider); we can't know the connected wallet's provider ahead of time, so start optimistic and
// fall back to a smaller chunk whenever a provider rejects the range.
const INITIAL_CHUNK = 45_000n;
const MIN_CHUNK = 500n;
// ScripDistributor was deployed recently relative to any given `latest` block; bound the backward
// scan so a cold load can't hang scanning toward genesis on a contract that turns out to have zero
// events (e.g. a fresh redeploy with no cap tables yet).
const MAX_LOOKBACK = 3_000_000n;

type EventName =
  | "CapTableCreated"
  | "PercentagesLocked"
  | "RevenuePooled"
  | "DistributionTriggered"
  | "AuditorGranted";

async function getEvents(
  client: ViemWalletClient,
  eventName: EventName,
  fromBlock: bigint,
  toBlock: bigint
) {
  return client.getContractEvents({
    address: SCRIP_DISTRIBUTOR_ADDRESS,
    abi: scripDistributorAbi,
    eventName,
    fromBlock,
    toBlock,
  });
}

// Scans backward from `latest` in shrinking chunks until `shouldStop` is satisfied or the lookback
// cap is hit. Used only for CapTableCreated, since capTableCount tells us exactly how many logs to
// expect — every other event type is then fetched forward over the now-known live block range.
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

// Fetches forward over a known (small, already-bounded) range, halving the chunk on provider
// rejection instead of failing the whole page.
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

export async function fetchScripState(client: ViemWalletClient, capTableCount: bigint): Promise<ScripState> {
  if (capTableCount === 0n) return EMPTY_STATE;

  const latest = await client.getBlockNumber();

  const createdLogs = await scanBackward(client, "CapTableCreated", latest, (found) => found.length >= Number(capTableCount));

  let earliestBlock = latest;
  for (const log of createdLogs) {
    if (log.blockNumber !== null && log.blockNumber < earliestBlock) earliestBlock = log.blockNumber;
  }

  const [lockedLogs, pooledLogs, distributedLogs, auditorLogs] = await Promise.all([
    scanForward(client, "PercentagesLocked", earliestBlock, latest),
    scanForward(client, "RevenuePooled", earliestBlock, latest),
    scanForward(client, "DistributionTriggered", earliestBlock, latest),
    scanForward(client, "AuditorGranted", earliestBlock, latest),
  ]);

  const blockNumbers = new Set<bigint>();
  for (const log of [...createdLogs, ...lockedLogs, ...pooledLogs, ...distributedLogs, ...auditorLogs]) {
    if (log.blockNumber !== null) blockNumbers.add(log.blockNumber);
  }
  await Promise.all([...blockNumbers].map((bn) => timestampOf(client, bn)));

  const capTables: CapTableInfo[] = createdLogs.map((log) => {
    const args = log.args as { id: bigint; founder: Address; owners: readonly Address[] };
    const lockLog = lockedLogs.find((l) => (l.args as { id: bigint }).id === args.id);
    return {
      id: args.id,
      founder: args.founder,
      owners: [...(args.owners ?? [])],
      createdAtMs: blockTimestampMs.get(log.blockNumber!.toString())!,
      createdTxHash: log.transactionHash!,
      locked: Boolean(lockLog),
      lockedAtMs: lockLog ? blockTimestampMs.get(lockLog.blockNumber!.toString()) : undefined,
      lockedTxHash: lockLog?.transactionHash,
    };
  });

  const pooled: RevenuePooledEvent[] = pooledLogs.map((log) => {
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

  const distributions: DistributionEvent[] = distributedLogs
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

  const auditorGrants: AuditorGrantEvent[] = auditorLogs.map((log) => {
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
