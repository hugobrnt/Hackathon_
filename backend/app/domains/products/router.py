from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.core.db import get_session
from app.core.errors import ErrorResponse
from app.domains.products import service
from app.domains.products.schemas import ProductRead, ProductUpdate

router = APIRouter(prefix="/accounts/{account_id}/product", tags=["products"])

SessionDep = Annotated[Session, Depends(get_session)]


@router.get(
    "",
    response_model=ProductRead,
    summary="Product of an account",
    responses={404: {"model": ErrorResponse, "description": "No product for this account."}},
)
def get_product(account_id: str, session: SessionDep) -> ProductRead:
    product = service.get_product(session, account_id)
    if product is None:
        raise HTTPException(status_code=404, detail="No product for this account. Create it with PUT.")
    return ProductRead.model_validate(product)


@router.put(
    "",
    response_model=ProductRead,
    summary="Create or update the product of an account",
    description=(
        "The user chooses a profile (`saas` or `ecommerce`) and gives the landing URL and a description. "
        "Both are required for the automatic DMs: the DM links to the URL, and the LLM uses the description "
        "and the profile to write a relevant DM."
    ),
    responses={404: {"model": ErrorResponse, "description": "Account not found."}},
)
def put_product(account_id: str, payload: ProductUpdate, session: SessionDep) -> ProductRead:
    try:
        return ProductRead.model_validate(service.upsert_product(session, account_id, payload))
    except service.AccountNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Account not found.") from exc
