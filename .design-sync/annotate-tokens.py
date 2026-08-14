#!/usr/bin/env python3
"""Annotate non-theme custom properties in the staged preview CSS with /* @kind other */.

The claude.ai/design token classifier scans the shipped stylesheets for custom properties.
Two populations in the compiled app CSS are NOT theme tokens and were showing up unclassified
(design-agent request, 2026-08-14):
  1. `@property --tw-*` — Tailwind v4 runtime plumbing (registered defaults for transforms,
     shadows, gradients). Must SHIP (utilities depend on the registered defaults) but must
     never classify as theme vocabulary.
  2. Custom properties declared ONLY under component selectors (never on :root/[data-theme]) —
     deliberate component parameterization (the --orb-tier-* density cascade, shell-grid layout
     vars, scroll-fade stops). Hoisting them would break their cascades; they are parameters,
     not tokens. Computed dynamically so new component params are covered on every re-stage.

Idempotent: skips declarations already carrying the marker. Run via cfg.buildCmd after the
tokens-CSS copy; operates in place on the file given as argv[1].
"""

import re
import sys

MARK = "/* @kind other */"
path = sys.argv[1]
css = open(path).read()

if MARK in css:
    # Re-run on an already-annotated file: strip old markers first so the pass stays idempotent
    # against a fresh copy OR a stale one.
    css = css.replace(MARK, "")

# ── population 2: props defined only under non-root selectors ──
root_defined: set[str] = set()
component_defined: set[str] = set()
for m in re.finditer(r"([^{}]+)\{([^{}]*)\}", css):
    sel = m.group(1).strip()
    body = m.group(2)
    names = re.findall(r"(--[\w-]+)\s*:", body)
    is_root = sel.startswith((":root", "::", "@", "html", ":host")) or "[data-theme" in sel
    for n in names:
        if n.startswith("--tw-"):
            continue
        (root_defined if is_root else component_defined).add(n)
component_only = component_defined - root_defined

# ── annotate: @property --tw-* blocks ──
css = re.sub(r"(@property --tw-)", MARK + r"\1", css)

# ── annotate: component-only property declarations ──
for name in sorted(component_only, key=len, reverse=True):
    css = re.sub(rf"(?<![\w-])({re.escape(name)}\s*:)", MARK + r"\1", css)

open(path, "w").write(css)
tw = css.count(MARK + "@property --tw-")
print(f"annotated: {tw} @property --tw-* rules, {len(component_only)} component-param names")
