#!/bin/sh
# ── the container entrypoint: file-secret indirection + the zero-config first boot ──────────────────
#
# Two jobs, then `exec "$@"` (the real command; signals reach node directly — with compose `init: true` the
# chain is tini → node).
#
# 1. *_FILE secret indirection (the containerize build plan §1.3). The app reads secrets from process.env
#    only (foundation/env parses once at module load; there is no *_FILE support in the schema). A hardened
#    deployment mounts file secrets at /run/secrets/* (docker/compose.secrets.yaml) and points <VAR>_FILE at
#    them; this shim exports each file's contents as <VAR>, so secret VALUES never sit in the container's
#    static config (`docker inspect` shows only the paths). Semantics, per listed VAR:
#      <VAR> already set (non-empty)      → left alone (an explicit env wins over the file)
#      <VAR>_FILE unset                   → nothing to do
#      <VAR>_FILE set, file readable      → export <VAR> = file contents (trailing newline stripped —
#                                           `openssl rand | tee` style files Just Work)
#      <VAR>_FILE set, file EMPTY         → treated as UNSET (a required-but-empty secret still fails loudly
#                                           at the env schema's superRefine)
#      <VAR>_FILE set, file unreadable    → exit 1 (a pointed-at-but-missing secret is a deploy bug; boot
#                                           must name it, not limp into the schema error one layer deeper)
#    The allowlist is explicit — it documents exactly which secrets are file-mountable.
#
#    COUPLED SITE — HOST_SECRET_ENV_KEYS in
#    packages/server/src/infra/providers/backends/agent-sdk/env.ts. Every name in the `for name in` line
#    below gets EXPORTED into the server's process.env, which is the baseline each agent-sdk child env
#    spreads — and that child runs tools AS HOST. The firewall's list is what deletes them again, so a name
#    added here and not there hands a live app secret to a tool-executing subprocess. The two lists must stay
#    SET-IDENTICAL; that is asserted by tests/server/infra/providers/backends/agent-sdk/env.test.ts ("the
#    *_FILE secret shim and the credential firewall move together"), which parses that very line. The
#    generated values in job 2 are exported under names ALREADY in that line (SESSION_SECRET,
#    LOCAL_INITIAL_PASSWORD), so they are firewalled by the same assertion.
#
# 0. PUID/PGID: start as root, own the data dir, drop to that uid/gid, re-exec this script (job 0 below).
#
# 2. The zero-config first boot. Two things a fresh container cannot get from a browser, because the app's
#    un-credentialed owner fallback and its first-run password screen are both gated on a LOOPBACK TCP peer
#    (infra/auth/dispatch.ts — a published bridge port never delivers one):
#      AUTH_MODE=single-user  → AUTH_FALLBACK defaults to `owner` here (that mode's ONLY credential; the
#                               schema refuses the `deny` pairing as a box that serves nobody). Only
#                               reachable from a loopback peer: host networking (docker/compose.host-network.yaml)
#                               or an on-box process — a published bridge port 401s, and boot says so.
#      AUTH_MODE=local        → SESSION_SECRET is generated once and kept in the data volume when neither the
#                               env nor a *_FILE provides it; LOCAL_INITIAL_PASSWORD likewise — generated on the
#                               first boot, PRINTED ONCE to the log, and kept at
#                               $ORB_DATA_DIR/secrets/initial_password. The owner seed is first-boot-only and
#                               never clobbers a password changed in-app, so re-exporting the kept value on
#                               later boots is inert. Delete the file after changing your password if you
#                               do not want the initial one on disk.
#    Both generated files live under the data volume next to the database they protect — the pepper
#    therefore does not survive a volume leak on its own. That is the accepted trade for a first boot with
#    zero setup; a deployment that wants the secret elsewhere provides SESSION_SECRET / SESSION_SECRET_FILE
#    and nothing is generated.
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

# ── job 0: run as YOUR user (PUID/PGID), the SillyTavern / linuxserver pattern ───────────────────────
# The image starts as root ONLY to (a) make the data dir owned by the app user — a bind-mounted host
# directory is otherwise root's or someone else's and the app cannot write it — and (b) drop to that user
# with `setpriv` (util-linux, in the base image) before anything else runs. PUID/PGID default to 1000 (the
# image's `node` user). Started already non-root (`user:` in compose, `docker run --user`, rootless
# podman)? Then nothing is chowned and the app runs as that user — the data dir must be writable by it.
data_dir="${ORB_DATA_DIR:-/app/data}"
secrets_dir="${data_dir}/secrets"
puid="${PUID:-1000}"
pgid="${PGID:-1000}"

if [ "$(id -u)" = 0 ]; then
  if [ "${puid}" != "$(id -u node)" ] || [ "${pgid}" != "$(id -g node)" ]; then
    groupmod -o -g "${pgid}" node
    usermod -o -u "${puid}" -g "${pgid}" node
  fi
  mkdir -p "${data_dir}" /app/.cache
  # Only the roots and whatever is not already ours — a large asset store is not re-chowned every boot.
  chown "${puid}:${pgid}" "${data_dir}" /app/.cache
  find "${data_dir}" -not -user "${puid}" -exec chown "${puid}:${pgid}" {} + 2>/dev/null || true
  echo "entrypoint: running as uid ${puid} gid ${pgid} (PUID/PGID)" >&2
  exec setpriv --reuid="${puid}" --regid="${pgid}" --init-groups --inh-caps=-all "$0" "$@"
fi

if [ ! -d "${data_dir}" ] || [ ! -w "${data_dir}" ]; then
  echo "entrypoint: ${data_dir} is not a writable directory for uid $(id -u)." >&2
  echo "entrypoint: start the container as root with PUID/PGID set to your user (the default), or make the directory writable by the uid you start it as." >&2
  exit 1
fi

# Write a freshly generated value into ${secrets_dir}/<name> (0600) unless the file already holds one.
# Prints "generated" or "kept" so the caller can log honestly.
keep_generated() {
  name="$1"
  generator="$2"
  path="${secrets_dir}/${name}"
  if [ -s "${path}" ]; then
    echo kept
    return 0
  fi
  (umask 077 && mkdir -p "${secrets_dir}" && node -e "${generator}" > "${path}")
  echo generated
}

mode="${AUTH_MODE:-single-user}"
case "${mode}" in
  single-user)
    if [ -z "${AUTH_FALLBACK:-}" ]; then
      export AUTH_FALLBACK=owner
    fi
    if [ -n "${AUTH_FALLBACK_TRUSTED_PEERS:-}" ]; then
      # The no-login mode is safe ONLY while the port is published on loopback: under docker's NAT every
      # client that reaches the published port arrives from the trusted bridge range, so a non-loopback
      # publication would make the whole network the owner. The compose echoes ORB_BIND in for this check.
      case "${ORB_BIND:-127.0.0.1}" in
        127.*|localhost|::1) ;;
        *)
          echo "entrypoint: REFUSING to boot — AUTH_MODE=single-user with AUTH_FALLBACK_TRUSTED_PEERS is published on ORB_BIND=${ORB_BIND}, which would make every device that can reach the port the owner with no login. For other devices use a login: AUTH_MODE=local, AUTH_FALLBACK=deny, AUTH_FALLBACK_TRUSTED_PEERS= (empty) in docker/orbweaver.local.env — then HTTPS in front (docker/README.md)." >&2
          exit 1
          ;;
      esac
    else
      echo "entrypoint: AUTH_MODE=single-user without AUTH_FALLBACK_TRUSTED_PEERS — the owner is whoever reaches this process over a LOOPBACK socket; a published bridge port is NOT loopback (every request would 401). The shipped docker/orbweaver.env sets the trusted bridge ranges; docker/compose.host-network.yaml is the other shape." >&2
    fi
    ;;
  local|oidc)
    # Both cookie modes need SESSION_SECRET (the scrypt pepper + session-token HMAC); an OIDC deployer
    # should not have to mint one by hand any more than a password-mode one.
    if [ -z "${SESSION_SECRET:-}" ]; then
      state="$(keep_generated session_secret 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')"
      SESSION_SECRET="$(cat "${secrets_dir}/session_secret")"
      export SESSION_SECRET
      echo "entrypoint: SESSION_SECRET ${state} at ${secrets_dir}/session_secret" >&2
    fi
    [ "${mode}" = oidc ] && exec "$@"
    if [ -z "${LOCAL_INITIAL_PASSWORD:-}" ]; then
      state="$(keep_generated initial_password 'process.stdout.write(require("node:crypto").randomBytes(15).toString("base64url"))')"
      LOCAL_INITIAL_PASSWORD="$(cat "${secrets_dir}/initial_password")"
      export LOCAL_INITIAL_PASSWORD
      handle="${OWNER_HANDLES:-${DEFAULT_USER_HANDLE:-owner}}"
      if [ "${state}" = generated ]; then
        {
          echo "entrypoint: ┌──────────────────────────────────────────────────────────────────────────┐"
          echo "entrypoint: │  FIRST BOOT — your login (no LOCAL_INITIAL_PASSWORD was set, so one was made)  "
          echo "entrypoint: │    user:     ${handle}"
          echo "entrypoint: │    password: ${LOCAL_INITIAL_PASSWORD}"
          echo "entrypoint: │  Kept at ${secrets_dir}/initial_password. Change it in Settings, then delete the file."
          echo "entrypoint: └──────────────────────────────────────────────────────────────────────────┘"
        } >&2
      else
        echo "entrypoint: initial password for '${handle}' is on file at ${secrets_dir}/initial_password (delete it once you have changed your password in Settings)" >&2
      fi
    fi
    ;;
  *)
    : # forward-header: every required value is explicit config; the env schema refuses a partial one at boot.
    ;;
esac

exec "$@"
