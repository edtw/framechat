import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.models.schemas import HealthResponse
from app.routers import chat
from app.routers import orchestrator as orchestrator_routes
from app.services.ai_manager import ai_manager
from app.services.orchestrator import orchestrator

# Configure logging
logging.basicConfig(
    level=settings.LOG_LEVEL,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="AFILIATORS AI Handler",
    description="DeepSeek-powered AI service for affiliate lead management",
    version="1.0.0",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(chat.router, prefix="/api")
app.include_router(orchestrator_routes.router, prefix="/api")


@app.on_event("startup")
async def startup_event():
    """Initialize AI services on startup."""
    logger.info("Starting AFILIATORS AI Handler...")
    try:
        await ai_manager.initialize()
        logger.info("AI Manager initialized successfully (DeepSeek)")
        await orchestrator.initialize()
        logger.info("AI Orchestrator initialized successfully")
    except Exception as e:
        logger.error("Failed to initialize AI services: %s", e)
    logger.info("AFILIATORS AI Handler started")


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Global health check endpoint."""
    try:
        provider_status = await ai_manager.get_provider_status()
        all_healthy = all(provider_status.values()) if provider_status else False
        return HealthResponse(
            status="healthy" if all_healthy else "degraded",
            providers=provider_status,
            version="1.0.0",
        )
    except Exception as e:
        logger.error("Health check failed: %s", e)
        return HealthResponse(
            status="unhealthy",
            providers={"deepseek": False},
            version="1.0.0",
        )


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "service": "AFILIATORS AI Handler",
        "version": "1.0.0",
        "provider": "DeepSeek",
        "status": "running",
        "docs": "/docs",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level=settings.LOG_LEVEL.lower(),
    )
