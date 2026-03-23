import { log, run, DOTFILES_DIR } from "./src/utils";
import { setupSymlinks } from "./src/symlinks";
import { commandExists } from "./src/platform";

async function sync() {
  console.log("\n  dotfiles sync\n");

  // Ensure Brewfile packages are installed (fast — skips already-installed)
  if (await commandExists("brew")) {
    log.step("Syncing Homebrew packages");
    try {
      await run(["brew", "bundle", "--file", `${DOTFILES_DIR}/Brewfile`, "--no-upgrade"]);
    } catch {
      log.warning("Some packages may have failed (likely already installed via other means)");
    }
  }

  // Ensure all symlinks are correct
  await setupSymlinks();

  log.success("\nSync complete!");
}

sync().catch((err) => {
  log.error(err.message);
  process.exit(1);
});
