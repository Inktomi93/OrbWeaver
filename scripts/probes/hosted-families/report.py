#!/usr/bin/env python3
"""Build RESULTS.md from results.jsonl (rerunnable)."""
import json, os, re, collections

HERE = os.path.dirname(os.path.abspath(__file__))
rows = {}
for l in open(os.path.join(HERE, "results.jsonl")):
    r = json.loads(l)
    rows[(r["surface"], r["model"], r["case"], r["stream"])] = r  # last wins

UNAV = (404, 429, 500, 502, 503, 0)  # 404 = model retired for this key; not a statement about the API
CASES = ["c1_mid_system", "c2_tail_system", "c3_user_user", "c4_asst_asst", "c5_prefill"]
SAMP = ["s_all", "s_top_k", "s_min_p", "s_repetition_penalty", "s_top_a"]
SNAME = {"s_top_k": "top_k", "s_min_p": "min_p", "s_repetition_penalty": "repetition_penalty", "s_top_a": "top_a"}
UP = {"top_k": ["top_k", "topK"], "min_p": ["min_p", "minP"], "repetition_penalty": ["repetition_penalty"], "top_a": ["top_a"]}


def family(model):
    m = model.split("/")[-1]
    for pat, name in [
        (r"^gpt-5(\.\d+)?-(mini|nano)", None), (r"^gpt-5(\.\d+)?", None), (r"^gpt-6(\.\d+)?", None), (r"^gpt-4\.1", "gpt-4.1"),
        (r"^gpt-4o", "gpt-4o"), (r"^o\d", "o-series"), (r"^gpt-oss", "gpt-oss"), (r"^chat-latest", "chat-latest"),
        (r"^gemini-2\.5", "gemini-2.5"), (r"^gemini-3\.(\d+)", None), (r"^gemini-3-", "gemini-3"), (r"^gemma", "gemma-4"),
        (r"^claude-(opus|sonnet|haiku|fable)-(\d+)", None),
    ]:
        mm = re.match(pat, m)
        if mm:
            if name:
                return name
            if m.startswith("gpt-"):
                return re.match(r"^gpt-\d+(\.\d+)?", m).group(0)
            if m.startswith("gemini-3."):
                return "gemini-3.x"
            if m.startswith("claude"):
                return "claude-" + mm.group(1)
    return m


def cell(r, _unused=None):
    if r is None:
        return "-"
    if r["status"] != 200:
        return f"{r['status']}"
    return f"200 {r['verdict']}"


def transform(case, r):
    """What OpenRouter did, from the echoed upstream body."""
    if r is None:
        return "-"
    if r["status"] != 200 or r.get("verdict") == "MID_STREAM_ERROR":
        return "(no echo: " + str(r["status"]) + ")"
    e = r.get("echo")
    if not e:
        return "no-echo"
    parts = []
    if e.get("responses_api"):
        parts.append("RESPONSES-API")
    roles = e.get("roles") or []
    sysf = e.get("system_field_text", "")
    if case in ("c1_mid_system", "c2_tail_system"):
        kept = [x for x in roles if x in ("system", "developer")]
        if "French" in sysf:
            parts.append("hoisted->system field")
        elif "French" in e.get("last", "") or (roles and "French" in json.dumps(e)):
            if kept and len(kept) > 1 or (kept and case == "c1_mid_system" and roles.count("system") + roles.count("developer") > 1):
                parts.append("kept in place")
            elif kept:
                parts.append("kept in place")
            else:
                parts.append("merged->user")
        parts.append("roles=" + ",".join(x[0].upper() for x in roles if x))
    elif case in ("c3_user_user", "c4_asst_asst"):
        parts.append("roles=" + ",".join(x[0].upper() for x in roles if x))
    elif case == "c5_prefill":
        parts.append("last=" + (roles[-1] if roles else "?"))
    if case.startswith("s_"):
        su = e.get("samplers_upstream", {})
        want = list(UP) if case == "s_all" else [SNAME[case]]
        passed = [w for w in want if any(k in su for k in UP[w])]
        dropped = [w for w in want if w not in passed]
        parts.append("passed=" + (",".join(passed) or "none") + (" dropped=" + ",".join(dropped) if dropped else ""))
    return " ".join(parts)


def surface_models(surface):
    return sorted({k[1] for k in rows if k[0] == surface}, key=lambda m: (family(m), m))


def table(surface, stream=False, cols=CASES, fn=lambda c, r: cell(r), title=""):
    out = [f"\n#### {title}\n", "| model | " + " | ".join(c for c in cols) + " |", "|---|" + "---|" * len(cols)]
    for m in surface_models(surface):
        out.append(f"| {m} | " + " | ".join(fn(c, rows.get((surface, m, c, stream))).replace("|", "/") for c in cols) + " |")
    return "\n".join(out)


def errs(surface):
    seen = collections.OrderedDict()
    for (s, m, c, st), r in rows.items():
        if s == surface and r["status"] != 200 and not st and not c.startswith("s_"):
            msg = re.sub(r"\s+", " ", r.get("error", ""))
            msg = re.sub(r"models/[\w.\-]+", "models/X", msg)
            msg = re.sub(r"^\[\{ \"error\": \{ \"code\": \d+, \"message\": ", "", msg)[:170]
            seen.setdefault((r["status"], msg), collections.defaultdict(set))[c].add(m.split("/")[-1])
    out = ["\n#### Distinct non-sampler error messages (status, message -> case: models)\n"]
    for (st, msg), cs in seen.items():
        out.append(f"- {st} `{msg}` -> " + "; ".join(f"{c}: {', '.join(sorted(v))}" for c, v in sorted(cs.items())))
    return "\n".join(out)


def facts(surface, m):
    g = lambda c, s=False: rows.get((surface, m, c, s))
    f = {}
    orr = surface == "openrouter"
    for c, name in [("c1_mid_system", "midConversationSystem"), ("c2_tail_system", "tailSystem")]:
        r = g(c)
        if r is None:
            f[name] = "n/a"
        elif r["status"] != 200:
            f[name] = (f"unavailable({r['status']})" if r["status"] in UNAV else f"rejected({r['status']})")
        else:
            t = transform(c, g(c, True)) if orr else ""
            tag = "hoisted" if "hoisted" in t else ("merged->user" if "merged" in t else ("passed-through" if orr else "accepted"))
            f[name] = f"{tag}/{'obeyed' if r['verdict']=='FRENCH' else r['verdict'].lower()}"
    for c, name in [("c3_user_user", "adjUser"), ("c4_asst_asst", "adjAssistant")]:
        r = g(c)
        f[name] = "n/a" if r is None else ((f"unavailable({r['status']})" if r["status"] in UNAV else f"rejected({r['status']})") if r["status"] != 200 else f"ok/{r['verdict'].lower()}")
    r = g("c5_prefill")
    f["assistantPrefill"] = "n/a" if r is None else ((f"unavailable({r['status']})" if r["status"] in UNAV else f"refused({r['status']})") if r["status"] != 200 else r["verdict"].lower())
    for c in SAMP[1:]:
        r = g(c)
        n = SNAME[c]
        if r is None:
            f[n] = "n/a"
        elif r["status"] != 200:
            f[n] = f"unavailable({r['status']})" if r["status"] in UNAV else f"rejected({r['status']})"
        elif orr:
            t = transform(c, g(c, True))
            f[n] = "dropped" if "dropped" in t else ("passed" if "passed=" in t and "none" not in t else "200-no-echo")
        else:
            f[n] = "200(accepted-or-ignored)"
    return f


def summary(surface):
    out = []
    byfam = collections.defaultdict(list)
    for m in surface_models(surface):
        byfam[family(m)].append(m)
    for fam, ms in byfam.items():
        fs = {m: facts(surface, m) for m in ms}
        out.append(f"\n**{fam}** ({', '.join(x.split('/')[-1] for x in ms)})")
        for k in fs[ms[0]]:
            vals = collections.defaultdict(list)
            for m in ms:
                vals[fs[m][k]].append(m.split("/")[-1])
            if len(vals) == 1:
                out.append(f"- {k}: {next(iter(vals))}")
            else:
                out.append(f"- {k}: **DISAGREE** " + "; ".join(f"{v} [{', '.join(x)}]" for v, x in vals.items()))
    return "\n".join(out)


NOTES = """# Family sweep: turn structure and sampler handling (measured 2026-10-03)

Script: `probe.py` (collect) + `report.py` (this file). Raw request/response per case in `raw/<surface>/<model>/<case>[.stream].json`
(OpenRouter `.stream.json` holds the SSE incl. the `debug.echo_upstream_body` chunk). Row-level data: `results.jsonl`.
Rerun: `python3 probe.py [surface...]` (FORCE=1 to redo), then `python3 report.py`.

Method notes
- Each request max_tokens/max_completion_tokens=300; if the reply was empty at 300 (reasoning burn) it was retried once at 2500 (flagged in results.jsonl `note`).
- OpenAI direct uses `max_completion_tokens` (the reasoning families reject `max_tokens`).
- 429/503 retried 3x (3s/8s/20s); still failing = UNAVAILABLE.
- Verdicts are regex heuristics: FRENCH = reply contains a French goodbye word; prefill CONTINUES = reply starts at F (or E F), RESTARTS = starts A B C; c3 SAW_BOTH = reply names "pelican" (the first user turn survived), LOST_FIRST = it did not.
- Sampler cells on DIRECT APIs: 200 means accepted OR silently ignored; the response cannot distinguish. Only OpenRouter's echoed upstream body shows passed vs dropped.
- Gemini native has no `system` role in `contents`: system lead goes in `systemInstruction`; mid-history/tail system turns are sent as `role:"system"` in `contents` (the thing under test). Native samplers go in `generationConfig` as topK/minP/repetitionPenalty/topA.
- Cases: c1 mid-history system, c2 trailing system (no trailing user), c3 user,user, c4 assistant,assistant, c5 prefill ("A B C D E" assistant tail), samplers (s_all = all four, then each alone).
## Key findings (hand-written from the tables below; the per-family summaries are generated)

OpenAI direct (chat completions, 27 models): every model accepts and obeys a mid-history system turn, a trailing system turn, user,user and assistant,assistant (adjacent roles never rejected, first user turn never lost). Samplers: top_k, min_p, repetition_penalty, top_a each 400 `Unknown parameter` on every model, individually and together. Prefill is not a feature: a final assistant turn is just history, the model restarts or continues nondeterministically (gpt-5.1/5.2, gpt-4o-mini, gpt-6-sol continued in this run; others restarted; gpt-4o differs from direct to OpenRouter) so treat `assistantPrefill` as unsupported/unreliable for the whole vendor. `gpt-5-chat-latest` is retired (404). Reasoning models need `max_completion_tokens`.

Gemini OpenAI-compat: top_k, min_p, repetition_penalty, top_a all 400 `Unknown name` (even top_k). Mid-history system accepted and obeyed on all reachable 3.x/gemma models (the shim lifts it). Tail system and prefill (conversation ending on a model turn) are PER-MODEL: gemini-3-flash-preview, 3.1-flash-lite, 3.5-flash and gemma-4 accept (prefill continues); 3.5-flash-lite, 3.6-flash, 3.7-flash, 3.8-flash 400 `Requests ending with a model turn are not supported.` Adjacent roles OK everywhere reachable. gemini-2.5-* are 404 for this key; gemini-3.1-pro-preview returned 429 quota on every request (unavailable, not measured).

Gemini native generateContent: topK accepted; minP/repetitionPenalty/topA 400 `Unknown name` (each alone too). A `role:"system"` turn inside `contents` is accepted and obeyed on 3-flash-preview/3.1-flash-lite/3.5-flash/gemma-4 but 400 `Role 'system' is not supported` on 3.5-flash-lite, 3.6, 3.7, 3.8-flash (per-model, tracks the same split as the compat tail/prefill 400). Same newer models refuse a trailing model turn (prefill); the older ones continue. Adjacent user,user / model,model accepted.

OpenRouter (stream+echo_upstream_body, raw in raw/openrouter/*/*.stream.json):
- OpenAI proprietary models (gpt-5*, gpt-6*, gpt-4.1*, o3, o4-mini, o3-mini): converted to the RESPONSES API (`input`, `max_output_tokens`); mid/tail system kept as `system` items in place; prefill passed as a trailing assistant `output_text` item; ALL four samplers dropped. gpt-4o, gpt-4o-mini and gpt-oss use chat completions (messages pass untouched). gpt-oss-120b passes top_k/min_p/top_a upstream and drops repetition_penalty. Prefill outcomes follow the model, not OpenRouter.
- Google (gemini-2.5 through 3.8): mid-history and tail system HOISTED into `systemInstruction`; all four samplers dropped (top_k too). Prefill passed through as a trailing model turn: continues on 2.5, 3-flash, 3.1-*, 3.5-flash; 400 `Requests ending with a model turn` on 3.5-flash-lite, 3.6, 3.7, 3.8 (and the hoisted tail-system case ends on a model turn, so it 400s on the same four). gemma-4-31b-it: messages passed through, top_k/min_p/repetition_penalty passed, top_a dropped.
- Anthropic: system turns never stay in `messages`. Old gen (sonnet-4/4.5, opus-4.1/4.5, haiku-4.5, and opus/sonnet 4.6, 4.7 for mid-history) hoists to the `system` field, so a mid-history "answer in French" instruction is not always obeyed (haiku-4.5 and sonnet-4.5 ignored it). Newer (opus-4.8, opus-5, opus-5.5, sonnet-5, sonnet-5.5, fable-5, fable-5.1) MERGE the mid-history system text into the neighbouring user turn and obey. Trailing system with no user: 400 on sonnet-4.6, opus-4.6, opus-4.7 (conversation ends on assistant => prefill refusal). Prefill: continues on sonnet-4/4.5, opus-4.1/4.5, haiku-4.5; refused 400 `This model does not support assistant message prefill` on sonnet-4.6, opus-4.6+, sonnet-5/5.5, fable-5/5.1. Samplers: top_k passed on sonnet-4/4.5, opus-4.1/4.5, haiku-4.5 and DROPPED on 4.6+ and 5.x; min_p, repetition_penalty, top_a always dropped.
- Adjacent user,user and assistant,assistant: 200 everywhere reachable on every surface (roleHandlingFloor: none needed for any tested family; Anthropic merges adjacent roles inside OpenRouter).

Families where models DISAGREE (fact must be per-model): Gemini 3.x (trailing-model-turn/prefill and native system-in-contents split lite/3.6+ vs earlier); Anthropic via OpenRouter (prefill, tail system, top_k, hoist-vs-merge split at 4.6/4.8); OpenAI prefill is nondeterministic per call, not a fact; gemma-4 26b vs 31b flaked earlier with 500s and agreed after retries.

Unavailable: gemini-3.1-pro-preview (quota 429 on direct compat+native; OpenRouter route measured), gemini-2.5-* direct (404 no longer available to new users), gemini-3.7-flash native c3 (429 after retries), gpt-5-chat-latest (404 deprecated). Stray EMPTY replies on OpenRouter sampler cases (gpt-5-nano, o3-mini) are reasoning burn at 300 tokens (status 200, samplers cases are not retried at 2500).
"""


def main():
    o = [NOTES]
    surfaces = [("openai", "OpenAI direct"), ("gemini_compat", "Gemini OpenAI-compat"), ("gemini_native", "Gemini native generateContent")]
    for s, title in surfaces:
        if not any(k[0] == s for k in rows):
            continue
        o.append(f"\n## {title}\n")
        o.append(table(s, cols=CASES, title="Turn-structure cases (status + verdict)"))
        o.append(table(s, cols=SAMP, title="Samplers (status; 200 = accepted or silently ignored)", fn=lambda c, r: "-" if r is None else str(r["status"])))
        o.append(errs(s))
        o.append("\n### Summary per family\n" + summary(s))
    if any(k[0] == "openrouter" for k in rows):
        ms = surface_models("openrouter")
        for vendor in ("openai", "google", "anthropic"):
            vm = [m for m in ms if m.startswith(vendor + "/")]
            sub = lambda s, vm=vm: None
            o.append(f"\n## OpenRouter: {vendor}\n")
            for kind, cols in (("Turn-structure cases (non-stream status + verdict)", CASES), ("Samplers (non-stream status)", SAMP)):
                o.append(f"\n#### {kind}\n")
                o.append("| model | " + " | ".join(cols) + " |\n|---|" + "---|" * len(cols))
                for m in vm:
                    o.append(f"| {m} | " + " | ".join((cell(rows.get(("openrouter", m, c, False))) if cols is CASES else str((rows.get(("openrouter", m, c, False)) or {"status": "-"})["status"])).replace("|", "/") for c in cols) + " |")
            o.append("\n#### What OpenRouter sent upstream (from echo_upstream_body; roles U/A/S, system_field = hoisted)\n")
            o.append("| model | " + " | ".join(CASES + SAMP) + " |\n|---|" + "---|" * (len(CASES) + len(SAMP)))
            for m in vm:
                o.append(f"| {m} | " + " | ".join(transform(c, rows.get(("openrouter", m, c, True))).replace("|", "/") for c in CASES + SAMP) + " |")
        o.append(errs("openrouter"))
        o.append("\n### Summary per family (OpenRouter)\n" + summary("openrouter"))
    open(os.path.join(HERE, "RESULTS.md"), "w").write("\n".join(o) + "\n")


main()
