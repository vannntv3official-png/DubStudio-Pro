import logging
import sys
from pathlib import Path

# Ensure backend root is on sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.core.config import settings
from app.core.errors import DubStudioError
from app.core.security import redact_sensitive_string
from app.database.session import init_db
from app.api.v1.router import api_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("dubstudio.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing DubStudio AI Backend...")
    await init_db()
    logger.info(f"DubStudio AI Backend ready at http://{settings.HOST}:{settings.PORT}")
    yield
    logger.info("Shutting down DubStudio AI Backend...")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS Middleware (Electron renderer and localhost web clients)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(DubStudioError)
async def dubstudio_error_handler(request: Request, exc: DubStudioError):
    logger.warning(f"DubStudio Error [{exc.code}]: {exc.message}")
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.to_dict()},
    )


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    err_str = redact_sensitive_string(str(exc))
    logger.exception(f"Unhandled backend error: {err_str}")
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": {
                "code": "INTERNAL_SERVER_ERROR",
                "message": "An unexpected error occurred during processing.",
                "details": err_str,
                "recovery": "Check application logs for details and try again.",
            }
        },
    )


app.include_router(api_router, prefix=settings.API_V1_STR)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=False,
    )
