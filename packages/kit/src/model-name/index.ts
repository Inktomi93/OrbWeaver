// modelDisplayName — the readable NAME of a model, derived from whatever identifier the backend gave us.
//
// WHY THIS IS A PRIMITIVE AND NOT A CALL-SITE `.split("/")`: a model identifier arrives in three unrelated
// shapes — a hosted route (`anthropic/claude-sonnet-5`), a HuggingFace org/repo ref
// (`Qwen/Qwen3-30B-A3B-Instruct-2507`), and a LOCAL WEIGHTS PATH from a self-hosted engine
// (`/mnt/models/storage/vllm-models/quantized/Huihui-ThinkingCap-Qwen3.6-27B-abliterated-W8A8-Dynamic-Per-Token`,
// 106 characters). Every surface that names a model has to answer the same question, and the last shape is
// the one that breaks layouts: the preset panel restated that path twice, ~100px apart (#115). Pure,
// zero-I/O, zero-domain, multiple consumers ⇒ `kit` by the placement rule; isomorphic because the CLIENT is
// the surface that renders it.
//
// NOT a provider-vocabulary map. `runner`/`family`/`protocol` are sealed inside `infra` and
// `domain/connection`'s `detectModelFamily` answers a CAPABILITY question (which directives a backend
// accepts). This answers a TYPOGRAPHIC one — what to print when there is not room for 106 characters — and
// deliberately knows nothing about which backend serves the thing.
//
// LOSSLESS BY CONTRACT: the derivation is for DISPLAY only and every call site keeps the full identifier
// (a `title`, a gloss line). Nothing routes, resolves, or persists on this string.

/** The identifier folded to nothing usable (empty, whitespace, `"/"`, a bare extension). */
const UNKNOWN_MODEL = "unknown model";

/** Weight-file extensions a served path can carry — dropped before the name is read. */
const WEIGHTS_EXTENSION = /\.(?:gguf|safetensors|bin|pt|pth)$/i;

/**
 * The FIRST whole `-`/`_`-delimited QUANTISATION SCHEME token in a basename, case-insensitively:
 *   · `W8A8` / `W4A16`     — weight/activation bit pairs (compressed-tensors, the local vLLM builds)
 *   · `Q4` / `Q5` / `Q8`   — llama.cpp k-quant families (`Q4_K_M` matches at `Q4`; `_K_M` is a modifier)
 *   · `FP8` / `BF16` / `INT4` — plain precision tags
 *   · `GPTQ`/`AWQ`/`GGUF`/`EXL2`/`EETQ`/`HQQ`/`BNB` — named quantisers
 *   · `4BIT` / `8BIT`      — the bitsandbytes spelling
 * The token must be a WHOLE segment (a leading separator, a segment boundary after), so `Qwen3` never
 * matches the `q\d+` arm and `A3B` — Qwen's ACTIVE-parameter count — never matches at all: the `W…A…` arm
 * requires the leading `W`, so an architecture size stays part of the model's identity where it belongs.
 * Matched against the ORIGINAL basename (never a split/re-join) so the name keeps its authored separators.
 */
const QUANT_TAIL = /[-_](w\d+a\d+|q\d+|fp\d+|bf\d+|int\d+|\d+bit|gptq|awq|gguf|exl2|eetq|hqq|bnb)(?=$|[-_])/i;

/**
 * The readable name for a model identifier, with the quantisation scheme kept as a terse suffix.
 *
 * The derivation is two rules, both chosen because they hold across all three identifier shapes:
 *  1. **The last path segment is the name.** `/a/b/Qwen3-30B` and `Qwen/Qwen3-30B` and `Qwen3-30B` all
 *     reduce to `Qwen3-30B`; a hosted route loses only its org prefix, which the full identifier still
 *     carries wherever it is glossed.
 *  2. **A quant token ENDS the name.** Quantisation tags are conventionally terminal and drag modifiers
 *     behind them (`W8A8-Dynamic-Per-Token`), so the FIRST quant token splits identity from build detail:
 *     everything before it is the name, the token itself is the suffix, and the modifiers are dropped
 *     (they live in the full identifier). Without this rule the 106-character path only shortens to 71.
 *
 * Separators inside the name are left exactly as authored — re-joining `claude-sonnet-5` with spaces
 * invents a capitalisation this function has no basis for.
 *
 * @example modelDisplayName("/media/…/Huihui-ThinkingCap-Qwen3.6-27B-abliterated-W8A8-Dynamic-Per-Token")
 *          → "Huihui-ThinkingCap-Qwen3.6-27B-abliterated · W8A8"
 */
export function modelDisplayName(model: string): string {
  const trimmed = model.trim();
  if (trimmed === "") {
    return UNKNOWN_MODEL;
  }
  const segments = trimmed.split("/").filter((segment) => segment !== "");
  const basename = (segments.at(-1) ?? "").replace(WEIGHTS_EXTENSION, "");
  if (basename === "") {
    return UNKNOWN_MODEL;
  }
  const quant = QUANT_TAIL.exec(basename);
  // No quant tag, or a name that is NOTHING BUT one (`-W8A8`) — there is no identity to split off, so the
  // basename stands as the name rather than becoming an empty string with a bullet in front of it.
  if (quant === null || quant.index === 0) {
    return basename;
  }
  return `${basename.slice(0, quant.index)} · ${quant[1] ?? ""}`;
}
