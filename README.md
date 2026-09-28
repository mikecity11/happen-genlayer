# Happen — real-world event prediction markets

An initial GenLayer contract and interactive browser prototype. The web preview is **local demo mode**: it stores simulated markets and positions in your browser and never moves GEN. The Python contract has been deployed and smoke-tested in **GenLayer Studio's sandbox**; this is not a public Studionet/Bradbury deployment or a wallet-connected website.

## Market rule

The question is whether the named event *physically begins with attendees in the named city* by its UTC deadline. A new venue in the same city counts as YES. Cancellation, online-only delivery, relocation to another city, or postponement past the deadline counts as NO. Conflicting or insufficient evidence means UNKNOWN and does not settle the market. The contract lets users refund after seven days if still unresolved. The two evidence URLs are set when the market is created and cannot be edited later.

## State and funds

`TreeMap` fields key every market by an incrementing ID and every position by ID plus address. Positions close before the event deadline. Stake is native GEN; winners claim a proportional share of the combined pool. If there were no stakes on the winning side, all stakes become refundable. Payouts use integer division, so a small amount of rounding dust may remain in the contract. The current version has no fee or owner withdrawal; it is not ready to handle meaningful funds. Withdrawals rely on GenLayer's asynchronous external message transfer and need verification on the deployment network.

## Run preview

From `web/`, run `python3 -m http.server 8000`, then visit `http://localhost:8000`. The example card has placeholder evidence URLs; create a market with two real public URLs to try the local flow.

## Local contract checks

Install `genlayer-test` and `genvm-linter`, then from the project root run `python3 -m pytest tests -q` and `genvm-lint check contracts/EventMarket.py`. Six direct-mode tests cover independent market storage, stake cutoff, mocked validator agreement and disagreement, YES payouts, no-winner refunds, unknown evidence, and the seven-day refund path. These tests mock web pages and LLM output; they do not verify live evidence retrieval, finality, or value transfers on the chain.

## Studio sandbox smoke test (September 28, 2026)

- Contract: `0x3C503720453B8B91f527d7686E036C0d97044825` in Studio.
- Deployment transaction: `0xff044bc2b53061dd36361c9469a27caf545e4c62e8d83a17b5070fbd5affb106` (finalized).
- Market creation transaction: `0xdcc2433e376a8ba8a729f6a2af94d38524d56e0d4957cdc922e4d9da082ed3f9` (finalized).
- `get_market(1)` returned the 2026 New York City Marathon question, separate NYRR and Race Roster evidence URLs, `outcome=0`, and zero YES/NO stakes. No token stake, settlement, payout, or external page render was tested in Studio.

## Before public network deployment

1. Deploy to the intended public test network; Studio's sandbox deployment is a separate instance.
2. Test two independent event pages that GenVM can actually render; test contradictory, unavailable, and prompt-injected pages.
3. Verify create, place position, resolve, unknown, refund, claim, repeat claim, and multiple markets end to end, including actual transfer receipt and finality.
4. Restrict market creation or moderate source URLs until malicious links and ambiguous questions have a clear policy. Add a payout dust policy and verify contract balance accounting with concurrent markets.
5. Connect a wallet-enabled frontend to the deployed contract. The browser prototype is intentionally not represented as a connected dApp.

## GenLayer API references

- https://docs.genlayer.com/developers/intelligent-contracts/features/storage
- https://docs.genlayer.com/developers/intelligent-contracts/features/web-access
- https://docs.genlayer.com/developers/intelligent-contracts/equivalence-principle
- https://docs.genlayer.com/developers/intelligent-contracts/features/value-transfers
