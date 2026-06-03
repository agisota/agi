import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "@fusion/core";
import type { FallbackLngObjList, InitOptions } from "i18next";

/**
 * Shared, framework-agnostic i18next configuration for both Fusion UI surfaces.
 *
 * The dashboard (browser) and the terminal UI (Node) each build their own
 * i18next instance, but they share the locale list, namespace split, fallback
 * chain, and base options defined here so the two surfaces stay consistent.
 */

/** All translation namespaces. Split so each surface loads only what it needs. */
export const NAMESPACES = ["common", "app", "errors", "cli"] as const;
export type Namespace = (typeof NAMESPACES)[number];

/** Default namespace keys resolve against when none is specified. */
export const DEFAULT_NAMESPACE: Namespace = "common";

/** Namespaces the browser dashboard loads (skips the terminal-only `cli`). */
export const DASHBOARD_NAMESPACES: readonly Namespace[] = ["common", "app", "errors"];

/** Namespaces the terminal UI loads (skips the dashboard-only `app`). */
export const CLI_NAMESPACES: readonly Namespace[] = ["common", "cli", "errors"];

/**
 * Script-aware fallback chain. A generic `zh` resolves to Simplified, the
 * Han-script tags resolve to their region catalog, and everything else falls
 * back to the source language. Combined with `load: "currentOnly"` this keeps
 * `zh-CN` and `zh-TW` from ever collapsing into a single generic `zh`.
 */
export const FALLBACK_LNG: FallbackLngObjList = {
  "zh-Hans": ["zh-CN"],
  "zh-Hant": ["zh-TW"],
  zh: ["zh-CN"],
  default: [DEFAULT_LOCALE],
};

/**
 * Base init options shared by every surface. Each surface spreads these and
 * adds its own resource-loading strategy (lazy backend for the dashboard,
 * static `resources` for the CLI) plus framework plugins.
 */
export function baseInitOptions(): InitOptions {
  return {
    supportedLngs: [...SUPPORTED_LOCALES],
    fallbackLng: FALLBACK_LNG,
    // Never collapse zh-CN/zh-TW into a generic `zh`.
    load: "currentOnly",
    nonExplicitSupportedLngs: false,
    // React (and Ink) escape on render; double-escaping mangles output.
    interpolation: { escapeValue: false },
    returnNull: false,
  };
}
