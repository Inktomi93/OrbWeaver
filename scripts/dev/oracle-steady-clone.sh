#!/usr/bin/env bash
# ── The differential-oracle steady clone + reference capture (CHECKLIST §C1) ──────────────────────
#
# Phase 5 step 1 (the ⭐ ops one-thing). Stands up `/tmp/neo-tavern-steady` — a copy of neo-tavern
# PINNED at a known HEAD (the reference) that can run neo's REAL chat-assembly transforms — then
# captures neo's SHAPE/cache-breakpoint reference outputs over the committed fixture
# (tests/support/fixtures/parity/breakpoint-cases.json) into a committed reference
# (tests/support/fixtures/parity/neo-reference.json) the orbweaver parity oracle diffs against.
#
# The capture drives neo's actual exported transforms — spliceInChatInjections · squashSameRole ·
# applyNamesBehavior · hasMultipleCharacters · computeHistoryBreakpoint — reproducing the orchestration
# of `shapeCompletionHistory` (pipeline.ts:1504-1578), the SHAPE phase that owns the §8 rolling-tail
# cache breakpoint. This is the PARITY surface (assembled history + breakpoint offset + cache
# placement), NOT memory (memory is a rewrite — its own .int tests, never the oracle).
#
# Idempotent. Re-run freely:
#   scripts/dev/oracle-steady-clone.sh            # ensure the clone exists at the pinned HEAD
#   scripts/dev/oracle-steady-clone.sh --refresh  # re-clone from the source neo working tree's HEAD
#   scripts/dev/oracle-steady-clone.sh --capture   # (re)capture neo-reference.json from the clone
#   scripts/dev/oracle-steady-clone.sh --refresh --capture
#
# node_modules is SYMLINKED from the source repo (936M — a copy is too heavy; CHECKLIST §C1 sanctions
# reuse). The clone is therefore runnable only while the source neo repo's node_modules is intact.
set -euo pipefail

DEST="${ORACLE_STEADY_DIR:-/tmp/neo-tavern-steady}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ORB_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SRC="${NEO_SRC_DIR:-$(cd "$ORB_ROOT/.." && pwd)/neo-tavern}"

FIXTURE="$ORB_ROOT/tests/support/fixtures/parity/breakpoint-cases.json"
REFERENCE="$ORB_ROOT/tests/support/fixtures/parity/neo-reference.json"

REFRESH=0
CAPTURE=0
for arg in "$@"; do
  case "$arg" in
    --refresh) REFRESH=1 ;;
    --capture) CAPTURE=1 ;;
    *) echo "unknown flag: $arg" >&2; exit 2 ;;
  esac
done

if [[ ! -d "$SRC/.git" ]]; then
  echo "FATAL: source neo-tavern repo not found at $SRC (set NEO_SRC_DIR)." >&2
  exit 1
fi

PINNED_HEAD="$(git -C "$SRC" rev-parse HEAD)"

clone() {
  echo "==> cloning steady neo @ ${PINNED_HEAD:0:12} → $DEST"
  rm -rf "$DEST"
  # Local clone (hardlinked objects — fast, cheap). Then pin to the source HEAD exactly.
  git clone --quiet --local --no-hardlinks "$SRC" "$DEST"
  git -C "$DEST" checkout --quiet --detach "$PINNED_HEAD"
}

if [[ "$REFRESH" == "1" || ! -d "$DEST/.git" ]]; then
  clone
else
  CURRENT="$(git -C "$DEST" rev-parse HEAD 2>/dev/null || echo none)"
  if [[ "$CURRENT" != "$PINNED_HEAD" ]]; then
    echo "==> steady clone is at ${CURRENT:0:12}, source HEAD is ${PINNED_HEAD:0:12} — re-cloning"
    clone
  else
    echo "==> steady clone already at pinned HEAD ${PINNED_HEAD:0:12} ($DEST)"
  fi
fi

# Symlink node_modules from the source (avoids a 936M copy). Re-link if missing/stale.
if [[ ! -e "$DEST/node_modules" ]]; then
  ln -s "$SRC/node_modules" "$DEST/node_modules"
  echo "==> symlinked node_modules → $SRC/node_modules"
fi

TSX="$DEST/node_modules/.bin/tsx"
if [[ ! -x "$TSX" ]]; then
  echo "FATAL: tsx not found at $TSX — is the source repo's node_modules installed?" >&2
  exit 1
fi

# ── The capture script — written INTO the clone so its `#server/*` subpath imports resolve against
# the clone's package.json. Quoted heredoc: nothing here is bash-expanded (literal TS). ──────────────
cat > "$DEST/oracle-capture.ts" <<'CAPTURE_EOF'
// AUTO-WRITTEN by scripts/dev/oracle-steady-clone.sh. Runs in the steady clone (cwd = the clone) so
// `#server/*` resolves to neo's src. Reproduces shapeCompletionHistory (pipeline.ts:1504-1578) over
// the orbweaver fixture using neo's REAL transforms, and emits the committed parity reference.
import { readFileSync, writeFileSync } from "node:fs";
import { spliceInChatInjections } from "#server/domain/chat/assembly/injections";
import { applyNamesBehavior } from "#server/domain/chat/assembly/names";
import { squashSameRole } from "#server/domain/chat/assembly/role-squash";
import { hasMultipleCharacters } from "#server/domain/chat/assembly/speaker-stamp";
import { computeHistoryBreakpoint } from "#server/domain/chat/engine/pipeline";

// pipeline.ts:1468 — module-internal const, reproduced verbatim.
const CONTINUATION_NUDGE = "[Continue the conversation.]";

type Msg = {
  role: "user" | "assistant";
  content: string;
  authorName?: string | null;
  characterId?: string | null;
};

// pipeline.ts:1476-1492 — not exported; reproduced verbatim (egocentric scoped fold).
function scopeHistoryToTarget(canon: Msg[], targetId: string): Msg[] {
  return canon.map((m) => {
    if (m.role === "assistant" && m.characterId != null && m.characterId !== targetId) {
      const name = m.authorName ?? null;
      return { role: "user" as const, content: name ? `${name}: ${m.content}` : m.content };
    }
    return m;
  });
}

type Case = {
  name: string;
  canon: Msg[];
  appendUserTurn: string | null;
  injections: { position: string; depth: number; role: string; content: string }[];
  groupConfig: { output: "per-speaker" | "narrator"; cardScope: "merged" | "scoped" };
  scopedTargetId: string | null;
  namesBehavior: "default" | "none" | "content" | "completion";
  speakers: { user: string; assistant: string };
  groupNudge: string | null;
};

// Faithful reproduction of shapeCompletionHistory's body for the stateless-runner path.
function shape(c: Case) {
  const scopedTargetId = c.scopedTargetId;
  const scopedCanon =
    c.groupConfig.output === "per-speaker" &&
    c.groupConfig.cardScope === "scoped" &&
    scopedTargetId != null
      ? scopeHistoryToTarget(c.canon, scopedTargetId)
      : c.canon;
  const multiCharacter = hasMultipleCharacters(scopedCanon as never);
  const withTail: Msg[] =
    c.appendUserTurn !== null
      ? [...scopedCanon, { role: "user" as const, content: c.appendUserTurn }]
      : scopedCanon;
  const injected = spliceInChatInjections(withTail as never, c.injections as never);
  const squashed = squashSameRole(injected as never);
  const named = applyNamesBehavior(
    squashed as never,
    c.namesBehavior,
    c.speakers,
    multiCharacter,
  );
  const nudge = c.groupNudge;
  const endsOnAssistant =
    named.length === 0 || named[named.length - 1]?.role === "assistant";
  const tailUser = nudge ?? (endsOnAssistant ? CONTINUATION_NUDGE : null);
  const history = tailUser
    ? squashSameRole([...named, { role: "user" as const, content: tailUser }] as never)
    : named;
  const bp = tailUser
    ? undefined
    : computeHistoryBreakpoint(withTail as never, injected as never, named as never, c.injections as never);
  // Runner placement (chat-completions.ts:89): targetIdx = history.length - 1 - offset. Only
  // meaningful when bp is defined (a defined bp ⇒ no tailUser ⇒ history === named).
  const targetIdx = bp !== undefined ? history.length - 1 - bp : null;
  return {
    multiCharacter,
    withTail,
    injected,
    squashed,
    named,
    history,
    cacheBreakpointFromEnd: bp ?? null,
    targetIdx,
  };
}

const fixturePath = process.env["ORACLE_FIXTURE"];
const refPath = process.env["ORACLE_REFERENCE"];
const neoHead = process.env["ORACLE_NEO_HEAD"] ?? "unknown";
if (!fixturePath || !refPath) {
  throw new Error("ORACLE_FIXTURE and ORACLE_REFERENCE env vars are required");
}

const fx = JSON.parse(readFileSync(fixturePath, "utf8"));
const cases: Record<string, ReturnType<typeof shape>> = {};
for (const c of fx.cases as Case[]) {
  cases[c.name] = shape(c);
}

const rollingTurns = (fx.rollingPair.turns as Case[]).map((t) => ({
  name: t.name,
  ...shape(t),
}));
const t1 = rollingTurns[0];
const t2 = rollingTurns[1];
const rollingDelta = {
  // The rolling-tail signature: the offset is invariant turn-over-turn (always the prior tip),
  // while the absolute cache_control placement ADVANCES by one committed user/assistant pair (2).
  // turn1 WRITES the prefix; turn2's older prefix is a cache READ (the ~5300-token win). Dropping
  // the breakpoint => both null => the silent regression (chat.md §8 / invariant 10).
  offsetInvariant: t1?.cacheBreakpointFromEnd === t2?.cacheBreakpointFromEnd,
  turn1TargetIdx: t1?.targetIdx ?? null,
  turn2TargetIdx: t2?.targetIdx ?? null,
  placementAdvance:
    t1?.targetIdx != null && t2?.targetIdx != null ? t2.targetIdx - t1.targetIdx : null,
};

const out = {
  $comment:
    "CAPTURED neo-tavern reference for the differential oracle. DO NOT hand-edit — regenerate via `scripts/dev/oracle-steady-clone.sh --capture`. Keyed by neoHead for provenance; no wall-clock (determinism). Each case is the SHAPE output of shapeCompletionHistory over breakpoint-cases.json, driven by neo's real transforms.",
  neoHead,
  cacheMinTokens: fx.cacheMinTokens ?? null,
  cases,
  rollingPair: { turns: rollingTurns, delta: rollingDelta },
};

writeFileSync(refPath, `${JSON.stringify(out, null, 2)}\n`, "utf8");
console.log(`captured ${Object.keys(cases).length} cases + rolling pair → ${refPath}`);
CAPTURE_EOF

echo "==> wrote capture script → $DEST/oracle-capture.ts"

if [[ "$CAPTURE" == "1" ]]; then
  echo "==> capturing neo reference over $FIXTURE"
  ( cd "$DEST" && \
    ORACLE_FIXTURE="$FIXTURE" \
    ORACLE_REFERENCE="$REFERENCE" \
    ORACLE_NEO_HEAD="$PINNED_HEAD" \
    "$TSX" oracle-capture.ts )
  # Normalize formatting so the committed reference matches biome (the repo's hook formats JSON).
  if [[ -x "$ORB_ROOT/node_modules/.bin/biome" ]]; then
    "$ORB_ROOT/node_modules/.bin/biome" format --write "$REFERENCE" >/dev/null 2>&1 || true
  fi
  echo "==> reference written → $REFERENCE"
fi

echo "==> done. clone=$DEST  head=${PINNED_HEAD:0:12}"
