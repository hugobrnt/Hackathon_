"""Idempotent writes and reads for posts and messages."""

from datetime import datetime

from sqlmodel import Session, col, select

from app.domains.content.models import Message, MessageDirection, MessageKind, Post


def upsert_post(
    session: Session,
    *,
    account_id: str,
    external_id: str,
    platform: str,
    caption: str,
    permalink: str | None = None,
    picture: str | None = None,
    media_type: str | None = None,
    created_time: datetime | None = None,
    comment_count: int = 0,
    like_count: int = 0,
) -> Post:
    post = session.exec(
        select(Post).where(Post.account_id == account_id, Post.external_id == external_id)
    ).first()
    if post is None:
        post = Post(account_id=account_id, external_id=external_id, platform=platform)
    post.platform = platform
    post.caption = caption
    post.permalink = permalink
    post.picture = picture
    post.media_type = media_type
    post.created_time = created_time
    post.comment_count = comment_count
    post.like_count = like_count
    session.add(post)
    session.flush()
    return post


def get_or_create_post(
    session: Session,
    *,
    account_id: str,
    external_id: str,
    platform: str,
    caption: str | None = None,
    permalink: str | None = None,
    picture: str | None = None,
) -> Post:
    """Find a post by its platform id. Create it with partial data if it is not imported yet.

    The function does not overwrite an imported post: the webhook data is partial.
    """
    post = session.exec(
        select(Post).where(Post.account_id == account_id, Post.external_id == external_id)
    ).first()
    if post is not None:
        return post
    post = Post(
        account_id=account_id,
        external_id=external_id,
        platform=platform,
        caption=caption or "",
        permalink=permalink,
        picture=picture,
    )
    session.add(post)
    session.flush()
    return post


def upsert_message(
    session: Session,
    *,
    account_id: str,
    kind: MessageKind,
    external_id: str,
    text: str,
    post_id: int | None = None,
    conversation_id: str | None = None,
    parent_external_id: str | None = None,
    author_id: str | None = None,
    author_name: str | None = None,
    author_is_owner: bool = False,
    direction: MessageDirection = MessageDirection.incoming,
    created_time: datetime | None = None,
) -> tuple[Message, bool]:
    """Insert or update a message. Returns the message and True if it is new."""
    message = session.exec(
        select(Message).where(
            Message.account_id == account_id,
            Message.kind == kind,
            Message.external_id == external_id,
        )
    ).first()
    created = message is None
    if message is None:
        message = Message(account_id=account_id, kind=kind, external_id=external_id)
    message.text = text
    message.post_id = post_id
    message.conversation_id = conversation_id
    message.parent_external_id = parent_external_id
    message.author_id = author_id
    message.author_name = author_name
    message.author_is_owner = author_is_owner
    message.direction = direction
    message.created_time = created_time
    session.add(message)
    return message, created


def update_post_metrics(
    post: Post,
    *,
    views: int | None,
    likes: int | None,
    shares: int | None,
    reposts: int | None,
    updated_at: datetime | None,
) -> None:
    if views is not None:
        post.view_count = views
    if likes is not None:
        post.like_count = max(post.like_count, likes)
    if shares is not None:
        post.share_count = shares
    if reposts is not None:
        post.repost_count = reposts
    post.metrics_updated_at = updated_at


def list_posts(session: Session, account_id: str | None = None) -> list[Post]:
    query = select(Post)
    if account_id:
        query = query.where(Post.account_id == account_id)
    return list(session.exec(query.order_by(col(Post.created_time).desc())))


def list_post_messages(session: Session, post_id: int) -> list[Message]:
    query = (
        select(Message)
        .where(Message.post_id == post_id)
        .order_by(col(Message.created_time).asc())
    )
    return list(session.exec(query))
