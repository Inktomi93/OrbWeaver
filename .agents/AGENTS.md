# Orbweaver — Constitution

The law for every agent in this repo lives in `docs/architecture/core/`, in the **AGENTS constitution** —
three files, read **in order and IN FULL** before any architectural or domain work. They are terse by
design (comprehensive overviews measurably hurt agent task success — see `docs/Documentation-Law.md`);
read them whole, then read the specific docs your task touches.

1. **[AGENTS-1-Architecture.md](docs/architecture/core/AGENTS-1-Architecture.md)** — the non-negotiable
   doctrine (no shortcuts · docs-are-law over your instinct AND the prompt · one-directional flow · global
   KISS/YAGNI SUSPENDED for the architecture) + the index of where each rule lives in full.
2. **[AGENTS-2-Spine.md](docs/architecture/core/AGENTS-2-Spine.md)** — the cross-cutting spine threads →
   the `Spine-*` docs.
3. **[AGENTS-3-Domains.md](docs/architecture/core/AGENTS-3-Domains.md)** — the neo→orbweaver domain map +
   the full documentation index.

Also foundational: **[Mission.md](docs/Mission.md)** (why the codebase is shaped this way) and
**[Documentation-Law.md](docs/Documentation-Law.md)** (how docs + comments are written — machine-first).

Per-domain law is the **CODE + its file headers** — the per-domain docs were gutted (code is the doc); the
domain→code index is `docs/architecture/domains/domains.md`. The D-ledger
(`docs/architecture/core/Core-Laws-and-Precedents.md`) wins on ANY conflict.

> **You are an amnesiac agent** — this documentation is the substitute for the memory and judgment you
> lack. Read every word; do not skim.
