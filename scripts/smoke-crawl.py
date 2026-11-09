#!/usr/bin/env python3
"""Signed-out page crawl (smoke test) for Sortes.

Renders every page in PAGES with headless Chromium (Python Playwright, a
system tool, not a repo dependency) and FAILS on:
  - any pageerror (uncaught exception, including hydration errors thrown by React)
  - any console.error (React logs hydration mismatches here)
  - HTTP status >= 500 on the document
  - JSON-LD on "/" that does not JSON.parse, or that contains a raw "<"
It also checks the signed-out pages (/account, /journal, /reports) answer with a
redirect or a 2xx render, never a 500.

Usage (against a running `next start`, e.g. `npx next start -p 3100`):
  python3 scripts/smoke-crawl.py [BASE_URL]        # default http://localhost:3100
Needs: pip install playwright && python3 -m playwright install chromium
Exit code 0 = all clean, 1 = failures listed above the summary.

Page list: built from `git diff --name-only 1c19e68..HEAD -- src` (lint-fix
phases A-F). Header.tsx and layout.tsx changed, and both render on every
page, so every app page is in scope; dynamic routes use one real slug each.
"""
import json
import sys

from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3100").rstrip("/")

PAGES = [
    "/", "/about", "/birth-card", "/card-meanings", "/charts", "/daily",
    "/deck", "/deck/the-fool", "/faq", "/guides", "/guides/what-is-tarot",
    "/horoscope", "/intake/quick-insight", "/intake/past-present-future",
    "/methodology", "/offline", "/oracles", "/privacy", "/readings",
    "/spreads", "/spreads/quick-insight", "/terms",
]
# Signed-out: must redirect or render (sign-in prompt), never 5xx.
SIGNED_OUT = ["/account", "/journal", "/reports"]

failures = []


def crawl(page, path, errors):
    errors.clear()
    resp = page.goto(BASE + path, wait_until="networkidle", timeout=60000)
    page.wait_for_timeout(800)  # let effects and hydration settle
    status = resp.status if resp else None
    return status


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context()  # fresh context: no cookies = signed out
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.on(
        "console",
        lambda m: errors.append(f"console.error: {m.text}") if m.type == "error" else None,
    )

    for path in PAGES + SIGNED_OUT:
        status = crawl(page, path, errors)
        final = page.url[len(BASE):] or "/"
        tag = "OK"
        if status is None or status >= 500:
            failures.append(f"{path}: HTTP {status}")
            tag = "FAIL"
        if errors:
            failures.extend(f"{path}: {e}" for e in errors)
            tag = "FAIL"
        redirect = f" -> {final}" if final != path else ""
        print(f"[{tag}] {path} HTTP {status}{redirect}")
        if path in SIGNED_OUT:
            h1 = page.locator("h1").first
            heading = h1.inner_text(timeout=2000) if h1.count() else "(no h1)"
            print(f"  signed-out view: h1 = {heading!r}")

        if path == "/":
            raw = page.eval_on_selector_all(
                'script[type="application/ld+json"]', "els => els.map(e => e.textContent)"
            )
            if not raw:
                failures.append("/: no JSON-LD script found")
            for i, txt in enumerate(raw):
                try:
                    data = json.loads(txt)
                    print(f"  JSON-LD[{i}] parsed OK, @type={data.get('@type') or [g.get('@type') for g in data.get('@graph', [])]}, raw '<' present: {'<' in txt}")
                    if "<" in txt:
                        failures.append(f"/: JSON-LD[{i}] contains raw '<'")
                except Exception as e:  # noqa: BLE001
                    failures.append(f"/: JSON-LD[{i}] JSON.parse failed: {e}")

    browser.close()

print()
if failures:
    print(f"SMOKE CRAWL: FAIL ({len(failures)} problem(s))")
    for f in failures:
        print("  - " + f)
    sys.exit(1)
print(f"SMOKE CRAWL: PASS ({len(PAGES) + len(SIGNED_OUT)} pages, 0 console errors, 0 page errors)")
