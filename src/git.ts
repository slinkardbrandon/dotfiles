import { existsSync, readFileSync } from "fs";
import { basename, join } from "path";
import { select, input } from "@inquirer/prompts";
import { log, run, runCapture, runQuiet } from "./utils";
import { ensurePersonalSigningKey } from "./keys";

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

// Picks a signing key whose UID actually matches the identity's email. Auto-selecting
// "the only key on the machine" is how a work key ends up signing personal commits:
// GitHub marks those Unverified because the key UID and author email disagree.
async function selectGpgKey(keys: GpgKey[], prompt: string, email?: string): Promise<string | null> {
  if (keys.length === 0) return null;

  const matching = email ? keys.filter((k) => k.uid.toLowerCase().includes(email.toLowerCase())) : keys;

  if (matching.length === 1) {
    log.info(`Found GPG key: ${matching[0].uid} (${matching[0].id})`);
    return matching[0].id;
  }

  if (matching.length === 0) {
    log.warning(`No GPG key UID matches ${email} — signing with another key would show as Unverified.`);
    const choice = await select({
      message: "How should signing be handled for this identity?",
      choices: [
        { name: "Skip signing (recommended — set it up later)", value: "" },
        ...keys.map((k) => ({ name: `Use ${k.uid} (${k.id}) anyway`, value: k.id })),
      ],
    });
    return choice || null;
  }

  return await select({
    message: prompt,
    choices: matching.map((k) => ({ name: `${k.uid} (${k.id})`, value: k.id })),
  });
}

async function writeGitIdentity(
  path: string,
  name: string,
  email: string,
  signingKey: string | null,
  gpgProgram: string,
  ghUser?: string,
) {
  let content = `[user]\n\tname = ${name}\n\temail = ${email}\n`;
  if (signingKey) {
    content += `\tsigningkey = ${signingKey}\n\n[gpg]\n\tprogram = ${gpgProgram}\n`;
  } else {
    content += `\n[commit]\n\tgpgsign = false\n`;
  }
  await Bun.write(path, content);

  // Naming the account makes push identity independent of gh's active account —
  // otherwise a stray `gh auth switch` silently repoints every work repo.
  if (ghUser) {
    const credKey = "credential.https://github.com.helper";
    await run(["git", "config", "--file", path, "--replace-all", credKey, ""]);
    await run(["git", "config", "--file", path, "--add", credKey, githubCredentialHelper(ghUser)]);
  }
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

const CRED_KEY = "credential.https://github.com.helper";

// Matches on the helper body rather than mere presence: the shared gitconfig also sets
// a helper for this URL, and inheriting that one is the problem we're fixing.
async function hasExplicitCredentialRouting(path: string): Promise<boolean> {
  try {
    const out = await runQuiet(["git", "config", "--file", path, "--get-all", CRED_KEY]);
    return out.includes("gh auth token");
  } catch {
    return false;
  }
}

// gh has no machine-readable account list, so this parses `gh auth status`. That command
// writes to stdout *and* stderr and exits non-zero when any account's token is stale, so
// capture both streams, ignore the exit code, and dedupe the names that show up twice.
// Account names are still correct in the stale-token case, and routing config is worth
// writing regardless — the helper simply returns nothing until the account is re-authed.
async function ghAccounts(): Promise<string[]> {
  const raw = await runCapture(["gh", "auth", "status", "--hostname", "github.com"]);
  return [...new Set([...raw.matchAll(/account (\S+)/g)].map((m) => m[1]))];
}

// Machines set up before push routing existed already have identities, so the
// ensureGitconfig* functions return early and never install it — leaving both identities
// falling through to gh's globally-active account, which is the ambiguity this whole
// setup exists to remove. Adds only the credential block; never touches name/email/signing.
async function ensureCredentialRouting(path: string, label: string, preferred?: string) {
  if (!existsSync(path)) return;
  if (await hasExplicitCredentialRouting(path)) return;

  // With a single account, gh's active account is unambiguous and explicit routing
  // buys nothing — so don't nag personal-only machines on every sync.
  const accounts = await ghAccounts();
  if (accounts.length < 2) return;

  log.step(`Adding GitHub push routing to ~/${basename(path)}`);
  const ghUser = await select({
    message: `Which GitHub account should ${label} repos push as?`,
    choices: [
      ...accounts.map((a) => ({ name: a, value: a })),
      { name: "Skip (fall through to gh's active account)", value: "" },
    ],
    default: preferred && accounts.includes(preferred) ? preferred : undefined,
  });
  if (!ghUser) return;

  await run(["git", "config", "--file", path, "--replace-all", CRED_KEY, ""]);
  await run(["git", "config", "--file", path, "--add", CRED_KEY, githubCredentialHelper(ghUser)]);
  log.success(`~/${basename(path)} now pushes as ${ghUser}`);
}

export async function ensureGitconfigLocal() {
  const localConfig = join(HOME, ".gitconfig.local");
  // keys.ts may have already created this file with only a signing key, so
  // checking for the file's existence isn't enough — verify the identity is
  // actually present before deciding to skip.
  if (hasIdentity(localConfig)) {
    await ensureCredentialRouting(localConfig, "default (non-personal)");
    return;
  }

  log.step("Setting up ~/.gitconfig.local (default git identity)");

  const name = await input({ message: "Git name (for commits):", default: "Brandon Slinkard" });
  // No email default: on corporate machines the default identity is the work
  // address, so we must not assume the personal one.
  const email = await input({ message: "Git email (for commits):" });
  // Optional: blank falls back to whichever account gh has active.
  const ghUser = await input({ message: "Default GitHub username for pushes (blank = gh's active account):" });

  // Preserve a signing key keys.ts may have written, rather than re-prompting.
  const existingKey = readConfigField(localConfig, "signingkey");
  const gpgProgram = await getGpgProgram();
  const selectedKey =
    existingKey || (await selectGpgKey(await detectGpgKeys(), "Which GPG key for default commits?", email));

  await writeGitIdentity(localConfig, name, email, selectedKey, gpgProgram, ghUser.trim() || undefined);
  log.success(`Created ~/.gitconfig.local (${email}${ghUser.trim() ? `, pushes as ${ghUser.trim()}` : ""})`);
}

// `gh auth git-credential` only ever answers for gh's globally-active account — asking
// it for a non-active username returns nothing. So per-directory routing has to name the
// account and pull that account's token out of gh's keyring explicitly.
const githubCredentialHelper = (ghUser: string) =>
  `!f() { test "$1" = get || return 0; ` +
  `t=$(gh auth token --hostname github.com --user ${ghUser} 2>/dev/null) || return 0; ` +
  `test -n "$t" || return 0; ` +
  `echo username=${ghUser}; echo "password=$t"; }; f`;

async function writePersonalIdentity(path: string, name: string, email: string, signingKeyPub: string, ghUser: string) {
  await Bun.write(path, `[user]\n\tname = ${name}\n\temail = ${email}\n`);

  const set = (key: string, value: string) => run(["git", "config", "--file", path, key, value]);

  // SSH signing rather than GPG: reuses the personal-only key, so no second GPG
  // keyring entry and no work key on a personal GitHub account.
  await set("user.signingkey", signingKeyPub);
  await set("gpg.format", "ssh");
  await set("commit.gpgsign", "true");
  await set("tag.gpgsign", "true");
  await set("gpg.ssh.allowedSignersFile", join(HOME, ".config", "git", "allowed_signers"));

  // Empty value first to reset the helper list inherited from the shared gitconfig,
  // which otherwise routes these repos to whichever account gh has active.
  const credKey = "credential.https://github.com.helper";
  await run(["git", "config", "--file", path, "--replace-all", credKey, ""]);
  await run(["git", "config", "--file", path, "--add", credKey, githubCredentialHelper(ghUser)]);
}

export async function ensureGitconfigPersonal() {
  const personalConfig = join(HOME, ".gitconfig.personal");

  // Created unconditionally: the shared gitconfig routes gitdir:~/personal/ here, so
  // the directory needs to exist even when the identity is already configured.
  await run(["mkdir", "-p", join(HOME, "personal")]);

  if (hasIdentity(personalConfig)) {
    await ensureCredentialRouting(personalConfig, "personal (~/dotfiles, ~/personal/*)", "slinkardbrandon");
    return;
  }

  log.step("Setting up ~/.gitconfig.personal (for ~/dotfiles and ~/personal/*)");

  const name = await input({ message: "Personal git name:", default: "Brandon Slinkard" });
  const email = await input({ message: "Personal git email:", default: "slinkardbrandon@gmail.com" });
  const ghUser = await input({ message: "Personal GitHub username (for push routing):", default: "slinkardbrandon" });

  const signingKeyPub = await ensurePersonalSigningKey(email);
  await writePersonalIdentity(personalConfig, name, email, signingKeyPub, ghUser);

  log.success(`Created ~/.gitconfig.personal (${email}, SSH-signed, pushes as ${ghUser})`);
  log.info(`Upload the signing key: gh ssh-key add ${signingKeyPub} --type signing`);
}
