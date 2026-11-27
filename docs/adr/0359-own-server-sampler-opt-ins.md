---
kind: adr
status: active
updated: 2026-11-26
---

# Own-server samplers and the antislop proxy are connection opt-ins

## Context

A vLLM that loads its own logits processors reads extended samplers from `vllm_xargs`, and an antislop proxy in front of a server reads top-level phrase and slop list fields. Stock vLLM reads neither. Orbweaver ships to installs whose vLLM is stock, so the vllm provider row must stay correct for a stock server. Stock vLLM `bad_words` also bans a phrase mid-sentence only when the phrase's space-led form has the bare form's token count (`SamplingParams.update_from_tokenizer`).

## Decision

- The own-server capabilities are two endpoint switches a connection declares, never provider row defaults: `samplerEnvelope` and `antislop` in `packages/contracts/src/inference/features.ts`. The connection editor's endpoint rows show them as switches, each stating what the server must be and what a wrong yes costs; the envelope row shows only for a connection served as the vLLM row (`VLLM_PROVIDER_ID` in `packages/contracts/src/inference/provider-id.ts`): the vllm provider row, or the one a detecting row identified. A declared tokenize endpoint says which endpoint answers and neither offers nor hides the row. They state what the server can take. What to send is a writing-style choice, so it lives in the preset.
- `samplerEnvelope: "vllm-xargs"` moves the knobs `SAMPLER_ENVELOPE_SPELLINGS` lists into `vllm_xargs` under llama.cpp's key names. Logit bias rides as parallel id and value lists, since an envelope value cannot be an object. A set repetition range moves the penalty into the envelope beside the window; without a range the penalty stays native. A thinking turn sends `close_thinking: true`.
- A curated capability row matched on the envelope (`packages/inference/src/capability/sources/curated/local-servers.ts`) states the extended samplers, so the stock vllm row offers only the stock set.
- `antislop: true` sends every banned phrase whole as top-level `banned_strings`. The preset's `slopList` and `slopStrength` knobs (`packages/contracts/src/preset/index.ts`) ride beside them as `slop_list` and `slop_strength`, with `slop_allow` carrying the room's character and user names and their words. A turn without the room's names sends no slop list, because the list's stock names may be the characters' own. The speaker pick sends its roster's names. Memory digests, extraction and captions send no names. `slopList` names a list the proxy holds. A background role takes both knobs from its own preset.
- The two slop knobs follow the preset's control rule (D68): the connection's capability states them only when it declares `antislop` (`markRouteFacts` in `packages/inference/src/capability/floor.ts`). Any other connection omits them from the editor, and a stored value never reaches its turns.
- A metered provider row never keeps an own-server feature, whoever declared it, so its preset slop knobs are never stated. The resolver drops them (`behavedFeatures` in `packages/inference/src/resolve/behave-as.ts`), and each turn raises `own_server_features_ignored`.
- The stock vllm row spells the phrase ban `vllm-bad-words`. It tokenizes both forms of each phrase, sends the phrases vLLM bans mid-sentence, and drops the rest with `sampling_knob_dropped`.
- A banned-phrase drop that leaves some phrases sent carries `partial` counts, and every banned-phrase drop from the stock phrase test carries a closed `cause` (`BANNED_PHRASE_CAUSES`): the server cannot ban the phrase as a sequence, or its tokenizer could not be asked. The chat notice names how many were dropped, says the rest were sent and names the cause; a sequence cause opens Params on the Banned phrases knob, and a tokenizer cause opens Connections. The chat bus carries counts and the cause only, because the phrases are the host's preset text and the bus reaches every member.
- DRY sequence breakers reach every row as literal strings. The chat pipeline renders their macros against the turn's own macro context, splits SillyTavern's JSON array and text-generation-webui's quoted comma form, adds a one-macro name's words, and removes repeats (`packages/server/src/domain/chat/assembly/sampler-names.ts`).

D358's word list library routes its entries through these same mechanisms. Not yet built: work item 4044 carries the library.

## Consequences

A stock vLLM body does not change unless the connection declares an opt-in. A box with its own processors gets every extended sampler without a provider row of its own. A connection that names the antislop proxy on a custom row also needs the phrase ban in its capability. A connection stores no slop list or strength, so switching connections never changes the writing style. `tests/inference/backends/openai-compat/body-shaping.int.test.ts` covers the envelope, the proxy fields, the metered refusal and the stock phrase verdicts.

## Alternatives rejected

- Move min-p and the extended knobs into `vllm_xargs` on the vllm row for everyone: rejected, stock vLLM reads none of them.
- A built-in provider row for the box: rejected, it ships one install's processors and proxy to everyone.
- Drop every phrase on stock vLLM: rejected, `bad_words` honours a phrase whose spaced form keeps its token count.
- Name the dropped phrases on the chat bus: rejected, the bus is room-public and carries no free text.
