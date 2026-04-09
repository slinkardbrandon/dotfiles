#!/usr/bin/env bun
/**
 * Claude Code status line — side-by-side dashboard
 *
 * Left table:  model · CLI version · repo · context bar · rate limits
 * Right table: token burn + water displacement (session / month / all-time)
 *
 * Data files (auto-created):
 *   /tmp/claude-latest-version       hourly npm version cache
 *   /tmp/claude-session-baseline     token baseline (resets on /new)
 *   ~/.claude/session-gallons.json   persistent gallon tracking
 */

import { statSync, readFileSync } from "fs";
import { basename, join } from "path";

// ── Types ────────────────────────────────────────────────────────────────────

interface StatusInput {
  session_id?: string;
  version?: string;
  cwd: string;
  model: { display_name: string };
  context_window: {
    used_percentage?: number;
    total_input_tokens?: number;
    total_output_tokens?: number;
  };
  cost: { total_duration_ms?: number };
  rate_limits: {
    five_hour?: { resets_at?: number; used_percentage?: number };
    seven_day?: { used_percentage?: number };
  };
}

interface SessionBaseline {
  sid: string;
  base_in: number;
  base_out: number;
}

interface GallonEntry {
  tok_k: number;
  cents: number;
  month: string;
}

interface GallonStore {
  sessions: Record<string, GallonEntry>;
  totals: {
    month: string;
    month_tok: number;
    month_cents: number;
    all_tok: number;
    all_cents: number;
  };
}

// ── ANSI helpers (raw codes — no chalk import for startup speed) ─────────────

const ESC = "\x1b";
const R = `${ESC}[0m`;
const DIM = `${ESC}[2m`;

const ansi = {
  dim: (s: string) => `${DIM}${s}${R}`,
  green: (s: string) => `${ESC}[32m${s}${R}`,
  yellow: (s: string) => `${ESC}[33m${s}${R}`,
  red: (s: string) => `${ESC}[31m${s}${R}`,
  teal: (s: string) => `${ESC}[38;5;43m${s}${R}`,
  water: (s: string) => `${ESC}[38;5;39m${s}${R}`,
  lightRed: (s: string) => `${ESC}[91m${s}${R}`,
  orange: (s: string) => `${ESC}[38;5;208m${s}${R}`,
  boldRed: (s: string) => `${ESC}[1;31m${s}${R}`,
};

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*[mK]/g, "");
}

function visWidth(s: string): number {
  const clean = stripAnsi(s);
  let w = 0;
  for (const ch of clean) {
    w += (ch.codePointAt(0)! >= 0x10000) ? 2 : 1;
  }
  return w;
}

// ── Formatting ───────────────────────────────────────────────────────────────

function hrule(n: number): string {
  return "─".repeat(n);
}

function colorPct(remaining: number): string {
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

function heatColor(tokK: number): (s: string) => string {
  if (tokK >= 200) return ansi.boldRed;
  if (tokK >= 100) return ansi.lightRed;
  if (tokK >= 50) return ansi.orange;
  return ansi.yellow;
}

// Format token count: 545k or 546M (integer math only)
function fmtTok(tokK: number): string {
  if (tokK >= 1000) {
    const whole = Math.floor(tokK / 1000);
    const frac = Math.floor((tokK % 1000) / 100); // one decimal
    return frac > 0 ? `${whole}.${frac}M` : `${whole}M`;
  }
  return `${tokK}k`;
}

// Format gallon-cents as "X.XX gal" (no floating point)
function fmtGal(cents: number): string {
  const whole = Math.floor(cents / 100);
  const frac = cents % 100;
  // Comma-separate the whole part for readability
  return `~${whole.toLocaleString()}.${String(frac).padStart(2, "0")} gal`;
}

// ── Table rendering ──────────────────────────────────────────────────────────

function mkSplit(left: string, width: number, right: string): string {
  const wl = visWidth(left);
  const wr = visWidth(right);
  const pad = Math.max(1, width - wl - wr);
  return `${DIM}│${R} ${left}${" ".repeat(pad)}${right} ${DIM}│${R}`;
}

// ── Git ──────────────────────────────────────────────────────────────────────

function getGitBranch(cwd: string): string | null {
  try {
    const r = Bun.spawnSync(
      ["git", "-C", cwd, "--no-optional-locks", "symbolic-ref", "--short", "HEAD"],
      { stdout: "pipe", stderr: "pipe" },
    );
    return r.exitCode === 0 ? r.stdout.toString().trim() : null;
  } catch {
    return null;
  }
}

// ── Version check ────────────────────────────────────────────────────────────

function checkVersion(current: string): string {
  const file = "/tmp/claude-latest-version";

  // Background refresh if stale (>60 min) or missing
  let needsRefresh = true;
  try {
    const age = (Date.now() - statSync(file).mtimeMs) / 60_000;
    if (age < 60) needsRefresh = false;
  } catch {}

  if (needsRefresh) {
    Bun.spawn(["sh", "-c", `npm view @anthropic-ai/claude-code version --json 2>/dev/null | tr -d '"' > "${file}"`]);
  }

  try {
    const latest = readFileSync(file, "utf8").trim();
    if (latest && latest !== current) return ansi.yellow(`(CLI v${current} ✘)`);
    return ansi.teal(`(CLI v${current} ✓)`);
  } catch {
    return ansi.dim(`(CLI v${current})`);
  }
}

// ── Session baseline (resets on /new) ────────────────────────────────────────

const BASELINE_FILE = "/tmp/claude-session-baseline";

function getSessionTokens(
  sessionId: string,
  rawIn: number,
  rawOut: number,
): { sessionIn: number; sessionOut: number } {
  let baseIn = 0;
  let baseOut = 0;

  try {
    const data: SessionBaseline = JSON.parse(readFileSync(BASELINE_FILE, "utf8"));
    if (data.sid === sessionId) {
      baseIn = data.base_in;
      baseOut = data.base_out;
    } else {
      throw "new session";
    }
  } catch {
    baseIn = rawIn;
    baseOut = rawOut;
    Bun.write(
      BASELINE_FILE,
      JSON.stringify({ sid: sessionId, base_in: baseIn, base_out: baseOut }),
    );
  }

  return {
    sessionIn: Math.max(0, rawIn - baseIn),
    sessionOut: Math.max(0, rawOut - baseOut),
  };
}

// ── Gallon tracking ──────────────────────────────────────────────────────────

const GALLONS_FILE = join(process.env.HOME!, ".claude", "session-gallons.json");

/**
 * Convert token count (in thousands) to gallon-cents (100 = 1 gallon).
 *
 * Based on inference-only water consumption estimates of ~0.5–1ml per 1k tokens
 * for data center cooling. We use 0.75ml/1k as a midpoint.
 *
 * The commonly cited "500ml per query" figure (Li et al. 2023,
 * https://arxiv.org/abs/2304.03271) includes training cost amortization
 * and was benchmarked against GPT-3/4 infrastructure — not representative
 * of modern inference-only workloads.
 *
 * Math: 0.75ml per 1k tokens → gallons = tokK * 0.75 / 3785.41
 * In integer gallon-cents: tokK * 75 / 3785, scaled to avoid FP.
 */
function tokToGalCents(tokK: number): number {
  // 0.75ml = 0.75/3785.41 gal per 1k tokens
  // In cents: (tokK * 0.75 * 100) / 3785.41 ≈ tokK * 75 / 3785
  return Math.round((tokK * 75) / 3785);
}

function updateGallons(
  sessionId: string,
  sessTok: number,
  sessCents: number,
): { monthTok: number; monthCents: number; allTok: number; allCents: number } {
  const curMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

  let store: GallonStore;
  try {
    store = JSON.parse(readFileSync(GALLONS_FILE, "utf8"));
    if (!store.sessions || !store.totals) throw "malformed";
  } catch {
    store = {
      sessions: {},
      totals: { month: curMonth, month_tok: 0, month_cents: 0, all_tok: 0, all_cents: 0 },
    };
  }

  // Compute delta from previous value for this session
  const prev = store.sessions[sessionId];
  const prevTok = prev?.tok_k ?? 0;
  const prevCents = prev?.cents ?? 0;
  const dTok = sessTok - prevTok;
  const dCents = sessCents - prevCents;

  // Keep only current session (others already baked into totals)
  store.sessions = { [sessionId]: { tok_k: sessTok, cents: sessCents, month: curMonth } };

  // Reset month totals on month rollover
  if (store.totals.month !== curMonth) {
    store.totals.month = curMonth;
    store.totals.month_tok = 0;
    store.totals.month_cents = 0;
  }

  // Apply delta to totals
  store.totals.all_tok += dTok;
  store.totals.all_cents += dCents;
  store.totals.month_tok += dTok;
  store.totals.month_cents += dCents;

  // Atomic write
  Bun.write(GALLONS_FILE, JSON.stringify(store));

  return {
    monthTok: store.totals.month_tok,
    monthCents: store.totals.month_cents,
    allTok: store.totals.all_tok,
    allCents: store.totals.all_cents,
  };
}

// ── Build burn line (column-aligned) ─────────────────────────────────────────

function mkBurnLine(
  tok: number,
  cents: number,
  tokColW: number,
  galColW: number,
): string {
  tok = Math.max(0, tok);
  cents = Math.max(0, cents);
  const tokStr = fmtTok(tok).padStart(tokColW);
  const galStr = fmtGal(cents).padStart(galColW);
  return `🔥 ${heatColor(tok)(tokStr)} I/O tokens  💧 ${ansi.water(galStr)}`;
}

// ── Main ─────────────────────────────────────────────────────────────────────

let input: StatusInput;
try {
  input = await Bun.stdin.json();
} catch (e) {
  console.error(`statusline: failed to parse stdin: ${e}`);
  process.exit(1);
}

const dirName = basename(input.cwd);
const branch = getGitBranch(input.cwd);

// -- Line 1: identity --
const versionStr = input.version ? checkVersion(input.version) : "";
const line1Left = [ansi.green(`[${input.model.display_name}]`), versionStr]
  .filter(Boolean)
  .join(" ");
const line1Right = [
  `📁 ${dirName}`,
  branch ? ` 🌿 ${branch}` : "",
].join("");

// -- Line 2 left: context bar + elapsed --
let line2Left = "";
if (input.context_window.used_percentage != null) {
  const pct = Math.round(input.context_window.used_percentage);
  const barColor = pct >= 80 ? ansi.red : pct >= 50 ? ansi.yellow : ansi.green;
  const filled = Math.floor((pct * 20) / 100);
  const empty = 20 - filled;
  const bar = barColor("█".repeat(filled)) + ansi.dim("░".repeat(empty));
  line2Left = `${bar} ${barColor(`${pct}%`)} ${ansi.dim("ctx")}`;
}

if (input.cost.total_duration_ms != null) {
  const elapsed = fmtElapsed(input.cost.total_duration_ms);
  line2Left = line2Left
    ? `${line2Left} ${ansi.dim(`· ${elapsed}`)}`
    : elapsed;
}

// -- Line 2 right: rate limits + reset --
let line2Right = "";
if (input.rate_limits.five_hour?.used_percentage != null) {
  const h5Left = 100 - Math.round(input.rate_limits.five_hour.used_percentage);

  let resetStr = "";
  if (input.rate_limits.five_hour.resets_at) {
    const secsUntil = input.rate_limits.five_hour.resets_at - Math.floor(Date.now() / 1000);
    if (secsUntil > 0) {
      const rh = Math.floor(secsUntil / 3600);
      const rm = Math.floor((secsUntil % 3600) / 60);
      resetStr = rh > 0
        ? ansi.dim(` ↺${rh}h${rm}m`)
        : ansi.dim(` ↺${rm}m`);
    }
  }

  line2Right = `5h: ${colorPct(h5Left)}${resetStr}`;

  if (input.rate_limits.seven_day?.used_percentage != null) {
    const wkLeft = 100 - Math.round(input.rate_limits.seven_day.used_percentage);
    line2Right += ` ${ansi.dim("·")} 7d: ${colorPct(wkLeft)}`;
  }
}

// -- Session tokens --
let sessionIn = 0;
let sessionOut = 0;
const rawIn = input.context_window.total_input_tokens ?? 0;
const rawOut = input.context_window.total_output_tokens ?? 0;

if (rawIn > 0 && rawOut > 0 && input.session_id) {
  ({ sessionIn, sessionOut } = getSessionTokens(input.session_id, rawIn, rawOut));
}

// -- Burn data --
const hasBurn = rawIn > 0 || rawOut > 0;
let sessTok = 0, sessCents = 0;
let monthTok = 0, monthCents = 0, allTok = 0, allCents = 0;

if (hasBurn) {
  sessTok = Math.floor((sessionIn + sessionOut) / 1000);
  sessCents = tokToGalCents(sessTok);

  if (input.session_id) {
    ({ monthTok, monthCents, allTok, allCents } =
      updateGallons(input.session_id, sessTok, sessCents));
  }
}

// -- Compute main table inner width --
const w1 = visWidth(line1Left) + visWidth(line1Right) + 3;
const w2 = visWidth(line2Left) + visWidth(line2Right) + (line2Right ? 3 : 0);
const inner = Math.max(w1, w2) + 2;

// Rebuild with correct width
const mainLines = [
  mkSplit(line1Left, inner, line1Right),
  mkSplit(line2Left, inner, line2Right),
];

if (hasBurn) {
  // Column widths for alignment (measure formatted strings, not raw numbers)
  const tokColW = Math.max(...[sessTok, monthTok, allTok].map((n) => fmtTok(Math.max(0, n)).length));
  const galColW = Math.max(...[sessCents, monthCents, allCents].map((n) => fmtGal(Math.max(0, n)).length));

  const bcSess = mkBurnLine(sessTok, sessCents, tokColW, galColW);
  const bcMonth = mkBurnLine(monthTok, monthCents, tokColW, galColW);
  const bcAll = mkBurnLine(allTok, allCents, tokColW, galColW);

  const blSess = ansi.dim("this session");
  const blMonth = ansi.dim("this month");
  const blAll = ansi.dim("all-time");

  // Burn table inner width
  const bw1 = visWidth(bcSess) + visWidth(blSess) + 3;
  const bw2 = visWidth(bcMonth) + visWidth(blMonth) + 3;
  const bw3 = visWidth(bcAll) + visWidth(blAll) + 3;
  const rbInner = Math.max(bw1, bw2, bw3) + 2;

  const burnLines = [
    mkSplit(bcSess, rbInner, blSess),
    mkSplit(bcMonth, rbInner, blMonth),
    mkSplit(bcAll, rbInner, blAll),
  ];

  // Render side-by-side (both 5 lines: top, content..., bottom)
  const mh = hrule(inner + 2);
  const bh = hrule(rbInner + 2);
  const gap = "    ";

  const mainTop = `${DIM}╭${mh}╮${R}`;
  const mainSep = `${DIM}├${mh}┤${R}`;
  const mainBot = `${DIM}╰${mh}╯${R}`;
  const burnTop = `${DIM}╭${bh}╮${R}`;
  const burnBot = `${DIM}╰${bh}╯${R}`;

  console.log(`${mainTop}${gap}${burnTop}`);
  console.log(`${mainLines[0]}${gap}${burnLines[0]}`);
  console.log(`${mainSep}${gap}${burnLines[1]}`);
  console.log(`${mainLines[1]}${gap}${burnLines[2]}`);
  console.log(`${mainBot}${gap}${burnBot}`);
} else {
  // Main table only
  const mh = hrule(inner + 2);
  console.log(`${DIM}╭${mh}╮${R}`);
  console.log(mainLines[0]);
  console.log(`${DIM}├${mh}┤${R}`);
  console.log(mainLines[1]);
  console.log(`${DIM}╰${mh}╯${R}`);
}
