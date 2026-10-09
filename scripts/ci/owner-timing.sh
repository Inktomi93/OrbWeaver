#!/usr/bin/env bash
# D308: only this admitted local host and an exact trusted main commit can claim stable timing.
set -euo pipefail
umask 077
export LC_ALL=C

if [ "$#" != 1 ]; then echo 'Usage: owner-timing.sh --poll|--scheduled' >&2; exit 3; fi
case "${1:-}" in
  --poll|--scheduled) mode="$1" ;;
  *) echo 'Usage: owner-timing.sh --poll|--scheduled' >&2; exit 3 ;;
esac

config=/etc/orbweaver-owner-timing.conf
test ! -L "$config"
test "$(stat -c %u "$config")" = 0
config_mode=$(stat -c %a "$config")
test "$((8#$config_mode & 022))" = 0
. "$config"

test -n "$EXPECTED_MACHINE_ID"
test "$(cat /etc/machine-id)" = "$EXPECTED_MACHINE_ID"
test "$(id -u)" = "$EXPECTED_UID"
test "$(lscpu -J | jq -r '.lscpu[] | select(.field == "Model name:") | .data')" = "$EXPECTED_CPU_MODEL"
test -z "${GITHUB_ACTIONS:-}"
test -z "${RUNNER_ENVIRONMENT+x}"
test "$TIMING_HARDWARE_CLASS" = inktomi-owner
test -d "$CHECKOUT_DIR/.git"
test ! -e "$CHECKOUT_DIR/.env"
test ! -L "$CHECKOUT_DIR/.env"
test -x "$PNPM_BIN"

mkdir -p "$STATE_DIR"
exec 9> "$STATE_DIR/controller.lock"
if ! flock -n 9; then
  echo 'Another owner timing admission is active; no measurement started.'
  exit 0
fi

cd "$CHECKOUT_DIR"
test "$(git remote get-url origin)" = https://github.com/Inktomi93/OrbWeaver.git
test -z "$(git status --porcelain --untracked-files=no)"
git -c credential.helper= fetch --no-tags https://github.com/Inktomi93/OrbWeaver.git refs/heads/main:refs/remotes/origin/main
sha=$(git rev-parse refs/remotes/origin/main)
[[ "$sha" =~ ^[a-f0-9]{40}$ ]]
test "$(git cat-file -t "$sha")" = commit
day=$(date -u +%F)
if [ "$mode" = --poll ] && [ -f "$STATE_DIR/last-attempt.sha" ] && [ "$(cat "$STATE_DIR/last-attempt.sha")" = "$sha" ]; then
  echo "No new main commit: $sha; no timing verdict created."
  exit 0
fi
if [ "$mode" = --scheduled ] && [ -f "$STATE_DIR/last-scheduled.day" ] && [ "$(cat "$STATE_DIR/last-scheduled.day")" = "$day" ]; then
  echo 'The scheduled observation was already attempted today; no timing verdict created.'
  exit 0
fi

git checkout --detach "$sha"
test "$(git rev-parse HEAD)" = "$sha"
test ! -e .env
test ! -L .env
printf '%s\n' "$sha" > "$STATE_DIR/last-attempt.sha"
if [ "$mode" = --scheduled ]; then printf '%s\n' "$day" > "$STATE_DIR/last-scheduled.day"; fi

run_dir="$STATE_DIR/runs/$(date -u +%Y%m%dT%H%M%SZ)-$sha"
mkdir -p "$run_dir"
printf '%s\n' "$sha" > "$run_dir/source.sha"
printf '%s\n' "$TIMING_HARDWARE_CLASS" > "$run_dir/hardware-class"
export ORB_DEDICATED_BOX=0
export ORB_TIMING_HARDWARE_CLASS="$TIMING_HARDWARE_CLASS"
export ORB_TEST_CAPABILITIES=stable-timing
export XDG_CACHE_HOME="$STATE_DIR/cache"
export XDG_DATA_HOME="$STATE_DIR/data"
export XDG_RUNTIME_DIR="/run/user/$EXPECTED_UID"
export COREPACK_HOME="$STATE_DIR/corepack"
export PNPM_HOME="$STATE_DIR/pnpm"
unset GH_TOKEN GITHUB_TOKEN SSH_AUTH_SOCK

set +e
(
  set -euo pipefail
  "$PNPM_BIN" install --frozen-lockfile
  "$PNPM_BIN" exec playwright install chromium
  "$PNPM_BIN" --filter @orb/showcase-plugins build
  "$PNPM_BIN" test:ct tests/client/lib/motion-stats.ct.tsx
  test reports/ct-flaky.json -nt "$run_dir/source.sha"
  "$PNPM_BIN" exec node scripts/ci/owner-timing-receipt.ts reports/ct-flaky.json "$TIMING_HARDWARE_CLASS"
) > "$run_dir/measurement.log" 2>&1
status=$?
set -e
printf '%s\n' "$status" > "$run_dir/exit-code"
mkdir -p "$run_dir/reports"
for report in reports/runs/ct/*; do
  if [ -d "$report" ] && [ "$report" -nt "$run_dir/source.sha" ]; then cp -a "$report" "$run_dir/reports/"; fi
done
echo "Owner timing attempt: $run_dir (exit $status)."
exit "$status"
