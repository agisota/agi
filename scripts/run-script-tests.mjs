#!/usr/bin/env node

import { globSync } from "node:fs";
import { spawn } from "node:child_process";

/*
FNXC:TestInfrastructure 2026-06-21-10:00:
Script-test verification must honor forwarded file arguments so targeted checks stay fast inside Fusion tasks.
The old package script always expanded scripts/__tests__/*.test.mjs before forwarded args, turning `pnpm test:scripts -- scripts/__tests__/x.test.mjs` into the full script suite and making task completion look stalled.
*/

const forwarded = process.argv.slice(2).filter((arg) => arg !== "--");
const testFiles = forwarded.length > 0
  ? forwarded
  : globSync("scripts/__tests__/*.test.mjs").sort();

const child = spawn(process.execPath, ["--test", ...testFiles], {
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
