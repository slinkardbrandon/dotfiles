import { log, run, runQuiet } from "./utils";
import { type Platform, commandExists } from "./platform";

export async function setupFish(platform: Platform) {
  log.step("Setting up Fish shell");

  // Check if fish is installed
  if (!(await commandExists("fish"))) {
    log.info("Fish not found, installing...");
    if (platform === "macos") {
      await run(["brew", "install", "fish"]);
    } else {
      await run([
        "bash",
        "-c",
        "sudo apt-add-repository -y ppa:fish-shell/release-3 && sudo apt update && sudo apt install -y fish",
      ]);
    }
  }

  const fishPath = (await runQuiet(["which", "fish"])).trim();
  log.info(`Fish shell found at: ${fishPath}`);

  // Add fish to allowed shells if not already there
  const shells = await Bun.file("/etc/shells").text();
  if (!shells.includes(fishPath)) {
    log.info("Adding Fish to /etc/shells...");
    await run(["bash", "-c", `echo "${fishPath}" | sudo tee -a /etc/shells`]);
    log.success("Fish added to allowed shells");
  } else {
    log.success("Fish already in /etc/shells");
  }

  // Set fish as default shell
  const currentShell = process.env.SHELL;
  if (currentShell !== fishPath) {
    log.info("Setting Fish as default shell...");
    await run(["chsh", "-s", fishPath]);
    log.success("Fish is now the default shell");
  } else {
    log.success("Fish is already the default shell");
  }

  log.success("Fish shell setup complete");
}
