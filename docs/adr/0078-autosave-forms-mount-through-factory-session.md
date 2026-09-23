---
kind: adr
status: active
updated: 2026-09-23
---

# Autosave forms mount through the factory session

## Context

TanStack form-core's `FormApi.update` reseeds `defaultValues` only while the form is untouched. After one edit, a form that receives another entity's values keeps the old ones. A per-field `onFieldUnmount` flush guarded by `isValid && !isDefaultValue` stays true after any edit, because nothing re-baselines after a save. A remount that resets the form fires that flush and writes the pre-reset values back over the reset.

## Decision

**Autosave entity forms mount ONLY through the factory's session boundary — the factory owns identity, reseed, flush, baseline, and the save driver.** `createAutosaveEntityForm` returns a boundary component (`<XForm entityId serverValues save>{(session) => …}</XForm>`); the internal hook is unexported, so wrong key placement is unspellable rather than documented-against. The boundary keys its Session by `entityId:epoch`; `reseed(next)` is the ONE reset path and takes explicit next-values (a mutation-response row or a contract default — NEVER a post-invalidation cache read; invalidation stays fire-and-forget by design); the teardown flush is Session-owned and discard-aware (the ONLY flush — `onFieldUnmount` is deleted; its real effect was the write-back vector); the baseline is last-SAVED values (never `isDefaultValue`); the save driver is a store-level values subscription, so structural array ops autosave like keystrokes and call-site `handleSubmit` flushes are gate-RED. Enforcers: the unexported hook (resolver physics) · `no-manual-autosave-flush` · the existing `no-form-reset-in-autosave` / `no-direct-useform` / `form-factory-for-multifield`. Born from a stickler live-P0 review; the wave is atomic: the old hook export dies in the same wave's SEAL.

## Consequences

- An entity switch or `reseed()` remounts the form and the consumer body. Tabs, scroll and drill-ins reset with it.
- Every guard compares against the last saved values, so a form is clean right after a save.
- Structural array edits save through the store subscription. Call sites add no manual flush.

## Alternatives rejected

- Swap TanStack Form's `formId`. `useForm` builds a new `FormApi` and `useField` rebinds, but nothing unmounts. Consumer UI state keeps the old entity's context, and no teardown point exists for the pending-edit flush.
- Pass live `defaultValues` and rely on the form-core reseed. It skips a touched form, so a dirty form keeps the previous entity's values. The clean-echo reseed still uses this path, where the form is clean.
- Document a consumer `key` contract and add a gate. A static gate cannot prove that the component owning the hook is keyed by the same `entityId`.
- Keep a per-field unmount flush. The form-level debounce already outlives every field, and the flush guard wrote stale values back.
