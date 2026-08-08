#!/bin/sh
# ── file-secret indirection (the containerize build plan §1.3) ────────────────────────────────────────
#
# The app reads secrets from process.env only (foundation/env parses once at module load; there is no
# *_FILE support in the schema). Compose therefore mounts file secrets at /run/secrets/* and points
# <VAR>_FILE at them; this shim exports each file's contents as <VAR> and execs the real command, so
# secret VALUES never appear in the container's static config (`docker inspect` shows only the paths).
#
# Semantics, per listed VAR:
#   <VAR> already set (non-empty)      → left alone (an explicit env wins over the file)
#   <VAR>_FILE unset                   → nothing to do
#   <VAR>_FILE set, file readable      → export <VAR> = file contents (trailing newline stripped —
#                                        `openssl rand | tee` style files Just Work)
#   <VAR>_FILE set, file EMPTY         → treated as UNSET (the repo ships empty placeholder files so
#                                        the zero-config single-user profile boots; a required-but-empty
#                                        secret still fails loudly at the env schema's superRefine)
#   <VAR>_FILE set, file unreadable    → exit 1 (a pointed-at-but-missing secret is a deploy bug; boot
#                                        must name it, not limp into the schema error one layer deeper)
#
# The allowlist is explicit — it documents exactly which secrets are file-mountable. Extending it is a
# one-line change here plus a `secrets:`/env pair in docker-compose.yaml.
set -eu

load_secret() {
  var="$1"
  file_var="${var}_FILE"
  eval "file=\${${file_var}:-}"
  eval "current=\${${var}:-}"
  if [ -n "${current}" ] || [ -z "${file}" ]; then
    return 0
  fi
  if [ ! -r "${file}" ]; then
    echo "entrypoint: ${file_var}=${file} is not readable — refusing to boot without the named secret" >&2
    exit 1
  fi
  value="$(cat "${file}")"
  if [ -z "${value}" ]; then
    return 0
  fi
  export "${var}=${value}"
}

for name in SESSION_SECRET OIDC_CLIENT_SECRET CREDENTIALS_KEY LOCAL_INITIAL_PASSWORD OPENROUTER_API_KEY DEBUG_TOKEN; do
  load_secret "${name}"
done

exec "$@"
