import { log, run, runQuiet } from "./utils";
import { commandExists } from "./platform";

async function defaults(args: string[]) {
  await run(["defaults", ...args]);
}

async function sudoDefaults(args: string[]) {
  await run(["sudo", "defaults", ...args]);
}

export async function applyMacOSDefaults() {
  log.step("Setting macOS defaults");

  // General UI/UX
  log.info("Configuring UI/UX...");
  await run(["sudo", "nvram", "SystemAudioVolume= "]);

  await defaults(["write", "NSGlobalDomain", "NSNavPanelExpandedStateForSaveMode", "-bool", "true"]);
  await defaults(["write", "NSGlobalDomain", "NSNavPanelExpandedStateForSaveMode2", "-bool", "true"]);
  await defaults(["write", "NSGlobalDomain", "PMPrintingExpandedStateForPrint", "-bool", "true"]);
  await defaults(["write", "NSGlobalDomain", "PMPrintingExpandedStateForPrint2", "-bool", "true"]);
  await defaults(["write", "NSGlobalDomain", "NSDocumentSaveNewDocumentsToCloud", "-bool", "false"]);
  await defaults(["write", "com.apple.LaunchServices", "LSQuarantine", "-bool", "false"]);
  await sudoDefaults(["write", "/Library/Preferences/com.apple.loginwindow", "AdminHostInfo", "HostName"]);
  await defaults(["write", "NSGlobalDomain", "NSAutomaticCapitalizationEnabled", "-bool", "false"]);
  await defaults(["write", "NSGlobalDomain", "NSAutomaticDashSubstitutionEnabled", "-bool", "false"]);
  await defaults(["write", "NSGlobalDomain", "NSAutomaticPeriodSubstitutionEnabled", "-bool", "false"]);
  await defaults(["write", "NSGlobalDomain", "NSAutomaticQuoteSubstitutionEnabled", "-bool", "false"]);
  await defaults(["write", "NSGlobalDomain", "NSAutomaticSpellingCorrectionEnabled", "-bool", "false"]);

  // Trackpad, keyboard, input
  log.info("Configuring input devices...");
  await defaults(["write", "com.apple.driver.AppleBluetoothMultitouch.trackpad", "Clicking", "-bool", "true"]);
  await defaults(["-currentHost", "write", "NSGlobalDomain", "com.apple.mouse.tapBehavior", "-int", "1"]);
  await defaults(["write", "NSGlobalDomain", "com.apple.mouse.tapBehavior", "-int", "1"]);
  await defaults(["write", "com.apple.BluetoothAudioAgent", "Apple Bitpool Min (editable)", "-int", "40"]);
  await defaults(["write", "NSGlobalDomain", "AppleKeyboardUIMode", "-int", "3"]);
  await defaults(["write", "NSGlobalDomain", "ApplePressAndHoldEnabled", "-bool", "false"]);
  await defaults(["write", "NSGlobalDomain", "KeyRepeat", "-int", "2"]);
  await defaults(["write", "NSGlobalDomain", "InitialKeyRepeat", "-int", "11"]);

  // Screen
  log.info("Configuring screen...");
  await defaults(["write", "com.apple.screensaver", "askForPassword", "-int", "1"]);
  await defaults(["write", "com.apple.screensaver", "askForPasswordDelay", "-int", "0"]);
  await run(["mkdir", "-p", `${process.env.HOME}/Desktop/Screenshots`]);
  await defaults(["write", "com.apple.screencapture", "location", "-string", `${process.env.HOME}/Desktop/Screenshots`]);
  await defaults(["write", "com.apple.screencapture", "type", "-string", "png"]);
  await defaults(["write", "com.apple.screencapture", "disable-shadow", "-bool", "true"]);

  // Finder
  log.info("Configuring Finder...");
  await defaults(["write", "com.apple.finder", "AppleShowAllFiles", "-bool", "true"]);
  await defaults(["write", "NSGlobalDomain", "AppleShowAllExtensions", "-bool", "true"]);
  await defaults(["write", "com.apple.finder", "ShowStatusBar", "-bool", "true"]);
  await defaults(["write", "com.apple.finder", "ShowPathbar", "-bool", "true"]);
  await defaults(["write", "com.apple.finder", "_FXShowPosixPathInTitle", "-bool", "true"]);
  await defaults(["write", "com.apple.finder", "_FXSortFoldersFirst", "-bool", "true"]);
  await defaults(["write", "com.apple.finder", "FXDefaultSearchScope", "-string", "SCcf"]);
  await defaults(["write", "com.apple.finder", "FXEnableExtensionChangeWarning", "-bool", "false"]);
  await defaults(["write", "com.apple.desktopservices", "DSDontWriteNetworkStores", "-bool", "true"]);
  await defaults(["write", "com.apple.desktopservices", "DSDontWriteUSBStores", "-bool", "true"]);
  await defaults(["write", "com.apple.finder", "FXPreferredViewStyle", "-string", "Nlsv"]);
  await run(["chflags", "nohidden", `${process.env.HOME}/Library`]);
  await run(["sudo", "chflags", "nohidden", "/Volumes"]);

  // Dock
  log.info("Configuring Dock...");
  await defaults(["write", "com.apple.dock", "tilesize", "-int", "48"]);
  await defaults(["write", "com.apple.dock", "magnification", "-bool", "true"]);
  await defaults(["write", "com.apple.dock", "largesize", "-int", "64"]);
  await defaults(["write", "com.apple.dock", "orientation", "-string", "bottom"]);
  await defaults(["write", "com.apple.dock", "minimize-to-application", "-bool", "true"]);
  await defaults(["write", "com.apple.dock", "enable-spring-load-actions-on-all-items", "-bool", "true"]);
  await defaults(["write", "com.apple.dock", "show-process-indicators", "-bool", "true"]);
  await defaults(["write", "com.apple.dock", "launchanim", "-bool", "false"]);
  await defaults(["write", "com.apple.dock", "expose-animation-duration", "-float", "0.1"]);
  await defaults(["write", "com.apple.dock", "autohide-delay", "-float", "0"]);
  await defaults(["write", "com.apple.dock", "autohide-time-modifier", "-float", "0"]);
  await defaults(["write", "com.apple.dock", "autohide", "-bool", "true"]);
  await defaults(["write", "com.apple.dock", "showhidden", "-bool", "true"]);
  await defaults(["write", "com.apple.dock", "show-recents", "-bool", "false"]);

  // Safari
  log.info("Configuring Safari...");
  try {
    await defaults(["write", "com.apple.Safari", "UniversalSearchEnabled", "-bool", "false"]);
    await defaults(["write", "com.apple.Safari", "SuppressSearchSuggestions", "-bool", "true"]);
    await defaults(["write", "com.apple.Safari", "ShowFullURLInSmartSearchField", "-bool", "true"]);
    await defaults(["write", "com.apple.Safari", "IncludeDevelopMenu", "-bool", "true"]);
    await defaults(["write", "com.apple.Safari", "WebKitDeveloperExtrasEnabledPreferenceKey", "-bool", "true"]);
    await defaults(["write", "com.apple.Safari", "com.apple.Safari.ContentPageGroupIdentifier.WebKit2DeveloperExtrasEnabled", "-bool", "true"]);
  } catch {
    log.warning("Some Safari settings could not be applied (Safari may need to be closed)");
  }

  // Terminal
  await defaults(["write", "com.apple.terminal", "StringEncodings", "-array", "4"]);
  await defaults(["write", "com.apple.terminal", "SecureKeyboardEntry", "-bool", "true"]);

  // Activity Monitor
  await defaults(["write", "com.apple.ActivityMonitor", "OpenMainWindow", "-bool", "true"]);
  await defaults(["write", "com.apple.ActivityMonitor", "ShowCategory", "-int", "0"]);
  await defaults(["write", "com.apple.ActivityMonitor", "SortColumn", "-string", "CPUUsage"]);
  await defaults(["write", "com.apple.ActivityMonitor", "SortDirection", "-int", "0"]);

  // Software Update
  await defaults(["write", "com.apple.SoftwareUpdate", "AutomaticCheckEnabled", "-bool", "true"]);
  await defaults(["write", "com.apple.SoftwareUpdate", "ScheduleFrequency", "-int", "1"]);
  await defaults(["write", "com.apple.SoftwareUpdate", "AutomaticDownload", "-int", "1"]);
  await defaults(["write", "com.apple.SoftwareUpdate", "CriticalUpdateInstall", "-int", "1"]);

  // Restart affected apps
  log.info("Restarting affected applications...");
  for (const app of ["Activity Monitor", "cfprefsd", "Dock", "Finder", "Safari", "SystemUIServer"]) {
    try {
      await run(["killall", app]);
    } catch {
      // App may not be running
    }
  }

  log.success("macOS defaults set! Some changes may require a logout/restart.");
}

export async function configureDock() {
  log.step("Configuring Dock");

  if (!(await commandExists("dockutil"))) {
    log.info("Installing dockutil...");
    await run(["brew", "install", "dockutil"]);
  }

  const appsToRemove = [
    "Messages", "Mail", "Maps", "Photos", "FaceTime", "Phone",
    "Calendar", "Contacts", "Reminders", "Notes", "TV", "Music", "News",
    "Safari", "iPhone Mirroring", "Games", "Apps",
  ];

  const coreApps = [
    "Obsidian",
    "Visual Studio Code",
    "Microsoft Teams",
    "Google Chrome",
  ];

  log.info("Removing default bloat...");
  for (const app of appsToRemove) {
    try {
      await run(["dockutil", "--remove", app, "--no-restart"]);
    } catch {
      // App not in dock
    }
  }

  log.info("Adding core apps...");
  for (const app of coreApps) {
    try {
      await runQuiet(["dockutil", "--find", app]);
    } catch {
      try {
        await run(["dockutil", "--add", `/Applications/${app}.app`, "--no-restart"]);
      } catch {
        log.warning(`Couldn't find ${app} in /Applications`);
      }
    }
  }

  await run(["killall", "Dock"]);
  log.success("Dock configured");
}
