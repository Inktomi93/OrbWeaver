---
kind: adr
status: active
updated: 2026-09-23
---

# The preset readout binding chip is honest by membership

## Context

Split off [ADR 0121](0121-the-close-out-ruling-for-the-preset-and.md), the close-out ruling for the preset and actor-state programs, whose seven independent clauses (A–G) pushed it over the 8 KiB ADR cap. This clause stands alone, as the original states. \[BUILT, lane D8R].

## Decision

**(G) \[BUILT, lane D8R] — the preset lane-D8 residue.** The readout's binding chip is honest-by-membership: `BINDING_VIEWS` (`client/src/features/preset/components/readout/preset-readout.tsx`) held `actions` alone, because a chip over the Params profile would claim a resolution that is not happening. Prompt JOINS that set now that its materialized carrier rows + true token costs have landed, and `BINDING_VIEWS` became a real table in the same change — three coupled sites: the TABLE (a total `Record<PresetEditorView["id"], boolean>`, so a sixth view is a `tsc` error and the chip can never be decided by omission), the CHIP's render test, and `PromptReadout`'s two cases. **Seam correction (this clause's original text named the wrong read):** the materialization rides **`chat.previewAssembly` + a new `presetOverride` param** — the seam §7.1 and the workboard both ruled — not `previewActionTemplates`, which renders template prose and carries no costs. The wire gained ONE field, `AssemblyBudgetPreview.sections` (`AssemblySectionCost` keyed by `PromptSection.id`, each with its materialized `rows`): the SAME assembled bytes partitioned by SECTION instead of by SOURCE, so the chat Preview tab and the bound preset readout are one read with two projections. The history PIVOT — the row the editor can never price chat-free — is priced off the FIT with one content-free row per kept turn (ST's `chatHistory-1 / assistant / 944`, with honest data). The UNBOUND case is untouched and stays first-class (`~—` = "not knowable here"; a bound-and-absent section is `~0` = "contributes nothing"). No new freshness row: `previewAssembly` has ridden `promptPreviewReads` since it was minted, so the bound rack inherits `presetsChanged` + every canon terminal by construction.

## Consequences

`BINDING_VIEWS` is a total `Record<PresetEditorView["id"], boolean>`, so a sixth view is a `tsc` error and the chip can never be decided by omission. The materialization rides `chat.previewAssembly` + a new `presetOverride` param, priced with `AssemblyBudgetPreview.sections`. The unbound case stays `~—` ("not knowable here"); a bound-and-absent section is `~0` ("contributes nothing").

## Alternatives rejected

Render the chip over the Params profile without a materialized cost (rejected: the chip would claim a resolution that is not happening).
