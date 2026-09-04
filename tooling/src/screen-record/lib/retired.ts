// Exact compatibility recipe for the retired Record CLI; execution always belongs to Snap filmstrip.
const VALUE_FLAGS = new Set(["--click", "--dom-click", "--hover", "--fill", "--wheel", "--pause", "--base", "--out", "--viewport", "--ref", "--session"]);
const BOOLEAN_FLAGS = new Set(["--json", "--isolated", "--dirty", "--fresh", "--wide", "--mobile", "--desktop", "--dark", "--light", "--reduced-motion"]);

function shellArg(value: string): string {
  return /^[A-Za-z0-9_./:@=-]+$/u.test(value) ? value : `'${value.replaceAll("'", `'"'"'`)}'`;
}

export interface RecordRetirement {
  readonly recipe: string;
  readonly errors: readonly string[];
}

interface TranslationStep {
  readonly nextIndex: number;
  readonly tokens: readonly string[];
  readonly error: string | null;
}

interface ValueStepInput {
  readonly token: string;
  readonly translatedToken?: string;
  readonly missingError?: string;
}

function valueStep(argv: readonly string[], index: number, input: ValueStepInput): TranslationStep {
  const { token } = input;
  const translatedToken = input.translatedToken ?? token;
  const missingError = input.missingError ?? `${token} requires a value`;
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    return { nextIndex: index, tokens: [], error: missingError };
  }
  return { nextIndex: index + 1, tokens: [translatedToken, value], error: null };
}

function translateRecordToken(argv: readonly string[], index: number): TranslationStep {
  const token = argv[index] as string;
  if (token === "--frames") {
    const next = argv[index + 1];
    return { nextIndex: next !== undefined && /^\d+$/u.test(next) ? index + 1 : index, tokens: [], error: null };
  }
  if (token === "--settle") {
    return valueStep(argv, index, { token, translatedToken: "--pause", missingError: "--settle requires milliseconds" });
  }
  if (token.startsWith("--") && VALUE_FLAGS.has(token)) {
    return valueStep(argv, index, { token });
  }
  if (token.startsWith("--") && !BOOLEAN_FLAGS.has(token)) {
    return { nextIndex: index, tokens: [], error: `unsupported retired Record flag ${token}` };
  }
  return { nextIndex: index, tokens: [token], error: null };
}

export function recordRetirement(argv: readonly string[]): RecordRetirement {
  if (argv.includes("--help") || argv.includes("-h")) {
    return { recipe: "pnpm snap --help", errors: [] };
  }
  const translated: string[] = [];
  const errors: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const step = translateRecordToken(argv, index);
    translated.push(...step.tokens);
    if (step.error !== null) {
      errors.push(step.error);
    }
    index = step.nextIndex;
  }
  translated.push("--filmstrip");
  return { recipe: `pnpm snap ${translated.map(shellArg).join(" ")}`.trim(), errors };
}
