---
kind: adr
status: active
updated: 2026-09-23
---

# the vLLM source ERRS OPEN: capability is per-checkpoint and undetectable, user settings are trusted, and `customParameters` reaches the vllm wire (AMENDS the 2026-07-24 BYOK-only ruling of `20ac4154c`)

## Context

Not recorded in the ledger row.

## Decision

Owner-ruled 2026-08-18, two words: *"Amend the ruling — vllm joins"*, and the posture verbatim: *"with vllm, since it can change per model and we have no real easy way to detect what it does and doesn't support… we'll have to let people set what they want and not force so much"* (his example: the fixed Qwen 3.8 template supports mid-turn system prompts — undetectable by construction). Three clauses: (a) `customParameters` deep-merges into the vllm chat body (`deepMergeRequestBody`, the custom-byo mechanism) behind a BELT DENYLIST of exactly the keys infra owns — `truncate_prompt_tokens`/`truncation_side` (the #165/#173 hang class), `stream`/`stream_options` (the surface hardcodes streaming), `model`/`messages` (a preset must not reroute attribution or blank canon) — denylisted keys DROP with a named partial-drop warn; (b) modeled/named params WIN over customParameters on collision (the endpoint is OURS — the inverse of custom-byo's your-endpoint-your-risk precedence, stated at both sites); (c) the vllm capability descriptor errs PERMISSIVE — a knob is never hidden because "the model might not support it"; translate-correctly beats expose-a-lie (`minimal` → the template floor `low`, never the fold-to-`xhigh` else-branch). OpenRouter's modeled-surface lock is UNTOUCHED — the amendment is vllm-only. Home (RE-POINTED 2026-09-19, `../design/orbweaver-inference-package.md` §8.1c/F21 — the vllm-named surface this clause was written against is gone and the mechanism is now wire-level, keyed on the connection's folded features and never on a provider id): the extras merge is `packages/inference/src/backends/openai-compat/body.ts` over `deepMergeRequestBody`, and the belt denylist is the one-homed `BELT_OWNED_BODY_KEYS` in `packages/contracts/src/inference/features.ts`; (b) modelled-wins is unchanged. Pins: the denylist per-key + precedence tests on that body builder. Landed with #197. **Rider (2026-08-18, #200/#201, `56a979d44`):** vllm was the first arm with a NON-FLOOR `turns` cell — a provider-named cell carrying `roleHandlingFloor:"none"`, `midConversationSystem:true`, `historySystemRows:true`. **DELETED 2026-09-19 (owner word, `../design/orbweaver-inference-package.md` F15: "the vllm floor has never really worked"): it described ONE template on ONE box.** A connection now DECLARES its own turns cell in its `declared` block and the generic openai-compat floor applies otherwise; what the rider proved about the BIT below stands (the first SECOND consumer of that bit — the D129(B) narrator mapping and the depth-splice both read it), both MEASURED live (tokenize render in place + the sanctioned history-system-rows probe, receipts in the cell's doc comment). Downstream consequences accepted: no default same-role squash on this wire (the preset knob restores it) and narrator canon rows were BRIEFLY delivered as wire `system` rows — REVERSED same day by owner ruling (see the D129 rider below / #203, `7bb5e3e4f`): group narration is the assistant's own voice and delivers as `assistant` on every wire; only the injection splice keeps the system channel.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
