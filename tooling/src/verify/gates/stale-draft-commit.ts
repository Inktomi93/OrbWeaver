// A once-seeded draft compared to its moving live seed can overwrite another writer.
// The shared visitor-fed reader preserves the legacy textual useState/if grammar,
// including its documented dirty-flag, setter-only, constant and package limits.
// FAMILY `draft-commit`: the diagnostic and remedy name the decision home `DRAFT_DECISION_HOME`, and
// `stale-draft-decision-health` proves that same declaration still resolves. Both come from
// `lib/stale-draft-read.ts`, so the health cannot guard a different path from the one findings send readers to.
import { defineGate } from "../contract/policy.ts";
import { createDraftCommitHooks, DRAFT_COMMIT_FIX, DRAFT_COMMIT_MESSAGE } from "../lib/stale-draft-read.ts";

export const gate = defineGate({
  id: "stale-draft-commit",
  family: "draft-commit",
  authority: "ordinary",
  severity: "error",
  population: "@client",
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: DRAFT_COMMIT_MESSAGE,
  fix: DRAFT_COMMIT_FIX,
  create: createDraftCommitHooks,
  mustFlag: [
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/components/cell.tsx":
          "import { useState } from 'react';\n" +
          "export function Cell({ source, onEdit }: { source: string; onEdit: (v: string) => void }) {\n" +
          "  const [draft, setDraft] = useState(source);\n" +
          "  const commit = () => {\n" +
          "    if (draft !== source) {\n" +
          "      onEdit(draft);\n" +
          "    }\n" +
          "  };\n" +
          "  return draft.length + (setDraft ? 0 : 1) + (commit ? 0 : 1);\n" +
          "}\n",
      },
      expect: { count: 1 },
      why: "THE FOUNDING SHAPE, verbatim from the pre-8e9158e14 tracker-value.tsx: a draft seeded from the live prop and committed under `draft !== source`",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/components/row.tsx":
          "import { useState } from 'react';\n" +
          "export function Row({ row, save }: { row: { text: string }; save: (v: string) => void }) {\n" +
          "  const [draft, setDraft] = useState(() => row.text);\n" +
          "  const onBlur = () => {\n" +
          "    if (row.text !== draft) {\n" +
          "      save(draft);\n" +
          "    }\n" +
          "  };\n" +
          "  return draft.length + (setDraft ? 0 : 1) + (onBlur ? 0 : 1);\n" +
          "}\n",
      },
      expect: { count: 1 },
      why: "the same defect in its other two spellings — a LAZY `useState(() => …)` seed, a PROPERTY-ACCESS live value, and the comparison written live-first",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/components/fixed.tsx":
          "import { useState } from 'react';\n" +
          "export function Cell({ source, onEdit }: { source: string; onEdit: (v: string) => void }) {\n" +
          "  const [draft, setDraft] = useState(source);\n" +
          "  const [openedFrom] = useState(source);\n" +
          "  const commit = () => {\n" +
          "    if (draft !== openedFrom) {\n" +
          "      onEdit(draft);\n" +
          "    }\n" +
          "  };\n" +
          "  return draft.length + (setDraft ? 0 : 1) + (commit ? 0 : 1) + openedFrom.length;\n" +
          "}\n",
      },
      why: "THE FIX: the same editor judged against WHAT IT OPENED WITH — the shape `resolveCommit` implements, and the shape roster-member-surface.tsx hand-rolls",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/components/watcher.tsx":
          "import { useState } from 'react';\n" +
          "export function Watcher({ hash }: { hash: string }) {\n" +
          "  const [seen, setSeen] = useState(hash);\n" +
          "  if (hash !== seen) {\n" +
          "    setSeen(hash);\n" +
          "  }\n" +
          "  return seen.length;\n" +
          "}\n",
      },
      why: "THE NEAR-MISS the second half exists for: identical syntax, but the branch only RESEEDS local state — 6 of the 14 raw shape matches on the corpus at mint were this idiom",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/components/save.tsx":
          "import { useState } from 'react';\n" +
          "export function Save({ name, onSave }: { name: string; onSave: () => void }) {\n" +
          "  const [draft, setDraft] = useState(name);\n" +
          "  const dirty = draft !== name;\n" +
          "  return dirty ? draft.length + (setDraft ? 0 : 1) + (onSave ? 0 : 1) : 0;\n" +
          "}\n",
      },
      why: "DECLARED LIMIT: a comparison with no guarded branch (a `dirty` flag feeding a disabled prop) has no write for this reader to see — the roster-member-surface class, caught by review rather than here",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/components/picker.tsx":
          "import { useState } from 'react';\n" +
          "const AUTO = 'auto';\n" +
          "export function Picker() {\n" +
          "  const [mode, setMode] = useState(AUTO);\n" +
          "  const apply = () => {\n" +
          "    if (mode === AUTO) {\n" +
          "      setMode(AUTO);\n" +
          "    }\n" +
          "  };\n" +
          "  return mode.length + (setMode ? 0 : 1) + (apply ? 0 : 1);\n" +
          "}\n",
      },
      why: "DECLARED LIMIT: an ALL_CAPS module constant cannot be moved by a second writer, so a draft seeded from one can never go stale against it",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/__stale_fence.ts": "export const clean = true;",
        "packages/ui/src/primitives/prim/prim.tsx":
          "import { useState } from 'react';\n" +
          "export function Prim({ label }: { label: string }) {\n" +
          "  const [draft, setDraft] = useState(label);\n" +
          "  const commit = () => {\n" +
          "    if (draft !== label) {\n" +
          "      console.log(draft);\n" +
          "    }\n" +
          "  };\n" +
          "  return draft.length + (setDraft ? 0 : 1) + (commit ? 0 : 1);\n" +
          "}\n",
      },
      why: "DECLARED LIMIT: `@orb/ui` is out of scanRoot — it sits BELOW the client in the cake and structurally cannot import the decision home this gate's fix names",
    },
  ],
});
