# Orbweaver in containers — deploy quickstart

The full design (trust model, exploit analysis, per-mode receipts):
[`docs/design/containerize-prod-image-spec.md`](../docs/design/containerize-prod-image-spec.md).
Build/artifact decisions: [`docs/design/containerize-build-plan.md`](../docs/design/containerize-build-plan.md).

## Pick a profile

| profile | what runs | GPU | image target | typical deployer |
| - | - | - | - | - |
| `all-in-one` | orb + the 3-engine vLLM fleet in ONE container | REQUIRED (`nvidia-container-toolkit`, ~34 GiB VRAM/card class) | `runtime-gpu` | the owner / turnkey GPU self-hosters |
| `slim` | orb only — cloud models (OpenRouter / agent-sdk), or a remote engine you point at | none | `runtime-slim` | cloud/CPU deployers |
| `sibling` | orb (slim) + an upstream `vllm/vllm-openai` container serving the GEN engine | required (for the sibling) | `runtime-slim` | GPU box, engines outside the app container |

```sh
docker compose --profile slim build          # or: --profile all-in-one / --profile sibling
docker compose --profile slim up -d
```

The `sibling` profile serves chat via the local GEN engine only; embed/rerank report down and the app
absence-degrades those features (the full local trio is `all-in-one`). Its serve command
(`docker-compose.yaml` → `vllm.command`) is pinned to the app's defaults and gets its Qwen3-VL flag
tune on first live run.

## The four auth modes (spec §3 — the shipped default is SECURE, not convenient)

| `AUTH_MODE` | secrets to fill (`docker/secrets/`) | must sit behind HTTPS proxy? | note |
| - | - | - | - |
| `single-user` (shipped default) | none | no — but the port must stay UNREACHABLE by untrusted clients | every request that reaches the port IS the owner; the control is network reachability, and co-tenant containers on the same network count as reachable |
| `local` | `session_secret`, `local_initial_password` | YES (`__Host-`/Secure cookie — plain-HTTP logins silently fail) | multi-user is a runtime admin setting |
| `oidc` | `session_secret`, `oidc_client_secret` + the `OIDC_*` block in `docker/orbweaver.env` | YES (callback derives from `X-Forwarded-Proto/Host`) | misconfig is boot-fatal, never a silent owner-fallback |
| `forward-header` | none hard-required (signed path needs a JWKS source) | recommended | prefer SIGNED; the unsigned path is fail-closed until `FORWARD_AUTH_TRUSTED_PROXIES` names the proxy `/32` |

`AUTH_FALLBACK` is **not** inert under `single-user` — the fallback flag is checked before the mode's
unconditional arm (`infra/auth/index.ts:48`), so `deny` there 401s every request and the box serves
nobody. The shipped file pairs `single-user` with `owner` (that fallback is the mode's only credential)
and puts `AUTH_FALLBACK=deny` inside each SSO mode's block — flip AUTH_MODE and AUTH_FALLBACK together.

Shipped hard lines (do not soften): `AUTH_FALLBACK=deny` in every SSO mode (un-credentialed ≠ owner,
even from inside the network), `DEBUG_TOKEN` unset (the whole `/api/_debug/*` surface 404s),
`WIRE_CAPTURE=off`, `RPG_TRACE=off`, no `ports:` on any service, `TRUSTED_LOCAL_HOSTS` never set to a
public FQDN.

### Diagnostics posture — three planes of one door

`IP_ALLOWLIST`, `DEBUG_TOKEN` and `WIRE_CAPTURE`/`RPG_TRACE` are not three unrelated switches; they are
the three planes of who can look inside a running box and how much is there. Read the block in
`docker/orbweaver.env` for the per-knob detail — the sentence that ties them together is:

> The **perimeter** (`IP_ALLOWLIST`) bounds who may knock. The **credential** (`DEBUG_TOKEN`, or an
> admin session) bounds who gets in. **Retention** (`WIRE_CAPTURE`/`RPG_TRACE`) decides what getting in
> is worth — with a recorder on, the `/api/_debug` ring holds raw provider request bodies: system
> prompts, full transcripts, persona and world text.

So a recorder ON with no `IP_ALLOWLIST` is the one combination that always deserves a second look, and
**turning a recorder on is a two-knob edit**. You do not have to remember this: the app resolves the
composed posture at boot, logs one info line stating it, and logs a `security`-tagged WARN naming the
exact knob for each exposure still open. The same verdict — plus its warnings, and never a secret value
— is served live at `GET /api/_debug/info` under `diagnostics`. The model and its wording live in
`packages/server/src/foundation/env/diagnostics.ts`.

Not done for you, on purpose: the app does **not** refuse to wire a capture sink when the perimeter is
open. Silently disabling capture on a box that has it on today is a posture flip the operator owns, so
the warning names the fix instead of taking it.

## Wiring your reverse proxy

Join the proxy to this compose network (or flip the `networks:` block per the comment at the bottom of
`docker-compose.yaml`) and target `orbweaver:8788` — the alias answers for whichever profile runs. The
proxy MUST pass `X-Forwarded-Proto/Host/For` (Caddy `reverse_proxy` does by default) and must NOT
duplicate the app's CSP. For SSE keep long read/write timeouts and no buffering (the owner's Caddyfile
carries `flush_interval -1` + 1800s).

## Data & models

- `orbweaver-data` volume → `/app/data`: sqlite + assets. Backup = this volume (plus your secrets).
- `vllm-models` volume → `/models`: HF + vLLM caches, shared by `all-in-one` and `sibling`. First boot
  pulls models (several GB) unless the image was built with `--build-arg BAKE_MODELS=true
  --secret id=hf_token,src=<file>` (gated repos only; Qwen3-VL is open).
- Rotating `credentials_key` orphans every stored BYOK credential — treat the key file as part of the
  backup set.

## Building with provenance (push-time, CI)

```sh
docker buildx build --target runtime-slim \
  --build-arg GIT_SHA=$(git rev-parse HEAD) --build-arg IMAGE_VERSION=<tag> \
  --sbom=true --provenance=mode=max \
  -t ghcr.io/<org>/orbweaver:<tag>-slim --push .
```

Attestations persist only on push with the containerd/OCI store; verify with
`docker buildx imagetools inspect <ref>`.
