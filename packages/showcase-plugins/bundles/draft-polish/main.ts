// Draft Polish offers an explicit composer replacement and viewer-local display typesetting.
// Neither path rewrites outgoing text invisibly; the human sends the visible draft.

const host = orb.host(1);
const ELLIPSIS_RE = /\.{3,}/g;
const RUN_OF_SPACES_RE = /[ \t]{2,}/g;
const SPACE_BEFORE_PUNCT_RE = / +([,.;:!?])/g;
const TRAILING_SPACE_RE = /[ \t]+$/gm;
const DOUBLE_DASH_RE = /(\S) ?-- ?(?=\S)/g;
const APOSTROPHE_RE = /(\w)'(?=\w)/g;
const OPEN_DQUOTE_RE = /(^|[\s([{])"/gm;
const CLOSE_DQUOTE_RE = /"/g;

// Code is copied, never passed through prose rules, on both paths.
const CODE_SPAN_RE = /(```[\s\S]*?```|`[^`\n]*`)/g;

function tidy(text: string): string {
  return text.replaceAll(ELLIPSIS_RE, "…").replaceAll(SPACE_BEFORE_PUNCT_RE, "$1").replaceAll(RUN_OF_SPACES_RE, " ");
}

function polish(draft: string): string {
  const segments = draft.split(CODE_SPAN_RE);
  return segments
    .map((segment, index) => {
      if (index % 2 === 1) {
        return segment;
      }
      const prose = tidy(segment);
      // A prose segment ending before code is not a line ending: keep the separator space.
      return prose.replaceAll(TRAILING_SPACE_RE, (spaces: string, offset: number) =>
        offset + spaces.length === prose.length && index < segments.length - 1 ? spaces : "",
      );
    })
    .join("")
    .trim();
}

function typesetProse(text: string): string {
  return tidy(text).replaceAll(DOUBLE_DASH_RE, "$1—").replaceAll(APOSTROPHE_RE, "$1’").replaceAll(OPEN_DQUOTE_RE, "$1“").replaceAll(CLOSE_DQUOTE_RE, "”");
}

function typeset(text: string): string {
  return text
    .split(CODE_SPAN_RE)
    .map((segment, index) => (index % 2 === 1 ? segment : typesetProse(segment)))
    .join("");
}

if (host.grants.includes("ui.surface")) {
  host.ui.registerCommand({
    name: "polish",
    describe: "Polish your visible draft before sending",
    composerDraft: true,
    placements: [{ target: "composer-action", label: "Polish", icon: "sparkles" }],
    onRun: (input) => polish(input.draft),
  });
}

if (host.grants.includes("chat.transform")) {
  host.transforms.registerDisplay({ name: "typeset", apply: (input) => Promise.resolve(typeset(input.text)) });
}

host.log.info("draft polish ready — explicit composer action and viewer-local typesetting; turn off in Settings → Plugins");
