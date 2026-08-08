# File secrets (compose `secrets:` → `/run/secrets/*`)

The five files beside this README are committed **EMPTY on purpose**: the image entrypoint treats an
empty secret file as *unset*, so the zero-config `single-user` profile boots without touching them.

Filling them in:

| file | feeds env | required by |
| - | - | - |
| `session_secret` | `SESSION_SECRET` (≥32 chars) | `local`, `oidc` (boot-fatal if missing) |
| `oidc_client_secret` | `OIDC_CLIENT_SECRET` | `oidc` |
| `local_initial_password` | `LOCAL_INITIAL_PASSWORD` (≥8 chars, first-boot owner seed) | `local` |
| `credentials_key` | `CREDENTIALS_KEY` (32 bytes, hex/base64 — losing it orphans every stored BYOK credential) | recommended for any mode storing provider keys (or set `CREDENTIALS_KEY_AUTO=true`) |
| `openrouter_api_key` | `OPENROUTER_API_KEY` | only if you use OpenRouter models |

Generate strong values with e.g. `openssl rand -hex 32 > session_secret` (the trailing newline is
stripped by the entrypoint).

**NEVER commit real values.** For a real deployment, point `ORB_SECRETS_DIR` at a directory OUTSIDE the
repo (each file `chmod 600`) instead of editing these in place:

```sh
ORB_SECRETS_DIR=/etc/orbweaver/secrets docker compose --profile slim up -d
```
