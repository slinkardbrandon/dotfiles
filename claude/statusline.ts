#!/usr/bin/env bun
/**
 * Claude Code status line — side-by-side dashboard
 *
 * Left table:  model · CLI version · repo · context bar · rate limits
 * Right table: token burn + water displacement (session / month / all-time)
 *
 * Data files (auto-created):
 *   /tmp/claude-latest-version       hourly npm version cache
 *   ~/.claude/session-gallons.json   persistent gallon tracking (cache-weighted water)
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
    current_usage?: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens: number;
      cache_read_input_tokens: number;
    };
  };
  cost: { total_duration_ms?: number };
  rate_limits: {
    five_hour?: { resets_at?: number; used_percentage?: number };
    seven_day?: { used_percentage?: number };
  };
}

interface GallonEntry {
  total_in: number;      // API total_input_tokens (for delta detection)
  total_out: number;     // API total_output_tokens
  io_k: number;          // total I/O in thousands (for display)
  compute_in: number;    // accumulated non-cached input tokens
  cache_create: number;  // accumulated cache creation tokens
  cache_read: number;    // accumulated cache read tokens
  output: number;        // accumulated output tokens
  month: string;
}

interface GallonStore {
  version?: number;
  sessions: Record<string, GallonEntry>;
  totals: {
    month: string;
    month_io: number;     // total I/O in K (manager metric)
    month_api: number;    // actual API throughput in K (matches /stats)
    month_water: number;  // water gallon-cents (cache-weighted)
    all_io: number;
    all_api: number;
    all_water: number;
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

function getUpgradeCommand(): string {
  try {
    const r = Bun.spawnSync(["which", "claude"], { stdout: "pipe" });
    const path = r.stdout.toString().trim();
    // Resolve symlink to detect standalone installer
    const resolved = Bun.spawnSync(["readlink", path], { stdout: "pipe" })
      .stdout.toString().trim() || path;
    if (resolved.includes(".local/share/claude/versions")) {
      return "curl -fsSL https://claude.ai/install.sh | sh";
    }
    if (path.includes("/homebrew/") || path.includes("/Cellar/")) {
      return "brew upgrade claude";
    }
  } catch {}
  return "npm install -g @anthropic-ai/claude-code";
}

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
    if (latest && latest !== current) {
      const cmd = getUpgradeCommand();
      return ansi.yellow(`(v${current} ✘ → ${latest})`) + ansi.dim(` [${cmd}]`);
    }
    return ansi.teal(`(CLI v${current} ✓)`);
  } catch {
    return ansi.dim(`(CLI v${current})`);
  }
}

// ── Transcript scanning (one-time migration) ────────────────────────────────

interface TranscriptTotals {
  compute_in: number;
  cache_create: number;
  cache_read: number;
  output: number;
}

function scanTranscripts(curMonth: string): { all: TranscriptTotals; month: TranscriptTotals } {
  const all: TranscriptTotals = { compute_in: 0, cache_create: 0, cache_read: 0, output: 0 };
  const month: TranscriptTotals = { compute_in: 0, cache_create: 0, cache_read: 0, output: 0 };
  const dir = join(process.env.HOME!, ".claude", "projects");

  try {
    const r = Bun.spawnSync(["find", dir, "-name", "*.jsonl", "-type", "f"], { stdout: "pipe" });
    const files = r.stdout.toString().trim().split("\n").filter(Boolean);

    for (const file of files) {
      try {
        const fileMonth = new Date(statSync(file).mtimeMs).toISOString().slice(0, 7);
        const target = fileMonth === curMonth ? month : null;
        const lines = readFileSync(file, "utf8").split("\n");

        for (const line of lines) {
          if (!line.includes('"usage"')) continue;
          try {
            const usage = JSON.parse(line)?.message?.usage;
            if (!usage) continue;
            const inp = usage.input_tokens ?? 0;
            const out = usage.output_tokens ?? 0;
            const cc = usage.cache_creation_input_tokens ?? 0;
            const cr = usage.cache_read_input_tokens ?? 0;
            all.compute_in += inp; all.cache_create += cc;
            all.cache_read += cr;  all.output += out;
            if (target) {
              target.compute_in += inp; target.cache_create += cc;
              target.cache_read += cr;  target.output += out;
            }
          } catch {}
        }
      } catch {}
    }
  } catch {}

  return { all, month };
}

// ── Gallon tracking ──────────────────────────────────────────────────────────

const GALLONS_FILE = join(process.env.HOME!, ".claude", "session-gallons.json");

/**
 * Cache-aware water consumption estimate (returns gallon-cents, 100 = 1 gallon).
 *
 * Based on inference-only estimates of ~0.75ml per 1k tokens for full GPU
 * compute (Li et al. 2023, https://arxiv.org/abs/2304.03271 — adjusted for
 * modern inference-only workloads, excluding training amortization).
 *
 * Cache reads are memory lookups, not full inference — ~10% of the compute
 * (and cooling water) of processing tokens through all transformer layers.
 * This aligns with Anthropic's ~90% billing discount on cache reads.
 *
 * Math: effective_tokens * 0.75ml / 3785.41ml per gallon, scaled to cents.
 */
const CACHE_READ_WEIGHT = 0.1;

function computeWaterCents(b: {
  compute_in: number;
  cache_create: number;
  cache_read: number;
  output: number;
}): number {
  const effectiveK =
    (b.compute_in + b.cache_create + b.cache_read * CACHE_READ_WEIGHT + b.output) / 1000;
  return Math.round((effectiveK * 75) / 3785);
}

function updateGallons(
  sessionId: string,
  totalIn: number,
  totalOut: number,
  currentUsage?: StatusInput["context_window"]["current_usage"],
): {
  sessApiK: number; sessWater: number;
  monthApiK: number; monthWater: number;
  allApiK: number; allWater: number;
} {
  const curMonth = new Date().toISOString().slice(0, 7);

  const STORE_VERSION = 5;

  let store: GallonStore;
  try {
    store = JSON.parse(readFileSync(GALLONS_FILE, "utf8"));
    if (!store.sessions || !store.totals) throw "malformed";

    if ((store.version ?? 0) < STORE_VERSION) {
      // v5: scan all session transcripts for accurate historical data
      // Replaces all previous estimation/migration logic
      const hist = scanTranscripts(curMonth);

      const toApiK = (t: TranscriptTotals) =>
        Math.floor((t.compute_in + t.cache_create + t.cache_read + t.output) / 1000);

      store.totals = {
        month: curMonth,
        month_io: 0,
        month_api: toApiK(hist.month),
        month_water: computeWaterCents(hist.month),
        all_io: 0,
        all_api: toApiK(hist.all),
        all_water: computeWaterCents(hist.all),
      };
      store.sessions = {};
      store.version = STORE_VERSION;
    }
  } catch {
    store = {
      version: STORE_VERSION,
      sessions: {},
      totals: { month: curMonth, month_io: 0, month_api: 0, month_water: 0, all_io: 0, all_api: 0, all_water: 0 },
    };
  }

  // Previous session state (or defaults for new session)
  const prev = store.sessions[sessionId];
  let computeIn = prev?.compute_in ?? 0;
  let cacheCreate = prev?.cache_create ?? 0;
  let cacheRead = prev?.cache_read ?? 0;
  let output = prev?.output ?? 0;

  // Accumulate current_usage when a new turn is detected
  const prevTotal = (prev?.total_in ?? 0) + (prev?.total_out ?? 0);
  const currTotal = totalIn + totalOut;
  if (currTotal !== prevTotal && currentUsage) {
    computeIn += currentUsage.input_tokens;
    cacheCreate += currentUsage.cache_creation_input_tokens;
    cacheRead += currentUsage.cache_read_input_tokens;
    output += currentUsage.output_tokens;
  }

  // Session values
  const sessApiK = Math.floor((computeIn + cacheCreate + cacheRead + output) / 1000);
  const sessBreakdown = { compute_in: computeIn, cache_create: cacheCreate, cache_read: cacheRead, output };
  const sessWater = computeWaterCents(sessBreakdown);

  // Deltas vs previous snapshot
  const prevApiK = prev
    ? Math.floor((prev.compute_in + prev.cache_create + prev.cache_read + prev.output) / 1000)
    : 0;
  const prevWater = prev
    ? computeWaterCents({ compute_in: prev.compute_in, cache_create: prev.cache_create, cache_read: prev.cache_read, output: prev.output })
    : 0;

  // Keep only current session (others already baked into totals)
  store.sessions = {
    [sessionId]: {
      total_in: totalIn, total_out: totalOut, io_k: 0,
      ...sessBreakdown, month: curMonth,
    },
  };

  // Month rollover
  if (store.totals.month !== curMonth) {
    store.totals.month = curMonth;
    store.totals.month_io = 0;
    store.totals.month_api = 0;
    store.totals.month_water = 0;
  }

  // Apply deltas
  const dApi = sessApiK - prevApiK;
  const dWater = sessWater - prevWater;
  store.totals.month_api += dApi;
  store.totals.month_water += dWater;
  store.totals.all_api += dApi;
  store.totals.all_water += dWater;

  Bun.write(GALLONS_FILE, JSON.stringify(store));

  return {
    sessApiK, sessWater,
    monthApiK: store.totals.month_api, monthWater: store.totals.month_water,
    allApiK: store.totals.all_api, allWater: store.totals.all_water,
  };
}

// ── Build burn line (column-aligned) ─────────────────────────────────────────

function mkBurnLine(
  api: number,
  cents: number,
  apiColW: number,
  galColW: number,
): string {
  api = Math.max(0, api);
  cents = Math.max(0, cents);
  const apiStr = fmtTok(api).padStart(apiColW);
  const galStr = fmtGal(cents).padStart(galColW);
  return `⚡ ${heatColor(api)(apiStr)} tokens  💧 ${ansi.water(galStr)}`;
}

// ── Error display ─────────────────────────────────────────────────────────────

function showError(msg: string): void {
  const inner = msg.length + 2;
  const h = hrule(inner + 2);
  console.log(`${DIM}╭${h}╮${R}`);
  console.log(`${DIM}│${R} ${ansi.red(msg)} ${DIM}│${R}`);
  console.log(`${DIM}╰${h}╯${R}`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

let input: StatusInput;
try {
  input = await Bun.stdin.json();
} catch (e) {
  showError(`stdin parse error: ${e}`);
  process.exit(1);
}

try {

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
if (input.rate_limits?.five_hour?.used_percentage != null) {
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

// -- Burn data (API totals directly — no baseline file needed) --
const rawIn = input.context_window.total_input_tokens ?? 0;
const rawOut = input.context_window.total_output_tokens ?? 0;
const hasBurn = rawIn > 0 || rawOut > 0;
let sessApiK = 0, sessWater = 0;
let monthApiK = 0, monthWater = 0;
let allApiK = 0, allWater = 0;

if (hasBurn && input.session_id) {
  ({ sessApiK, sessWater, monthApiK, monthWater, allApiK, allWater } =
    updateGallons(input.session_id, rawIn, rawOut, input.context_window.current_usage));
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
  const apiColW = Math.max(...[sessApiK, monthApiK, allApiK].map((n) => fmtTok(Math.max(0, n)).length));
  const galColW = Math.max(...[sessWater, monthWater, allWater].map((n) => fmtGal(Math.max(0, n)).length));

  const bcSess = mkBurnLine(sessApiK, sessWater, apiColW, galColW);
  const bcMonth = mkBurnLine(monthApiK, monthWater, apiColW, galColW);
  const bcAll = mkBurnLine(allApiK, allWater, apiColW, galColW);

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

} catch (e) {
  showError(`statusline error: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
}
