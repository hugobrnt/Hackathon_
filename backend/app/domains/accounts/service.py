from sqlmodel import Session, col, select

from app.core.config import Settings
from app.domains.accounts.models import SocialAccount
from app.integrations.zernio.client import ZernioClient, ZernioError


async def resolve_profile_id(client: ZernioClient, settings: Settings) -> str:
    """Use `ZERNIO_PROFILE_ID` if it is set, else the first Zernio profile."""
    if settings.zernio_profile_id:
        return settings.zernio_profile_id
    profiles = await client.list_profiles()
    if not profiles:
        raise ZernioError(404, "No Zernio profile found. Create one in the Zernio dashboard.")
    return profiles[0].id


def upsert_account(
    session: Session,
    account_id: str,
    platform: str,
    username: str | None,
    profile_id: str | None,
    is_demo: bool = False,
    is_active: bool | None = None,
    needs_reconnection: bool | None = None,
) -> SocialAccount:
    account = session.get(SocialAccount, account_id)
    if account is None:
        account = SocialAccount(id=account_id, platform=platform, is_demo=is_demo)
    account.platform = platform
    account.username = username or account.username
    account.profile_id = profile_id or account.profile_id
    if is_active is not None:
        account.is_active = is_active
    if needs_reconnection is not None:
        account.needs_reconnection = needs_reconnection
    session.add(account)
    session.commit()
    session.refresh(account)
    return account


async def sync_accounts(
    session: Session, client: ZernioClient, platform: str | None = None, profile_id: str | None = None
) -> list[SocialAccount]:
    """Copy the accounts connected in Zernio into the local database."""
    remote = await client.list_accounts(platform=platform)
    return [
        upsert_account(session, a.id, a.platform, a.username or a.display_name, a.profile_id_str,
                       is_active=a.is_active, needs_reconnection=a.needs_reconnection)
        for a in remote
        if profile_id is None or a.profile_id_str == profile_id
    ]


def list_accounts(session: Session) -> list[SocialAccount]:
    return list(session.exec(select(SocialAccount).order_by(col(SocialAccount.connected_at))))
