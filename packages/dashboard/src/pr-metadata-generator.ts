import { promisify } from "node:util";
import { exec as execCb } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { GlobalSettings, ProjectSettings, Settings, Task } from "@fusion/core";
import { resolveTaskPlanningModel } from "@fusion/core";
import { createFnAgent } from "@fusion/engine";

const execAsync = promisify(execCb);

export interface GeneratedPrMetadata {
  title: string;
  body: string;
  templateUsed: boolean;
}

interface AiMetadataResult {
  title: string;
  summary: string;
  changes: string;
  testing: string;
  linkedTask: string;
}

function buildFallback(task: Task): GeneratedPrMetadata {
  return {
    title: task.title ?? task.id,
    body: [
      "## Summary",
      "",
      task.description?.trim() || "Summary unavailable.",
      "",
      "## Changes",
      "",
      "- Details unavailable.",
      "",
      "## Testing",
      "",
      "- Not provided.",
      "",
      "## Linked Task",
      "",
      `Closes ${task.id}`,
    ].join("\n"),
    templateUsed: false,
  };
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseAiResult(raw: string): AiMetadataResult | null {
  try {
    const parsed = JSON.parse(raw) as Partial<AiMetadataResult>;
    const title = asString(parsed.title);
    const summary = asString(parsed.summary);
    const changes = asString(parsed.changes);
    const testing = asString(parsed.testing);
    const linkedTask = asString(parsed.linkedTask);
    if (!title || !summary || !changes || !testing) {
      return null;
    }
    return { title, summary, changes, testing, linkedTask };
  } catch {
    return null;
  }
}

function buildBody(result: AiMetadataResult, taskId: string): string {
  const linkedTaskLines = [result.linkedTask, `Closes ${taskId}`].filter(Boolean);
  return [
    "## Summary",
    "",
    result.summary,
    "",
    "## Changes",
    "",
    result.changes,
    "",
    "## Testing",
    "",
    result.testing,
    "",
    "## Linked Task",
    "",
    ...linkedTaskLines,
  ].join("\n");
}

function fillTemplate(template: string, result: AiMetadataResult, taskId: string): string {
  const known = new Map<string, string>([
    ["summary", result.summary],
    ["changes", result.changes],
    ["testing", result.testing],
    ["linked task", `${result.linkedTask}\n\nCloses ${taskId}`.trim()],
  ]);

  const lines = template.split(/\r?\n/);
  let i = 0;
  const out: string[] = [];
  while (i < lines.length) {
    const line = lines[i];
    const headingMatch = line.match(/^(##+)\s+(.*)$/);
    if (!headingMatch) {
      out.push(line);
      i += 1;
      continue;
    }

    const heading = headingMatch[2].trim().toLowerCase();
    const replacement = known.get(heading);
    out.push(line);
    i += 1;

    const sectionBody: string[] = [];
    while (i < lines.length && !/^(##+)\s+/.test(lines[i])) {
      sectionBody.push(lines[i]);
      i += 1;
    }

    if (replacement) {
      out.push("");
      out.push(...replacement.split("\n"));
    } else {
      out.push(...sectionBody);
    }
  }

  if (!out.join("\n").includes(`Closes ${taskId}`)) {
    out.push("", "## Linked Task", "", `Closes ${taskId}`);
  }

  return out.join("\n");
}

async function runCommand(command: string, cwd: string): Promise<string> {
  const { stdout } = await execAsync(command, {
    cwd,
    timeout: 15_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout.trim();
}

async function resolveBaseBranch(task: Task, repoRoot: string): Promise<string> {
  if (task.prInfo?.baseBranch) {
    return task.prInfo.baseBranch;
  }

  try {
    const stdout = await runCommand("gh repo view --json defaultBranchRef -q .defaultBranchRef.name", repoRoot);
    if (stdout) return stdout;
  } catch {
    // fallback below
  }
  return "main";
}

export async function generatePrMetadata(input: {
  task: Task;
  repoRoot: string;
  settings: ProjectSettings & GlobalSettings;
  signal?: AbortSignal;
}): Promise<GeneratedPrMetadata> {
  const { task, repoRoot, settings, signal } = input;
  const fallback = buildFallback(task);

  const baseBranch = await resolveBaseBranch(task, repoRoot);
  const [logOut, diffStatOut] = await Promise.all([
    runCommand(`git log --no-merges ${baseBranch}..HEAD --format=%s%n%b`, repoRoot).catch(() => ""),
    runCommand(`git diff --stat ${baseBranch}..HEAD`, repoRoot).catch(() => ""),
  ]);

  let promptContent = "";
  try {
    const promptPath = join(repoRoot, ".fusion", "tasks", task.id, "PROMPT.md");
    promptContent = (await readFile(promptPath, "utf8")).trim();
  } catch {
    promptContent = "";
  }

  const templatePath = join(repoRoot, ".github", "pull_request_template.md");
  const templateExists = await access(templatePath).then(() => true).catch(() => false);
  const template = templateExists ? await readFile(templatePath, "utf8") : "";

  const model = resolveTaskPlanningModel(task, settings as Partial<Settings>);
  let aiText = "";
  const { session } = await createFnAgent({
    cwd: repoRoot,
    tools: "readonly",
    defaultProvider: model.provider,
    defaultModelId: model.modelId,
    systemPrompt: [
      "Generate GitHub PR metadata.",
      "Respond with strict JSON only.",
      "Schema: {title, summary, changes, testing, linkedTask}",
    ].join("\n"),
    onText: (delta: string) => {
      aiText += delta;
    },
  });

  try {
    const contextPrompt = [
      `Task ID: ${task.id}`,
      `Task title: ${task.title}`,
      `Task description: ${task.description ?? ""}`,
      `Base branch: ${baseBranch}`,
      "Commit log:",
      logOut || "(none)",
      "Diff stat:",
      diffStatOut || "(none)",
      "Task prompt:",
      promptContent || "(none)",
    ].join("\n\n");

    if (signal?.aborted) {
      throw new Error("Metadata generation aborted");
    }

    await session.prompt(contextPrompt);
  } finally {
    try {
      session.dispose();
    } catch {
      // best effort
    }
  }

  const parsed = parseAiResult(aiText);
  if (!parsed) {
    return fallback;
  }

  const body = templateExists ? fillTemplate(template, parsed, task.id) : buildBody(parsed, task.id);
  return {
    title: parsed.title,
    body,
    templateUsed: templateExists,
  };
}
