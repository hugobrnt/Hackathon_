from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.core.db import get_session
from app.core.errors import ErrorResponse
from app.domains.products import service
from app.domains.products.schemas import ProductCreate, ProductRead, ProductUpdate

router = APIRouter(tags=["products"])

SessionDep = Annotated[Session, Depends(get_session)]
NOT_FOUND: dict[int | str, dict[str, Any]] = {404: {"model": ErrorResponse}}


def _raise(exc: service.ProductError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=exc.message)


@router.get(
    "/accounts/{account_id}/products",
    response_model=list[ProductRead],
    summary="List the products of an account",
    description="The catalog page: each product or landing page with its title, link and description.",
)
def list_products(account_id: str, session: SessionDep, active_only: bool = False) -> list[ProductRead]:
    return [ProductRead.model_validate(p) for p in service.list_products(session, account_id, active_only)]


@router.post(
    "/accounts/{account_id}/products",
    response_model=ProductRead,
    status_code=201,
    summary="Add a product to the catalog",
    description=(
        "Each product has a title, a link and a description. The LLM uses them to find the product of each "
        "comment (F7 ter) and to write a DM that links to the right page."
    ),
    responses=NOT_FOUND,
)
def create_product(account_id: str, payload: ProductCreate, session: SessionDep) -> ProductRead:
    try:
        return ProductRead.model_validate(service.create_product(session, account_id, payload))
    except service.ProductError as exc:
        raise _raise(exc) from exc


@router.get("/products/{product_id}", response_model=ProductRead, summary="Get a product", responses=NOT_FOUND)
def get_product(product_id: int, session: SessionDep) -> ProductRead:
    try:
        return ProductRead.model_validate(service.get_product(session, product_id))
    except service.ProductError as exc:
        raise _raise(exc) from exc


@router.put("/products/{product_id}", response_model=ProductRead, summary="Update a product", responses=NOT_FOUND)
def update_product(product_id: int, payload: ProductUpdate, session: SessionDep) -> ProductRead:
    try:
        return ProductRead.model_validate(service.update_product(session, product_id, payload))
    except service.ProductError as exc:
        raise _raise(exc) from exc


@router.delete(
    "/products/{product_id}",
    response_model=ProductRead,
    summary="Remove a product from the catalog",
    description="Deactivates the product (`is_active=false`). The past DMs and links keep it.",
    responses=NOT_FOUND,
)
def delete_product(product_id: int, session: SessionDep) -> ProductRead:
    try:
        return ProductRead.model_validate(service.deactivate_product(session, product_id))
    except service.ProductError as exc:
        raise _raise(exc) from exc
