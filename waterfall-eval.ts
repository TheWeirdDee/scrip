/**
 * Scrip — WATERFALL EVALUATION (reference of the logic Nox runs in the TEE).
 *
 * This is the plain-language algorithm the confidential compute performs. In production this runs
 * INSIDE Nox on SEALED terms (thresholds/ratios/milestones), taking only the PUBLIC total as clear
 * input, and emitting one SEALED payout per owner. Here it is shown in the clear so the behavior is
 * legible and unit-testable. The deployed contract performs the Nox operations synchronously in
 * distribute(); only later handle decryption is asynchronous.
 *
 * WHY THIS IS THE INNOVATION: every other Nox project seals a STATIC number the founder typed.
 * Scrip's split is DECIDED by a rule Nox evaluates on hidden terms — confidential COMPUTATION.
 * Real deals are conditional waterfalls (investor paid back first, then a split, better if milestone
 * hit). Scrip lets that settle on-chain without exposing the terms OR the payouts.
 */

export interface Tier {
  beneficiary: number;   // owner index (PUBLIC)
  absCap: bigint;        // SEALED in prod: "first $X to this beneficiary" (0 = none)
  ratioBps: bigint;      // SEALED in prod: share of remainder after abs caps, in bps (10000 = 100%)
  milestone: boolean;    // SEALED in prod: gate — tier applies only if true (default true/ungated)
}

/**
 * Evaluate the waterfall on the public total. Tiers are consumed IN ORDER.
 * Two passes so "first $X" style abs-caps are honored before ratio splits of the remainder —
 * matching how real waterfalls read ("investor paid back first, THEN split the rest").
 *
 * MUL BEFORE DIV always (integer floor). All arithmetic maps to Nox sealed ops in production.
 */
export function evaluateWaterfall(publicTotal: bigint, tiers: Tier[], ownerCount: number): bigint[] {
  const payout: bigint[] = new Array(ownerCount).fill(0n);
  let remaining = publicTotal;

  // PASS 1 — absolute caps ("first $X to A"), in order, gated by sealed milestone
  for (const t of tiers) {
    if (!t.milestone) continue;              // sealed gate: tier skipped if milestone false
    if (t.absCap > 0n) {
      const take = remaining < t.absCap ? remaining : t.absCap;   // min(remaining, cap)
      payout[t.beneficiary] += take;
      remaining -= take;
    }
  }

  // PASS 2 — ratio splits of what's LEFT ("then split the rest 70/30")
  // ratios are applied to the remainder AFTER abs caps; MUL before DIV.
  for (const t of tiers) {
    if (!t.milestone) continue;
    if (t.ratioBps > 0n) {
      const take = (remaining * t.ratioBps) / 10000n;   // floor
      payout[t.beneficiary] += take;
    }
  }
  // (any dust from flooring stays in the contract; a final remainder tier can sweep it if desired)

  return payout;
}

/**
 * THE DEMO PROOF (use as a unit test + a demo beat): the SAME public total distributes DIFFERENTLY
 * depending on the sealed milestone — something a static split literally cannot express.
 */
export function proofWaterfallIsConditional() {
  // Deal: investor (owner 0) paid back first $1000, then founder (owner 1) / investor 70/30,
  //       BUT if founder milestone hit, founder/investor 85/15.
  const total = 3000n;
  const ownerCount = 2;

  const base = (milestoneHit: boolean): Tier[] => [
    { beneficiary: 0, absCap: 1000n, ratioBps: 0n, milestone: true },                 // investor first $1000
    { beneficiary: 1, absCap: 0n, ratioBps: milestoneHit ? 8500n : 7000n, milestone: true },  // founder
    { beneficiary: 0, absCap: 0n, ratioBps: milestoneHit ? 1500n : 3000n, milestone: true },  // investor rest
  ];

  const noMilestone = evaluateWaterfall(total, base(false), ownerCount);
  // remaining after $1000 to investor = 2000 → founder 70% = 1400, investor 30% = 600
  // investor total = 1000 + 600 = 1600 ; founder = 1400
  const withMilestone = evaluateWaterfall(total, base(true), ownerCount);
  // remaining 2000 → founder 85% = 1700, investor 15% = 300 ; investor total = 1300 ; founder = 1700

  return { noMilestone, withMilestone };
  // SAME $3000 total, DIFFERENT payouts based on a SEALED milestone. Static splits can't do this.
}
