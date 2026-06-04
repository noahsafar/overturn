"""
Environment validation and initialization for the worker.

This module validates required environment variables at startup.
"""

import os
import sys
from typing import Dict, List, Optional
from dataclasses import dataclass
from enum import Enum

# Import sentry early so it can capture initialization errors
try:
    from . import sentry
except ImportError:
    sentry = None  # sentry-sdk not installed


class Severity(Enum):
    ERROR = "error"
    WARNING = "warning"


@dataclass
class ValidationError:
    """A single environment variable validation error."""
    var_name: str
    message: str
    severity: Severity


@dataclass
class ValidationResult:
    """Result of environment validation."""
    valid: bool
    errors: List[ValidationError]
    warnings: List[ValidationError]
    environment: str


# Environment variable specifications
ENV_SPECS: Dict[str, Dict] = {
    # Database
    "DATABASE_URL": {
        "description": "PostgreSQL connection string with pgvector",
        "required": True,
        "validator": lambda v: v.startswith("postgresql://"),
        "examples": ["postgresql://user:pass@host:5432/dbname?schema=public"],
    },
    # LLM
    "ANTHROPIC_API_KEY": {
        "description": "Anthropic API key (ZDR endpoint required for PHI)",
        "required_in_env": ["staging", "production"],
    },
    "ANTHROPIC_ZDR": {
        "description": "Enable Anthropic ZDR (zero data retention)",
        "default": "true",
    },
    # Temporal
    "TEMPORAL_HOST": {
        "description": "Temporal server host",
        "required": True,
    },
    "TEMPORAL_NAMESPACE": {
        "description": "Temporal namespace",
        "default": "default",
    },
    "TEMPORAL_TASK_QUEUE": {
        "description": "Temporal task queue name",
        "default": "appeals",
    },
    # Object Storage
    "S3_BUCKET": {
        "description": "S3 bucket for ERA/claim document storage",
        "required_in_env": ["staging", "production"],
    },
    "AWS_REGION": {
        "description": "AWS region",
        "default": "us-east-1",
    },
    # Observability
    "SENTRY_DSN": {
        "description": "Sentry DSN for error tracking",
        "required_in_env": ["staging", "production"],
    },
    "LANGFUSE_PUBLIC_KEY": {
        "description": "Langfuse public key for LLM observability",
        "required_in_env": ["staging", "production"],
    },
    "LANGFUSE_SECRET_KEY": {
        "description": "Langfuse secret key",
        "required_in_env": ["staging", "production"],
    },
    # Browser Automation
    "BROWSERBASE_API_KEY": {
        "description": "Browserbase API key",
        "required_in_env": ["staging", "production"],
    },
    "STAGEHAND_ENV": {
        "description": "Stagehand environment (BROWSERBASE, LOCAL, FAKE)",
        "default": "FAKE",
        "validator": lambda v: v in ["BROWSERBASE", "LOCAL", "FAKE"],
    },
    # External Services
    "DOCUMO_API_KEY": {
        "description": "Documo API key for eFax",
        "required_in_env": ["staging", "production"],
    },
    "LOB_API_KEY": {
        "description": "Lob API key for mail-house",
        "required_in_env": ["staging", "production"],
    },
    "RESEND_API_KEY": {
        "description": "Resend API key for email",
        "required_in_env": ["staging", "production"],
    },
    # Clearinghouse
    "CLEARINGHOUSE_POLL_INTERVAL_S": {
        "description": "SFTP poll interval in seconds",
        "default": "300",
        "validator": lambda v: v.isdigit() and int(v) > 0,
    },
    # Internal
    "WORKER_INTERNAL_URL": {
        "description": "Internal URL for worker API",
        "default": "http://localhost:8001",
    },
}


def validate_environment() -> ValidationResult:
    """Validate all environment variables."""
    env = os.environ.get("NODE_ENV", os.environ.get("ENVIRONMENT", "development"))
    errors: List[ValidationError] = []
    warnings: List[ValidationError] = []

    for var_name, spec in ENV_SPECS.items():
        value = os.environ.get(var_name)
        is_required = (
            spec.get("required", False) or
            (env in spec.get("required_in_env", []))
        )

        # Check if missing
        if not value:
            if is_required and "default" not in spec:
                errors.append(ValidationError(
                    var_name=var_name,
                    message=f"Missing required environment variable: {var_name}",
                    severity=Severity.ERROR
                ))
                continue
            elif not is_required:
                continue

        # Use default if available
        actual_value = value or spec.get("default", "")

        # Run custom validator
        validator = spec.get("validator")
        if validator and not validator(actual_value):
            if is_required:
                errors.append(ValidationError(
                    var_name=var_name,
                    message=f"Invalid value for {var_name}: {actual_value}",
                    severity=Severity.ERROR
                ))
            else:
                warnings.append(ValidationError(
                    var_name=var_name,
                    message=f"Potentially invalid value for {var_name}: {actual_value}",
                    severity=Severity.WARNING
                ))

        # Warn if dev values in staging/production
        if env in ["staging", "production"] and _is_dev_value(actual_value):
            warnings.append(ValidationError(
                var_name=var_name,
                message=f"Using development/placeholder value for {var_name} in {env}",
                severity=Severity.WARNING
            ))

    return ValidationResult(
        valid=len(errors) == 0,
        errors=errors,
        warnings=warnings,
        environment=env,
    )


def _is_dev_value(value: str) -> bool:
    """Check if a value looks like a dev/placeholder value."""
    dev_patterns = [
        "localhost",
        "127.0.0.1",
        "dev.local",
        "development",
        "test_",
        "stub",
        "fake",
    ]
    value_lower = value.lower()
    return any(pattern in value_lower for pattern in dev_patterns)


def format_validation_result(result: ValidationResult) -> str:
    """Format validation results for display."""
    lines = []

    if result.valid:
        lines.append("✓ Environment validation passed")
    else:
        lines.append("✗ Environment validation failed")

    if result.errors:
        lines.append("\nErrors:")
        for error in result.errors:
            spec = ENV_SPECS.get(error.var_name, {})
            lines.append(f"  {error.var_name}:")
            lines.append(f"    {error.message}")
            if spec.get("description"):
                lines.append(f"    Description: {spec['description']}")
            if spec.get("examples"):
                lines.append(f"    Examples: {', '.join(spec['examples'])}")

    if result.warnings:
        lines.append("\nWarnings:")
        for warning in result.warnings:
            lines.append(f"  {warning.var_name}: {warning.message}")

    return "\n".join(lines)


def validate_or_throw() -> None:
    """Validate environment and throw if invalid (for production)."""
    result = validate_environment()
    env = os.environ.get("NODE_ENV", os.environ.get("ENVIRONMENT", "development"))

    if not result.valid:
        if env in ["staging", "production"]:
            print(f"Environment validation failed:\n{format_validation_result(result)}", file=sys.stderr)
            sys.exit(1)
        else:
            print(f"WARNING: {format_validation_result(result)}")
    elif result.warnings:
        print(f"WARNING: {format_validation_result(result)}")
    else:
        print("✓ Environment validated")


# Validate on import
validate_or_throw()
