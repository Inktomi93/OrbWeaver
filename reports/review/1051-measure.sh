#!/bin/bash
# Rerun of the 1051 measurements: kit single file twice, then the 9 kit marker files twice.
# The first run of each scope may rebuild the inventory partition (cold); the second reuses it (warm).
# Each run: its own setsid session, 900 s cap, RSS of the whole descendant tree every 5 s.
# usage: bash reports/review/1051-measure.sh <checkout> <out-dir>
set -u
WT=$1
OUT=$2
SINGLE=(packages/kit/src/time/index.ts)
KIT9=(packages/kit/src/cel/index.ts packages/kit/src/ids/index.ts packages/kit/src/json-schema/lift.ts packages/kit/src/macro/evaluator.ts
  packages/kit/src/macro/registry.ts packages/kit/src/png-card-chunk/index.ts packages/kit/src/regex/index.ts packages/kit/src/time/index.ts
  packages/kit/src/world-info/index.ts)

run() {
  local label=$1
  shift
  local dir="$OUT/$label" args=() start pid t rc
  mkdir -p "$dir"
  for f in "$@"; do args+=(--file "$f"); done
  start=$(date +%s.%N)
  setsid timeout -s TERM 900 env -C "$WT" pnpm check:structure --check caught-failure-ownership "${args[@]}" >"$dir/run.log" 2>&1 &
  pid=$!
  printf 't_s\tpid\trss_kb\tcmd\n' >"$dir/samples.tsv"
  while kill -0 "$pid" 2>/dev/null; do
    t=$(awk -v s="$start" -v n="$(date +%s.%N)" 'BEGIN{printf "%.0f", n-s}')
    ps -eo pid=,ppid=,rss=,args= | awk -v t="$t" -v root="$pid" '
      { p[$1]=$2; r[$1]=$3; a[$1]=$4" "$5" "$6" "$7 }
      END { keep[root]=1; changed=1
        while (changed) { changed=0; for (x in p) if (!(x in keep) && (p[x] in keep)) { keep[x]=1; changed=1 } }
        for (x in keep) if (x in r) printf "%s\t%s\t%s\t%s\n", t, x, r[x], a[x] }' >>"$dir/samples.tsv"
    sleep 5
  done
  wait "$pid"
  rc=$?
  {
    echo "== $label exit=$rc wall_s=$(awk -v s="$start" -v e="$(date +%s.%N)" 'BEGIN{printf "%.1f", e-s}') load=$(cut -d' ' -f1-3 /proc/loadavg)"
    grep -E 'raw [0-9]|final-pass cost' "$dir/run.log"
    awk -F'\t' 'NR>1 && $4 ~ /cli.ts structure/ {if($3>c)c=$3} NR>1 && $4 ~ /semantic-inventory-worker/ {if($3>w)w=$3}
      END{printf "cli_peak_kib=%d worker_peak_kib=%d\n", c, w}' "$dir/samples.tsv"
  } | tee -a "$OUT/summary.txt"
}

run single-1 "${SINGLE[@]}"
run single-2 "${SINGLE[@]}"
run kit9-1 "${KIT9[@]}"
run kit9-2 "${KIT9[@]}"
