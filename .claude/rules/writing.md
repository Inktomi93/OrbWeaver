---
paths:
  - ".claude/**"
  - "CLAUDE.md"
  - "AGENTS.md"
---

# Writing instruction files

Rules for every instruction file: `CLAUDE.md`, `.claude/rules`, agents, skills, memory, and code
comments. Docs under `docs/**` follow their own style doc; see `.claude/rules/docs.md`.

Owner-voice sections — personality, communication, and philosophy written in the owner's own words —
are exempt from this style. Never rewrite them into plain style. Wrap one in `<!-- owner-voice -->` and
`<!-- /owner-voice -->` so the check skips it.

`pnpm check:agents` checks `CLAUDE.md`, `AGENTS.md` and every `.claude/**` Markdown file against rules 1, 4
and 12, and checks that every link and backticked repository path exists. It skips code spans and code
blocks, so quote a literal name in backticks.

## Writing

1. No history. No dates, incident stories, issue or PR numbers, `used to`, `retired`, `was believed`.
   Git holds history.
2. No counts. Do not write how many rules, files, tests, lessons, or workers exist. Point at the file
   that owns the value.
3. Lean. Plain, short sentences. Say it once. No all-caps emphasis, no stacked clauses, no self-praise.
   When in doubt, cut.
4. Banned words: `load-bearing`, and house slang (`belt`, `fence`, `arm`, `lens`, `receipt`, `rung`)
   unless the glossary defines it.
5. Say what to do. Keep a prohibition only when the failure is real and current, and give the reason
   in one clause.
6. Code speaks for itself. A comment exists only for a non-obvious reason.

## Writing standard (adapted from ASD-STE100)

- Instructions: one per sentence, imperative, 20 words or fewer. Descriptions: 25 words or fewer.
- Active voice. Simple tenses.
- One word for one thing, every time. No synonyms for variety. Use the project's terms exactly.
- No idioms, slang, or figures of speech. Prefer short common words: "use", "start", "show".
- Put the most important statement first. Numbered lists for steps, bullets for unordered items,
  tables to compare.
- Put a warning before the step it protects, and start it with the command.
- Quote code, commands, paths, and identifiers exactly. Code comments follow the codebase, not this
  style.

## Structure

7. One home per rule. Other files link to it and never restate it. Two copies that disagree are a bug.
8. Enforced beats written. If a hook or check blocks it, the prose gets one pointer line or nothing.
9. Every rule is checkable or carries a reason. Otherwise delete it.
10. Add a rule only when a mistake repeats. A one-off gets fixed in code.
11. Edit in place. Deleting is normal. Never write a correction beside the original.
12. Always-on text stays small. `CLAUDE.md` with its imports, plus any rule without `paths:`, stays
    under 200 lines. Every rule uses list-form `paths:` frontmatter. Procedures are skills. Agent bodies stay short.

## Memory and reports

13. Memory holds only facts the code cannot show. Rule-shaped lessons become path-scoped rules.
    Subagents get no memory.
14. Reports and commit messages lead with the outcome and stay short.
