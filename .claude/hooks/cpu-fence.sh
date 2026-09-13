#!/usr/bin/env bash
# PER-SESSION CPU/MEMORY CEILING (#1835, owner ask 2026-09-06: "kinder on the cpu … without
# over-complicating it"). Called in ONE line from session-onboard.sh, and safe to run by hand.
#
# WHY A CGROUP CEILING AND NOT MORE `nice`. `nice` was already everywhere — every tooling spawn rides
# `nice -n 19` — and 14h of Prometheus says it did not protect the thing it was supposed to: node_load1
# peaked at 105.8 on 24 cores, CPU busy sat at 93-99% for hours, PSI cpu "some" hit 0.6, and the
# co-hosted homelab containers (which only ever want ~3 cores) were starved anyway. The reason is
# structural: under cgroup v2 the containers live in system.slice and our fleet lives in user.slice, and
# BOTH carry cpu.weight 100 — so the kernel splits the machine 50/50 between the two slices whatever the
# nice values inside them are. `nice` orders OUR OWN tasks against each other; it has never been able to
# reach across a slice boundary. A QUOTA can: it is an absolute ceiling on how much CPU this session's
# whole process tree may consume, enforced by the kernel, regardless of who else wants the machine.
#
# SIZING — RAISED 800% -> 1600% ON 2026-09-12 (owner, measured). CPUQuota is percent-of-ONE-CPU, so
# 1600% = 16 cores. The original 800% was sized so two sessions x 800% = 16 of 24 threads and a third made
# 24. That arithmetic assumed the quota's cost was zero when the fleet was idle. IT IS NOT: a quota is a
# CEILING, NOT A SHARE, and ceilings DO NOT POOL — with 800% each, an idle claude-b left 8 cores that the
# primary session structurally could not touch.
#
# WHAT WAS MEASURED, 2026-09-12, with eight lanes live across two accounts:
#   * the co-hosted containers this fence exists to protect were using ~2.3% of ONE core, total
#     (caddy 1.69%, searxng 0.32%, valkey 0.20%, crowdsec/sillytavern/forgejo/unpoller ~0.01% each);
#   * this session was throttled in 15.2% of all periods (nr_throttled 214778 / nr_periods 1415535,
#     104468 s cumulative throttled time) — WHILE ~14 OF 24 CORES SAT IDLE;
#   * the Playwright chromium processes were running at ~158% OUTSIDE this scope entirely, so the quota
#     was never fencing that part of our own workload anyway.
# A 33%-of-box ceiling protecting 2.3% of a core, while the owner's standing note was that the work "is
# dragging", is a fence paying for nothing.
#
# 1600% IS DELIBERATE OVERSUBSCRIPTION and that is the point. Two sessions x 1600% = 3200% of a 2400% box.
# When one session is idle the other gets 16 cores instead of 8; when both saturate, the kernel splits by
# cpu.weight (both 100) to ~1200% each — strictly better than a hard 1200% ceiling each, which would idle
# the same cores whenever one side paused. The containers are protected by headroom (8 cores unclaimed at
# the split) plus their own near-zero demand, not by our ceiling.
#
# The number lives in tooling/concurrency-profile.json (`sessionCpuQuotaPct`), not here.
#
# IT ALSO TAMES THE LOAD-AVERAGE GATES, and that is a real second effect rather than a side note: a
# THROTTLED task is not runnable, so it leaves the run queue. Linux's loadavg counts runnable+uninterruptible
# tasks, so capping the sessions lowers the number every load-scaled budget and every `loadavg < 24`
# precondition reads (_shared/load-budget.ts).
#
# WHAT THIS CANNOT DO, and the owner's one-liner that can. A per-session quota bounds US; it cannot give
# the CONTAINERS priority when the box is saturated by something else. That lever is a ROOT property on
# the whole user slice and is deliberately NOT run here (this hook never uses sudo):
#     sudo systemctl set-property user.slice CPUWeight=30
# It is a WEIGHT, so it costs nothing when the box is idle and hands the homelab ~77% under contention.
# Owner-run, once, persistent.
#
# NO IOWeight. `io` is not among the delegated controllers in user.slice's subtree on this box, so an
# IOWeight= property would be ACCEPTED, STORED, and INERT — a setting that looks applied and does
# nothing, which is the lying-instrument shape this repo fixes on sight. If the io controller is ever
# delegated, that is the moment to add it, with a `cat io.max` receipt.
#
# A CLAUDE SUBAGENT SHARES ITS PARENT SESSION'S SCOPE (they are the same process tree under one
# terminal's `app-*.scope`), so this caps the WHOLE session — every lane it is running — not one agent.
# That is the intended unit: the fleet's cost is per session, not per lane.
#
# IT NEVER BLOCKS A SESSION. Every failure — no systemd, no scope, an unreadable profile, a refused
# set-property — prints ONE line saying so and exits 0.
set -uo pipefail

root="${CLAUDE_PROJECT_DIR:-}"
if [ -z "$root" ]; then
  root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." 2>/dev/null && pwd)
fi
profile="$root/tooling/concurrency-profile.json"

if [ "${ORB_DEDICATED_BOX:-}" = "1" ]; then
  echo "cpu-fence: ORB_DEDICATED_BOX=1 — this box is yours alone, no ceiling set"
  exit 0
fi

# The session's own cgroup leaf. cgroup v2 gives one `0::<path>` line; the leaf under
# `user@<uid>.service/app.slice` is the unit systemd knows this process by.
scope=$(awk -F/ '/^0::/ {print $NF}' /proc/self/cgroup 2>/dev/null)
case "$scope" in
  *.scope|*.service) ;;
  *)
    echo "cpu-fence: not inside a systemd user unit (cgroup leaf '${scope:-<none>}') — no ceiling set"
    exit 0
    ;;
esac

if ! command -v systemctl >/dev/null 2>&1; then
  echo "cpu-fence: systemctl not on PATH — no ceiling set"
  exit 0
fi

read_profile() { # read_profile <key>
  [ -f "$profile" ] || return 1
  command -v jq >/dev/null 2>&1 || return 1
  jq -r --arg k "$1" '.profiles.shared[$k] // empty' "$profile" 2>/dev/null
}

quota=$(read_profile sessionCpuQuotaPct || true)
memhigh=$(read_profile sessionMemoryHigh || true)
case "$quota" in
  ''|*[!0-9]*)
    echo "cpu-fence: could not read sessionCpuQuotaPct from $profile — no ceiling set"
    exit 0
    ;;
esac

props=()
[ "$quota" -gt 0 ] && props+=("CPUQuota=${quota}%")
[ -n "$memhigh" ] && props+=("MemoryHigh=${memhigh}")
if [ "${#props[@]}" -eq 0 ]; then
  echo "cpu-fence: the shared profile sets no CPUQuota and no MemoryHigh — nothing to apply"
  exit 0
fi

# `--runtime`: the property lives until the next boot and leaves no unit drop-in behind. A scope is
# transient anyway (it dies with the terminal), so a persistent property would only accumulate.
if systemctl --user set-property --runtime "$scope" "${props[@]}" >/dev/null 2>&1; then
  echo "cpu-fence: $scope ${props[*]}"
else
  echo "cpu-fence: systemctl --user set-property refused ${props[*]} on $scope (is the cpu controller delegated to app.slice?) — no ceiling set"
fi
exit 0
