// Draft Polish offers an explicit composer replacement and viewer-local display typesetting.
// Neither path rewrites outgoing text invisibly; the human sends the visible draft.

const host = orb.host(1);
const ELLIPSIS_RE = /\.{3,}/g;
const RUN_OF_SPACES_RE = /[ \t]{2,}/g;
const SPACE_RUN_RE = / +/g;
const TAB_OR_SPACE_RUN_RE = /[ \t]+/g;
const PUNCT = ",.;:!?";
const LINE_TERMINATORS = "\n\r\u2028\u2029";
const DOUBLE_DASH_RE = /(\S) ?-- ?(?=\S)/g;
const APOSTROPHE_RE = /(\w)'\b/g;
const OPEN_DQUOTE_RE = /(^|[\s([{])"/gm;
const CLOSE_DQUOTE_RE = /"/g;

// Code is copied, never passed through prose rules, on both paths.
const CODE_SPAN_RE = /(```[\s\S]*?```|`[^`\n]*`)/;

// A space run is dropped whole when punctuation follows it (` +([,.;:!?])` kept the mark); matching the run
// itself, not the run plus its mark, keeps a long run of spaces linear.
function dropSpacesBeforePunct(text: string): string {
  return text.replaceAll(SPACE_RUN_RE, (spaces: string, offset: number) => {
    const next = text.charAt(offset + spaces.length);
    return next !== "" && PUNCT.includes(next) ? "" : spaces;
  });
}

function tidy(text: string): string {
  return dropSpacesBeforePunct(text.replaceAll(ELLIPSIS_RE, "…")).replaceAll(RUN_OF_SPACES_RE, " ");
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
      // A run of blanks is trailing when it ends the segment or sits before a line terminator.
      return prose.replaceAll(TAB_OR_SPACE_RUN_RE, (spaces: string, offset: number) => {
        const end = offset + spaces.length;
        if (end < prose.length && !LINE_TERMINATORS.includes(prose.charAt(end))) {
          return spaces;
        }
        return end === prose.length && index < segments.length - 1 ? spaces : "";
      });
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
