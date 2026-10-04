// Dated prose-with-tools receipts for local servers (`scripts/probes/prose-with-tools`, RESULTS.md in its dated
// results directory). A row here states `silencesProse: false` for one (model family × server) whose folded
// turns co-emitted prose and tool calls in streaming and non-streaming; every other local model keeps the
// endpoint floor's fail-closed `silencesProse: true` (`../../floor.ts`).

import type { CapabilityOverrideInput } from "@orb/contracts/inference";

// Matches the served name, the GGUF file name, the checkpoint path and an Ollama tag alike ("qwen3.8-27b",
// "Qwen3.8-27B-UD-Q4_K_M.gguf", ".../Qwen3.8-27B-W8A8-…", "qwen3.8:27b"); not Flash-Next or other sizes.
// KoboldCpp has no row: its default tool mode forces tool-only JSON (measured 0/20 co-emission) and the API
// does not say which mode a server runs, so only `--jinja_tools` co-emits and nothing can tell them apart.
const QWEN38_27B = "(^|/)qwen3\\.8[-:]27b";
const PROBE = "scripts/probes/prose-with-tools/results/2026-10-03/RESULTS.md";

export const measuredLocalServerRows = [
  {
    match: { provider: "vllm", model: QWEN38_27B },
    generation: { tools: { parallel: true, silencesProse: false } },
    evidence: {
      tier: "measured",
      dated: "2026-10-03",
      cite: `${PROBE}: vLLM 0.29.0, W8A8 checkpoint, served template, --tool-call-parser qwen3_coder; folded turns co-emitted 16/30 streaming and 12/30 non-streaming, 0 empty, 0 leaked calls`,
    },
  },
  {
    match: { provider: "llama-cpp", model: QWEN38_27B },
    generation: { tools: { parallel: true, silencesProse: false } },
    evidence: {
      tier: "measured",
      dated: "2026-10-03",
      cite: `${PROBE}: llama.cpp server-cuda, UD-Q4_K_M GGUF, --jinja; served template co-emitted 6/10 streaming and 3/10 non-streaming, Qwen's stock template 3/10 and 7/10, 0 empty, 0 leaked calls`,
    },
  },
  {
    match: { provider: "ollama", model: QWEN38_27B },
    generation: { tools: { parallel: true, silencesProse: false } },
    evidence: {
      tier: "measured",
      dated: "2026-10-03",
      cite: `${PROBE}: Ollama 0.35.1, UD-Q4_K_M GGUF imported FROM the file (rendered with the GGUF's embedded template), think off; co-emitted 4/10 streaming and 3/10 non-streaming, 0 empty, 0 leaked calls`,
    },
  },
] as const satisfies readonly CapabilityOverrideInput[];
