// Gate: entry-synthetic-role-is-user (#2382) — ensures that synthetic Principals with a hardcoded
// `role: "user"` only appear in the entry layer (`packages/server/src/entry/`). A synthetic Principal
// is one where `role` is a STRING LITERAL rather than read from a database row. The three current sites
// (compose/chat.ts, compose/imagery.ts, compose/search-discovery.ts) all hardcode `role: "user"` for
// role-irrelevant ops (getCard, persona reads). A domain-layer file hardcoding a Principal's role is
// a privilege-escalation surface — it should use an existing resolver that reads the role from the DB.
//
// DETECTION: syntax-tier regex on blanked text. The discriminator is `role: "user"` appearing in a file
// under `@server` but NOT under `entry/`. The `entry/` population is EXCLUDED because that's where
// synthetic Principals legitimately live. Tests are excluded by `@server` population.
//
// DECLARED LIMIT: `role: "user"` appears in many non-Principal contexts (chat messages, API shapes).
// The gate scopes to files that ALSO contain the word `Principal` to reduce false positives.
//
// FAMILY: a declared SINGLETON under its own id. No shared reader — this is a layer-boundary check.
import { defineGate } from "../contract/policy.ts";
import { blankTsComments } from "../lib/comment-spans.ts";

const ENTRY_PREFIX = "packages/server/src/entry/";
const ROLE_USER_RE = /\brole:\s*"user"/u;

const MESSAGE =
  'a hardcoded `role: "user"` in a Principal-aware file outside `entry/` — synthetic Principals with a fabricated role belong only in the entry composition layer (compose/chat.ts, compose/imagery.ts, compose/search-discovery.ts). A domain verb that needs a Principal should receive one from its caller or use an existing resolver.';

export const gate = defineGate({
  id: "entry-synthetic-role-is-user",
  family: "entry-synthetic-role-is-user",
  authority: "hard",
  severity: "error",
  population: "@server",
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: 'receive the Principal from the caller or use createHostPrincipalResolver instead of hardcoding `role: "user"` in a domain file.',
  create: (ctx) => ({
    visitFile: (sf) => {
      const raw = sf.getFullText();
      const file = ctx.relativePath(sf);
      // Only files outside entry/ that mention Principal.
      if (file.startsWith(ENTRY_PREFIX) || !raw.includes("Principal")) {
        return;
      }
      // Only files that have role: "user" in code (not comments).
      if (!ROLE_USER_RE.test(raw)) {
        return;
      }
      const blanked = blankTsComments(sf);
      // The "Principal" fence must also pass on blanked text — a file that mentions Principal only
      // in a COMMENT (quiet-generate.ts) is not a Principal-aware file in the code sense.
      if (!blanked.includes("Principal")) {
        return;
      }
      for (const [index, line] of blanked.split("\n").entries()) {
        const match = ROLE_USER_RE.exec(line);
        if (match !== null) {
          ctx.report.file(file, {
            line: index + 1,
            column: match.index + 1,
            token: 'role: "user"',
            message: 'hardcoded `role: "user"` in a Principal-aware file outside entry/ — use an existing resolver.',
          });
        }
      }
    },
  }),
  mustFlag: [
    {
      mode: "source",
      files: {
        "packages/server/src/domain/chat/verbs/sneaky.ts":
          'import type { Principal } from "@orb/contracts/identity";\nconst p: Principal = { userId: "x", role: "user", handle: "x", externalId: null, via: "fallback" };\nexport const x = p;\n',
      },
      expect: { count: 1, token: 'role: "user"' },
      why: 'a hardcoded role: "user" in a domain file that imports Principal — the privilege-escalation surface this gate closes',
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "packages/server/src/entry/compose/ok.ts":
          'import type { Principal } from "@orb/contracts/identity";\nconst p: Principal = { userId: "x", role: "user", handle: "x", externalId: null, via: "fallback" };\nexport const x = p;\n',
      },
      why: 'an entry/ file with role: "user" — the sanctioned home, excluded by prefix',
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/chat/verbs/msg.ts": 'const msg = { role: "user", content: "hello" };\nexport const x = msg;\n',
      },
      why: 'a role: "user" in a file that does NOT mention Principal — excluded by the Principal fence',
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/chat/verbs/comment.ts": '// The Principal gets role: "user" from the DB.\nexport const x = 1;\n',
      },
      why: 'a comment spelling role: "user" in a Principal-mentioning file — blanked, does not match',
    },
  ],
});
