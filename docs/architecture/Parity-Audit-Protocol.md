# Neo-Tavern → Orbweaver Parity Audit Protocol & Log

**Context:** The goal is to ensure 100% feature and behavioral parity with `neo-tavern` when migrating domains into `orbweaver`. However, Orbweaver's rigorous architecture (strict boundaries, exhaustiveness, one-way flow, zero shortcuts) MUST NOT BE COMPROMISED. We don't port bad patterns; we port *capabilities*. 

**🛑 CRITICAL DIRECTIVES FOR ALL AGENTS: DO NOT SKIM 🛑**
1. **Read Every Word:** Before touching a domain, read its architecture docs and the pain ledger (`docs/architecture/core/Core-Laws-and-Precedents.md`) IN FULL. Use `view_file` sequentially if >800 lines. Skimming leads to severe architectural violations.
   - **MANDATORY PRE-REQUISITE:** You MUST read `AGENTS-1-Architecture.md`, `AGENTS-2-Spine.md`, and `AGENTS-3-Domains.md` in `docs/architecture/core` in full before doing ANY domain work. The architecture rules are law.
2. **No `grep` for Code Structure:** When searching `neo-tavern` for interfaces or function definitions, use `ast-grep` or `ts-morph` (NEVER plain `grep`). You MUST capture the JSDoc comments to understand the original intent.
3. **Global Search Before Drop:** Before declaring a capability "dropped" or missing, you MUST perform a `grep_search` across the ENTIRE `docs/architecture` directory to verify it wasn't deliberately moved (e.g., `attachTagToTargets` moved from `tag` to `character` as `bulkAddCardTag`).
4. **No Sideways Imports:** Always respect the 1-way flow. Use `ctx` dependency injection for cross-feature needs.

If you have just woken up and lost context: **START HERE.** Pick the next unchecked domain from the log below and execute the workflow.

## 🔍 The Protocol Workflow

For any domain being audited, follow these exact phases in order:

### Phase 1: Context Loading
1. **Locate the Domain:**
   - `orbweaver`: `packages/server/src/domain/<domain>`
   - `neo-tavern`: `/home/inktomi/inktomi-stack/development/neo-tavern/src/server/domain/<domain>`
2. **Read the Docs (NO SKIMMING):**
   - Did you read `AGENTS-1/2/3` in full yet? If not, do that now.
   - Read `docs/architecture/domains/<domain>.md` in Orbweaver.
   - Read `README.md` in the Neo-Tavern domain directory.

### Phase 2: Structural Recon (USE AST TOOLS)
1. **Extract Original Intent:** Use `ast-grep outline` or the provided `scratch/find_interfaces.ts` harness to extract the public interfaces from `neo-tavern` *with their JSDoc comments*.
   - *Example:* `npx tsx scratch/find_interfaces.ts "/home/inktomi/inktomi-stack/development/neo-tavern/src/server/domain/<domain>/**/*.ts" <TypeName>`
2. **Side-by-Side Comparison:** Compare `contract/service.ts`, `contract/params.ts`, `contract/views.ts`, and Zod schemas. Look for dropped fields, flipped cardinalities, or missing bulk tallies (`{ updated, skipped, missing }`).
3. **The Global Search Check:** If a feature is missing in Orbweaver, do NOT assume regression yet. Run `grep_search` across `docs/architecture/` to see if it was deliberately moved or redesigned.
4. **Check the Debt & Build Plans:** Before calling something "missing", verify it isn't deliberately deferred. Check `docs/architecture/core/Core-BUILD-PLAN.md` and `docs/architecture/core/Core-Audits-and-Debt.md`. A "missing" feature is often already tracked as a phase 2 debt item.

### Phase 3: Behavioral Deep Dive
Compare `verbs/` and `persistence/`:
- **Error Handling:** Did Orbweaver replace a silent skip (e.g. `return null`) with an atomicity failure (e.g. `throw` inside `Promise.all`)?
- **Side-Effects:** Did we miss cascading deletions, metrics tallying, or event emissions?

### Phase 4: Stop and Check! (NO FIXES UNTIL OKAYED)
**Rule:** Do NOT implement fixes or tweaks yet. Surface your findings to the user.
- Summarize the discovered parity gaps.
- Separate accidental regressions from deliberate architectural redesigns (as proven by your global searches).
- Await user approval before proceeding to implementation.

### Phase 5: Implementation & Verification
Once you have the okay:
1. **Implement:** Re-implement the approved fixes in Orbweaver following Orbweaver rules.
2. **Verify:** Run `pnpm typecheck` to ensure contracts match, and `pnpm check` to verify structure and dependency cruisers.
3. **Test:** Run `pnpm test` (or `pnpm vitest run tests/server/domain/<domain>`).

### Phase 6: Log It
Update the Running Log below. Check off the domain and write a concise bulleted summary of the ICKs found and fixed.

---

## 📋 The Running Log

- [x] **tag**
  - **Fixed:** Canonicalization bypass. Added `normalizeTagName` to `updateTag` and empty-string guards to both `createTag` and `updateTag`.
  - **Reverted Mistake:** We initially thought `attachTagToTargets` (One-to-Many library bulk-edit) was dropped. A directory-wide search revealed it was intentionally MOVED to the `character` domain as `bulkAddCardTag`. We reverted the architectural violation of adding it back to `tag`.
- [x] **admin**
  - **Verified:** Perfect parity. No capabilities dropped, 2-layer role gates are intact, atomic `WHERE role <> 'owner'` is correctly applied on mutations, and TOCTOU handle conflicts translate cleanly. No ICKs found.
- [x] **assets**
  - **Deferred:** `maxBytes` constraint dropped from `storeBlob` input params (in neo-tavern it bounded non-HTTP callers like zip extract before magic bytes sniffing). Added as debt item PD-67.
  - **Deferred:** GC/Backfill/Fsck verbs (`backfillAvatars`, `collectGarbage`, `reapIfOrphan`, `fsck`, `rebuildFromTree`) deliberately omitted for the v2 maintenance wave (tracked in PD-26).
- [x] **buddy**
  - **Verified:** Parity with neo-tavern maintained. Verified adherence to Orbweaver's `agent` pattern/injection model.
  - **Verified:** State logic (`proposals.ts`) assumes single-replica execution, consistent with expectations.
- [x] **character**
  - **Redesign (Verified):** `description` and `creatorNotes` were deliberately dropped from `CharacterSummary` (`views.ts` docs confirm it is a "light" read-model). Catalog labels are now powered by the `discovery` domain's `character_summaries` distillation table.
  - **Fixed:** `tags` is missing from `CharacterSummary`. Restored by implementing the read-only join via the "pool.ts pattern" in `queries.ts` (`listOwnedCharactersWithAvatar`), maintaining strict domain boundaries.
  - **Fixed:** Bulk mutations (`bulkRemove`, `bulkArchive`, `bulkAddCardTag`) were returning `void`. Restored to return `{ updated, skipped, missing }` tallies using `Promise.allSettled`.
- [ ] **chat**
- [ ] **connection**
- [ ] **credentials**
- [ ] **discovery**
- [ ] **embeddings**
- [ ] **export**
- [ ] **import**
- [ ] **notifications**
- [ ] **persona**
- [ ] **preset**
- [ ] **search**
- [ ] **sessions**
- [ ] **settings**
- [ ] **stats**
- [ ] **workloads**
- [ ] **world-info**
