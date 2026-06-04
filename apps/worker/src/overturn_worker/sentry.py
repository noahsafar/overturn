"""
Sentry error tracking and performance monitoring for the worker.

This module initializes Sentry for production error tracking.
PHI is automatically scrubbed before sending to Sentry.
"""

import os
import re
from typing import Any, Optional, Dict, List
from dataclasses import dataclass

# PHI scrubbing patterns
PHI_KEY_HINTS = [
    "first_name", "last_name", "firstName", "lastName",
    "member_id", "memberId", "member",
    "dob", "birth_date", "birthDate",
    "ssn", "social_security",
    "patient", "claim", "denial",
    "address", "phone", "email",
]

PHI_VALUE_REGEXES: List[re.Pattern] = [
    re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),  # SSN
    re.compile(r"\b(19|20)\d{2}-\d{2}-\d{2}\b"),  # ISO date
    re.compile(r"\bMEM[A-Z0-9]{6,}\b", re.IGNORECASE),  # member-id
    re.compile(r"\bCLM[A-Z0-9]{6,}\b", re.IGNORECASE),  # claim-id
]


def _scrub(value: Any) -> Any:
    """Scrub PHI from a value."""
    if not isinstance(value, str):
        return value
    for pattern in PHI_VALUE_REGEXES:
        if pattern.search(value):
            return "[scrubbed-PHI]"
    return value


def _is_phi_key(key: str) -> bool:
    """Check if a key looks like it might contain PHI."""
    key_lower = key.lower()
    return any(hint.lower() in key_lower for hint in PHI_KEY_HINTS)


def _scrub_dict(data: Dict[str, Any]) -> Dict[str, Any]:
    """Scrub PHI from a dictionary."""
    scrubbed = {}
    for key, value in data.items():
        if _is_phi_key(key):
            scrubbed[key] = "[scrubbed-PHI]"
        elif isinstance(value, dict):
            scrubbed[key] = _scrub_dict(value)
        elif isinstance(value, list):
            scrubbed[key] = [_scrub(item) if isinstance(item, (dict, str)) else item for item in value]
        else:
            scrubbed[key] = _scrub(value)
    return scrubbed


def init_sentry() -> Optional[Any]:
    """Initialize Sentry for error tracking."""
    dsn = os.environ.get("SENTRY_DSN")
    if not dsn:
        print("[sentry] Disabled - SENTRY_DSN not set")
        return None

    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration

        environment = os.environ.get("NODE_ENV", os.environ.get("ENVIRONMENT", "development"))
        traces_sample_rate = float(os.environ.get("SENTRY_TRACES_SAMPLE_RATE", "0.1"))

        def before_send(event: Dict[str, Any], hint: Dict[str, Any]) -> Dict[str, Any]:
            """Scrub PHI from events before sending to Sentry."""
            # Scrub request data
            if "request" in event:
                request = event["request"]
                if "headers" in request:
                    request["headers"] = _scrub_dict(request["headers"])
                if "data" in request:
                    request["data"] = _scrub_dict(request["data"])

            # Scrub tags and extra
            for key in ["tags", "extra", "contexts"]:
                if key in event and event[key]:
                    event[key] = _scrub_dict(event[key])

            # Scrub breadcrumbs
            if "breadcrumbs" in event:
                event["breadcrumbs"] = [
                    {**bc, "data": _scrub_dict(bc.get("data", {}))} if "data" in bc else bc
                    for bc in event["breadcrumbs"]
                ]

            # Scrub exception message
            if "exception" in event:
                for exception in event["exception"].get("values", []):
                    if "value" in exception and isinstance(exception["value"], str):
                        exception["value"] = _scrub(exception["value"])
                    if "stacktrace" in exception:
                        for frame in exception["stacktrace"].get("frames", []):
                            if "vars" in frame:
                                frame["vars"] = _scrub_dict(frame["vars"])

            return event

        sentry_sdk.init(
            dsn=dsn,
            environment=environment,
            traces_sample_rate=traces_sample_rate,
            integrations=[
                FastApiIntegration(),
                SqlalchemyIntegration(),
            ],
            before_send=before_send,
            ignore_errors=[
                # Common transient errors
                "Connection refused",
                "Temporary failure",
                # Browser extension errors
                "top.GLOBALS",
                "originalCreateNotification",
            ],
            attach_stacktrace=True,
            max_breadcrumbs=50,
        )

        print(f"[sentry] Initialized in {environment} mode")
        return sentry_sdk

    except ImportError:
        print("[sentry] WARNING: sentry-sdk not installed")
        return None
    except Exception as e:
        print(f"[sentry] WARNING: Initialization failed: {e}")
        return None


# Initialize on import
sentry_sdk = init_sentry()


def capture_exception(err: Exception, context: Optional[Dict[str, Any]] = None) -> None:
    """Capture an exception with optional context."""
    if sentry_sdk is None:
        return

    scrubbed_context = _scrub_dict(context or {})
    sentry_sdk.capture_exception(err, extra=scrubbed_context)


def capture_message(message: str, level: str = "info") -> None:
    """Capture a message with optional severity."""
    if sentry_sdk is None:
        return
    sentry_sdk.capture_message(message, level=level)


def set_user(user_id: str, email: Optional[str] = None, practice_id: Optional[str] = None) -> None:
    """Set user context for better error tracking."""
    if sentry_sdk is None:
        return

    user_data: Dict[str, Any] = {"id": user_id}
    if email:
        user_data["email"] = email
    if practice_id:
        user_data["practiceId"] = practice_id

    sentry_sdk.set_user(user_data)


def clear_user() -> None:
    """Clear user context on logout."""
    if sentry_sdk is not None:
        sentry_sdk.set_user(None)


def add_breadcrumb(message: str, category: Optional[str] = None, data: Optional[Dict[str, Any]] = None) -> None:
    """Add a breadcrumb for debugging."""
    if sentry_sdk is None:
        return

    scrubbed_data = _scrub_dict(data or {})
    sentry_sdk.add_breadcrumb(
        message=message,
        category=category or "default",
        data=scrubbed_data,
        level="info",
    )
