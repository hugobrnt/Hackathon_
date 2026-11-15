from urllib.parse import parse_qs, urlsplit

import pytest
import respx
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import get_settings
from app.domains.classification.taxonomy import Intent
from app.domains.tracking.service import is_bot, with_utm
from tests.test_outreach import PRODUCT, add_comment, mock_reply, setup_post

BROWSER = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Instagram 350.0"


def test_with_utm_keeps_other_params() -> None:
    url = with_utm("https://shop.test/p?ref=abc&utm_source=old", source="instagram", content="post_1", term="objection")
    query = parse_qs(urlsplit(url).query)
    assert query["ref"] == ["abc"]
    assert query["utm_source"] == ["instagram"] and query["utm_medium"] == ["dm"]
    assert query["utm_campaign"] == ["auto_dm"] and query["utm_content"] == ["post_1"]
    assert query["utm_term"] == ["objection"]


def test_bot_detection() -> None:
    assert is_bot("facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)")
    assert is_bot("meta-externalagent/1.1")
    assert is_bot(None)
    assert not is_bot(BROWSER)


def path(url: str) -> str:
    # The short links use PUBLIC_BASE_URL: keep only the path for the test client.
    return urlsplit(url).path


def test_click_flow_and_ctr(client: TestClient, session: Session, zernio_mock: respx.MockRouter) -> None:
    post_id = setup_post(session)
    add_comment(session, post_id, "c1", "u1", Intent.purchase_intent)
    add_comment(session, post_id, "c2", "u2", Intent.pre_purchase_question)
    mock_reply(zernio_mock, "c1")
    mock_reply(zernio_mock, "c2")
    client.put("/accounts/acc-1/product", json=PRODUCT)
    client.put(f"/posts/{post_id}/auto-dm", json={"enabled": True})
    attempts = client.post(f"/posts/{post_id}/auto-dm/run").json()["attempts"]
    assert [a["status"] for a in attempts] == ["sent", "sent"]
    url = attempts[0]["tracked_url"]

    # The Instagram preview bot is not a click.
    bot = client.get(path(url), headers={"User-Agent": "facebookexternalhit/1.1"})
    assert bot.status_code == 302
    for _ in range(2):
        response = client.get(path(url), headers={"User-Agent": BROWSER})
    assert response.status_code == 302 and response.headers["cache-control"] == "no-store"
    query = parse_qs(urlsplit(response.headers["location"]).query)
    assert query["utm_term"] == ["purchase_intent"] and query["utm_content"] == ["post_p1"]

    links = client.get("/tracking/links", params={"post_id": post_id}).json()
    link = next(item for item in links if item["short_url"] == url)
    assert (link["click_count"], link["bot_hits"]) == (2, 1)

    stats = client.get("/tracking/stats", params={"account_id": "acc-1"}).json()
    assert (stats["dms_sent"], stats["links_clicked"], stats["clicks"]) == (2, 1, 2)
    assert stats["click_through_rate"] == 0.5
    assert stats["posts"][0]["post_id"] == post_id

    dms = client.get("/auto-dm/attempts").json()
    assert {d["link_clicks"] for d in dms} == {0, 2}


def test_unknown_link(client: TestClient) -> None:
    assert client.get("/r/nope").status_code == 404


def test_localhost_falls_back_to_utm_url(
    client: TestClient, session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("TRACKING_BASE_URL", "http://localhost:8000")
    get_settings.cache_clear()
    post_id = setup_post(session)
    message_id = add_comment(session, post_id, "c1", "u1", Intent.purchase_intent)
    client.put("/accounts/acc-1/product", json=PRODUCT)
    client.put(f"/posts/{post_id}/auto-dm", json={"enabled": True})
    draft = client.post(f"/messages/{message_id}/auto-dm/preview").json()
    assert draft["tracked_url"].startswith(str(PRODUCT["landing_url"]))
    assert "utm_medium=dm" in draft["tracked_url"] and draft["tracked_url"] in draft["text"]
