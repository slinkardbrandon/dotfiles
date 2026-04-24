#!/usr/bin/env bun
/**
 * Rebuild session-gallons.json from Claude Code session transcripts.
 *
 * Run on any machine to bootstrap accurate historical token/water data:
 *   bun ~/dotfiles/claude/sync-usage.ts
 *
 * Safe to re-run — overwrites totals from transcript truth but preserves
 * the active session entry so the statusline doesn't double-count.
 */

import { statSync, readFileSync, existsSync } from "fs";
import { join } from "path";

const HOME = process.env.HOME!;
const PROJECTS_DIR = join(HOME, ".claude", "projects");
const GALLONS_FILE = join(HOME, ".claude", "session-gallons.json");
const STORE_VERSION = 5;
const CACHE_READ_WEIGHT = 0.1;

// ── ANSI ────────────────────────────────────────────────────────────────────

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const water = (s: string) => `\x1b[38;5;39m${s}\x1b[0m`;

// ── Helpers ─────────────────────────────────────────────────────────────────

interface Breakdown {
  compute_in: number;
  cache_create: number;
  cache_read: number;
  output: number;
}

function computeWaterCents(b: Breakdown): number {
  const effectiveK =
    (b.compute_in + b.cache_create + b.cache_read * CACHE_READ_WEIGHT + b.output) / 1000;
  return Math.round((effectiveK * 75) / 3785);
}

function fmtM(n: number): string {
  return (n / 1_000_000).toFixed(2) + "M";
}

function fmtGal(cents: number): string {
  return `~${(cents / 100).toFixed(2)} gal`;
}

function toApiK(b: Breakdown): number {
  return Math.floor((b.compute_in + b.cache_create + b.cache_read + b.output) / 1000);
}

// ── Scan ────────────────────────────────────────────────────────────────────

console.log(dim("Scanning session transcripts..."));

if (!existsSync(PROJECTS_DIR)) {
  console.log(yellow("No projects directory found at " + PROJECTS_DIR));
  process.exit(1);
}

const { stdout } = Bun.spawnSync(["find", PROJECTS_DIR, "-name", "*.jsonl", "-type", "f"], {
  stdout: "pipe",
});
const files = stdout.toString().trim().split("\n").filter(Boolean);

if (files.length === 0) {
  console.log(yellow("No session transcripts found."));
  process.exit(1);
}

const curMonth = new Date().toISOString().slice(0, 7);
const all: Breakdown = { compute_in: 0, cache_create: 0, cache_read: 0, output: 0 };
const monthly = new Map<string, Breakdown>();
let messageCount = 0;

for (const file of files) {
  try {
    const fileMonth = new Date(statSync(file).mtimeMs).toISOString().slice(0, 7);
    if (!monthly.has(fileMonth)) {
      monthly.set(fileMonth, { compute_in: 0, cache_create: 0, cache_read: 0, output: 0 });
    }
    const month = monthly.get(fileMonth)!;
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
        month.compute_in += inp; month.cache_create += cc;
        month.cache_read += cr;  month.output += out;
        messageCount++;
      } catch {}
    }
  } catch {}
}

// ── Report ──────────────────────────────────────────────────────────────────

const totalApi = all.compute_in + all.cache_create + all.cache_read + all.output;

console.log();
console.log(green("=== Token Breakdown ==="));
console.log(`  Files scanned:          ${cyan(String(files.length))}`);
console.log(`  Messages with usage:    ${cyan(String(messageCount))}`);
console.log();
console.log(`  Non-cached input:       ${dim(fmtM(all.compute_in))}`);
console.log(`  Cache creation:         ${dim(fmtM(all.cache_create))}`);
console.log(`  Cache reads:            ${cyan(fmtM(all.cache_read))} ${dim("(93% of total)")}`);
console.log(`  Output:                 ${dim(fmtM(all.output))}`);
console.log(`  ${"─".repeat(40)}`);
console.log(`  Total API throughput:   ${green(fmtM(totalApi))}`);
console.log();

const allWater = computeWaterCents(all);
console.log(green("=== Water Estimate ==="));
console.log(`  Cache-weighted water:   ${water(fmtGal(allWater))}`);
console.log();

console.log(green("=== Monthly Breakdown ==="));
for (const [month, b] of [...monthly.entries()].sort()) {
  const api = b.compute_in + b.cache_create + b.cache_read + b.output;
  const w = computeWaterCents(b);
  const marker = month === curMonth ? " ← current" : "";
  console.log(`  ${month}: ${cyan(fmtM(api).padStart(10))} tokens  ${water(fmtGal(w).padStart(12))}${dim(marker)}`);
}
console.log();

// ── Write ───────────────────────────────────────────────────────────────────

const curMonthData = monthly.get(curMonth) ?? { compute_in: 0, cache_create: 0, cache_read: 0, output: 0 };

// Preserve active session entry if the file already exists at v5
let sessions: Record<string, any> = {};
try {
  const existing = JSON.parse(readFileSync(GALLONS_FILE, "utf8"));
  if (existing.version === STORE_VERSION && existing.sessions) {
    sessions = existing.sessions;
  }
} catch {}

const store = {
  version: STORE_VERSION,
  sessions,
  totals: {
    month: curMonth,
    month_io: 0,
    month_api: toApiK(curMonthData),
    month_water: computeWaterCents(curMonthData),
    all_io: 0,
    all_api: toApiK(all),
    all_water: allWater,
  },
};

await Bun.write(GALLONS_FILE, JSON.stringify(store));
console.log(green(`✓ Wrote ${GALLONS_FILE}`));
console.log(dim("  Statusline will pick up the new totals on next refresh."));
