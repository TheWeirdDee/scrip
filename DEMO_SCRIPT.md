# SCRIP — Demo Script (≤4 minutes)

Principle: demo the *sealed cap table paying out*, not the plumbing. One frame carries the whole
thesis: a real 0xSplits Split with a provable public total, and payouts that are sealed handles.
Everything real on Sepolia, no mock data. Don't over-explain TEE internals.

---

## 0:00–0:50 — The leak
**On screen:** a real 0xSplits Split on the explorer — recipients and **percentages visible**.
**Say:**
> "This is how revenue-sharing works on-chain today with 0xSplits — a great protocol. But look:
> every owner's percentage is public, and every payout is public. This is a company's cap table,
> naked on a block explorer. In the real world your shareholding and your dividends are private.
> On-chain they're not — which is exactly why serious capital won't share revenue this way."

## 0:50–2:00 — The sealed cap table
**On screen:** the Scrip app. Founder sets up a cap table — owners listed, but each ownership %
entered and **sealed in the browser** before it hits the chain.
**Say:**
> "Scrip wraps 0xSplits — unmodified — and seals the part that matters. The owners are known.
> The percentages are not."
**Action:** open the explorer on the Scrip contract — **percentages are encrypted handles**, and
the 0xSplits Split routes its total to Scrip.
> "The split still runs. The total flowing through is public and provable. But how it's divided —
> sealed."

## 2:00–3:00 — Confidential payout (the one frame)
**On screen:** revenue (real USDC) flows into the Split → pools in Scrip → distribute.
**Say:**
> "Revenue comes in — publicly, provably. Then Scrip pays each owner their share, computed inside
> the TEE from their sealed percentage."
**Action:** explorer on the distribution — **recipient addresses visible, every amount a sealed
handle.** THE one-frame thesis:
> "Nobody watching the chain knows if this owner earned $500 or $500,000. The total is provable;
> the splits are sealed."
**Action:** an owner logs in, decrypts **their own** payout — and only theirs.

## 3:00–3:40 — Accountability (selective disclosure)
**On screen:** founder grants an auditor access.
**Say:**
> "Confidential isn't unaccountable. The founder can grant an auditor a scoped view of the whole
> cap table — recorded on-chain — while the public still sees only the total, and each owner still
> sees only their own."

## 3:40–4:00 — Close
**Say:**
> "0xSplits lets anyone share revenue by ownership — but it's all public. Scrip makes it
> confidential without touching the protocol: private cap table, private payouts, provable total.
> That's Scrip."

---

## Four-sentence written pitch
> On-chain revenue-sharing protocols like 0xSplits expose every owner's percentage and every
> payout — your cap table, naked on a block explorer, which is why serious capital won't use it.
> Scrip wraps 0xSplits unmodified and seals the part that matters: ownership percentages and
> payouts are confidential, computed in a Nox TEE, while the total distributed stays publicly
> provable. Each owner decrypts only their own share; an auditor can be granted a scoped view;
> the public sees only the total. Private ownership, private dividends, provable accountability —
> layered onto a real protocol without modifying it.

## Delivery notes
- ≤4:00 hard limit (scored). Time it.
- The "sealed handles where the amounts should be" explorer frame is the money shot — lead the
  video's thumbnail/first frames with it.
- Everything on screen is real: real 0xSplits Split, real Sepolia USDC, real Nox compute. No mock
  data — it's ⭐⭐⭐. If any leg is faked, cut it.
