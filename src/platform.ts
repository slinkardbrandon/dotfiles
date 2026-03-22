import { $ } from "bun";

export type Platform = "macos" | "linux";

export function detectPlatform(): Platform {
  return process.platform === "darwin" ? "macos" : "linux";
}

export function isWSL(): boolean {
  try {
    const release = require("fs").readFileSync("/proc/version", "utf8");
    return release.toLowerCase().includes("microsoft");
  } catch {
    return false;
  }
}

export async function commandExists(cmd: string): Promise<boolean> {
  try {
    await $`which ${cmd}`.quiet();
    return true;
  } catch {
    return false;
  }
}
