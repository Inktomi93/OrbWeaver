---
kind: review
status: executed
updated: 2026-08-08
---

# Containerize surface — security review of `fd4ae9119` (gate before the work-stream is done)

> **Scope:** the authored artifacts + code arms of `fd4ae9119` (`Dockerfile`, `docker-compose.yaml`,
> `.dockerignore`, `docker/*`, and the `VLLM_ENGINE_HOST` / `effectiveVllmDisabled` code changes),
> reviewed against `docs/design/containerize-prod-image-spec.md` §4 + §8 and
> `docs/design/containerize-build-plan.md`. No image was built and no container was run — the live build
> and the pentest cage remain the owner's sequenced step. Every claim below carries its receipt.
>
> **Outcome:** the §8 mapping holds on eight of nine checks. ONE defect made the flagship zero-config
> deployment inert and rested on a security claim that is false in three documents — fixed in the
> `docker/` tier by this review's own commit. Two secondary claims (`cap_drop` everywhere; "a stranger
> cannot mis-pair variant and posture") are REFUTED and reported. One code-tier hardening item is
> reported, not made.

## F1 — CRITICAL (deliverable) · the shipped default pair 401s every request, and three docs say it cannot

**What was shipped.** `docker/orbweaver.env` shipped `AUTH_MODE=single-user` + `AUTH_FALLBACK=deny`, on
the stated premise that "single-user IGNORES this knob (its fallback is unconditional — that is what
single-user means)". The same premise is in the spec twice (`containerize-prod-image-spec.md:147` "`AUTH_FALLBACK`
is irrelevant (fallback is unconditional)"; `:338` "`single-user` ignores `AUTH_FALLBACK` (unconditional)")
and in the compose header (`docker-compose.yaml:20-21`, pre-fix).

**The premise is false.** The fallback flag is tested BEFORE the mode's unconditional arm:

```
packages/server/src/infra/auth/index.ts:48
  if (config.fallback === "owner" && ownerFallbackAllowed(headers, config)) {
```

`ownerFallbackAllowed` does return `true` unconditionally for `single-user`
(`infra/auth/dispatch.ts:41-43`) — but it is never reached when `fallback === "deny"`. `resolveSingleUser`
returns `null` by design (`infra/auth/modes/single-user.ts:9`), so there is no other identity source:
`resolve()` returns `identity: null`, the seam mints no Principal (`entry/auth/seam.ts:158`), and the
transport 401s.

**Measured, not reasoned** (`resolve()` driven directly, `ORB_ENV_NO_FILE=1 NODE_ENV=production`):

```
{"mode":"single-user","fallback":"owner","host":"127.0.0.1","identity":"owner","via":"fallback"}
{"mode":"single-user","fallback":"owner","host":"orbweaver.example.com","identity":"owner","via":"fallback"}
{"mode":"single-user","fallback":"deny","host":"127.0.0.1","identity":null,"via":"header"}
{"mode":"single-user","fallback":"deny","host":"orbweaver.example.com","identity":null,"via":"header"}
```

The behavior is **already pinned by an existing test** — `tests/server/infra/auth/index.test.ts:48-52`,
*"fallback 'deny' + no identity → identity null (SSO mandatory)"*, constructed with
`cfg({ mode: "single-user", fallback: "deny" })`. So the code is deliberate and the documents are wrong.

**Impact.** `docker compose --profile slim up -d` with the shipped defaults produces a container that
401s every request, including the SPA's own tRPC calls — the zero-config profile `docker/secrets/README.md`
promises does not serve. It fails CLOSED, so this is not an exposure; the security consequence is
second-order and real: the two obvious deployer reactions to "everything 401s" are to flip
`AUTH_FALLBACK=owner` **and** to add a `ports:` mapping to check reachability, which together are exactly
the AUTHFIX-2 exploit the whole §4 design exists to prevent.

**Fix (landed, `docker/` tier).** `docker/orbweaver.env` now ships `AUTH_FALLBACK=owner` beside
`AUTH_MODE=single-user` (that fallback IS single-user's only credential), states the real mechanism with
its receipt, and moves `AUTH_FALLBACK=deny` INSIDE each SSO mode's commented block (`local` / `oidc` /
`forward-header`) so the mode and the fallback are flipped in one edit. `docker-compose.yaml` and
`docker/README.md` were corrected to match. No control was weakened: `deny` under single-user was not
protecting a surface, it was disabling the application; the belt that matters (`deny` in the three SSO
modes, where the origin gate is the attack surface) is now attached to each mode that needs it.

**Still owed — two things this review did NOT do:**

1. **Truth-repair the spec** (outside the `docker/` remit granted to this lane). Exact edits owed:
   - `containerize-prod-image-spec.md:147` — "`AUTH_FALLBACK` is irrelevant (fallback is unconditional)"
     → "`AUTH_FALLBACK` must be `owner` (the flag is checked before the mode's unconditional arm —
     `infra/auth/index.ts:48`); `deny` under single-user 401s every request."
   - `:338` — "`single-user` ignores `AUTH_FALLBACK` (unconditional), which is exactly why single-user
     must not be public" → "`single-user` requires `AUTH_FALLBACK=owner`; its protection is network
     reachability alone, which is exactly why single-user must not be public."
   - `:233` (the §3.5 matrix, single-user row) — "Origin gate: NONE (unconditional owner)" is fine, but
     the "Required secrets: none" row should note `AUTH_FALLBACK=owner` is required for the mode to work.
2. **A code-tier fence for the incoherent pair** — see F6.

## F2 — REFUTED CLAIM (low) · `cap_drop: [ALL]` is not "everywhere"

`containerize-build-plan.md:164-165` claims "`cap_drop: [ALL]` + `no-new-privileges` everywhere". The
`vllm` sibling service has `security_opt: no-new-privileges:true` and **no `cap_drop`**
(`docker-compose.yaml:164-165`; confirmed in the rendered `sibling` profile — the service carries
`security_opt` only). Upstream `vllm/vllm-openai` also ships no `USER`, so that container is root with the
default capability set, on the same network as the app, holding the GPU.

Not fixed here deliberately: `cap_drop: [ALL]` on a CUDA workload can break page-locked memory
(`CAP_IPC_LOCK`) and the sibling profile has never been run. Recommended at the owner's live step: add
`cap_drop: [ALL]`, run it, and add back `cap_add: [IPC_LOCK]` only if vLLM demands it. Either way the
build plan's "everywhere" should become "on the app services".

## F3 — REFUTED CLAIM (low) · a shared `env_file` CAN mis-pair variant and engine posture

`containerize-build-plan.md:33-35`: *"Picking a profile picks the CORRECT engine env … a stranger cannot
mis-pair variant and engine posture."* Only the `sibling` profile is actually pinned (it sets
`ENGINES_POSTURE`/`VLLM_ENGINE_HOST` in the service's own `environment:` block, which wins). `all-in-one`
and `slim` inherit theirs from the **image ENV**, and a compose `env_file` value beats image ENV — while
`docker/orbweaver.env` (read by all three profiles) carries a commented `ENGINES_POSTURE=adopt-only` +
`VLLM_ENGINE_HOST=` block inviting exactly that edit.

Measured with a crafted env file (`ORB_ENV_FILE=… docker compose --profile all-in-one config`):

```
ENGINES_POSTURE: adopt-only          # the runtime-gpu image bakes adopt-or-start
VLLM_ENGINE_HOST: my-gpu-box.internal
```

…while the same file under `--profile sibling` still renders `VLLM_ENGINE_HOST: vllm`. Consequence is
availability, not exposure (the all-in-one's baked fleet is simply never spawned, and the egress bypass
follows the declared host either way). The env file's engine block now carries that warning.

## F4 — HYGIENE (low, not fixed) · `tmpfs: /tmp` has no size bound on the read-only profiles

`slim`/`sibling` run `read_only: true` + `tmpfs: [/tmp]`. Bundle import and the agent-sdk child config
dirs stage into `tmpdir()` (`infra/storage/zip.ts:411`, `entry/http/import-tree.ts:296`,
`infra/providers/backends/agent-sdk/env.ts:146,172`), which is now RAM. An authenticated user importing a
large bundle consumes container memory instead of disk. One-line bound if the owner wants it:
`- /tmp:size=1g`, or point `IMPORT_STAGING_DIR` at the data volume. Left to the live step because a cap
set blind can reject a legitimate import.

## F5 — HYGIENE (informational) · CRLF secret files carry the `\r` through

`docker/entrypoint.sh:36` uses `$(cat …)`, which strips trailing newlines but not a trailing `\r`. A
secret file authored on Windows yields a value ending in CR. `CREDENTIALS_KEY` would fail its hex/base64
parse loudly; `SESSION_SECRET` would silently be a different-but-valid pepper (harmless until the file is
rewritten without the CR, which invalidates every live session). Not worth code today; noted so it is not
diagnosed twice.

## F6 — CODE-TIER, REPORTED ONLY · make the incoherent auth pair boot-fatal

The env schema already refuses `oidc` without its five keys and `local` without its two
(`foundation/env/index.ts:371-396`) precisely so "a misconfigured box never silently degrades". The same
argument applies to `AUTH_MODE=single-user` + `AUTH_FALLBACK=deny`: it is a configuration in which **no
request can ever authenticate**, and today it degrades into a silent 401-everything box rather than a
named boot failure. Recommended `superRefine` arm:

```
if (val.AUTH_MODE === "single-user" && val.AUTH_FALLBACK === "deny") → boot-fatal:
  "AUTH_FALLBACK=deny under AUTH_MODE=single-user leaves no way to authenticate
   (single-user has no credential other than the owner fallback)"
```

Coupled sites if taken: `tests/server/foundation/env/index.test.ts` (a new refusal row) and the three
in-code comments that currently assert the fallback is unconditional in single-user — `infra/auth/dispatch.ts:9`,
`infra/auth/index.ts:31-32`, `infra/auth/modes/single-user.ts:1-4`. Each says "unconditional" without the
`fallback === "owner"` precondition; that wording is what the spec and the shipped env file were written
from, so repairing the comments is part of the fix, not a nicety.

## Checklist verdicts (the brief's nine)

| # | Item | Verdict | Receipt |
| - | - | - | - |
| 1 | Expose-only, never `ports:`; the commented stanza doesn't re-open the Host-mint | **CONFIRMED** | `docker compose --profile {all-in-one,slim,sibling} config` all exit 0 with zero `ports:`/`published` keys; only `expose: ["8788"]` (+ `8703` on the sibling engine). The sole publish path is the commented `127.0.0.1:8788:8788` at `docker-compose.yaml:215-216`, loopback-bound, under an accurate warning that in single-user everything reaching the port is the owner. |
| 2 | `AUTH_FALLBACK` / `DEBUG_TOKEN` / `WIRE_CAPTURE` / `RPG_TRACE` shipped safe; env precedence can't silently flip them | **CONFIRMED with a defect (F1)** | Rendered env for all three profiles: `AUTH_MODE=single-user`, `AUTH_FALLBACK` (was `deny`, now `owner` — F1), `WIRE_CAPTURE: 'off'`, `RPG_TRACE: 'off'`, no `DEBUG_TOKEN` key. Precedence is one-way and documented: image ENV < `env_file` < service `environment:`; no service's `environment:` block names an auth key, so the env file is authoritative for auth and cannot be overridden by a stray shell export. Schema defaults behind it: `AUTH_FALLBACK` `owner`, `DEBUG_TOKEN` optional/unset ⇒ `/api/_debug/*` 404, `WIRE_CAPTURE`/`RPG_TRACE` `off` (`foundation/env/index.ts:160,164,169,301`). |
| 3 | Secrets never in image/compose/env; the shim audited; no leak vectors | **CONFIRMED** | Shim (`docker/entrypoint.sh`): `set -eu`, no `set -x`, values never in argv (`export` is a builtin; only the PATH reaches `cat`'s argv), the error line echoes the path only (`:33`), explicit-env-wins (`:29`), empty ⇒ unset (`:37-39`), unreadable ⇒ `exit 1` (`:32-35`). `eval` is used only to indirect through names from a fixed literal list, and assignment context makes a value with spaces/quotes/newlines inert. `shellcheck` clean. Context hygiene proven by **planted positive + negative controls** (`docker build -f -` per path against the real context): `docker/secrets` → not found, `.env` → not found, `data` → not found, `tests` → not found; `docker/entrypoint.sh` → copied, `packages/server/src` → copied. HF token rides `--mount=type=secret,id=hf_token,env=HF_TOKEN,required=false` only (`Dockerfile:153`) — never `ARG`/`ENV`, so it is absent from image history. Boot-fatal env errors do NOT echo values: Zod v4 `too_small`/`invalid_value` issues carry `minimum`/`values`, never the input (probed against the same zod build). |
| 3b | (found while auditing 3) the shim's allowlist is a COUPLED SITE with the agent-sdk credential firewall | **CONFIRMED, currently consistent** | The shim exports exactly `SESSION_SECRET OIDC_CLIENT_SECRET CREDENTIALS_KEY LOCAL_INITIAL_PASSWORD OPENROUTER_API_KEY DEBUG_TOKEN` (`entrypoint.sh:43`), which is set-identical to `HOST_SECRET_ENV_KEYS` stripped from every agent-sdk child env (`infra/providers/backends/agent-sdk/env.ts:15-22,34-38`). **Any future addition to the shim must be added there too** — a secret added to one list only rides into a subprocess whose tools execute as host. |
| 4 | The egress change relocates, never accumulates | **CONFIRMED** | `internalBackendHostPorts()` builds a FRESH 3-element set from one `env.VLLM_ENGINE_HOST` (`infra/network/egress.ts:83-86`) — structurally incapable of accumulating. The claimed displaced-default test exists and asserts what was claimed: `tests/server/infra/network/egress.int.test.ts:161-165` — after relocating to `127.0.0.2`, `http://127.0.0.1:8701/models` must contain `SSRF_BLOCKED`; siblings pin the relocated ports passing (`:146-153`) and a non-configured port on the relocated host still blocked (`:155-159`). Ran green, and the firewall's own boot log in the run is the direct receipt: `backends:["127.0.0.2:8701","127.0.0.2:8702","127.0.0.2:8703"]` — three entries, loopback gone. Port-scoping and the `hostPortKey` normalization are unchanged, so `127.0.0.1:22`-class targets stay blocked. |
| 5 | Non-root, `cap_drop: ALL`, `no-new-privileges`, `read_only`+`tmpfs` | **CONFIRMED for the app services; REFUTED for the sibling engine (F2)** | Both targets end `USER node` (`Dockerfile:102,197`). `runtime-slim` inherits uid-1000 `node` from `node:26-bookworm-slim`; `runtime-gpu` explicitly evicts ubuntu24.04's squatting uid-1000 `ubuntu` and mints `node` 1000:1000 (`:129-130`) — and that RUN fails the build loudly if the eviction did not happen (`groupadd -g 1000` would collide), so it cannot silently fall back to root. Writable roots are chowned to `node` before the drop (`:101,195-196`). Rendered compose: `cap_drop: [ALL]` + `no-new-privileges:true` on all three app services; `read_only: true` + `tmpfs: [/tmp]` on `slim`/`orbweaver-ext`; `all-in-one` is deliberately not read-only with the reason stated in-file. Only a live `docker run --rm <img> id` settles the effective uid — that is the owner's step. |
| 6 | Can a hostile `VLLM_ENGINE_HOST` become an SSRF/exfil vector? | **CONFIRMED SAFE, with a stated assumption** | Who can set it: the deployer only. It is a `process.env` key parsed once and frozen (`foundation/env/index.ts:209,415`); a repo-wide sweep found no AppSettings/DB/admin override and no non-env writer. The value is unvalidated (`z.string().min(1)`), so I measured every smuggling shape against `new URL()` + the egress key builder: `evil.com#`, `evil.com/`, `evil.com?x=`, `engine:9999` (URL parse failure), `http://evil.com`, decimal `2130706433`, and `0` all produce a connect-side `hostname:port` that does NOT equal the env-derived `${host}:${port}` key, so the bypass does not match and the request falls to the guarded connector — i.e. **every malformed value fails CLOSED** (a private target is SSRF-blocked; only a genuinely public target connects, which needs no bypass). `[::1]` and uppercase hosts match correctly, and the `.toLowerCase()` at `egress.ts:84` is what makes the uppercase case agree — it is load-bearing, not cosmetic. The relocation genuinely NARROWS as designed: the operator's declared host:port is the only private-range exemption, same class as the auto-allowed OIDC issuer. **Assumption:** a deployer who sets `VLLM_ENGINE_HOST` to a host they do not control is exfiltrating their own prompts by their own configuration; nothing here elevates a non-deployer into that decision. |
| 7 | Profile coupling pins the engine posture | **REFUTED (F3)** | Only `sibling` is pinned (service `environment:`); `all-in-one`/`slim` rely on image ENV, which a shared `env_file` overrides — measured. Auth posture, by contrast, IS identical across profiles (same env file, same secrets, same `expose`), so there is no profile combination that boots an app "in a broken-auth state" relative to another. |
| 8 | Anything else | see F1–F6 + the two notes below | |

## Two more things worth the owner's eye

- **Multi-profile invocation is unguarded.** `docker compose --profile slim --profile sibling up` is
  legal and starts two app containers that share the `orbweaver` network alias AND the `orbweaver-data`
  volume — two servers on one sqlite file, with the proxy round-robining between them. The file says
  "Exactly ONE profile at a time" (`docker-compose.yaml:11`) and nothing enforces it. Integrity risk, not
  authz; there is no compose-level enforcement, so the only lever is the warning it already has.
- **`expose`-only is half a control, and the documented Caddy wiring spends the other half.** The
  spec's A2 assumption states this correctly ("or another container on `inktomi-net` is compromised"),
  but the artifacts' prose ("this compose publishes nothing", "the port must stay UNREACHABLE") reads as
  if publication were the whole gate, while the recommended integration is to join an external
  multi-service network. In the shipped `single-user` mode, every co-tenant container on that network is
  the owner — and no `Host` spoofing is even required, because single-user's fallback ignores origin
  entirely. Corrected in `docker/orbweaver.env`, `docker-compose.yaml`, and `docker/README.md` by this
  commit; the spec's §4 belt ("recommend `AUTH_FALLBACK=deny`") only ever applied to the SSO modes and
  now says so.

## What this review did NOT verify (the owner's sequenced live step)

`docker build` of either target (both pass `docker build --check`: *"Check complete, no warnings
found."*), any container run, effective uid at runtime, the read-only-rootfs shakeout, the vLLM fleet
spawning inside the namespace, and the §4/Fork F pentest cage (Host-spoof owner fallback against a
reachable port, the unsigned forward-header peer gate, the debug gate across modes). One live check to
add to that list, cheap: `docker inspect --format '{{json .Config.Healthcheck}}' orbweaver:slim` — the
exec-form healthcheck embeds a JS template literal `${process.env.PORT??8788}`, and I confirmed by
building a throwaway image that BuildKit does **not** expand it (the arg survives verbatim), but only a
running container proves the probe returns 0.
