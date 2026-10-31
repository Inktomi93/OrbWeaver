// biome-ignore lint/correctness/noUndeclaredDependencies: `claude-code` is the engine's virtual module for mods, provided at load, never an npm package.
import type { Register } from "claude-code";

// The orchestrator skill rides in the system prompt of a session that orchestrates, read fresh from its one
// home on every render. A system prompt section has no size cap and is never compacted away.
const SKILL = ".claude/skills/orchestrator/SKILL.md";
const FRONTMATTER = /^---\n[\s\S]*?\n---\n+/;

export const register: Register = (on) => {
  on("prompt.compose", async ($, e, next) => {
    const composed = await next(e);
    // Only a session that can dispatch lanes orchestrates: role agents lack the Agent tool, and a teammate
    // runs a role of its own.
    if (!e.tools.includes("Agent") || e.traits.includes("teammate")) {
      return composed;
    }
    const text = await $.fs.read(SKILL).catch(() => null);
    if (typeof text !== "string") {
      return composed;
    }
    const section = {
      id: "orb-session:orchestrator",
      scope: "session" as const,
      text: `# Orchestrator skill (from \`${SKILL}\`, loaded; do not load it again)\n\n${text.replace(FRONTMATTER, "")}`,
    };
    return { ...composed, sections: [...composed.sections, section] };
  });
};
