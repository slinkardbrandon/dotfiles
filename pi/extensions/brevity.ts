/**
 * Brevity reminder: appends ~/dotfiles/agents/brevity.md to the latest user
 * message before every LLM call, so the style rules stay recent instead of
 * fading behind a long session. Not persisted to the session file.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const BREVITY_PATH = join(homedir(), "dotfiles", "agents", "brevity.md");

function loadReminder(): string | undefined {
	try {
		return readFileSync(BREVITY_PATH, "utf8").trim() || undefined;
	} catch {
		return undefined;
	}
}

export default function (pi: ExtensionAPI) {
	pi.on("context", async (event) => {
		const reminder = loadReminder();
		if (!reminder) return;

		const messages = event.messages;
		for (let i = messages.length - 1; i >= 0; i--) {
			const message = messages[i];
			if (message.role !== "user") continue;

			const text = `\n\n<system-reminder>\n${reminder}\n</system-reminder>`;
			if (typeof message.content === "string") message.content += text;
			else message.content.push({ type: "text", text });
			return { messages };
		}
	});
}
