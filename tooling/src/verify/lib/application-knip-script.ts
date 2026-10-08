// D307 separates checker launchers from application subjects. Only their manifest operand changes;
// native Knip still accounts for every surrounding command, and real source imports remain intact.
import { devNull } from "node:os";
import type { Command, Node, Word, WordPart } from "unbash";
import { parse } from "unbash";

function assertLiteralPart(part: WordPart): void {
  if (part.type === "DoubleQuoted") {
    for (const child of part.parts) {
      assertLiteralPart(child);
    }
    return;
  }
  if (part.type === "Literal" || part.type === "SingleQuoted" || part.type === "AnsiCQuoted") {
    return;
  }
  throw new Error(`application Knip script requires literal words: ${part.type}`);
}

function assertLiteralWord(word: Word): void {
  for (const part of word.parts ?? []) {
    assertLiteralPart(part);
  }
}

function literalCommandName(command: Command): string {
  const { name, suffix } = command;
  if (name === undefined) {
    throw new Error("application Knip script requires a command, not an assignment-only statement");
  }
  assertLiteralWord(name);
  for (const word of suffix) {
    assertLiteralWord(word);
  }
  for (const assignment of command.prefix) {
    if (assignment.array !== undefined || assignment.index !== undefined || assignment.append === true) {
      throw new Error("application Knip script requires scalar environment assignments");
    }
    if (assignment.value !== undefined) {
      assertLiteralWord(assignment.value);
    }
  }
  if (command.redirects.length > 0) {
    throw new Error("application Knip script does not admit redirections");
  }
  return name.value;
}

function launcherOperand(command: Command): Word | undefined {
  const name = literalCommandName(command);
  const { suffix } = command;
  if (name === "pnpm") {
    assertPnpmCommand(suffix);
    return;
  }
  if (name !== "node") {
    if (suffix.length > 0) {
      throw new Error(`application Knip script has an unsupported command wrapper: ${name}`);
    }
    return;
  }
  const operand = suffix[0];
  if (operand === undefined || operand.value.length === 0 || operand.value.startsWith("-")) {
    throw new Error("application Knip script requires a literal first Node launcher operand");
  }
  if (operand.text === operand.value && /[*?[\]{}~]/u.test(operand.value)) {
    throw new Error("application Knip script does not admit an expanded Node launcher operand");
  }
  return operand;
}

function assertPnpmCommand(words: readonly Word[]): void {
  let index = 0;
  if (words[0]?.value === "--filter") {
    if (words[1] === undefined || words[1].value.startsWith("-")) {
      throw new Error("application Knip pnpm filter requires a literal workspace selector");
    }
    index = 2;
  } else if (words[0]?.value.startsWith("--filter=") === true) {
    index = 1;
  }
  const verb = words[index]?.value;
  if (verb === undefined || verb.startsWith("-") || verb === "dlx" || verb === "node") {
    throw new Error("application Knip script requires pnpm script delegation or literal binary execution");
  }
  if (verb === "exec") {
    const binary = words[index + 1]?.value;
    if (binary === undefined || binary.startsWith("-") || binary === "node") {
      throw new Error("application Knip pnpm exec requires a literal binary, not an embedded Node launcher");
    }
  }
}

function* scriptCommands(node: Node): Iterable<Command> {
  if (node.type === "Statement") {
    if (node.background === true || node.redirects.length > 0) {
      throw new Error("application Knip script does not admit background execution or redirections");
    }
    yield* scriptCommands(node.command);
    return;
  }
  if (node.type === "AndOr" || node.type === "Pipeline") {
    for (const command of node.commands) {
      yield* scriptCommands(command);
    }
    return;
  }
  if (node.type === "Command") {
    yield node;
    return;
  }
  throw new Error(`application Knip script has unsupported control flow: ${node.type}`);
}

/** Project classified checker launchers without changing their native binary or script accounting. */
export function projectApplicationKnipScript(script: string, isToolingLauncher: (specifier: string) => boolean): string {
  const parsed = parse(script);
  if ((parsed.errors?.length ?? 0) > 0 || parsed.commands.length === 0) {
    throw new Error(`application Knip script could not parse completely: ${parsed.errors?.map(({ message }) => message).join("; ") ?? "empty script"}`);
  }
  const operands: Word[] = [];
  for (const statement of parsed.commands) {
    for (const command of scriptCommands(statement)) {
      const operand = launcherOperand(command);
      if (operand !== undefined && isToolingLauncher(operand.value)) {
        operands.push(operand);
      }
    }
  }
  let projected = script;
  for (const operand of operands.toSorted((left, right) => right.pos - left.pos)) {
    projected = `${projected.slice(0, operand.pos)}'${devNull}'${projected.slice(operand.end)}`;
  }
  return projected;
}
