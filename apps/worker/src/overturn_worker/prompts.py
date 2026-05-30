"""Load the versioned prompt markdown files from `packages/prompts`.

Single source of truth shared with the web app — bumping `v1` → `v2` only
needs to happen in one place.
"""

from __future__ import annotations

import re
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[4] / "packages" / "prompts" / "src"


def _load(name: str) -> str:
    p = _ROOT / name
    if not p.exists():
        # Fallback to env-overridable path for container deployments where
        # the monorepo layout is flattened.
        alt = Path(__file__).resolve().parent / "prompts" / name
        if alt.exists():
            p = alt
        else:
            raise FileNotFoundError(f"prompt not found: {name} (tried {p} and {alt})")
    return p.read_text(encoding="utf-8")


STRATEGIZE_V1 = _load("strategize.v1.md")
DRAFT_V1 = _load("draft.v1.md")
REDRAFT_V1 = _load("redraft.v1.md")


_PLACEHOLDER_RE = re.compile(r"\{\{(\w+)\}\}")


def render(template: str, **vars: object) -> str:
    """Mustache-style {{var}} substitution matching the TS `render` helper."""

    def sub(m: re.Match[str]) -> str:
        k = m.group(1)
        if k not in vars:
            raise KeyError(f"Missing prompt variable: {k}")
        return str(vars[k])

    return _PLACEHOLDER_RE.sub(sub, template)
