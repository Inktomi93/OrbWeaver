// The fixed probe SCENE and its sampling profiles — the per-request axes every variant is measured on.
// A fixed mini RP scene: the traffic shape the gen slot actually serves. Deterministic where it matters
// (temperature 0 on the diffable probe, a fixed seed elsewhere), so the only variable across columns is
// the VARIANT.
export const RP_SYSTEM = "You are Maren, a dry-witted lighthouse keeper on a storm-wracked coast. Stay in character. Two short paragraphs maximum.";
export const RP_TURNS = [
  { role: "user", content: "The storm knocked out my lantern. Can I shelter here tonight?" },
  { role: "assistant", content: "Maren eyes you over her mug. \"Door's open, floor's dry. Don't touch the lens.\"" },
  { role: "user", content: "What's the strangest thing you've seen from this tower?" },
];

// Sampling per the model card (README "Best Practices"): thinking and instruct modes want DIFFERENT
// params. A fixed seed pins cross-variant reproducibility. top_k / min_p / repetition_penalty are vLLM
// extensions its OpenAI-compatible server accepts as top-level fields.
const SEED = 42;
const MAX_TOKENS = 600;
const TEMP_THINKING = 1.0;
const TEMP_INSTRUCT = 0.7;
const TOP_P_THINKING = 0.95;
const TOP_P_INSTRUCT = 0.8;
const TOP_K = 20;
const MIN_P = 0;
const PRESENCE_THINKING = 0;
const PRESENCE_INSTRUCT = 1.5;
const REP_PENALTY = 1;

export const THINKING_SAMPLING = {
  temperature: TEMP_THINKING,
  top_p: TOP_P_THINKING,
  top_k: TOP_K,
  min_p: MIN_P,
  presence_penalty: PRESENCE_THINKING,
  repetition_penalty: REP_PENALTY,
  seed: SEED,
  max_tokens: MAX_TOKENS,
};
export const INSTRUCT_SAMPLING = {
  temperature: TEMP_INSTRUCT,
  top_p: TOP_P_INSTRUCT,
  top_k: TOP_K,
  min_p: MIN_P,
  presence_penalty: PRESENCE_INSTRUCT,
  repetition_penalty: REP_PENALTY,
  seed: SEED,
  max_tokens: MAX_TOKENS,
};

export const EFFORTS = ["xhigh", "medium", "low"] as const;

export const THINK_MAX_TOKENS = 2500;
export const DIFFABLE_MAX_TOKENS = 80;

// ── prefill probes (template continue/prefill arm, 2026-08-18) ───────────────────────────────────
// Two doors into the same template arm: the standard OpenAI-compat flags (continue_final_message +
// add_generation_prompt:false — transformers renders then cuts at an internal sentinel) and the
// template-visible kwarg (chat_template_kwargs.assistant_prefill — the template itself leaves the turn
// open). Content prefill wants thinking OFF (a pure-content continuation under enable_thinking:true lands
// entirely in reasoning_content — parser initial-state fact, vllm/parser/qwen3.py); thinking prefill wants
// enable_thinking:true so the opener-less output stream still splits at </think>. A stock-template
// 400/empty here is a finding, by design.
export const PREFILL_CONTENT_PREFIX = 'Maren sets down her mug, squints at the horizon, and says, "';
// Ends MID-SENTENCE deliberately: a steer that reads as a complete thought gets closed instantly
// (measured live 2026-08-18 — immediate "</think>" + a correctly in-register answer, reasoning 0 chars); an
// unfinished clause forces the model to CONTINUE the thinking in that voice first.
export const PREFILL_THINK_OPEN = "<think>\nStay terse and dry, no moralizing — answer like a sailor. The strangest thing I saw from this tower was";
export const PREFILL_STEER = "Keep it to one clipped sentence, in Maren's coastal drawl.";

// ── the vision fixture ───────────────────────────────────────────────────────────────────────────
// A synthetic 256x256 image: a red circle on white. Qwen3.8 is a VL model; this proves the vision path
// (visual tower + preprocessor) actually works, not just that the weights are present.
export const VISION_TEST_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAIAAADTED8xAAAE/0lEQVR4nO3ZO3LbWBBAUWhq9qHA+1+SA62EE8jlUYmSSIIfEH3PiR0A/foCoPxyOBwWqPpn6wuALQmANAGQJgDSBECaAEgTAGkCIE0ApAmANAGQJgDSBECaAEgTAGkCIE0ApAmANAGQJgDSBECaAEgTAGkCIE0ApAmANAGQJgDSBECaAEgTAGkCIE0ApAmANAGQJgDSBECaAEgTAGkCIE0ApAmANAGQJgDSBECaAEgTAGkCIE0ApAmANAGQJgDSBECaAEgTAGkCIE0ApAmANAGQJgDSBECaAEgTAGn/bn0BIb9fX8//x7/e3u53Jfz1cjgctr6GmS5a93NI4h4EcEs3X/rviOFWBHADD9v7Y0q4kgDW23DvjylhHQGs8VSr/5EMLiWACzzt3h9TwpkEcJYdrf5HMjjJf4SdttPtX/Z85Q/jDfCTMQvkVfAdAXxtzOp/JINjPoG+MHL7l7n3dQ0BfDZ7S2bf3Qo+gf6XWg6fQ++8Af5Ibf/Su9/vCGBZqtvQvOtPBJDeg/K9v6sHYAPiE+j+CI4f/LHmz+LoG8D2H2vOJBoAvCsG0HzUnSM4mVwAwTO+SG0+rQBqp7tOakqhAFLneqXOrCoBdE70ViITqwQAX0oEEHmY3VxhbvMDKJzi/Yyf3vAAxp/fA8ye4fAA4GeTA5j96HqkwZOcHACcNDaAwQ+tTUyd58wApp7WtkZOdWYAcKaBAYx8UD2JebMdGACcTwCkTQtg3jv62Qyb8LQA4CKjAhj2cHpak+Y8KgC4lABImxPApPfy8xsz7TkBwAoCIG1IAGPeyDsyY+ZDAoB1BECaAEibEMCMj9E9GjD5CQHAagIgTQCkCYA0AZC2+wAG/CFi1/Y+/90HANcQAGkCIE0ApAmANAGQJgDSBECaAEgTAGkCIE0ApAmANAGQtvsAfr29bX0JaXuf/+4DgGsIgDQBkCYA0gRA2oQA9v6HiP0aMPkJAcBqAiBNAKQNCWDAx+juzJj5kABgHQGQNieAGW/kvRgz7TkBwAoCIG1UAGPey09u0pxHBQCXmhbApIfTcxo24WkBwEUEQNrAAIa9o5/KvNkODADONzOAeQ+qZzByqjMDWIae1oamznNsAHCOyQFMfWg93uBJTg4AThoewOBH18PMnuHwAJbp53dv46c3P4AlcIp3UphbIgD4TiWAwsPstiITqwSwZE70JjqzCgWwlM71GqkptQJYYqe7Qm0+uQCW3hmfLziZYgDwVzSA4KPupOZMXg6Hw9bXsKXfr69bX8L2mqv/LvoG+Kt89u/iE6gHsLQ3oHzv7wSwLNU9aN71JwL4o7YNtfv9Tv1H8LHxP4ut/kfeAJ/N3o/Zd7eCAL4wdUum3tc1fAL9ZMznkNX/jgBO23UGVv9nPoFO2+8O7ffKH8Yb4AI7ehVY/TMJYI2nLcHeX0oA6z1VBlZ/HQHcwIYl2PsrCeCWHlaCvb8VAdzLzWOw9PcggMe5KAnr/hgCIM1/hJEmANIEQJoASBMAaQIgTQCkCYA0AZAmANIEQJoASBMAaQIgTQCkCYA0AZAmANIEQJoASBMAaQIgTQCkCYA0AZAmANIEQJoASBMAaQIgTQCkCYA0AZAmANIEQJoASBMAaQIgTQCkCYA0AZAmANIEQJoASBMAaQIgTQCkCYA0AZAmANIEQJoASBMAaQIgTQCkCYA0AZAmANIEQJoASBMAaQIg7T8ctCqyxW12bgAAAABJRU5ErkJggg==";
export const VISION_MAX_TOKENS = 60;
export const VISION_HEAD_CHARS = 80;
