#!/usr/bin/env python3
"""Family sweep probe: turn structure + sampler handling per hosted API.

Usage: python3 probe.py [surface ...]   (surfaces: openai gemini_compat gemini_native openrouter)
Reads probe keys from the repo .env (never printed). Writes raw/<surface>/<model>/<case>[.stream].json
and appends one summary row per request to results.jsonl. Rerun is idempotent per (surface,model,case,variant):
existing raw files are skipped unless FORCE=1.
"""
import json, os, re, sys, time, urllib.request, urllib.error, concurrent.futures as cf, threading

HERE = os.path.dirname(os.path.abspath(__file__))
ENV = os.path.join(HERE, "..", "..", "..", ".env")
RAW = os.path.join(HERE, "raw")
OUT = os.path.join(HERE, "results.jsonl")
LOCK = threading.Lock()
FORCE = os.environ.get("FORCE") == "1"


def key(name):
    for line in open(ENV):
        if line.startswith(name + "="):
            return line.split("=", 1)[1].strip().strip('"')
    raise SystemExit(f"missing {name}")


OPENAI_KEY = key("OPENAI_PROBE_KEY")
GEMINI_KEY = key("GEMINI_PROBE_KEY")
OR_KEY = key("OPENROUTER_PROBE_KEY")

SYS = "You are a terse assistant."
M = lambda r, c: {"role": r, "content": c}
BASE_Q = [M("system", SYS), M("user", "Say hi in one word.")]
CASES = {
    "c1_mid_system": [M("system", SYS), M("user", "Say hello."), M("assistant", "Hello."), M("system", "Answer in French."), M("user", "Say bye.")],
    "c2_tail_system": [M("system", SYS), M("user", "Say hello."), M("assistant", "Hello."), M("system", "Answer in French and say bye.")],
    "c3_user_user": [M("system", SYS), M("user", "Remember the word: pelican."), M("user", "What word did I ask you to remember?")],
    "c4_asst_asst": [M("system", SYS), M("user", "Say hello."), M("assistant", "Hello."), M("assistant", "How can I help?"), M("user", "Say bye.")],
    "c5_prefill": [M("system", SYS), M("user", "Recite the alphabet as space-separated capital letters, starting at A. Output only letters."), M("assistant", "A B C D E")],
}
SAMPLERS = {"top_k": 40, "min_p": 0.05, "repetition_penalty": 1.1, "top_a": 0.1}
CASES["s_all"] = BASE_Q
for k in SAMPLERS:
    CASES["s_" + k] = BASE_Q
CASE_ORDER = list(CASES)


def sampler_extra(case):
    if case == "s_all":
        return dict(SAMPLERS)
    if case.startswith("s_") and case[2:] in SAMPLERS:
        return {case[2:]: SAMPLERS[case[2:]]}
    return {}


MODELS = {
    "openai": [
        "gpt-5", "gpt-5-mini", "gpt-5-nano", "gpt-5.1", "gpt-5.2", "gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano",
        "gpt-5.5", "gpt-5.6-sol", "gpt-5.6-luna", "gpt-5.6-terra", "gpt-6-sol", "gpt-6-luna", "gpt-6-astra",
        "gpt-6.1-sol", "gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano", "gpt-4o", "gpt-4o-mini", "o1", "o3", "o3-mini", "o4-mini",
        "gpt-5-chat-latest", "chat-latest",
    ],
    "gemini": [
        "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro", "gemini-3-flash-preview",
        "gemini-3.1-pro-preview", "gemini-3.1-flash-lite", "gemini-3.5-flash", "gemini-3.5-flash-lite",
        "gemini-3.6-flash", "gemini-3.7-flash", "gemini-3.8-flash", "gemma-4-31b-it", "gemma-4-26b-a4b-it",
    ],
    "openrouter": [
        "openai/gpt-5", "openai/gpt-5-mini", "openai/gpt-5-nano", "openai/gpt-5.1", "openai/gpt-5.2", "openai/gpt-5.4",
        "openai/gpt-5.4-mini", "openai/gpt-5.4-nano", "openai/gpt-5.5", "openai/gpt-5.6-sol", "openai/gpt-5.6-luna",
        "openai/gpt-5.6-terra", "openai/gpt-6-sol", "openai/gpt-6-luna", "openai/gpt-6-astra", "openai/gpt-6.1-sol",
        "openai/gpt-4.1", "openai/gpt-4.1-mini", "openai/gpt-4.1-nano", "openai/gpt-4o", "openai/gpt-4o-mini",
        "openai/o3", "openai/o4-mini", "openai/o3-mini", "openai/gpt-oss-120b",
        "google/gemini-2.5-flash", "google/gemini-2.5-flash-lite", "google/gemini-2.5-pro", "google/gemini-3-flash-preview",
        "google/gemini-3.1-pro-preview", "google/gemini-3.1-flash-lite", "google/gemini-3.5-flash",
        "google/gemini-3.5-flash-lite", "google/gemini-3.6-flash", "google/gemini-3.7-flash", "google/gemini-3.8-flash",
        "google/gemma-4-31b-it",
        "anthropic/claude-haiku-4.5", "anthropic/claude-sonnet-4", "anthropic/claude-sonnet-4.5",
        "anthropic/claude-sonnet-4.6", "anthropic/claude-sonnet-5", "anthropic/claude-sonnet-5.5",
        "anthropic/claude-opus-4.1", "anthropic/claude-opus-4.5", "anthropic/claude-opus-4.6",
        "anthropic/claude-opus-4.7", "anthropic/claude-opus-4.8", "anthropic/claude-opus-5",
        "anthropic/claude-opus-5.5", "anthropic/claude-fable-5", "anthropic/claude-fable-5.1",
    ],
}


def http(url, body, headers, stream=False, timeout=120):
    """POST with 503/429 retry (3x, backoff). Returns (status, text, attempts)."""
    data = json.dumps(body).encode()
    for attempt in range(4):
        req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json", **headers})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.status, r.read().decode("utf-8", "replace"), attempt + 1
        except urllib.error.HTTPError as e:
            txt = e.read().decode("utf-8", "replace")
            if e.code in (429, 500, 502, 503) and attempt < 3:
                time.sleep([3, 8, 20][attempt])
                continue
            return e.code, txt, attempt + 1
        except Exception as e:  # timeout / connection
            if attempt < 3:
                time.sleep([3, 8, 20][attempt])
                continue
            return 0, f"EXC {type(e).__name__}: {e}", attempt + 1


def err_msg(txt):
    try:
        j = json.loads(txt)
        e = j.get("error", j)
        if isinstance(e, list):
            e = e[0].get("error", e[0])
        m = e.get("message") if isinstance(e, dict) else str(e)
        raw = (e.get("metadata") or {}).get("raw") if isinstance(e, dict) else None
        return (m or "")[:300] + (f" | raw: {str(raw)[:300]}" if raw else "")
    except Exception:
        return txt[:300]


def parse_sse(txt):
    content, debug, finish, mid_err = "", None, None, None
    for line in txt.splitlines():
        if not line.startswith("data:"):
            continue
        p = line[5:].strip()
        if p == "[DONE]":
            continue
        try:
            j = json.loads(p)
        except Exception:
            continue
        if "debug" in j and debug is None:
            debug = j["debug"]
        if "error" in j:
            mid_err = j["error"]
        for c in j.get("choices", []):
            content += (c.get("delta") or {}).get("content") or ""
            finish = c.get("finish_reason") or finish
    return content, debug, finish, mid_err


def classify(case, content):
    c = (content or "").strip()
    if not c:
        return "EMPTY"
    if case in ("c1_mid_system", "c2_tail_system"):
        fr = re.search(r"au revoir|bient[oô]t|salut|adieu|à plus|a plus|bonne |ciao|à la prochaine|a la prochaine|à demain", c, re.I)
        return "FRENCH" if fr else "NOT_FRENCH"
    if case == "c3_user_user":
        return "SAW_BOTH" if "pelican" in c.lower() else "LOST_FIRST"
    if case == "c4_asst_asst":
        return "REPLIED"
    if case == "c5_prefill":
        s = re.sub(r"^[\s`'\"]+", "", c)
        if re.match(r"A\s*B\s*C", s):
            return "RESTARTS"
        if re.match(r"(?:E\s*)?F\b", s) or re.match(r"F\s*G", s):
            return "CONTINUES"
        return "OTHER"
    return "OK"


def summarize_echo(debug):
    """What OpenRouter actually sent upstream."""
    if not debug:
        return None
    b = debug.get("echo_upstream_body")
    if isinstance(b, str):
        try:
            b = json.loads(b)
        except Exception:
            return {"unparsed": True}
    if not isinstance(b, dict):
        return None
    s = {"keys": sorted(b.keys())}
    msgs = b.get("messages") or b.get("input") or b.get("contents")
    s["responses_api"] = "input" in b and "messages" not in b
    s["msg_key"] = "messages" if "messages" in b else ("input" if "input" in b else ("contents" if "contents" in b else None))
    if isinstance(msgs, list):
        s["roles"] = [m.get("role") or m.get("type") for m in msgs if isinstance(m, dict)]
        last = msgs[-1] if msgs else {}
        s["last"] = json.dumps(last)[:160]
    sysf = b.get("system") or b.get("systemInstruction") or b.get("instructions")
    s["system_field"] = bool(sysf)
    if sysf:
        s["system_field_text"] = json.dumps(sysf)[:300]
    gen = b.get("generationConfig") or {}
    flat = {**b, **gen}
    s["samplers_upstream"] = {k: flat.get(k) for k in list(SAMPLERS) + ["topK", "topP", "minP", "top_p"] if k in flat}
    return s


def call_once(surface, model, case, max_tokens, stream):
    msgs = CASES[case]
    extra = sampler_extra(case)
    if surface in ("openai", "gemini_compat", "openrouter"):
        body = {"model": model, "messages": msgs}
        if surface == "openai":
            url, hdr = "https://api.openai.com/v1/chat/completions", {"Authorization": f"Bearer {OPENAI_KEY}"}
            body["max_completion_tokens"] = max_tokens
        elif surface == "gemini_compat":
            url, hdr = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {"Authorization": f"Bearer {GEMINI_KEY}"}
            body["max_tokens"] = max_tokens
        else:
            url, hdr = "https://openrouter.ai/api/v1/chat/completions", {"Authorization": f"Bearer {OR_KEY}"}
            body["max_tokens"] = max_tokens
            if stream:
                body["stream"] = True
                body["debug"] = {"echo_upstream_body": True}
        body.update(extra)
    else:  # gemini_native
        contents, sys_parts = [], None
        for i, m in enumerate(msgs):
            if m["role"] == "system" and i == 0:
                sys_parts = {"parts": [{"text": m["content"]}]}
                continue
            contents.append({"role": {"assistant": "model"}.get(m["role"], m["role"]), "parts": [{"text": m["content"]}]})
        gc = {"maxOutputTokens": max_tokens}
        nm = {"top_k": "topK", "min_p": "minP", "repetition_penalty": "repetitionPenalty", "top_a": "topA"}
        gc.update({nm[k]: v for k, v in extra.items()})
        body = {"contents": contents, "generationConfig": gc}
        if sys_parts:
            body["systemInstruction"] = sys_parts
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        hdr = {"x-goog-api-key": GEMINI_KEY}
    status, txt, att = http(url, body, hdr)
    return body, status, txt, att


def run(surface, model, case, stream=False):
    safe = model.replace("/", "__")
    d = os.path.join(RAW, surface, safe)
    os.makedirs(d, exist_ok=True)
    fn = os.path.join(d, case + (".stream" if stream else "") + ".json")
    if os.path.exists(fn) and not FORCE:
        return
    mt, note = 300, ""
    body, status, txt, att = call_once(surface, model, case, mt, stream)
    # reasoning models can burn 300 tokens thinking; retry once with more headroom so the case is judgeable
    if status == 200 and not case.startswith("s_"):
        def content_of(t):
            if stream:
                return parse_sse(t)[0]
            try:
                j = json.loads(t)
                if surface == "gemini_native":
                    return "".join(p.get("text", "") for c in j.get("candidates", []) for p in (c.get("content") or {}).get("parts", []))
                return j["choices"][0]["message"].get("content") or ""
            except Exception:
                return ""
        if not content_of(txt).strip():
            mt, note = 2500, "retried max_tokens=2500 after empty@300"
            body, status, txt, att = call_once(surface, model, case, mt, stream)
    row = {"surface": surface, "model": model, "case": case, "stream": stream, "status": status, "attempts": att, "max_tokens": mt, "note": note}
    content, echo, finish, mid_err = "", None, None, None
    if status == 200:
        if stream:
            content, debug, finish, mid_err = parse_sse(txt)
            echo = summarize_echo(debug)
            row["echo_present"] = debug is not None
        else:
            try:
                j = json.loads(txt)
                if surface == "gemini_native":
                    cand = (j.get("candidates") or [{}])[0]
                    content = "".join(p.get("text", "") for p in (cand.get("content") or {}).get("parts", []))
                    finish = cand.get("finishReason")
                else:
                    ch = j["choices"][0]
                    content, finish = ch["message"].get("content") or "", ch.get("finish_reason")
                    if surface == "openrouter" and j.get("error"):
                        mid_err = j["error"]
            except Exception as e:
                row["parse_error"] = str(e)
        row["content"] = content[:200]
        row["finish"] = finish
        row["verdict"] = classify(case, content)
        if mid_err:
            row["verdict"] = "MID_STREAM_ERROR"
            row["error"] = json.dumps(mid_err)[:300]
    else:
        row["verdict"] = "UNAVAILABLE" if status in (429, 500, 502, 503, 0) else "REJECTED"
        row["error"] = err_msg(txt)
    if echo:
        row["echo"] = echo
    with open(fn, "w") as f:
        json.dump({"request": body, "status": status, "response": txt[:30000]}, f, indent=1)
    with LOCK, open(OUT, "a") as f:
        f.write(json.dumps(row) + "\n")


def main():
    surfaces = sys.argv[1:] or ["openai", "gemini_compat", "gemini_native", "openrouter"]
    jobs = []
    for s in surfaces:
        models = MODELS["gemini" if s.startswith("gemini") else s]
        for m in models:
            for c in CASE_ORDER:
                jobs.append((s, m, c, False))
                if s == "openrouter":
                    jobs.append((s, m, c, True))
    print(f"{len(jobs)} requests", flush=True)
    done = 0
    with cf.ThreadPoolExecutor(max_workers=int(os.environ.get("WORKERS", "6"))) as ex:
        for f in cf.as_completed([ex.submit(run, *j) for j in jobs]):
            done += 1
            if f.exception():
                print("job error:", f.exception(), flush=True)
            if done % 100 == 0:
                print(done, flush=True)


if __name__ == "__main__":
    main()
