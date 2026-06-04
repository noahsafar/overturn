"""
Health check endpoint for monitoring and load balancer checks.

Returns service health status for web and worker components.
"""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, Optional
from datetime import datetime
import os
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

app = FastAPI()


class HealthCheckResponse(BaseModel):
    status: str
    timestamp: str
    version: str
    components: Dict[str, Dict[str, Any]]
    dependencies: Dict[str, str]


class ComponentHealth(BaseModel):
    status: str
    message: Optional[str] = None
    latency_ms: Optional[float] = None


def get_version() -> str:
    """Get application version from environment or git."""
    return os.environ.get("APP_VERSION", "dev")


def check_database() -> ComponentHealth:
    """Check database connectivity and basic operations."""
    from overturn_worker.models import SessionLocal

    start = datetime.now()
    try:
        with SessionLocal() as session:
            # Simple query to verify connection
            result = session.execute(text("SELECT 1")).scalar()
            if result == 1:
                latency = (datetime.now() - start).total_seconds() * 1000
                return ComponentHealth(
                    status="healthy",
                    latency_ms=round(latency, 2)
                )
    except SQLAlchemyError as e:
        return ComponentHealth(
            status="unhealthy",
            message=f"Database error: {str(e)[:100]}"
        )
    except Exception as e:
        return ComponentHealth(
            status="unhealthy",
            message=f"Unexpected error: {str(e)[:100]}"
        )


def check_temporal() -> ComponentHealth:
    """Check Temporal connectivity."""
    try:
        import temporalio.client

        start = datetime.now()
        # Try to connect to Temporal
        client = temporalio.client.Client.connect(
            os.environ.get("TEMPORAL_HOST", "localhost:7233"),
            namespace=os.environ.get("TEMPORAL_NAMESPACE", "default")
        )

        latency = (datetime.now() - start).total_seconds() * 1000
        return ComponentHealth(
            status="healthy",
            latency_ms=round(latency, 2)
        )
    except Exception as e:
        return ComponentHealth(
            status="unhealthy",
            message=f"Temporal error: {str(e)[:100]}"
        )


def check_llm_provider() -> ComponentHealth:
    """Check LLM provider connectivity (without making actual calls)."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if api_key:
        return ComponentHealth(
            status="healthy",
            message="API key configured"
        )
    return ComponentHealth(
        status="degraded",
        message="No API key configured (dev mode)"
    )


def check_langfuse() -> ComponentHealth:
    """Check Langfuse observability configuration."""
    public_key = os.environ.get("LANGFUSE_PUBLIC_KEY")
    secret_key = os.environ.get("LANGFUSE_SECRET_KEY")

    if public_key and secret_key:
        return ComponentHealth(
            status="healthy",
            message="Langfuse configured"
        )
    return ComponentHealth(
        status="degraded",
        message="Langfuse not configured (telemetry disabled)"
    )


def check_sentry() -> ComponentHealth:
    """Check Sentry error tracking configuration."""
    dsn = os.environ.get("SENTRY_DSN")
    if dsn:
        return ComponentHealth(
            status="healthy",
            message="Sentry configured"
        )
    return ComponentHealth(
        status="degraded",
        message="Sentry not configured (error tracking disabled)"
    )


@app.get("/health", response_model=HealthCheckResponse)
async def health_check():
    """Comprehensive health check endpoint."""
    components = {}

    # Check database
    components["database"] = check_database().dict()

    # Check Temporal
    components["temporal"] = check_temporal().dict()

    # Check external services
    components["llm_provider"] = check_llm_provider().dict()
    components["langfuse"] = check_langfuse().dict()
    components["sentry"] = check_sentry().dict()

    # Determine overall status
    all_healthy = all(
        c.get("status") in ["healthy", "degraded"]
        for c in components.values()
    )
    overall_status = "healthy" if all_healthy else "unhealthy"

    # Get dependency versions
    dependencies = {}
    try:
        import temporalio
        dependencies["temporalio"] = temporalio.__version__
    except ImportError:
        pass

    try:
        import sqlalchemy
        dependencies["sqlalchemy"] = sqlalchemy.__version__
    except ImportError:
        pass

    return HealthCheckResponse(
        status=overall_status,
        timestamp=datetime.now().isoformat(),
        version=get_version(),
        components=components,
        dependencies=dependencies
    )


@app.get("/health/ready")
async def readiness_check():
    """Simple readiness check for Kubernetes/container probes."""
    try:
        from overturn_worker.models import SessionLocal
        with SessionLocal() as session:
            session.execute(text("SELECT 1"))
        return {"status": "ready"}
    except Exception:
        raise HTTPException(status_code=503, detail="Service not ready")


@app.get("/health/live")
async def liveness_check():
    """Simple liveness check for Kubernetes/container probes."""
    return {"status": "alive"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
