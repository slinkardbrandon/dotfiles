/**
 * Session goal: /goal sets a goal that is injected as a system prompt section
 * on every model request. The goal is persisted as a custom session entry, so
 * it survives quit and `pi --resume`, and stays scoped to its own session.
 */

import type { ExtensionAPI, ExtensionContext, SessionEntry } from "@earendil-works/pi-coding-agent";

const GOAL_ENTRY = "goal";
const FLAG = "⚑ goal";

function readGoalFromEntries(entries: SessionEntry[]): string {
	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i];
		if (entry.type !== "custom" || entry.customType !== GOAL_ENTRY) continue;
		const data = entry.data as { goal?: string } | undefined;
		return data?.goal ?? "";
	}
	return "";
}

export default function (pi: ExtensionAPI) {
	let goal = "";

	function renderWidget(ctx: ExtensionContext) {
		if (!goal) {
			ctx.ui.setWidget(GOAL_ENTRY, undefined);
			return;
		}

		ctx.ui.setWidget(GOAL_ENTRY, (_tui, theme) => ({
			invalidate() {},
			render(width: number): string[] {
				const room = width - FLAG.length - 1;
				const text = goal.length > room ? `${goal.slice(0, Math.max(0, room - 1))}…` : goal;
				return [`${theme.fg("warning", theme.bold(FLAG))} ${theme.fg("dim", text)}`];
			},
		}), { placement: "belowEditor" });
	}

	pi.on("session_start", (_event, ctx) => {
		goal = readGoalFromEntries(ctx.sessionManager.getEntries());
		renderWidget(ctx);
	});

	pi.registerCommand(GOAL_ENTRY, {
		description: "Set, show, or clear the session goal",
		handler: async (args, ctx) => {
			const input = (args ?? "").trim();
			if (!input) {
				ctx.ui.notify(goal ? `Goal: ${goal}` : "No goal set.", "info");
				return;
			}

			goal = input === "clear" ? "" : input;
			pi.appendEntry(GOAL_ENTRY, { goal });
			renderWidget(ctx);
			ctx.ui.notify(goal ? `Goal: ${goal}` : "Goal cleared.", "info");
		},
	});

	pi.on("before_agent_start", (event) => {
		if (goal) {
			event.systemPromptOptions.sections.goal =
				`The user's goal for this session:\n${goal}\n` +
				"Keep every response and action aimed at it. Say so when work drifts off it.";
		} else {
			delete event.systemPromptOptions.sections.goal;
		}
	});
}
