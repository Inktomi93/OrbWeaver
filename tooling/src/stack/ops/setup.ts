// `pnpm start`'s setup pass: ask the questions in a terminal and write the answers into `.env` in place.
// lib/setup-plan.ts makes every decision; this file only reads lines, prints, and writes the file.
import { writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type {
  AnswerParse,
  SetupAnswers,
  SetupAudience,
  SetupLogin,
  SetupMachine,
  SetupResult,
  SetupRunOpts,
  SetupUrlKind,
  SetupValues,
} from "../contract/types.ts";
import { SETUP_AUDIENCES, SETUP_LOGINS } from "../contract/types.ts";
import {
  ALLOWED_HOSTS_KEY,
  AUTH_MODE_KEY,
  applySetupValues,
  currentAuthMode,
  decideSetup,
  detectedHostNames,
  hostList,
  openUrls,
  PORT_KEY,
  parseAddressAnswer,
  parseChoiceAnswer,
  parsePortAnswer,
  SETUP_COMMAND,
  SINGLE_USER_MODE,
  setupDefaults,
  setupValues,
} from "../lib/setup-plan.ts";
import { parseEnvText, readEnvText } from "./prod-state.ts";

refuseDirectInvocation(import.meta.url, SETUP_COMMAND);

const INTRO = "orbweaver setup. Press Enter to keep the value in [brackets]; Ctrl-C stops without writing anything.";

interface Menu<T extends string> {
  readonly title: string;
  readonly choices: readonly T[];
  readonly labels: Record<T, string>;
}

const AUDIENCE_MENU: Menu<SetupAudience> = {
  title: "Who will use orbweaver?",
  choices: SETUP_AUDIENCES,
  labels: { "just-me": "just me, on this computer (no sign-in)", network: "people on my network (everyone signs in)" },
};

const LOGIN_MENU: Menu<SetupLogin> = {
  title: "How will people sign in?",
  choices: SETUP_LOGINS,
  labels: { password: "a password stored by orbweaver", sso: "single sign-on through your identity provider" },
};

/** Shown when SSO was chosen and no SSO mode is configured: setup never collects the identity provider's secrets. */
const SSO_PENDING_LINES = [
  "Single sign-on needs your identity provider's settings, which setup does not ask for. Until they are set, people sign in with a password.",
  "To switch, set these in .env: AUTH_MODE=oidc, OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET and OIDC_REDIRECT_URIS (or AUTH_MODE=forward-header behind a forward-auth proxy).",
  'Each key is described under "Login modes" in docker/README.md.',
] as const;

interface LineReader {
  /** Print `prompt` and parse lines until one parses; `null` when the input ended or the operator pressed Ctrl-C. */
  readonly ask: <T>(prompt: string, parse: (raw: string) => AnswerParse<T>) => Promise<{ readonly value: T } | null>;
  readonly say: (text: string) => void;
  readonly close: () => void;
}

function lineReader(opts: SetupRunOpts): LineReader {
  const rl = createInterface({ input: opts.input, output: opts.output });
  // Ctrl-C in a terminal reaches readline as a key, not a signal: end the pass so nothing is written.
  rl.on("SIGINT", () => {
    opts.output.write("\n");
    rl.close();
  });
  // One iterator for the whole pass: it buffers lines that arrive before a question is printed.
  const lines = rl[Symbol.asyncIterator]();
  return {
    ask: async <T>(prompt: string, parse: (raw: string) => AnswerParse<T>): Promise<{ readonly value: T } | null> => {
      for (;;) {
        rl.setPrompt(prompt);
        opts.output.write(prompt);
        const next = await lines.next();
        if (next.done === true) {
          return null;
        }
        const parsed = parse(String(next.value));
        if (parsed.ok) {
          return { value: parsed.value };
        }
        opts.output.write(`  ${parsed.error}\n`);
      }
    },
    say: (text: string): void => {
      opts.output.write(`${text}\n`);
    },
    close: (): void => {
      rl.close();
    },
  };
}

/** A numbered menu: the title and options are printed once, and the prompt line alone is what readline redraws. */
async function choose<T extends string>(reader: LineReader, menu: Menu<T>, fallback: T): Promise<{ readonly value: T } | null> {
  reader.say([menu.title, ...menu.choices.map((choice, index) => `  ${index + 1}) ${menu.labels[choice]}`)].join("\n"));
  return await reader.ask(`Choose [${menu.choices.indexOf(fallback) + 1}]: `, (raw) => parseChoiceAnswer(raw, menu.choices, fallback));
}

/** How each kind of URL is labelled; a LAN address is the one that always works, so it carries no caveat. */
const URL_NOTES: Record<SetupUrlKind, string> = {
  lan: "",
  tailnet: "   (from your tailnet)",
  mdns: "   (may work: .local names resolve on macOS; Windows and Linux may need mDNS support)",
};

const WSL_LINES = [
  "This is WSL2: other devices cannot reach WSL's own address. Turn on mirrored networking in WSL, or forward the port",
  'from Windows with `netsh interface portproxy`; README.md, "Other devices, and the internet", has the steps.',
] as const;

/** Where another device opens the box, most reliable first; under WSL2, why there is no such address yet. */
function reachLines(machine: SetupMachine, port: number): readonly string[] {
  if (machine.wsl) {
    return WSL_LINES;
  }
  const urls = openUrls(machine, port);
  if (urls.length === 0) {
    return [`Other devices open http://<this computer's address>:${port}; no network address was found to show here.`];
  }
  return ["Other devices on your network open:", ...urls.map(({ url, kind }) => `  ${url}${URL_NOTES[kind]}`)];
}

/** The address question. It is pre-filled with this machine's own names, so Enter is always a working answer: an
 *  IP address needs no entry, and the detected names are written for people who type a name. */
async function askAddress(reader: LineReader, machine: SetupMachine, port: number, current: string | null): Promise<{ readonly value: string | null } | null> {
  const known: readonly string[] = [...new Set([...hostList(current), ...detectedHostNames(machine.hostname)])];
  reader.say(reachLines(machine, port).join("\n"));
  return await reader.ask(
    `Any other name people will type to reach this? An IP address needs no entry. [${known.length === 0 ? "none" : known.join(", ")}]: `,
    (raw) => parseAddressAnswer(raw, known),
  );
}

/** Ask every question; `null` when the pass was cancelled. The login and address questions are asked only for
 *  `network`. */
async function askAll(reader: LineReader, defaults: SetupAnswers, machine: SetupMachine): Promise<SetupAnswers | null> {
  const port = await reader.ask(`Port for orbweaver [${defaults.port}]: `, (raw) => parsePortAnswer(raw, defaults.port));
  if (port === null) {
    return null;
  }
  const audience = await choose(reader, AUDIENCE_MENU, defaults.audience);
  if (audience === null) {
    return null;
  }
  if (audience.value === "just-me") {
    return { ...defaults, port: port.value, audience: audience.value };
  }
  const login = await choose(reader, LOGIN_MENU, defaults.login);
  if (login === null) {
    return null;
  }
  const address = await askAddress(reader, machine, port.value, defaults.allowedHosts);
  if (address === null) {
    return null;
  }
  return { port: port.value, audience: audience.value, login: login.value, allowedHosts: address.value };
}

function summaryLines(opts: SetupRunOpts, values: SetupValues): readonly string[] {
  const written = [`${PORT_KEY}=${values.port}`, `${AUTH_MODE_KEY}=${values.authMode}`];
  if (values.allowedHosts !== null) {
    written.push(`${ALLOWED_HOSTS_KEY}=${values.allowedHosts}`);
  }
  const shared = values.authMode !== SINGLE_USER_MODE;
  return [
    `Saved ${written.join(", ")} in ${opts.envPath}. Run \`${SETUP_COMMAND}\` to change them.`,
    ...(values.ssoPending ? SSO_PENDING_LINES : []),
    ...(shared ? reachLines(opts.machine, values.port) : []),
  ];
}

/** Decide whether to ask, ask, and write `.env`. Nothing is read from the input and nothing is printed unless
 *  the decision is to ask; a cancelled pass writes nothing. */
export async function runSetup(opts: SetupRunOpts): Promise<SetupResult> {
  const text = readEnvText(opts.envPath);
  const decision = decideSetup({ envExists: text !== null, setup: opts.setup, interactive: opts.interactive });
  if (decision !== "ask") {
    return { kind: decision };
  }
  const fileEnv = parseEnvText(text ?? "");
  const reader = lineReader(opts);
  reader.say(INTRO);
  let answers: SetupAnswers | null;
  try {
    answers = await askAll(reader, setupDefaults(fileEnv, opts.ambient), opts.machine);
  } finally {
    reader.close();
  }
  if (answers === null) {
    return { kind: "cancelled" };
  }
  const values = setupValues(answers, currentAuthMode(fileEnv, opts.ambient));
  const next = applySetupValues(text, values);
  if (next !== text) {
    writeFileSync(opts.envPath, next);
  }
  reader.say(summaryLines(opts, values).join("\n"));
  return { kind: "written", values };
}
