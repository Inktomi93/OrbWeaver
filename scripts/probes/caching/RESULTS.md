# Bounded initial live caching results

Run: **2026-10-05T23:53:11.436Z**. The same harness terminal completed with exit 0. There were 24 physical POST starts, 24 HTTP 200 results, eight scenario verdicts and no scenario/network error rows. The complete authorized initial budget is spent.

## Prefix evidence

Each row used three physical calls: cold, identical prepared retry, then appended app turn. All seven first/second serialized body hashes match; all seven appended bodies differ. All seven warm calls report positive cached reads. OpenRouter response replay was disabled throughout these experiments.

Serving provider is reported in the retained OpenRouter streaming frames, not inferred from the model catalog: ordinals 4–6 Anthropic, 10–12 OpenAI, 16–18 Google, 19–21 Alibaba, and 22–24 OpenAI. Native routes use the documented vendor endpoints. Native Anthropic whole input in the table is the sum of its reported ordinary/read/creation input axes, not an invented wire total counter.

| Route / exact model | Ordinals | Input cold / warm / appended | Cached read cold / warm / appended | Cache write cold / warm / appended | Reported USD cold / warm / appended |
| - | - | - | - | - | - |
| Native Anthropic `claude-sonnet-5` | 1–3 | 25700 / 25700 / 25734 | 0 / 25667 / 25667 | 25667 / 0 / 35 | absent / absent / absent |
| OpenRouter `anthropic/claude-sonnet-5` | 4–6 | 25700 / 25700 / 25734 | 0 / 25667 / 25667 | 25667 / 0 / 35 | .0642735 / .0052394 / .0053249 |
| Native OpenAI `gpt-6-sol` | 7–9 | 19182 / 19182 / 19209 | 0 / 19158 / 19158 | 19158 / 0 / 28 | absent / absent / absent |
| OpenRouter `openai/gpt-6-sol` | 10–12 | 19182 / 19182 / 19209 | 0 / 19130 / 19130 | 19130 / 0 / 0 | .047979 / .00398 / .004034 |
| Native Google `gemini-3.8-flash` | 13–15 | 24347 / 24347 / 24367 | absent / 20442 / absent | absent / absent / absent | absent / absent / absent |
| OpenRouter `google/gemini-3.8-flash` | 16–18 | 24344 / 24344 / 24362 | 24327 / 24327 / 24346 | 24327 / 0 / 24346 | .00285465 / .001841025 / .002856116666666667 |
| OpenRouter `qwen/qwen3-coder-plus` | 19–21 | 23647 / 23647 / 23676 | 0 / 23621 / 23621 | 23621 / 0 / 29 | .0192154625 / .001558765 / .0015823275 |

Native Google appended cached-read count is absent, therefore **unknown**, not a proven hit or zero. Native Google cache-write zero in the common mapper is an applicability-derived billable creation-rate fact, not a wire-reported storage-write count. Native Anthropic output count is reported as four; Google candidates count is one and total counts are present. The original in-run summary omitted those fields; raw frames retained them and `summary.json` corrects the offline projection.

OpenRouter Gemini creation and read counts overlap on ordinals 16 and 18. Preserve both reported axes; their sum is not a disjoint subset of input. Reported cost remains authoritative. A disjoint configured-rate estimate cannot price this overlap when measured cost is absent. Native OpenAI raw creation counts (19158, explicit zero, 28) prove the installed compatible SDK's omitted creation count is not an authoritative zero.

The OpenRouter Gemini experiment sent explicit markers, but aggregate cached-token reporting does not establish an exact implicit-versus-explicit read split. No such split is claimed.

## Full-response replay and freshness

Ordinals 22–24 use OpenRouter `openai/gpt-6-sol`. Cold MISS billed .039854 USD; identical prepared retry HIT reported input/output/total **0 / 0 / 0** and cost **0**, while replaying the same nonempty five-character reply. The HIT has a new generation ID and source ID referring to the cold generation:

- Cold: `gen-1791244434-P66a6aWc2U8x1cR5gxv1`.
- HIT: `gen-1791244435-AlHDaqb6uo2HuhJ7h7vb`; source equals the cold ID; age 0, TTL 300.
- Actual fresh swipe: `gen-1791244435-AsV2qhzqm0AB8MGVBAZm`, request header false, no Clear, no response-cache HIT; .039854 USD.

The swipe body hash equals the original body hash. Thus the fresh bypass is independently established by the request header and new billed generation, not by a changed prompt or coincident response text. The response-replay verdict is `confirmed-miss-hit-and-fresh-bypass`.

## Limits and remaining acceptance

This live battery uses two humans / one character, Default names, requested strict floor and one admitted mode per prefix route. It complements, but does not replace, the 816 scripted persisted app cells. It is not an all-model/all-mode/all-vendor live claim. Other TTLs and older OpenAI retention have SDK/resolver/UI evidence, not additional paid conditioning. Image/embedding physical endpoint/header witnesses and affected UI cases are complete. Integrated durable H accounting/provenance and independent reviews remain pending. Exact upstream-transformed ordering is unobserved. See [support and evidence](SUPPORT.md) for the current route boundaries and vendor differences.

The retained-app rows are explicitly labeled **K uncombined**. They are regression evidence for the old SDK/raw-normalization loss, not proof that pending H ordered-leg/private response-cache persistence has already landed. The deliberately lost first generation is billed by the provider and recorded here, but is not a committed app variant; no deleted-charge ledger is introduced.

Managed native Gemini cachedContents resource creation/binding/lifecycle is owner-parked out of the alpha cut. No resource operation, production database operation, stack restart or additional paid request was performed.
