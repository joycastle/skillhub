#!/usr/bin/env python3
"""Generate a local Hermes Agent JWT for SkillHub API testing.

This is a development helper only. Hermes Agent should generate equivalent
short-lived JWTs when it calls SkillHub in production.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import hmac
import json
import os
import time


def b64url(raw: bytes) -> bytes:
    return base64.urlsafe_b64encode(raw).rstrip(b"=")


def json_b64url(value: dict) -> bytes:
    return b64url(json.dumps(value, separators=(",", ":"), ensure_ascii=False).encode("utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate a test Hermes Agent JWT for SkillHub")
    parser.add_argument("--feishu-open-id", required=True, help="Feishu open_id, e.g. ou_xxx")
    parser.add_argument("--name", default="", help="Display name")
    parser.add_argument("--email", default="", help="Optional email")
    parser.add_argument("--ttl-seconds", type=int, default=300)
    args = parser.parse_args()

    secret = os.getenv("HERMES_SKILLHUB_JWT_SECRET", "")
    if not secret:
        raise SystemExit("HERMES_SKILLHUB_JWT_SECRET is not set")

    issuer = os.getenv("HERMES_SKILLHUB_JWT_ISSUER", "hermes-agent")
    now = int(time.time())
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "iss": issuer,
        "sub": f"feishu:{args.feishu_open_id}",
        "exp": now + args.ttl_seconds,
    }
    if args.name:
        payload["name"] = args.name
    if args.email:
        payload["email"] = args.email

    signing_input = b".".join([json_b64url(header), json_b64url(payload)])
    signature = hmac.new(secret.encode("utf-8"), signing_input, hashlib.sha256).digest()
    print((signing_input + b"." + b64url(signature)).decode("utf-8"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
