# File secrets (the `docker/compose.secrets.yaml` overlay → `/run/secrets/*`)

Not needed for the quick start: the default compose takes values from `docker/orbweaver.local.env`
(gitignored) and generates the session secret and initial password into the data volume on the first boot.
Use this overlay when a value must never be readable from `docker inspect` — the container gets FILES, and
the entrypoint exports each one as its env var at boot.

```sh
mkdir -p /etc/orbweaver/secrets && cd /etc/orbweaver/secrets
openssl rand -hex 32 > session_secret
openssl rand -hex 32 > credentials_key
touch local_initial_password oidc_client_secret openrouter_api_key claude_oauth_token   # every file must exist; empty = unset
chmod 600 *
ORB_SECRETS_DIR=/etc/orbweaver/secrets docker compose -f docker-compose.yaml -f docker/compose.secrets.yaml up -d
```

`ORB_SECRETS_DIR` defaults to this directory, which is gitignored except for this README — files you create
here stay out of git, but a directory outside the checkout survives a `git clean`.

| file | feeds | used by |
| - | - | - |
| `session_secret` | `SESSION_SECRET` (≥32 chars) | `local`, `oidc` — otherwise generated into the data volume |
| `local_initial_password` | `LOCAL_INITIAL_PASSWORD` (≥8 chars, first-boot owner seed) | `local` — otherwise generated and printed on the first boot |
| `oidc_client_secret` | `OIDC_CLIENT_SECRET` | `oidc` |
| `credentials_key` | `CREDENTIALS_KEY` (32 bytes, hex/base64 — losing it orphans every stored provider key) | any mode storing provider keys; otherwise `CREDENTIALS_KEY_AUTO=true` generates one into the data volume |
| `openrouter_api_key` | `OPENROUTER_API_KEY` | only to seed OpenRouter at boot |
| `claude_oauth_token` | `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`) | the optional Claude-subscription backend |

The trailing newline `openssl rand | tee` leaves is stripped. An explicit env value wins over the file.
