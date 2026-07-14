import logging
import sys
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.batch import router as batch_router
from app.api.compare import router as compare_router
from app.api.dependencies import warm_vision_service
from app.api.extract import router as extract_router
from app.api.health import router as health_router
from app.api.verify import router as verify_router
from app.core.config import get_settings
from app.core.error_handlers import api_error_handler, request_validation_error_handler
from app.core.errors import ApiError, ErrorEnvelope, ErrorPayload


def configure_app_logging() -> None:
    app_logger = logging.getLogger("app")
    app_logger.setLevel(logging.INFO)
    app_logger.propagate = False

    if app_logger.handlers:
        return

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("%(levelname)s:%(name)s:%(message)s"))
    app_logger.addHandler(handler)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    _ = app
    warm_vision_service()
    yield


def create_app() -> FastAPI:
    configure_app_logging()
    settings = get_settings()
    app = FastAPI(title=settings.app_name, version=settings.app_version, lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.backend_cors_origins,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health_router)
    app.include_router(extract_router)
    app.include_router(verify_router)
    app.include_router(batch_router)
    app.include_router(compare_router)
    app.add_exception_handler(ApiError, api_error_handler)
    app.add_exception_handler(RequestValidationError, request_validation_error_handler)

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        _ = (request, exc)
        envelope = ErrorEnvelope(
            error=ErrorPayload(
                code="internal_error",
                message="Something went wrong. Please try again.",
                details={},
            )
        )
        return JSONResponse(status_code=500, content=envelope.model_dump())

    return app


app = create_app()
