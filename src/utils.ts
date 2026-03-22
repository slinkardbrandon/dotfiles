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

export const DOTFILES_DIR = import.meta.dir.replace("/src", "");
