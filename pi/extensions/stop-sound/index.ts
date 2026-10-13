/**
 * Play a sound when a pi turn ends and pi is awaiting input, mirroring the
 * Claude Code Stop hook in claude/settings.json (which fires per-turn, not
 * at session end). Both shell out to the same script
 * (claude/hooks/play-sound.ts) so the platform logic lives in one place.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { join } from "node:path";

const HOME = process.env.HOME ?? "";
const PLAY_SOUND_SCRIPT = join(HOME, "dotfiles", "claude", "hooks", "play-sound.ts");

export default function (pi: ExtensionAPI) {
  pi.on("turn_end", async () => {
    try {
      const child = Bun.spawn(["bun", PLAY_SOUND_SCRIPT], {
        stdin: "ignore",
        stdout: "ignore",
        stderr: "ignore",
      });
      child.unref();
    } catch {
      // Missing script/bun isn't worth failing a turn over.
    }
  });
}
