import { existsSync } from "fs";
import { join } from "path";
import { confirm, input } from "@inquirer/prompts";
import { log, run, runQuiet } from "./utils";
import { type Platform, commandExists } from "./platform";

const SSH_DIR = join(process.env.HOME!, ".ssh");
const SSH_KEY = join(SSH_DIR, "id_ed25519");

async function ensureDeps(platform: Platform) {
  const missing: string[] = [];

  if (!(await commandExists("gpg"))) missing.push("gnupg");
  if (!(await commandExists("gh"))) missing.push("gh");

  if (platform === "macos" && !(await commandExists("pinentry-mac"))) {
    missing.push("pinentry-mac");
  }

  if (missing.length > 0) {
    log.warning(`Missing dependencies: ${missing.join(", ")}`);
    const install = await confirm({ message: "Install missing dependencies?" });
    if (!install) {
      throw new Error("Cannot proceed without required dependencies");
    }

    if (platform === "macos") {
      await run(["brew", "install", ...missing]);
    } else {
      await run(["sudo", "apt", "install", "-y", ...missing]);
    }
  }
}

async function configureGPGAgent(platform: Platform) {
  log.info("Configuring GPG agent...");
  const gnupgDir = join(process.env.HOME!, ".gnupg");
  await run(["mkdir", "-p", gnupgDir]);
  await run(["chmod", "700", gnupgDir]);

  let pinentryProgram: string;
  if (platform === "macos") {
    pinentryProgram = (await runQuiet(["which", "pinentry-mac"])).trim();
  } else {
    // Use curses or tty on Linux
    if (await commandExists("pinentry-curses")) {
      pinentryProgram = (await runQuiet(["which", "pinentry-curses"])).trim();
    } else {
      pinentryProgram = (await runQuiet(["which", "pinentry-tty"])).trim();
    }
  }

  const agentConf = `pinentry-program ${pinentryProgram}
default-cache-ttl 600
max-cache-ttl 7200
enable-ssh-support
`;

  await Bun.write(join(gnupgDir, "gpg-agent.conf"), agentConf);
  await run(["chmod", "600", join(gnupgDir, "gpg-agent.conf")]);

  await run(["gpgconf", "--kill", "gpg-agent"]);
  await run(["gpgconf", "--launch", "gpg-agent"]);

  log.success("GPG agent configured");
}

async function setupSSH(platform: Platform): Promise<string> {
  log.step("SSH Key Setup");

  let keyPath = SSH_KEY;

  if (existsSync(SSH_KEY)) {
    log.warning(`SSH key already exists at ${SSH_KEY}`);
    const createNew = await confirm({ message: "Create a new SSH key?" });
    if (!createNew) {
      log.info("Skipping SSH key generation");
      return keyPath;
    }
    keyPath = join(SSH_DIR, "id_ed25519_new");
  }

  const email = await input({ message: "Enter your email for SSH key:" });

  await run(["mkdir", "-p", SSH_DIR]);
  await run(["chmod", "700", SSH_DIR]);
  await run(["ssh-keygen", "-t", "ed25519", "-C", email, "-f", keyPath]);

  log.success(`SSH key generated: ${keyPath}`);

  // Configure SSH agent
  log.info("Configuring SSH agent...");

  let sshConfig: string;
  if (platform === "macos") {
    sshConfig = `# Auto-load SSH keys and use macOS keychain
Host *
  AddKeysToAgent yes
  UseKeychain yes
  IdentityFile ~/.ssh/id_ed25519

Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519
`;
  } else {
    sshConfig = `# Auto-load SSH keys
Host *
  AddKeysToAgent yes
  IdentityFile ~/.ssh/id_ed25519

Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519
`;
  }

  await Bun.write(join(SSH_DIR, "config"), sshConfig);
  await run(["chmod", "600", join(SSH_DIR, "config")]);

  // Add key to agent
  try {
    await run(["bash", "-c", 'eval "$(ssh-agent -s)" > /dev/null 2>&1']);
    if (platform === "macos") {
      await run(["ssh-add", "--apple-use-keychain", keyPath]);
    } else {
      await run(["ssh-add", keyPath]);
    }
  } catch {
    log.warning("Could not add key to ssh-agent automatically");
  }

  log.success("SSH configured");
  return keyPath;
}

async function setupGPG(): Promise<string | null> {
  log.step("GPG Key Setup");

  let gpgKeyId: string | null = null;
  let generateNew = true;

  // Check for existing keys
  try {
    const existingKeys = await runQuiet(["gpg", "--list-secret-keys", "--keyid-format=long"]);
    if (existingKeys.trim()) {
      log.warning("Existing GPG keys found:");
      console.log(existingKeys);
      generateNew = await confirm({ message: "Create a new GPG key?" });

      if (!generateNew) {
        // Extract first key ID
        const match = existingKeys.match(/sec\s+\w+\/(\w+)/);
        if (match) gpgKeyId = match[1];
        return gpgKeyId;
      }
    }
  } catch {
    // No existing keys
  }

  if (generateNew) {
    const name = await input({ message: "Enter your name:" });
    const email = await input({ message: "Enter your email:" });

    const keyScript = `%echo Generating GPG key...
Key-Type: RSA
Key-Length: 4096
Subkey-Type: RSA
Subkey-Length: 4096
Name-Real: ${name}
Name-Email: ${email}
Expire-Date: 0
%no-protection
%commit
%echo Done
`;

    await Bun.write("/tmp/gpg-key-script", keyScript);
    await run(["gpg", "--batch", "--generate-key", "/tmp/gpg-key-script"]);
    await Bun.spawn(["rm", "/tmp/gpg-key-script"]).exited;

    log.success("GPG key generated");

    // Get new key ID
    const output = await runQuiet(["gpg", "--list-secret-keys", "--keyid-format=long", email]);
    const match = output.match(/sec\s+\w+\/(\w+)/);
    if (match) gpgKeyId = match[1];

    if (gpgKeyId) {
      log.info(`Your GPG key ID: ${gpgKeyId}`);
    }
  }

  // Configure Git
  if (gpgKeyId) {
    log.info("Configuring Git to use GPG signing...");
    const gpgPath = await runQuiet(["which", "gpg"]);
    // Write machine-specific GPG config to local gitconfig (not the shared one)
    const localGitconfig = join(process.env.HOME!, ".gitconfig.local");
    await run(["git", "config", "--file", localGitconfig, "user.signingkey", gpgKeyId]);
    await run(["git", "config", "--file", localGitconfig, "gpg.program", gpgPath.trim()]);
    log.success("Git configured for GPG signing (written to ~/.gitconfig.local)");
  }

  return gpgKeyId;
}

async function uploadToGitHub(sshKeyPath: string, gpgKeyId: string | null, hostname: string, displayName: string) {
  try {
    await run(["gh", "auth", "status", "--hostname", hostname]);
  } catch {
    log.warning(`Not authenticated to ${displayName}`);
    log.info(`To authenticate, run: gh auth login --hostname ${hostname}`);
    return;
  }

  log.success(`Authenticated to ${displayName}`);

  // Upload SSH key
  const pubKeyPath = `${sshKeyPath}.pub`;
  if (existsSync(pubKeyPath)) {
    log.info(`Uploading SSH key to ${displayName}...`);
    try {
      const hostname_label = (await runQuiet(["hostname"])).trim();
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      await run(["gh", "ssh-key", "add", pubKeyPath, "--title", `${hostname_label}-${date}`, "--hostname", hostname]);
      log.success(`SSH key uploaded to ${displayName}`);
    } catch {
      log.warning(`SSH key may already exist on ${displayName}`);
    }
  }

  // Upload GPG key
  if (gpgKeyId) {
    log.info(`Uploading GPG key to ${displayName}...`);
    try {
      await run(["bash", "-c", `gpg --armor --export "${gpgKeyId}" | gh gpg-key add --hostname ${hostname}`]);
      log.success(`GPG key uploaded to ${displayName}`);
    } catch {
      log.warning(`GPG key may already exist on ${displayName}`);
    }
  }
}

async function backupKeys(sshKeyPath: string, gpgKeyId: string | null) {
  const doBackup = await confirm({ message: "Create encrypted backup of your keys?" });
  if (!doBackup) return;

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const backupDir = join(process.env.HOME!, ".dotfiles-backup", `keys-${timestamp}`);
  await run(["mkdir", "-p", backupDir]);
  await run(["chmod", "700", backupDir]);

  if (existsSync(sshKeyPath)) {
    await run(["cp", sshKeyPath, backupDir]);
    await run(["cp", `${sshKeyPath}.pub`, backupDir]);
    log.info("SSH keys backed up");
  }

  if (gpgKeyId) {
    await run(["bash", "-c", `gpg --armor --export-secret-keys "${gpgKeyId}" > "${join(backupDir, "gpg-private-key.asc")}"`]);
    await run(["bash", "-c", `gpg --armor --export "${gpgKeyId}" > "${join(backupDir, "gpg-public-key.asc")}"`]);
    log.info("GPG keys backed up");
  }

  await run(["bash", "-c", `chmod 600 "${backupDir}"/*`]);
  log.success(`Keys backed up to: ${backupDir}`);
  log.warning("IMPORTANT: Store this backup in a secure location (1Password, etc.)");
}

export async function setupKeys(platform: Platform) {
  log.step("Setting up GPG & SSH keys");

  await ensureDeps(platform);
  await configureGPGAgent(platform);

  const sshKeyPath = await setupSSH(platform);
  const gpgKeyId = await setupGPG();

  // GitHub integration
  const uploadPersonal = await confirm({ message: "Upload keys to github.com?" });
  if (uploadPersonal) {
    await uploadToGitHub(sshKeyPath, gpgKeyId, "github.com", "GitHub.com");
  }

  const hasEnterprise = await confirm({ message: "Do you have an enterprise GitHub account?", default: false });
  if (hasEnterprise) {
    const enterpriseHost = await input({ message: "Enter enterprise GitHub hostname (e.g., github.company.com):" });
    if (enterpriseHost) {
      await uploadToGitHub(sshKeyPath, gpgKeyId, enterpriseHost, enterpriseHost);
    }
  }

  // Backup
  await backupKeys(sshKeyPath, gpgKeyId);

  // Summary
  console.log("\n=========================================");
  log.success("Key Setup Complete!");
  console.log("=========================================\n");

  if (existsSync(`${sshKeyPath}.pub`)) {
    console.log("SSH Public Key:");
    console.log("----------------------------------------");
    console.log(await Bun.file(`${sshKeyPath}.pub`).text());
    console.log("----------------------------------------\n");
  }

  console.log("Next steps:");
  console.log("1. If not already done, authenticate with GitHub: gh auth login");
  console.log("2. Test SSH connection: ssh -T git@github.com");
  console.log("3. Test GPG signing: git commit --allow-empty -m 'test signing'");
  console.log("4. Store your backup securely if created\n");
}
