import type { Settings } from "./types.js";

const LEGACY_EXPERIMENTAL_FEATURE_ALIASES: Record<string, string> = {
  devServer: "devServerView",
};

/*
FNXC:WorkflowSettings 2026-06-22-18:05:
workflowColumns and workflowGraphExecutor are now default-on rollout flags, while workflowInterpreterDualObserve remains default-off because it runs diagnostic shadow parity observation. Explicit false stays a kill switch for the two default-on runtime paths.
*/
const DEFAULT_ON_EXPERIMENTAL_FEATURES = new Set([
  "workflowColumns",
  "workflowGraphExecutor",
]);

export function isExperimentalFeatureEnabled(
  settings: Pick<Settings, "experimentalFeatures"> | undefined,
  key: string,
): boolean {
  const features = settings?.experimentalFeatures;
  const canonicalKey = LEGACY_EXPERIMENTAL_FEATURE_ALIASES[key] ?? key;
  if (features?.[canonicalKey] === false) return false;
  if (features?.[canonicalKey] === true) return true;

  for (const [legacyKey, aliasCanonical] of Object.entries(LEGACY_EXPERIMENTAL_FEATURE_ALIASES)) {
    if (aliasCanonical === canonicalKey && features?.[legacyKey] === true) {
      return true;
    }
  }

  if (DEFAULT_ON_EXPERIMENTAL_FEATURES.has(canonicalKey)) return true;

  return false;
}
