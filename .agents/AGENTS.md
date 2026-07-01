# The Orbweaver Architecture (Rules & Directives)

The complete architectural guidelines, constraints, and historical ledger have been split into three files to keep them under the 40k limit. 

**🛑 CRITICAL DIRECTIVE FOR ALL AGENTS: DO NOT SKIM 🛑**
You MUST read the following files in sequence using `view_file` before you begin any architectural or domain-level work. They are the law:

1. **[docs/architecture/core/AGENTS-1-Architecture.md](file:///home/inktomi/inktomi-stack/development/orbweaver/docs/architecture/core/AGENTS-1-Architecture.md)**
   Contains the fundamental rules, directory structure, one-directional flow constraint, and the Pain Ledger (historical crunches to resolve).

2. **[docs/architecture/core/AGENTS-2-Spine.md](file:///home/inktomi/inktomi-stack/development/orbweaver/docs/architecture/core/AGENTS-2-Spine.md)**
   Contains the cross-cutting Spine threads (identity, settings, serialization, types, string-union dispatch) and the Grounded Intelligence AST scout findings.

3. **[docs/architecture/core/AGENTS-3-Domains.md](file:///home/inktomi/inktomi-stack/development/orbweaver/docs/architecture/core/AGENTS-3-Domains.md)**
   Contains the definitive domain map, the knowledge/derived-data untangle, cross-cutting concept homes, the connection boundary, and open judgment calls.

If you are auditing or migrating a domain, you MUST read its specific file in `docs/architecture/domains/<domain>.md` as well.

> **Read every word.** You are an amnesiac agent and this documentation is the only substitute for the memory and judgment you lack.
