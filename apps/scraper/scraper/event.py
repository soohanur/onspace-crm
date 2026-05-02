"""Tiny stdout JSON event protocol — read by NestJS scrape.processor.ts."""
from __future__ import annotations
import json
import sys
from typing import Any


def emit(event_type: str, **fields: Any) -> None:
    line = json.dumps({"type": event_type, **fields}, ensure_ascii=False)
    sys.stdout.write(line + "\n")
    sys.stdout.flush()
