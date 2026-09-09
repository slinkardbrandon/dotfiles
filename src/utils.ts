import chalk from "chalk";
import { $ } from "bun";

export const log = {
  info: (msg: string) => console.log(chalk.blue("[INFO]"), msg),
  success: (msg: string) => console.log(chalk.green("[SUCCESS]"), msg),
  warning: (msg: string) => console.log(chalk.yellow("[WARNING]"), msg),
  error: (msg: string) => console.log(chalk.red("[ERROR]"), msg),
  step: (msg: string) => console.log(chalk.cyan("\n>>>"), chalk.bold(msg)),
};

export async function run(cmd: string[], opts?: { sudo?: boolean; cwd?: string }) {
  const args = opts?.sudo ? ["sudo", ...cmd] : cmd;
  const result = await Bun.spawn(args, {
    cwd: opts?.cwd,
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  });

  const exitCode = await result.exited;
  if (exitCode !== 0) {
    throw new Error(`Command failed (exit ${exitCode}): ${args.join(" ")}`);
  }
}

export async function runQuiet(cmd: string[]): Promise<string> {
  const result = await Bun.spawn(cmd, {
    stdout: "pipe",
    stderr: "pipe",
  });

  const exitCode = await result.exited;
  const output = await new Response(result.stdout).text();

  if (exitCode !== 0) {
    throw new Error(`Command failed (exit ${exitCode}): ${cmd.join(" ")}`);
  }

  return output.trim();
}

// Like runQuiet, but tolerates a non-zero exit and merges stderr. Some CLIs report
// perfectly usable information on stderr and/or exit non-zero while doing so —
// `gh auth status` does both — and runQuiet would throw that information away.
export async function runCapture(cmd: string[]): Promise<string> {
  const result = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
  await result.exited;
  const [out, err] = await Promise.all([
    new Response(result.stdout).text(),
    new Response(result.stderr).text(),
  ]);
  return `${out}\n${err}`.trim();
}

export const DOTFILES_DIR = import.meta.dir.replace("/src", "");
