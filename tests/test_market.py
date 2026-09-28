from datetime import datetime, timezone


def future_times():
    now = int(datetime.now(timezone.utc).timestamp())
    return now + 3600, now + 7200


def test_two_markets_keep_separate_records(direct_deploy):
    market = direct_deploy("contracts/EventMarket.py")
    close, deadline = future_times()
    first = market.create_market("Event A", "Lagos", close, deadline,
                                 "https://example.org/a", "https://example.net/a")
    second = market.create_market("Event B", "Abuja", close, deadline,
                                  "https://example.org/b", "https://example.net/b")
    assert first != second
    assert market.get_market(first)["title"] == "Event A"
    assert market.get_market(second)["title"] == "Event B"


def test_positions_are_isolated_and_close_on_time(direct_vm, direct_deploy, direct_alice):
    market = direct_deploy("contracts/EventMarket.py")
    close, deadline = future_times()
    one = market.create_market("A", "Lagos", close, deadline,
                               "https://example.org/a", "https://example.net/a")
    two = market.create_market("B", "Abuja", close, deadline,
                               "https://example.org/b", "https://example.net/b")
    direct_vm.sender = direct_alice
    direct_vm.value = 100
    market.take_position(one, True)
    direct_vm.value = 0
    assert market.get_market(one)["yes_total"] == 100
    assert market.get_market(two)["yes_total"] == 0
    direct_vm.warp(datetime.fromtimestamp(close, timezone.utc).isoformat())
    direct_vm.value = 100
    with direct_vm.expect_revert("Betting closed"):
        market.take_position(one, True)


def test_resolution_uses_independent_validator_and_preserves_other_market(
        direct_vm, direct_deploy, direct_alice, direct_bob):
    market = direct_deploy("contracts/EventMarket.py")
    close, deadline = future_times()
    one = market.create_market("Concert A", "Lagos", close, deadline,
                               "https://example.org/a", "https://example.net/a")
    two = market.create_market("Concert B", "Abuja", close, deadline,
                               "https://example.org/b", "https://example.net/b")
    direct_vm.sender = direct_alice
    direct_vm.value = 100
    market.take_position(one, True)
    direct_vm.sender = direct_bob
    market.take_position(one, False)
    direct_vm.value = 0
    direct_vm.warp(datetime.fromtimestamp(deadline + 86401, timezone.utc).isoformat())
    direct_vm.mock_web(r"example\.org/a", {"status": 200, "body": "Concert happened in Lagos"})
    direct_vm.mock_web(r"example\.net/a", {"status": 200, "body": "The event opened in Lagos"})
    direct_vm.mock_llm(r"Decide if this named event", '{"outcome":"YES","reason":"Both sources confirm."}')
    assert market.resolve(one) == "YES"
    assert direct_vm.run_validator() is True
    assert market.get_market(one)["outcome"] == 1
    assert market.get_market(two)["outcome"] == 0
    direct_vm.sender = direct_alice
    assert market.claim(one) == 200
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("No winning position"):
        market.claim(one)
    direct_vm.clear_mocks()
    direct_vm.mock_web(r"example\.org/a", {"status": 200, "body": "Concert canceled"})
    direct_vm.mock_web(r"example\.net/a", {"status": 200, "body": "Concert canceled"})
    direct_vm.mock_llm(r"Decide if this named event", '{"outcome":"NO","reason":"Canceled."}')
    assert direct_vm.run_validator() is False


def test_unresolved_market_refunds_after_seven_days(direct_vm, direct_deploy, direct_alice):
    market = direct_deploy("contracts/EventMarket.py")
    close, deadline = future_times()
    market_id = market.create_market("Concert", "Lagos", close, deadline,
                                     "https://example.org/a", "https://example.net/a")
    direct_vm.sender = direct_alice
    direct_vm.value = 100
    market.take_position(market_id, True)
    direct_vm.value = 0
    direct_vm.warp(datetime.fromtimestamp(deadline + 7 * 86400 + 1, timezone.utc).isoformat())
    market.refund_unresolved(market_id)
    assert market.get_market(market_id)["outcome"] == 3
    assert market.claim(market_id) == 100
    with direct_vm.expect_revert("Already claimed"):
        market.claim(market_id)


def test_no_winning_stakes_refunds_losing_side(direct_vm, direct_deploy, direct_alice):
    market = direct_deploy("contracts/EventMarket.py")
    close, deadline = future_times()
    market_id = market.create_market("Concert", "Lagos", close, deadline,
                                     "https://example.org/a", "https://example.net/a")
    direct_vm.sender = direct_alice
    direct_vm.value = 250
    market.take_position(market_id, False)
    direct_vm.value = 0
    direct_vm.warp(datetime.fromtimestamp(deadline + 86401, timezone.utc).isoformat())
    direct_vm.mock_web(r"example\.org/a", {"status": 200, "body": "Concert opened"})
    direct_vm.mock_web(r"example\.net/a", {"status": 200, "body": "Concert began"})
    direct_vm.mock_llm(r"Decide if this named event", '{"outcome":"YES","reason":"Held."}')
    assert market.resolve(market_id) == "YES"
    assert market.get_market(market_id)["outcome"] == 3
    assert market.claim(market_id) == 250


def test_unknown_keeps_market_open(direct_vm, direct_deploy):
    market = direct_deploy("contracts/EventMarket.py")
    close, deadline = future_times()
    market_id = market.create_market("Concert", "Lagos", close, deadline,
                                     "https://example.org/a", "https://example.net/a")
    direct_vm.warp(datetime.fromtimestamp(deadline + 86401, timezone.utc).isoformat())
    direct_vm.mock_web(r"example\.org/a", {"status": 200, "body": "Scheduled"})
    direct_vm.mock_web(r"example\.net/a", {"status": 200, "body": "No update"})
    direct_vm.mock_llm(r"Decide if this named event", '{"outcome":"UNKNOWN","reason":"No confirmation."}')
    assert "remains unresolved" in market.resolve(market_id)
    assert market.get_market(market_id)["outcome"] == 0
