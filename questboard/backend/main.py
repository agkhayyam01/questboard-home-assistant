import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated
from uuid import uuid4

from fastapi import FastAPI, Header, Request
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, ConfigDict, Field, model_validator

from .rewards import RewardEvent
from .store import Store, StoreError


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.store = Store(Path(os.environ.get("DATA_DIR", "backend/data")))
    app.state.store.initialize()
    yield


app = FastAPI(title="Questboard", lifespan=lifespan)


@app.exception_handler(StoreError)
def handle_store_error(request: Request, exc: StoreError):
    return JSONResponse(status_code=exc.status, content={"detail": exc.detail})


class UpdateModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="before")
    @classmethod
    def reject_nulls(cls, value):
        if isinstance(value, dict) and any(v is None for v in value.values()):
            raise ValueError("Fields cannot be null")
        return value


class ProfileUpdate(UpdateModel):
    name: Annotated[str | None, Field(min_length=1, max_length=80)] = None
    color: Annotated[str | None, Field(min_length=1, max_length=80)] = None


class ItemUpdate(UpdateModel):
    equipped: Annotated[bool | None, Field(strict=True)] = None
    placed: Annotated[bool | None, Field(strict=True)] = None


class LayoutUpdate(UpdateModel):
    x: Annotated[float, Field(strict=True, ge=0, le=100)]
    y: Annotated[float, Field(strict=True, ge=0, le=100)]
    size: Annotated[int, Field(strict=True, ge=32, le=128)]
    layer: Annotated[int, Field(strict=True, ge=1, le=1000)]


@app.get("/api/profiles")
def profiles(request: Request):
    return request.app.state.store.profiles()


@app.get("/api/profiles/{profile_id}")
def profile_details(profile_id: str, request: Request):
    return request.app.state.store.details(profile_id)


@app.patch("/api/profiles/{profile_id}")
def update_profile(profile_id: str, update: ProfileUpdate, request: Request):
    return request.app.state.store.update_profile(profile_id, update.model_dump(exclude_unset=True))


@app.post("/api/profiles/{profile_id}/simulate-reward")
def simulate_reward(
    profile_id: str,
    request: Request,
    idempotency_key: Annotated[str | None, Header(min_length=1, max_length=200)] = None,
):
    store = request.app.state.store
    store.record_reward(RewardEvent("simulated", idempotency_key or str(uuid4()), profile_id, "simulated"))
    with store.connect() as db:
        return store.profile(db, profile_id)


@app.post("/api/profiles/{profile_id}/open-chest")
def open_chest(profile_id: str, request: Request):
    return request.app.state.store.open_chest(profile_id)


@app.post("/api/profiles/{profile_id}/items/{item_id}")
def update_item(profile_id: str, item_id: str, update: ItemUpdate, request: Request):
    return request.app.state.store.update_item(profile_id, item_id, update.model_dump(exclude_unset=True))


@app.put("/api/profiles/{profile_id}/items/{item_id}/layout")
def update_layout(profile_id: str, item_id: str, update: LayoutUpdate, request: Request):
    return request.app.state.store.update_layout(profile_id, item_id, update.model_dump())


@app.delete("/api/profiles/{profile_id}/items/{item_id}/layout")
def reset_layout(profile_id: str, item_id: str, request: Request):
    return request.app.state.store.reset_layout(profile_id, item_id)


@app.get("/{path:path}", include_in_schema=False)
def frontend(path: str):
    if path == "api" or path.startswith("api/"):
        return JSONResponse(status_code=404, content={"detail": "Not found"})
    dist = Path(os.environ.get("FRONTEND_DIST", Path(__file__).resolve().parent.parent / "frontend" / "dist")).resolve()
    candidate = (dist / path).resolve()
    if candidate.is_relative_to(dist) and candidate.is_file():
        return FileResponse(candidate)
    index = (dist / "index.html").resolve()
    if candidate.is_relative_to(dist) and index.is_relative_to(dist) and index.is_file() and (not path or "." not in Path(path).name):
        return FileResponse(index)
    return JSONResponse(status_code=404, content={"detail": "Not found"})
