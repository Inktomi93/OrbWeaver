// `regexScriptSchema` / `RegexScript` — the persisted script-library wire shape (the find/replace rules
// a character card, preset, or user settings carries). The pure executor lives in `@orb/kit/regex`,
// reading a kit-local structural `RegexScriptInput` since kit may not import contracts; the alignment is
// asserted via `RegexScript satisfies RegexScriptInput`, pinned in the contract test.

import { MAX_FIND_REGEX_LENGTH, REGEX_PLACEMENTS, SubstituteFindRegex } from "@orb/kit/regex";
import { z } from "zod";

// ── Field caps (named so the literals aren't bare magic numbers) ──────────────
const MIN_ID_LENGTH = 1;
const MAX_ID_LENGTH = 128;
const MAX_NAME_LENGTH = 200;
const MAX_REPLACE_LENGTH = 10_000;
const MAX_TRIM_STRING_LENGTH = 2000;
const MAX_TRIM_STRINGS = 100;
// Recursive-generation depth window the script applies within. `0` = floor; the ceiling is generous
// (a depth this large is effectively unbounded) — both are nullable (null = no bound on that side).
const MIN_RECURSION_DEPTH = 0;
const MAX_RECURSION_DEPTH = 100_000;

export const regexScriptSchema = z.object({
  id: z.string().min(MIN_ID_LENGTH).max(MAX_ID_LENGTH),
  name: z.string().max(MAX_NAME_LENGTH),
  // Storage-boundary cap == execution cap (`@orb/kit/regex` MAX_FIND_REGEX_LENGTH) so an over-long
  // pattern can't even be persisted (it would otherwise only be rejected at execution).
  findRegex: z.string().max(MAX_FIND_REGEX_LENGTH),
  replaceString: z.string().max(MAX_REPLACE_LENGTH),
  // The placement set this script runs in; `z.enum` over the kit tuple (the union's single source of
  // truth — `no-inline-union-redecl`). Capped at the tuple length (no value can repeat usefully).
  placement: z.array(z.enum(REGEX_PLACEMENTS)).max(REGEX_PLACEMENTS.length),
  enabled: z.boolean().default(true),

  // Options mimicking the legacy ST card-format.
  markdownOnly: z.boolean().default(false),
  promptOnly: z.boolean().default(false),
  runOnEdit: z.boolean().default(false),
  trimStrings: z.array(z.string().max(MAX_TRIM_STRING_LENGTH)).max(MAX_TRIM_STRINGS).default([]),

  // How macros run on the FIND pattern before it is compiled (kit `SubstituteFindRegex`: none/raw/escaped).
  // Multi-value `z.literal([...])` (zod 4.x) — one node, one `invalid_value` issue naming all three options,
  // where the old three-arm `z.union` emitted a nested `invalid_union`. Same accepted set.
  substituteRegex: z.literal([SubstituteFindRegex.none, SubstituteFindRegex.raw, SubstituteFindRegex.escaped]).default(SubstituteFindRegex.none),

  // Min/Max depth for recursive generation (null = unbounded on that side).
  minDepth: z.number().int().min(MIN_RECURSION_DEPTH).max(MAX_RECURSION_DEPTH).nullable().default(null),
  maxDepth: z.number().int().min(MIN_RECURSION_DEPTH).max(MAX_RECURSION_DEPTH).nullable().default(null),
});

export type RegexScript = z.infer<typeof regexScriptSchema>;
