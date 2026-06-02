import { describe, expect, it } from "vitest";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { loadManifestFromPath, resolvePluginEntryFile } from "../commands/plugin.js";

function writePackedPlugin(root: string): void {
  mkdirSync(join(root, "dist"), { recursive: true });
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify(
      {
        name: "fusion-plugin-packed-test",
        version: "0.1.0",
        type: "module",
        exports: {
          ".": {
            types: "./dist/index.d.ts",
            import: "./dist/index.js",
          },
        },
        files: ["dist", "manifest.json"],
        devDependencies: {
          "@runfusion/fusion": "^0.1.0",
        },
      },
      null,
      2,
    ),
  );
  writeFileSync(
    join(root, "manifest.json"),
    JSON.stringify(
      {
        id: "fusion-plugin-packed-test",
        name: "Packed Test",
        version: "0.1.0",
        description: "Synthetic standalone packed plugin artifact.",
      },
      null,
      2,
    ),
  );
  writeFileSync(
    join(root, "dist", "index.js"),
    "import { definePlugin } from '@runfusion/fusion/plugin-sdk';\nexport default definePlugin({ manifest: { id: 'fusion-plugin-packed-test', name: 'Packed Test', version: '0.1.0' } });\n",
  );
  writeFileSync(join(root, "dist", "index.d.ts"), "export {};\n");
}

function collectTextFiles(root: string): string[] {
  const files: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
        continue;
      }
      if ([".js", ".mjs", ".cjs", ".json", ".ts", ".d.ts"].includes(extname(fullPath))) {
        files.push(fullPath);
      }
    }
  };
  visit(root);
  return files;
}

describe("standalone plugin pack shape", () => {
  it("is accepted by the loader entry seams and does not leak private workspace imports", async () => {
    const packedRoot = join(tmpdir(), `fn-plugin-pack-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    try {
      writePackedPlugin(packedRoot);

      const { manifest, path } = await loadManifestFromPath(packedRoot);
      expect(path).toBe(packedRoot);
      expect(manifest).toMatchObject({
        id: "fusion-plugin-packed-test",
        name: "Packed Test",
        version: "0.1.0",
      });
      await expect(resolvePluginEntryFile(packedRoot)).resolves.toBe(join(packedRoot, "dist", "index.js"));

      const contents = collectTextFiles(packedRoot).map((file) => readFileSync(file, "utf-8"));
      expect(contents.length).toBeGreaterThan(0);
      for (const content of contents) {
        expect(content).not.toContain("@fusion/");
        expect(content).not.toContain("workspace:");
      }
    } finally {
      rmSync(packedRoot, { recursive: true, force: true });
    }
  });
});
