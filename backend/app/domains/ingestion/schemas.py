from pydantic import BaseModel, Field


class ImportResult(BaseModel):
    account_id: str
    posts: int = Field(default=0, description="Posts imported or updated.")
    comments: int = Field(default=0, description="Comments and replies imported or updated.")
    conversations: int = Field(default=0, description="DM conversations read.")
    dms: int = Field(default=0, description="Direct messages imported or updated.")
    metrics: int = Field(default=0, description="Posts with views, shares and reposts from the Zernio analytics.")
    new_messages: int = Field(default=0, description="Comments and DMs not in the database before.")
    errors: list[str] = Field(default_factory=list, description="Non-fatal errors (one post or conversation).")
