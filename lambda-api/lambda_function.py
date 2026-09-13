#!/usr/bin/env python3
"""
Minimal API for travel-map.

Routes (API Gateway HTTP API → Lambda proxy):
  GET /health  — health check
  GET /tours   — Hokkaido tour GeoJSON (bundled tours.geojson)
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict

TOURS_PATH = Path(__file__).resolve().parent / "tours.geojson"


def _response(status: int, body: Any, *, cors: bool = True) -> Dict[str, Any]:
    headers = {"Content-Type": "application/json"}
    if cors:
        headers.update(
            {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET,OPTIONS",
                "Access-Control-Allow-Headers": "content-type,authorization",
            }
        )
    return {
        "statusCode": status,
        "headers": headers,
        "body": body if isinstance(body, str) else json.dumps(body, ensure_ascii=False),
    }


def _load_tours() -> Dict[str, Any]:
    if not TOURS_PATH.is_file():
        raise FileNotFoundError(f"Missing {TOURS_PATH}")
    with TOURS_PATH.open("r", encoding="utf-8") as f:
        return json.load(f)


def lambda_handler(event, context):
    method = (
        (event.get("requestContext") or {}).get("http", {}).get("method")
        or event.get("httpMethod")
        or "GET"
    ).upper()
    path = (
        event.get("rawPath")
        or event.get("path")
        or "/"
    )

    if method == "OPTIONS":
        return _response(204, "")

    if path.endswith("/health") or path == "/health":
        return _response(
            200,
            {
                "status": "ok",
                "service": "travel-map",
                "region": os.environ.get("AWS_REGION", ""),
            },
        )

    if path.endswith("/tours") or path == "/tours":
        try:
            return _response(200, _load_tours())
        except Exception as exc:  # noqa: BLE001
            return _response(500, {"error": str(exc)})

    return _response(404, {"error": "not found", "path": path})
