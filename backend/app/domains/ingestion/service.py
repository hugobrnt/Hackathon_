"""Import posts, comments and DMs of one account from Zernio into the database."""

from collections.abc import Iterable, Iterator

from sqlmodel import Session

from app.domains.accounts.models import SocialAccount, utc_now
from app.domains.content import repository
from app.domains.content.models import MessageDirection, MessageKind, Post
from app.domains.ingestion.schemas import ImportResult
from app.integrations.zernio.client import ZernioClient, ZernioError
from app.integrations.zernio.schemas import Comment, Conversation, DirectMessage, PlatformPost


def flatten_comments(comments: Iterable[Comment], parent_id: str | None = None) -> Iterator[tuple[Comment, str | None]]:
    """Yield each comment and its replies, with the id of the parent comment."""
    for comment in comments:
        yield comment, comment.parent_id or parent_id
        yield from flatten_comments(comment.replies, comment.id)


def save_post(session: Session, account: SocialAccount, post: PlatformPost) -> Post:
    saved = repository.upsert_post(
        session,
        account_id=account.id,
        external_id=post.id,
        platform=post.platform or account.platform,
        caption=post.message or "",
        permalink=post.permalink,
        picture=post.picture,
        media_type=post.media_type,
        created_time=post.created_time,
        comment_count=post.comment_count,
        like_count=post.like_count,
    )
    if post.share_count is not None and saved.share_count is None:
        saved.share_count = post.share_count
    return saved


async def refresh_metrics(
    session: Session, client: ZernioClient, account: SocialAccount, posts: list[Post], result: ImportResult
) -> None:
    """Read views, shares and reposts from the Zernio analytics (best effort)."""
    try:
        await client.sync_external_posts(account.id)
    except ZernioError as exc:
        result.errors.append(f"metrics sync: {exc.message}")
    for post in posts:
        try:
            metrics = await client.get_post_metrics(post.external_id, account.id)
        except ZernioError as exc:
            result.errors.append(f"metrics of post {post.external_id}: {exc.message}")
            continue
        if metrics is None:
            continue
        repository.update_post_metrics(
            post,
            views=metrics.views,
            likes=metrics.likes,
            shares=metrics.shares,
            reposts=metrics.reposts,
            updated_at=metrics.last_updated or utc_now(),
        )
        session.add(post)
        result.metrics += 1


def save_comments(
    session: Session, account: SocialAccount, post: Post, comments: Iterable[Comment], result: ImportResult
) -> None:
    for comment, parent_id in flatten_comments(comments):
        author = comment.from_
        is_owner = bool(author and author.is_owner)
        _, created = repository.upsert_message(
            session,
            account_id=account.id,
            kind=MessageKind.comment,
            external_id=comment.id,
            text=comment.message or "",
            post_id=post.id,
            parent_external_id=parent_id,
            author_id=author.id if author else None,
            author_name=(author.username or author.name) if author else None,
            author_is_owner=is_owner,
            direction=MessageDirection.outgoing if is_owner else MessageDirection.incoming,
            created_time=comment.created_time,
        )
        result.comments += 1
        result.new_messages += int(created)


def save_dms(
    session: Session,
    account: SocialAccount,
    conversation: Conversation,
    messages: Iterable[DirectMessage],
    result: ImportResult,
) -> None:
    for dm in messages:
        direction = (
            MessageDirection.outgoing if dm.direction == "outgoing" else MessageDirection.incoming
        )
        _, created = repository.upsert_message(
            session,
            account_id=account.id,
            kind=MessageKind.dm,
            external_id=dm.id,
            text=dm.message or "",
            conversation_id=conversation.id,
            author_id=dm.sender_id,
            author_name=dm.sender_name or conversation.participant_name,
            author_is_owner=direction == MessageDirection.outgoing,
            direction=direction,
            created_time=dm.created_at,
        )
        result.dms += 1
        result.new_messages += int(created)


async def import_account(session: Session, client: ZernioClient, account: SocialAccount) -> ImportResult:
    """Import the recent posts with their comments, then the DM conversations.

    A failure on one post or one conversation goes into `errors`. A failure on the
    post list stops the import, because nothing else can work without it.
    """
    result = ImportResult(account_id=account.id)

    saved_posts: list[Post] = []
    for remote_post in await client.list_account_posts(account.id):
        post = save_post(session, account, remote_post)
        saved_posts.append(post)
        result.posts += 1
        try:
            comments = [c async for c in client.iter_post_comments(remote_post.id, account.id)]
        except ZernioError as exc:
            result.errors.append(f"comments of post {remote_post.id}: {exc.message}")
            continue
        save_comments(session, account, post, comments, result)
    session.commit()

    await refresh_metrics(session, client, account, saved_posts, result)
    session.commit()

    try:
        conversations = [c async for c in client.iter_conversations(account.id)]
    except ZernioError as exc:
        result.errors.append(f"conversations: {exc.message}")
        conversations = []
    for conversation in conversations:
        result.conversations += 1
        try:
            messages = [
                m async for m in client.iter_conversation_messages(conversation.id, account.id)
            ]
        except ZernioError as exc:
            result.errors.append(f"messages of conversation {conversation.id}: {exc.message}")
            continue
        save_dms(session, account, conversation, messages, result)

    account.last_imported_at = utc_now()
    session.add(account)
    session.commit()
    return result
