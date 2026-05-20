import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const componentsDir = resolve(__dirname, "..", "components");

function stripVarFallbackRgba(content: string): string {
  return content.replace(/var\([^()]*,\s*rgba?\([^)]*\)\s*\)/g, "");
}

describe("component CSS color token hygiene", () => {
  it("contains no raw rgb/rgba calls outside var() fallbacks", () => {
    const cssFiles = readdirSync(componentsDir)
      .filter((name) => name.endsWith(".css"))
      .sort();

    const violations: string[] = [];

    for (const fileName of cssFiles) {
      const filePath = join(componentsDir, fileName);
      const source = readFileSync(filePath, "utf8");
      const withoutFallbacks = stripVarFallbackRgba(source);
      const lines = withoutFallbacks.split(/\r?\n/);

      for (let index = 0; index < lines.length; index += 1) {
        if (/rgba?\(/.test(lines[index])) {
          violations.push(`${fileName}:${index + 1}:${lines[index].trim()}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
