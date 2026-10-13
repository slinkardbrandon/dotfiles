#!/usr/bin/env bun
/**
 * Shared "session ended" sound for both harnesses: the Claude Code Stop hook
 * (claude/settings.json) and the pi stop-sound extension
 * (pi/extensions/stop-sound) both shell out to this script instead of each
 * reimplementing per-platform playback.
 *
 * Plays claude/sounds/stop.wav (a bundled copy of macOS's Funk.aiff) so the
 * sound is identical everywhere, not just "some system default".
 *
 * macOS: afplay plays it directly. WSL: no native audio device, so hop out
 * to Windows via interop (same trick src/theme.ts uses for the Alacritty
 * mirror) — wslpath to a Windows-visible path, then PowerShell's
 * Media.SoundPlayer, which only speaks WAV (hence bundling a .wav, not an
 * .aiff/.mp3). Plain Linux: no audio path, no-op.
 */

import { join } from "node:path";

const SOUND_PATH = join(import.meta.dir, "..", "sounds", "stop.wav");

function isWSL(): boolean {
  try {
    const release = require("fs").readFileSync("/proc/version", "utf8");
    return release.toLowerCase().includes("microsoft");
  } catch {
    return false;
  }
}

async function run(cmd: string[]) {
  try {
    const child = Bun.spawn(cmd, { stdin: "ignore", stdout: "ignore", stderr: "ignore" });
    await child.exited;
  } catch {
    // Missing player/interop isn't worth failing a shutdown/stop hook over.
  }
}

async function runQuiet(cmd: string[]): Promise<string> {
  const child = Bun.spawn(cmd, { stdout: "pipe", stderr: "ignore" });
  const out = await new Response(child.stdout).text();
  await child.exited;
  return out.trim();
}

if (process.platform === "darwin") {
  await run(["afplay", SOUND_PATH]);
} else if (isWSL()) {
  try {
    const windowsPath = await runQuiet(["wslpath", "-w", SOUND_PATH]);
    if (windowsPath) {
      await run([
        "powershell.exe",
        "-c",
        `(New-Object Media.SoundPlayer '${windowsPath}').PlaySync()`,
      ]);
    }
  } catch {
    // wslpath missing or interop disabled — stay quiet, don't break the hook.
  }
}
