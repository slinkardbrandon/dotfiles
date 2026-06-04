/**
 * Pi status line — port of the Claude Code side-by-side dashboard.
 *
 * Left table:  model · Pi version · repo · context bar · turn/cost
 * Right table: token burn + water displacement (session / month / all-time)
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { createRequire } from "node:module";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

interface UsageBucket {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
}

interface GallonEntry extends UsageBucket {
	month: string;
}

interface GallonStore {
	version?: number;
	sessions: Record<string, GallonEntry>;
	totals: {
		month: string;
		monthApi: number;
		monthWater: number;
		allApi: number;
		allWater: number;
	};
}

interface StyleFns {
	dim: (s: string) => string;
	green: (s: string) => string;
	yellow: (s: string) => string;
	red: (s: string) => string;
	teal: (s: string) => string;
	water: (s: string) => string;
	lightRed: (s: string) => string;
	orange: (s: string) => string;
	boldRed: (s: string) => string;
}

const PACKAGE_NAME = "@earendil-works/pi-coding-agent";
const STORE_VERSION = 1;
const CACHE_READ_WEIGHT = 0.1;
const WATER_ML_PER_1K_EFFECTIVE_TOKENS = 0.75;
const ML_PER_GALLON = 3785.41;

let requestRender: (() => void) | undefined;
let turnStartMs: number | undefined;
let lastTurnMs: number | undefined;
let cachedPiVersion: string | null | undefined;

function agentDir(): string {
	return process.env.PI_CODING_AGENT_DIR || join(process.env.HOME || process.env.USERPROFILE || ".", ".pi", "agent");
}

function gallonsFile(): string {
	return join(agentDir(), "session-gallons.json");
}

function hrule(n: number): string {
	return "─".repeat(Math.max(0, n));
}

function colorPct(remaining: number, ansi: StyleFns): string {
	if (remaining <= 25) return ansi.red(`${remaining}%`);
	if (remaining <= 50) return ansi.yellow(`${remaining}%`);
	return ansi.green(`${remaining}%`);
}

function fmtElapsed(ms: number): string {
	const s = Math.floor(ms / 1000);
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	const sec = s % 60;
	if (h > 0) return `${h}h ${m}m`;
	if (m > 0) return `${m}m ${sec}s`;
	return `${sec}s`;
}

function isNewer(a: string, b: string): boolean {
	const pa = a.split(".").map(Number);
	const pb = b.split(".").map(Number);
	for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
		const va = pa[i] ?? 0;
		const vb = pb[i] ?? 0;
		if (va > vb) return true;
		if (va < vb) return false;
	}
	return false;
}

function heatColor(tokK: number, ansi: StyleFns): (s: string) => string {
	if (tokK >= 200) return ansi.boldRed;
	if (tokK >= 100) return ansi.lightRed;
	if (tokK >= 50) return ansi.orange;
	return ansi.yellow;
}

function fmtTok(tokK: number): string {
	if (tokK >= 1000) {
		const whole = Math.floor(tokK / 1000);
		const frac = Math.floor((tokK % 1000) / 100);
		return frac > 0 ? `${whole}.${frac}M` : `${whole}M`;
	}
	return `${tokK}k`;
}

function fmtCompactTokens(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1000000) return `${Math.round(count / 1000)}k`;
	if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
	return `${Math.round(count / 1000000)}M`;
}

function fmtGal(cents: number): string {
	const whole = Math.floor(cents / 100);
	const frac = cents % 100;
	return `~${whole.toLocaleString()}.${String(frac).padStart(2, "0")} gal`;
}

function getPiVersion(): string | null {
	if (cachedPiVersion !== undefined) return cachedPiVersion;

	try {
		const require = createRequire(import.meta.url);
		const pkgPath = require.resolve(`${PACKAGE_NAME}/package.json`);
		cachedPiVersion = JSON.parse(readFileSync(pkgPath, "utf8")).version ?? null;
		return cachedPiVersion ?? null;
	} catch {}

	try {
		const result = spawnSync("pi", ["--version"], { encoding: "utf8", timeout: 1000 });
		cachedPiVersion = result.status === 0 ? (result.stdout.match(/\d+\.\d+\.\d+/)?.[0] ?? null) : null;
		return cachedPiVersion ?? null;
	} catch {
		cachedPiVersion = null;
		return null;
	}
}

function checkVersion(current: string, ansi: StyleFns): string {
	const file = join(tmpdir(), "pi-latest-version");

	let needsRefresh = true;
	try {
		const ageMinutes = (Date.now() - statSync(file).mtimeMs) / 60_000;
		if (ageMinutes < 60) needsRefresh = false;
	} catch {}

	if (needsRefresh) {
		spawn(
			"sh",
			["-c", `npm view ${PACKAGE_NAME} version --json --registry https://registry.npmjs.org 2>/dev/null | tr -d '\"' > ${JSON.stringify(file)}`],
			{ detached: true, stdio: "ignore" },
		).unref();
	}

	try {
		const latest = readFileSync(file, "utf8").trim();
		if (latest && isNewer(latest, current)) {
			return ansi.yellow(`(Pi v${current} ✘ → ${latest})`) + ansi.dim(" [pi update --self]");
		}
		return ansi.teal(`(Pi v${current} ✓)`);
	} catch {
		return ansi.dim(`(Pi v${current})`);
	}
}

function computeWaterCents(bucket: UsageBucket): number {
	const effectiveK = (bucket.input + bucket.cacheWrite + bucket.cacheRead * CACHE_READ_WEIGHT + bucket.output) / 1000;
	return Math.round((effectiveK * WATER_ML_PER_1K_EFFECTIVE_TOKENS * 100) / ML_PER_GALLON);
}

function apiK(bucket: UsageBucket): number {
	return Math.floor((bucket.input + bucket.output + bucket.cacheRead + bucket.cacheWrite) / 1000);
}

function zeroUsage(): UsageBucket {
	return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
}

function getSessionUsage(ctx: ExtensionContext): UsageBucket {
	const usage = zeroUsage();
	for (const entry of ctx.sessionManager.getEntries()) {
		if (entry.type === "message" && entry.message.role === "assistant") {
			const message = entry.message as AssistantMessage;
			usage.input += message.usage.input;
			usage.output += message.usage.output;
			usage.cacheRead += message.usage.cacheRead;
			usage.cacheWrite += message.usage.cacheWrite;
			usage.cost += message.usage.cost.total;
		}
	}
	return usage;
}

function readGallonStore(curMonth: string): GallonStore {
	try {
		const store = JSON.parse(readFileSync(gallonsFile(), "utf8")) as GallonStore;
		if (!store.sessions || !store.totals) throw new Error("malformed");
		if ((store.version ?? 0) < STORE_VERSION) throw new Error("old");
		return store;
	} catch {
		return {
			version: STORE_VERSION,
			sessions: {},
			totals: { month: curMonth, monthApi: 0, monthWater: 0, allApi: 0, allWater: 0 },
		};
	}
}

function updateGallons(sessionId: string, usage: UsageBucket): {
	sessApiK: number;
	sessWater: number;
	monthApiK: number;
	monthWater: number;
	allApiK: number;
	allWater: number;
} {
	const curMonth = new Date().toISOString().slice(0, 7);
	const store = readGallonStore(curMonth);

	if (store.totals.month !== curMonth) {
		store.totals.month = curMonth;
		store.totals.monthApi = 0;
		store.totals.monthWater = 0;
	}

	const prev = store.sessions[sessionId];
	const prevUsage: UsageBucket = prev ?? zeroUsage();
	const sessApiK = apiK(usage);
	const sessWater = computeWaterCents(usage);
	const prevApiK = apiK(prevUsage);
	const prevWater = computeWaterCents(prevUsage);

	store.sessions[sessionId] = { ...usage, month: curMonth };
	store.totals.monthApi += sessApiK - prevApiK;
	store.totals.monthWater += sessWater - prevWater;
	store.totals.allApi += sessApiK - prevApiK;
	store.totals.allWater += sessWater - prevWater;

	try {
		mkdirSync(dirname(gallonsFile()), { recursive: true });
		writeFileSync(gallonsFile(), JSON.stringify(store));
	} catch {}

	return {
		sessApiK,
		sessWater,
		monthApiK: store.totals.monthApi,
		monthWater: store.totals.monthWater,
		allApiK: store.totals.allApi,
		allWater: store.totals.allWater,
	};
}

function splitLine(left: string, totalWidth: number, right: string, ansi: StyleFns): string {
	const inner = Math.max(1, totalWidth - 4);
	let l = left;
	let r = right;
	let available = inner - 1;

	if (visibleWidth(l) + visibleWidth(r) > available) {
		const rightBudget = Math.max(0, Math.min(visibleWidth(r), Math.floor(available / 2)));
		r = truncateToWidth(r, rightBudget, "");
		available = inner - 1 - visibleWidth(r);
		l = truncateToWidth(l, Math.max(0, available), ansi.dim("…"));
	}

	const pad = Math.max(1, inner - visibleWidth(l) - visibleWidth(r));
	return `${ansi.dim("│")} ${l}${" ".repeat(pad)}${r} ${ansi.dim("│")}`;
}

function desiredSplitWidth(pairs: Array<[string, string]>): number {
	return Math.max(10, ...pairs.map(([left, right]) => visibleWidth(left) + visibleWidth(right) + 5));
}

function buildBox(pairs: Array<[string, string]>, width: number, ansi: StyleFns, separatorAfterFirst = false): string[] {
	const boxWidth = Math.max(10, width);
	const h = hrule(boxWidth - 2);
	const lines = [`${ansi.dim("╭")}${ansi.dim(h)}${ansi.dim("╮")}`];
	pairs.forEach(([left, right], index) => {
		lines.push(splitLine(left, boxWidth, right, ansi));
		if (separatorAfterFirst && index === 0) lines.push(`${ansi.dim("├")}${ansi.dim(h)}${ansi.dim("┤")}`);
	});
	lines.push(`${ansi.dim("╰")}${ansi.dim(h)}${ansi.dim("╯")}`);
	return lines;
}

function burnLine(api: number, cents: number, apiColW: number, galColW: number, ansi: StyleFns): string {
	api = Math.max(0, api);
	cents = Math.max(0, cents);
	const apiStr = fmtTok(api).padStart(apiColW);
	const galStr = fmtGal(cents).padStart(galColW);
	return `⚡ ${heatColor(api, ansi)(apiStr)} tokens  💧 ${ansi.water(galStr)}`;
}

function renderStatus(ctx: ExtensionContext, footerData: { getGitBranch(): string | null }, width: number, ansi: StyleFns): string[] {
	const cwdName = basename(ctx.cwd);
	const branch = footerData.getGitBranch();
	const usage = getSessionUsage(ctx);
	const hasBurn = apiK(usage) > 0;
	const currentVersion = getPiVersion();
	const versionStr = currentVersion ? checkVersion(currentVersion, ansi) : ansi.dim("(Pi)");
	const modelName = ctx.model?.name || ctx.model?.id || "no model";

	const line1Left = [ansi.green(`[${modelName}]`), versionStr].filter(Boolean).join(" ");
	const line1Right = [`📁 ${cwdName}`, branch ? ` 🌿 ${branch}` : ""].join("");

	const context = ctx.getContextUsage();
	let line2Left = "";
	if (context?.percent != null) {
		const pct = Math.round(context.percent);
		const barColor = pct >= 80 ? ansi.red : pct >= 50 ? ansi.yellow : ansi.green;
		const filled = Math.floor((pct * 20) / 100);
		const bar = barColor("█".repeat(filled)) + ansi.dim("░".repeat(20 - filled));
		line2Left = `${bar} ${barColor(`${pct}%`)} ${ansi.dim("ctx")}`;
	} else if (context?.contextWindow) {
		line2Left = `${ansi.dim("░".repeat(20))} ${ansi.dim(`?/${fmtCompactTokens(context.contextWindow)} ctx`)}`;
	}

	const elapsedMs = turnStartMs ? Date.now() - turnStartMs : lastTurnMs;
	if (elapsedMs != null) {
		line2Left = line2Left ? `${line2Left} ${ansi.dim(`· ${fmtElapsed(elapsedMs)}`)}` : fmtElapsed(elapsedMs);
	}

	const cost = usage.cost > 0 ? `$${usage.cost.toFixed(3)}` : "";
	const contextRemaining = context?.percent == null ? undefined : 100 - Math.round(context.percent);
	const line2Right = [
		cost,
		contextRemaining == null ? "" : `left: ${colorPct(contextRemaining, ansi)}`,
	].filter(Boolean).join(` ${ansi.dim("·")} `);

	const mainPairs: Array<[string, string]> = [[line1Left, line1Right], [line2Left, line2Right]];
	const desiredMainWidth = desiredSplitWidth(mainPairs);

	if (!hasBurn) return buildBox(mainPairs, Math.min(width, desiredMainWidth), ansi, true);

	const gallons = updateGallons(ctx.sessionManager.getSessionId(), usage);
	const apiColW = Math.max(...[gallons.sessApiK, gallons.monthApiK, gallons.allApiK].map((n) => fmtTok(Math.max(0, n)).length));
	const galColW = Math.max(...[gallons.sessWater, gallons.monthWater, gallons.allWater].map((n) => fmtGal(Math.max(0, n)).length));
	const burnPairs: Array<[string, string]> = [
		[burnLine(gallons.sessApiK, gallons.sessWater, apiColW, galColW, ansi), ansi.dim("this session")],
		[burnLine(gallons.monthApiK, gallons.monthWater, apiColW, galColW, ansi), ansi.dim("this month")],
		[burnLine(gallons.allApiK, gallons.allWater, apiColW, galColW, ansi), ansi.dim("all-time")],
	];
	const desiredBurnWidth = desiredSplitWidth(burnPairs);
	const gap = "    ";

	if (desiredMainWidth + visibleWidth(gap) + desiredBurnWidth <= width) {
		const main = buildBox(mainPairs, desiredMainWidth, ansi, true);
		const burn = buildBox(burnPairs, desiredBurnWidth, ansi);
		return main.map((line, i) => `${line}${gap}${burn[i] ?? ""}`);
	}

	return [
		...buildBox(mainPairs, Math.min(width, desiredMainWidth), ansi, true),
		...buildBox(burnPairs, Math.min(width, desiredBurnWidth), ansi),
	];
}

export default function (pi: ExtensionAPI) {
	function installFooter(ctx: ExtensionContext) {
		ctx.ui.setFooter((tui, theme, footerData) => {
			requestRender = () => tui.requestRender();
			const ansi: StyleFns = {
				dim: (s) => theme.fg("dim", s),
				green: (s) => theme.fg("success", s),
				yellow: (s) => theme.fg("warning", s),
				red: (s) => theme.fg("error", s),
				teal: (s) => theme.fg("accent", s),
				water: (s) => theme.fg("accent", s),
				lightRed: (s) => theme.fg("error", s),
				orange: (s) => theme.fg("warning", s),
				boldRed: (s) => theme.fg("error", theme.bold(s)),
			};

			return {
				dispose() {
					requestRender = undefined;
				},
				invalidate() {},
				render(width: number): string[] {
					return renderStatus(ctx, footerData, width, ansi);
				},
			};
		});
	}

	pi.on("session_start", async (_event, ctx) => {
		installFooter(ctx);
	});

	pi.on("turn_start", async () => {
		turnStartMs = Date.now();
		requestRender?.();
	});

	pi.on("turn_end", async () => {
		if (turnStartMs) lastTurnMs = Date.now() - turnStartMs;
		turnStartMs = undefined;
		requestRender?.();
	});

	pi.on("message_end", async () => {
		requestRender?.();
	});

	pi.on("model_select", async () => {
		requestRender?.();
	});
}
