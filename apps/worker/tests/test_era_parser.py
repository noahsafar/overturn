"""ERA parser tests — the seed format and a couple of edge cases."""

from __future__ import annotations

from overturn_worker.era_parser import parse_simple


def test_parses_seed_era():
    era = (
        "835~ST*835*0001~BPR*I*0*C*ACH*CTX*01*123456789*DA*987654321*123456789*~"
        "CLP*CLM001*4*180.00*0.00*0.00*MC*XYZ*11*1*CO~CAS*CO*50*180.00~"
    )
    claims = parse_simple(era)
    assert len(claims) == 1
    c = claims[0]
    assert c.control_number == "CLM001"
    assert c.billed == 180.0
    assert c.paid == 0.0
    assert len(c.denials) == 1
    assert c.denials[0].code == "CO-50"
    assert c.denials[0].amount == 180.0
    assert c.denied == 180.0


def test_handles_multiple_denials_in_one_cas():
    era = "CLP*CLM002*4*500.00*100.00*0.00*MC*XYZ*11*1*CO~CAS*CO*45*400.00*1*16*100.00*1~"
    claims = parse_simple(era)
    assert len(claims) == 1
    codes = {d.code for d in claims[0].denials}
    assert codes == {"CO-45", "CO-16"}


def test_empty_returns_empty():
    assert parse_simple("") == []
