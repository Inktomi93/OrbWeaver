#!/bin/sh
# Generates first-boot files and drops privileges before starting the app.
# The app reads *_FILE itself: exporting file contents would expose them through /proc/<pid>/environ.
# Explicit nonempty env values still win over files; only generated file paths are exported here.
set -eu
# Everything the app writes is private to its user. A bind-mounted ./data is a host directory, and the
# database, uploads and backups in it must not be readable by other users of that host. The mask survives
# the setpriv exec below and is inherited by node and every child it starts.
umask 077

# ── job 0: run as YOUR user (PUID/PGID), the SillyTavern / linuxserver pattern ───────────────────────
# The image starts as root ONLY to (a) make the data dir owned by the app user — a bind-mounted host
# directory is otherwise root's or someone else's and the app cannot write it — and (b) drop to that user
# with `setpriv` (util-linux, in the base image) before anything else runs. PUID/PGID default to 1000 (the
# image's `node` user). The ids are passed to setpriv as NUMBERS and /etc/passwd is never edited: the rootfs
# is read-only under the shipped compose, so groupmod/usermod cannot lock /etc/group and any other PUID
# would refuse to boot. `--no-new-privs` makes the image itself carry what compose's security_opt sets, so a
# bare `docker run` gets it too. Started already non-root (`user:` in compose, `docker run --user`, rootless
# podman)? Then nothing is chowned and the app runs as that user — the data dir must be writable by it.
data_dir="${DATA_DIR:-/app/data}"
export DATA_DIR="${data_dir}"
secrets_dir="${data_dir}/secrets"
puid="${PUID:-1000}"
pgid="${PGID:-1000}"

# Numeric and non-zero only. setpriv resolves a name, so PUID=root (or 0) would re-exec this script as root
# forever, and PGID=0 would run the app in group root.
for id_pair in "PUID=${puid}" "PGID=${pgid}"; do
  id_value="${id_pair#*=}"
  case "${id_value}" in
    '' | *[!0-9]*) id_ok=no ;;
    *) if [ "${id_value}" -eq 0 ]; then id_ok=no; else id_ok=yes; fi ;;
  esac
  if [ "${id_ok}" = no ]; then
    echo "entrypoint: REFUSING to boot — ${id_pair} must be a non-zero numeric id (the app never runs as root or in group root). Set PUID/PGID to your user's numbers, e.g. PUID=\$(id -u) PGID=\$(id -g)." >&2
    exit 1
  fi
done

if [ "$(id -u)" = 0 ]; then
  # A nested DATA_DIR that does not exist yet needs traversable parents; the chmod below still closes the root.
  (umask 022 && mkdir -p "${data_dir}" /app/.cache)
  # Only the roots and whatever is not already ours — a large asset store is not re-chowned every boot.
  chown "${puid}:${pgid}" "${data_dir}" /app/.cache
  # The trailing slash makes find walk a data root that is itself a symlink.
  find "${data_dir}/" -not -user "${puid}" -exec chown "${puid}:${pgid}" {} + 2>/dev/null || true
  # The umask above covers new files only. Closing the root closes every older 644/755 entry beneath it
  # to other host users, without walking the tree.
  chmod go-rwx "${data_dir}"
  echo "entrypoint: running as uid ${puid} gid ${pgid} (PUID/PGID)" >&2
  exec setpriv --reuid="${puid}" --regid="${pgid}" --clear-groups --no-new-privs --inh-caps=-all "$0" "$@"
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

# An unreadable declared file must reach the app's refusal, not be replaced by a generated secret.
secret_unset() {
  var="$1"
  file_var="${var}_FILE"
  eval "file=\${${file_var}:-}"
  eval "current=\${${var}:-}"
  [ -z "${current}" ] || return 1
  [ -n "${file}" ] || return 0
  secret_contents="$(cat "${file}")" || return 1
  [ -z "${secret_contents}" ]
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
    if secret_unset SESSION_SECRET; then
      state="$(keep_generated session_secret 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')"
      export SESSION_SECRET_FILE="${secrets_dir}/session_secret"
      echo "entrypoint: SESSION_SECRET ${state} at ${secrets_dir}/session_secret" >&2
    fi
    [ "${mode}" = oidc ] && exec "$@"
    if secret_unset LOCAL_INITIAL_PASSWORD; then
      state="$(keep_generated initial_password 'process.stdout.write(require("node:crypto").randomBytes(15).toString("base64url"))')"
      export LOCAL_INITIAL_PASSWORD_FILE="${secrets_dir}/initial_password"
      handle="${OWNER_HANDLES:-${DEFAULT_USER_HANDLE:-owner}}"
      # The password itself is never written here: this output is the container log, which users paste
      # into public bug reports. The banner names the command that reads the file instead.
      if [ "${state}" = generated ]; then
        {
          echo "entrypoint: ┌──────────────────────────────────────────────────────────────────────────┐"
          echo "entrypoint: │  FIRST BOOT — your login (no LOCAL_INITIAL_PASSWORD was set, so one was made)  "
          echo "entrypoint: │    user:     ${handle}"
          echo "entrypoint: │    password: run  docker compose exec orbweaver cat ${LOCAL_INITIAL_PASSWORD_FILE}"
          echo "entrypoint: │  It is not printed in this log, so a pasted log cannot leak it."
          echo "entrypoint: │  Change it in Settings, then delete the file."
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
