# Happen — real-world event prediction markets

An initial GenLayer contract and interactive browser prototype. The web preview is **local demo mode**: it stores simulated markets and positions in your browser and never moves GEN. The Python contract is **not deployed or network-verified**.

## Market rule

The question is whether the named event *physically begins with attendees in the named city* by its UTC deadline. A new venue in the same city counts as YES. Cancellation, online-only delivery, relocation to another city, or postponement past the deadline counts as NO. Conflicting or insufficient evidence means UNKNOWN and does not settle the market. The contract lets users refund after seven days if still unresolved. The two evidence URLs are set when the market is created and cannot be edited later.

## State and funds

`TreeMap` fields key every market by an incrementing ID and every position by ID plus address. Positions close before the event deadline. Stake is native GEN; winners claim a proportional share of the combined pool. If there were no stakes on the winning side, all stakes become refundable. Payouts use integer division, so a small amount of rounding dust may remain in the contract. The current version has no fee or owner withdrawal; it is not ready to handle meaningful funds. Withdrawals rely on GenLayer's asynchronous external message transfer and need verification on the deployment network.

## Run preview

From `web/`, run `python3 -m http.server 8000`, then visit `http://localhost:8000`. The example card has placeholder evidence URLs; create a market with two real public URLs to try the local flow.

## Local contract checks

Install `genlayer-test` and `genvm-linter`, then from the project root run `python3 -m pytest tests -q` and `genvm-lint check contracts/EventMarket.py`. Six direct-mode tests cover independent market storage, stake cutoff, mocked validator agreement and disagreement, YES payouts, no-winner refunds, unknown evidence, and the seven-day refund path. These tests mock web pages and LLM output; they do not verify live evidence retrieval, finality, or value transfers on the chain.

## Before network deployment

1. Run the contract in GenLayer Studio on the chosen network and check the syntax/API against its current runtime.
2. Test two independent event pages that GenVM can actually render; test contradictory, unavailable, and prompt-injected pages.
3. Verify create, place position, resolve, unknown, refund, claim, repeat claim, and multiple markets end to end, including actual transfer receipt and finality.
4. Restrict market creation or moderate source URLs until malicious links and ambiguous questions have a clear policy. Add a payout dust policy and verify contract balance accounting with concurrent markets.
5. Connect a wallet-enabled frontend to the deployed contract. The browser prototype is intentionally not represented as a connected dApp.

## GenLayer API references

- https://docs.genlayer.com/developers/intelligent-contracts/features/storage
- https://docs.genlayer.com/developers/intelligent-contracts/features/web-access
- https://docs.genlayer.com/developers/intelligent-contracts/equivalence-principle
- https://docs.genlayer.com/developers/intelligent-contracts/features/value-transfers
