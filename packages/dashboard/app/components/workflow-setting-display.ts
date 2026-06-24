import type { WorkflowSettingDefinition } from "../api";

export type WorkflowSettingGroup = "models" | "review" | "steps" | "advanced";

export interface WorkflowSettingDisplay {
  group: WorkflowSettingGroup;
  label: string;
  description?: string;
}

/*
FNXC:WorkflowSettings 2026-06-17-09:13:
Title summarization is project/global-scoped and configured in Project Models, so this workflow display map intentionally omits titleSummarizer* keys. If a custom workflow declares a same-named key, render it as Advanced instead of implying Fusion will execute it as a workflow model lane.
*/
/*
FNXC:i18n-Finalize 2026-06-24-04:30:
The English label/description strings in DISPLAY and in WORKFLOW_SETTING_GROUP_LABELS are the i18next defaultValue fallbacks, not the rendered copy. WorkflowSettingsPanel localizes them at render time: labels via t(`workflowSettings.settingLabel.${id}`), descriptions via t(`workflowSettings.settingDescription.${id}`), and group headers via t(`workflowSettings.group.${group}`). RU (and other) translations live in the @fusion/i18n catalogs. Do NOT call t() here — this map is a module-level const evaluated before i18next initializes, so a t() call at load would resolve against an empty bundle. Keep these values in English so a missing catalog key degrades to readable English instead of a raw key.
*/
const DISPLAY: Record<string, WorkflowSettingDisplay> = {
  planningProvider: {
    group: "models",
    label: "Plan/Triage provider",
    description: "Provider used when planning or triaging tasks.",
  },
  planningModelId: {
    group: "models",
    label: "Plan/Triage model",
    description: "Model used when planning or triaging tasks.",
  },
  planningFallbackProvider: {
    group: "models",
    label: "Plan/Triage fallback provider",
  },
  planningFallbackModelId: {
    group: "models",
    label: "Plan/Triage fallback model",
  },
  executionProvider: {
    group: "models",
    label: "Executor provider",
    description: "Provider used by task implementation agents.",
  },
  executionModelId: {
    group: "models",
    label: "Executor model",
    description: "Model used by task implementation agents.",
  },
  validatorProvider: {
    group: "models",
    label: "Reviewer provider",
    description: "Provider used by review and validation agents.",
  },
  validatorModelId: {
    group: "models",
    label: "Reviewer model",
    description: "Model used by review and validation agents.",
  },
  validatorFallbackProvider: {
    group: "models",
    label: "Reviewer fallback provider",
  },
  validatorFallbackModelId: {
    group: "models",
    label: "Reviewer fallback model",
  },
  requirePrApproval: {
    group: "review",
    label: "Require PR approval",
  },
  requirePlanApproval: {
    group: "review",
    label: "Require plan approval",
  },
  reviewHandoffPolicy: {
    group: "review",
    label: "Review handoff policy",
  },
  maxReviewerContextRetries: {
    group: "review",
    label: "Reviewer context retries",
  },
  maxReviewerFallbackRetries: {
    group: "review",
    label: "Reviewer fallback retries",
  },
  reflectionEnabled: {
    group: "review",
    label: "Reflection enabled",
  },
  workflowStepTimeoutMs: {
    group: "steps",
    label: "Step timeout",
  },
  workflowStepScopeEnforcement: {
    group: "steps",
    label: "Step scope enforcement",
  },
  planOnlyScopeLeakEnforcement: {
    group: "steps",
    label: "Plan-only scope leak enforcement",
  },
  workflowRevisionForkOnScopeMismatch: {
    group: "steps",
    label: "Fork revision on scope mismatch",
  },
  strictScopeEnforcement: {
    group: "steps",
    label: "Strict scope enforcement",
  },
  runStepsInNewSessions: {
    group: "steps",
    label: "Run steps in new sessions",
  },
  maxParallelSteps: {
    group: "steps",
    label: "Max parallel steps",
  },
  buildRetryCount: {
    group: "steps",
    label: "Build retry count",
  },
  verificationFixRetries: {
    group: "steps",
    label: "Verification fix retries",
  },
  maxPostReviewFixes: {
    group: "steps",
    label: "Post-review fix passes",
  },
};

export const WORKFLOW_SETTING_GROUP_ORDER: WorkflowSettingGroup[] = [
  "models",
  "review",
  "steps",
  "advanced",
];

export const WORKFLOW_SETTING_GROUP_LABELS: Record<WorkflowSettingGroup, string> = {
  models: "Models",
  review: "Review & Approval",
  steps: "Step Execution",
  advanced: "Advanced",
};

export function getWorkflowSettingDisplay(setting: WorkflowSettingDefinition): WorkflowSettingDisplay {
  return DISPLAY[setting.id] ?? { group: "advanced", label: setting.name, description: setting.description };
}

export function groupWorkflowSettings(
  settings: WorkflowSettingDefinition[],
): Array<{ group: WorkflowSettingGroup; settings: WorkflowSettingDefinition[] }> {
  const byGroup = new Map<WorkflowSettingGroup, WorkflowSettingDefinition[]>();
  for (const setting of settings) {
    const group = getWorkflowSettingDisplay(setting).group;
    const list = byGroup.get(group) ?? [];
    list.push(setting);
    byGroup.set(group, list);
  }
  return WORKFLOW_SETTING_GROUP_ORDER
    .map((group) => ({ group, settings: byGroup.get(group) ?? [] }))
    .filter((entry) => entry.settings.length > 0);
}
