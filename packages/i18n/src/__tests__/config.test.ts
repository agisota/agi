import { SUPPORTED_LOCALES } from "@fusion/core";
import { describe, expect, it } from "vitest";
import { cliResources } from "../cli-catalogs.js";
import {
  baseInitOptions,
  CLI_NAMESPACES,
  DASHBOARD_NAMESPACES,
  DEFAULT_NAMESPACE,
  FALLBACK_LNG,
  NAMESPACES,
} from "../config.js";

describe("@fusion/i18n config", () => {
  it("dashboard and cli namespaces are subsets of NAMESPACES", () => {
    for (const ns of [...DASHBOARD_NAMESPACES, ...CLI_NAMESPACES]) {
      expect(NAMESPACES).toContain(ns);
    }
  });

  it("defaults to the common namespace", () => {
    expect(DEFAULT_NAMESPACE).toBe("common");
  });

  it("keeps zh-CN and zh-TW separate (load: currentOnly)", () => {
    const opts = baseInitOptions();
    expect(opts.load).toBe("currentOnly");
    expect(opts.supportedLngs).toEqual([...SUPPORTED_LOCALES]);
    expect(opts.interpolation?.escapeValue).toBe(false);
  });

  it("routes Chinese scripts and defaults everything else to en", () => {
    expect(FALLBACK_LNG.zh).toEqual(["zh-CN"]);
    expect(FALLBACK_LNG["zh-Hans"]).toEqual(["zh-CN"]);
    expect(FALLBACK_LNG["zh-Hant"]).toEqual(["zh-TW"]);
    expect(FALLBACK_LNG.default).toEqual(["en"]);
  });

  it("ships a CLI catalog map for every supported locale and namespace", () => {
    for (const lng of SUPPORTED_LOCALES) {
      expect(cliResources).toHaveProperty(lng);
      for (const ns of CLI_NAMESPACES) {
        expect(cliResources[lng]).toHaveProperty(ns);
      }
    }
  });

  it("has real en content (catalogs wired, not empty)", () => {
    expect(cliResources.en.cli).toMatchObject({ tui: { loading: expect.any(String) } });
    expect(cliResources.en.common).toMatchObject({ columns: { done: "Done" } });
  });
});
