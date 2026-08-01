import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateWaterfall, proofWaterfallIsConditional } from '../waterfall-eval.ts';

test('absolute caps run in order before ratios', () => {
  assert.deepEqual(evaluateWaterfall(3_000n, [
    { beneficiary: 0, absCap: 1_000n, ratioBps: 0n, milestone: true },
    { beneficiary: 1, absCap: 0n, ratioBps: 7_000n, milestone: true },
    { beneficiary: 0, absCap: 0n, ratioBps: 3_000n, milestone: true },
  ], 2), [1_600n, 1_400n]);
});

test('sealed milestone changes payout for the same public total', () => {
  const { noMilestone, withMilestone } = proofWaterfallIsConditional();
  assert.deepEqual(noMilestone, [1_600n, 1_400n]);
  assert.deepEqual(withMilestone, [1_300n, 1_700n]);
  assert.notDeepEqual(noMilestone, withMilestone);
});

test('inactive tiers pay zero and integer division leaves dust', () => {
  assert.deepEqual(evaluateWaterfall(101n, [
    { beneficiary: 0, absCap: 100n, ratioBps: 0n, milestone: false },
    { beneficiary: 0, absCap: 0n, ratioBps: 5_000n, milestone: true },
    { beneficiary: 1, absCap: 0n, ratioBps: 5_000n, milestone: true },
  ], 2), [50n, 50n]);
});
