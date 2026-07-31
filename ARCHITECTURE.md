# SCRIP — Architecture

## 1. The core insight (why this wraps cleanly)

0xSplits stores **recipients + ownership percentages as on-chain calldata, validated by a
hash**, and distributes ETH/ERC-20 by those percentages. The *leak* is that **the percentages
and payouts are public**. For a cap table / revenue share, that's exactly the sensitive data.

So Scrip doesn't try to push a confidential token through Splits' ERC-20 path (that breaks —
see §3). Instead, Scrip **seals the allocation and the payout**, and uses 0xSplits as the
**public, unmodified revenue-routing + provable-total rail**. The privacy is on the ownership
and the amounts; Splits keeps doing the plumbing.

## 2. Components

| Layer | Choice | Role |
|---|---|---|
| Wrapped protocol | **0xSplits** (unmodified, live on Sepolia) | public revenue routing + provable total |
| Confidential layer | **Nox** (TEE, Intel TDX) — NOT FHE | seal percentages, compute payouts, ACL disclosure |
| Confidential token | **ERC-7984**, Nox's own TEE-based implementation (`@iexec-nox/nox-confidential-contracts`) — NOT OpenZeppelin's confidential-contracts package, which is Zama FHEVM-based and therefore banned | recipients receive sealed amounts |
| ERC20 on-ramp | **`ERC20ToERC7984Wrapper`** (`@iexec-nox/nox-confidential-contracts/contracts/token/extensions/`) | real USDC → confidential token (no mock money), 1:1, `euint256` |
| Contracts | Solidity + Nox Hardhat starter | on ETH Sepolia |
| Frontend | Next.js 16.2 (`--webpack`, never Turbopack), TS, Tailwind | owner portal + auditor view |

## 3. The ERC-7984 / ERC-20 interface wall (KNOWN, designed around)

**Fact (verified from ERC-7984 + 0xSplits docs):** ERC-7984 is **not ERC-20 compliant**; its
transfers are `confidentialTransfer` / `confidentialTransferFrom` (eight variants), not ERC-20
`transfer`/`transferFrom`. 0xSplits' `distributeERC20` expects a real ERC-20. **Therefore you
cannot pour an ERC-7984 token into a Split and call `distributeERC20`.** This is the same wall
that killed the Sablier idea — do not fight it.

Scrip is designed *around* it (§4).

## 4. Two wrap architectures (clean primary, fallback documented)

### CLEAN (primary) — Splits routes the public total, Nox distributes sealed shares
1. Revenue arrives as **real USDC** into a 0xSplits Split (public, provable total in).
2. The Split's recipient is a **Scrip distributor contract** (a single recipient = 100% to Scrip),
   so Splits does what it always does, unmodified, and hands the pooled total to Scrip.
3. Scrip **wraps** the received USDC into a confidential ERC-7984 token (ERC7984ERC20Wrapper).
4. Scrip computes each owner's cut from their **sealed ownership percentage** (Nox TEE
   computation on the public total) and **confidentialTransfers** the sealed amount to each owner.
5. Each owner decrypts only their own payout (ACL). The Split's inbound total remains public.

Here 0xSplits is genuinely wrapped and unmodified — it routes and proves the total; Scrip is a
Split recipient that adds the confidential allocation layer. The "split percentages" live sealed
in Scrip, not in the public Split.

### FALLBACK (if step 3/4 confidential path fights the async TEE in time)
0xSplits handles the **public accounting** (provable total, recipient registry, the equity
structure as a visible-but-aggregate split), while Scrip handles the **confidential payout**
alongside — recipients' individual amounts sealed via Nox, computed from sealed percentages,
paid as ERC-7984. Slightly looser coupling; still "built on / wraps 0xSplits."

Decide clean-vs-fallback at Phase 3.

## 5. Sealing the cap table (the equity layer)

The ownership percentages are held as **sealed handles** in the Scrip contract (each owner's %
is an encrypted euint). The public sees a Split routing 100% to Scrip and a provable total;
it does NOT see how Scrip divides that total. That sealed percentage set **is** the confidential
cap table. Selective disclosure lets the founder decrypt the whole table, an owner decrypt their
own %, an auditor decrypt a granted batch.

## 6. Payout computation (Nox TEE, async)

For each owner `i` with sealed percentage `p[i]` (basis points) and public pooled total `T`:
```
payout[i] = Nox computation: (p[i] * T) / 10_000   // on sealed p[i], public T
```
`mul` by a public total is a sealed×public op; division by the public constant 10_000. Result is
a sealed payout handle, confidentialTransferred to owner `i`. **Async:** submit → TEE Runner
computes → payout handles ready → distribute. UI shows "computing allocations in the TEE" as an
intentional state.

**No-leak-on-error rigor (from GhostLend):** never revert in a way that reveals a sealed
percentage; clamp/handle silently.

## 7. Correctness guard

Sealed percentages must sum to 10_000 (100%). Enforce via a Nox comparison on the sealed sum
against the public constant, or require the founder to submit a valid sealed set proven at
setup. Prevents a broken/over-allocated cap table.

## 8. Data / correlation

A `splitId`/`capTableId` ties the 0xSplits Split, the sealed percentage set, the pooled total,
and the payout batch together. Recipient addresses public; percentages and payouts sealed.

---

## 9. The waterfall upgrade (ScripWaterfall, supersedes the flat-percentage model above)

`hardhat/contracts/ScripWaterfall.sol` (deployed at `0xb9c64beb326ba50acc07bcb4bf1ce0b7f25c3478`,
v2 — see §10 below; supersedes the v1 deploy at `0x137077d0c4ef8179b7e405a19ee4e62210e5ae43`)
replaces the single sealed percentage per owner (§§1-8 above) with an ordered list of sealed
**tiers** — each an absolute recoup cap, a split ratio, and a milestone gate, all sealed handles.
`distribute()` evaluates the whole waterfall in one pass using only Nox's synchronous library
calls (`add/sub/mul/div/lt/select`) — **no async request/callback**, contrary to an earlier design
assumption in the repo-root `ScripWaterfall.sol` spec draft: every Nox compute call here resolves
in the same transaction, exactly like §7's `payout = pct × total / 10_000`, just chained across
more operations and gated by `select` instead of a single `mul`/`div` pair. The only async step
anywhere in this system remains decrypting a handle afterward (§6, unchanged). A separate 0xSplits
Split (`0xB97F83C034A97893f7F8BDD78b70C035b3C501Ee`) routes to `ScripWaterfall`, keeping the
original `ScripDistributor` deployment and demo (§§1-8) untouched.

---

## 10. v2 — per-cap-table fund ledger (fund-safety fix)

Any wallet can create a cap table, and every cap table on this deployment shares one contract's
USDC balance — 0xSplits sends a plain, untagged ERC-20 transfer, so there's no on-chain way to know
which deal an incoming transfer was meant for. v1's `poolRevenue(id)` just read
`usdc.balanceOf(address(this))` directly: with concurrent founders, one cap table's `poolRevenue`/
`distribute` could pool and spend USDC that actually arrived for a different founder's cap table.
v2 adds `pooledUnspent[id]` and `totalPooledUnspent`: `poolRevenue(id)` attributes only the
newly-arrived, not-yet-claimed delta (`balance - totalPooledUnspent`) to the caller's id, and
`distribute(id, publicTotal)` requires `publicTotal <= pooledUnspent[id]`. Residual, disclosed
limit: if two founders both deposit before either calls `poolRevenue`, whoever calls it first
claims the combined new delta for their own id — closing that fully requires a dedicated Split per
waterfall, out of scope here. See the contract's own comment on `pooledUnspent` and `log.md`'s
"[WATERFALL v2]" entry for the real transactions that found and fixed this.
