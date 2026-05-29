import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { select, input } from "@inquirer/prompts";
import { log, run, runQuiet } from "./utils";

const HOME = process.env.HOME!;

interface GpgKey {
  id: string;
  uid: string;
}

async function detectGpgKeys(): Promise<GpgKey[]> {
  const keys: GpgKey[] = [];
  try {
    const raw = await runQuiet(["gpg", "--list-secret-keys", "--keyid-format=long"]);
    const lines = raw.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const secMatch = lines[i].match(/sec\s+\w+\/(\w+)/);
      if (secMatch) {
        const uid = lines.slice(i + 1, i + 4).find((l) => l.includes("uid"))?.replace(/.*\]\s*/, "").trim() || "unknown";
        keys.push({ id: secMatch[1], uid });
      }
    }
  } catch {}
  return keys;
}

async function getGpgProgram(): Promise<string> {
  try {
    return await runQuiet(["which", "gpg"]);
  } catch {
    return "/usr/bin/gpg";
  }
}

async function selectGpgKey(keys: GpgKey[], prompt: string): Promise<string | null> {
  if (keys.length === 0) return null;
  if (keys.length === 1) {
    log.info(`Found GPG key: ${keys[0].uid} (${keys[0].id})`);
    return keys[0].id;
  }
  return await select({
    message: prompt,
    choices: keys.map((k) => ({ name: `${k.uid} (${k.id})`, value: k.id })),
  });
}

function writeGitIdentity(path: string, name: string, email: string, signingKey: string | null, gpgProgram: string): Promise<number> {
  let content = `[user]\n\tname = ${name}\n\temail = ${email}\n`;
  if (signingKey) {
    content += `\tsigningkey = ${signingKey}\n\n[gpg]\n\tprogram = ${gpgProgram}\n`;
  } else {
    content += `\n[commit]\n\tgpgsign = false\n`;
  }
  return Bun.write(path, content);
}

// Read a single git config value from a config file via simple regex.
function readConfigField(path: string, field: string): string | null {
  if (!existsSync(path)) return null;
  const match = readFileSync(path, "utf8").match(new RegExp(`${field}\\s*=\\s*(.+)`));
  return match ? match[1].trim() : null;
}

// True when the file already has both a name and email (a usable identity).
function hasIdentity(path: string): boolean {
  return Boolean(readConfigField(path, "name") && readConfigField(path, "email"));
}

export async function ensureGitconfigLocal() {
  const localConfig = join(HOME, ".gitconfig.local");
  // keys.ts may have already created this file with only a signing key, so
  // checking for the file's existence isn't enough — verify the identity is
  // actually present before deciding to skip.
  if (hasIdentity(localConfig)) return;

  log.step("Setting up ~/.gitconfig.local (default git identity)");

  const name = await input({ message: "Git name (for commits):", default: "Brandon Slinkard" });
  // No email default: on corporate machines the default identity is the work
  // address, so we must not assume the personal one.
  const email = await input({ message: "Git email (for commits):" });

  // Preserve a signing key keys.ts may have written, rather than re-prompting.
  const existingKey = readConfigField(localConfig, "signingkey");
  const gpgProgram = await getGpgProgram();
  const selectedKey = existingKey || (await selectGpgKey(await detectGpgKeys(), "Which GPG key for default commits?"));

  await writeGitIdentity(localConfig, name, email, selectedKey, gpgProgram);
  log.success(`Created ~/.gitconfig.local (${email})`);
}

export async function ensureGitconfigPersonal() {
  const personalConfig = join(HOME, ".gitconfig.personal");
  if (hasIdentity(personalConfig)) return;

  log.step("Setting up ~/.gitconfig.personal (for dotfiles repo)");

  const name = await input({ message: "Personal git name:", default: "Brandon Slinkard" });
  const email = await input({ message: "Personal git email:", default: "slinkardbrandon@gmail.com" });

  const existingKey = readConfigField(personalConfig, "signingkey");
  const gpgProgram = await getGpgProgram();
  const selectedKey = existingKey || (await selectGpgKey(await detectGpgKeys(), "Which GPG key for personal commits?"));

  await writeGitIdentity(personalConfig, name, email, selectedKey, gpgProgram);
  log.success(`Created ~/.gitconfig.personal (${email})`);
}
