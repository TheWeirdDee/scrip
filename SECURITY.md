# Security Review

Scrip completed an internal, code-level security review on August 1, 2026 covering the canonical
waterfall contract, browser transaction flows, encrypted-input validation, access control, fund
accounting, event indexing, and disclosure boundaries. The review found no unresolved critical or
high-severity issue in the intended single-deal Sepolia submission flow. Remediations from the
review are listed below and enforced by lint, TypeScript, behavioral tests, and CI.

## Remediated findings

- Cap-table creation now derives the new ID from its transaction event, removing a cross-user race.
- The builder rejects malformed/duplicate owners, invalid precision, ratios above 100%, and
  milestone outcomes whose active ratios exceed 100%.
- Canonical contract source rejects zero-value distributions, zero/duplicate owners, zero auditors,
  and auditor grants before a payout exists.
- Revenue pooling is founder-only, rejects nonexistent cap tables and empty arrivals, and one-shot
  distribution must consume the full attributed pool so no remainder can be stranded.
- Auditor IDs and addresses are validated before rendering or transaction submission.
- Auditor disclosure is described accurately as scoped and permanent on the current deployment.

## Verified security boundaries

- Owner addresses, tier count/order, and total distributions are public.
- Caps, ratios, milestone flags, and individual payouts are sealed.
- Auditor viewer grants are permanent on the current deployment.
- The current shared Split cannot identify which waterfall an untagged incoming ERC-20 transfer
  belongs to. If multiple founders fund before pooling, the first pool call attributes the combined
  unclaimed delta. The submission flow therefore operates one funded deal at a time and pools
  immediately; a multi-tenant release uses a dedicated Split/escrow for each waterfall.
- Contract source now rejects zero distributions, zero/duplicate owners, zero auditors, and grants
  before distribution. These guards require a new deployment; the addresses in the README remain
  the already-demonstrated v2 deployment until that migration is completed.

## Review matrix

| Area | Result | Evidence |
|---|---|---|
| Founder authorization | Pass in canonical source | create/lock/pool/distribute/grant paths enforce founder ownership |
| Input integrity | Pass | contract address guards plus browser address, precision, tier, and ratio validation |
| Fund accounting | Pass for single-deal flow | per-table ledger, founder-only attribution, full-pool one-shot settlement |
| Reentrancy/state order | Pass | distribution state and ledger are updated before wrapper/token external calls |
| Confidentiality/ACL | Pass | terms remain sealed; each payout grants only its recipient and explicitly granted auditors |
| Cross-user frontend races | Pass | created table ID is decoded from the mined transaction event |
| Event/RPC resilience | Pass | bounded, chunked log scans with adaptive provider fallback |
| Multi-tenant attribution | Deferred architecture item | dedicated Split/escrow per waterfall for simultaneous independent funding |

This review is specific to the repository revision and Sepolia submission scope. Report suspected
vulnerabilities privately to the repository owner before opening a public issue.
