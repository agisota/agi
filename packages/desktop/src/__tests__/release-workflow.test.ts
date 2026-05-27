import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../../../");

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.join(repoRoot, relativePath), "utf-8");
}

describe("desktop release workflow wiring", () => {
  it("adds desktop build jobs for windows, macOS, and linux", async () => {
    const release = await readRepoFile(".github/workflows/release.yml");
    const testRelease = await readRepoFile(".github/workflows/test-release.yml");

    for (const workflow of [release, testRelease]) {
      expect(workflow).toContain("build-desktop-windows:");
      expect(workflow).toContain("runs-on: windows-latest");
      expect(workflow).toMatch(/pnpm --filter @fusion\/desktop dist:win|electron-builder --win/);
      expect(workflow).toContain("name: fusion-desktop-windows");

      expect(workflow).toContain("build-desktop-macos:");
      expect(workflow).toContain("runs-on: macos-latest");
      expect(workflow).toMatch(/pnpm --filter @fusion\/desktop dist:mac|electron-builder --mac/);
      expect(workflow).toContain("name: fusion-desktop-macos");

      expect(workflow).toContain("build-desktop-linux:");
      expect(workflow).toContain("runs-on: ubuntu-latest");
      expect(workflow).toMatch(/pnpm --filter @fusion\/desktop dist:linux|electron-builder --linux/);
      expect(workflow).toContain("name: fusion-desktop-linux");
    }
  });

  it("wires release aggregation to include desktop assets across platforms", async () => {
    const release = await readRepoFile(".github/workflows/release.yml");

    expect(release).toContain(
      "needs: [build-binaries, build-desktop-windows, build-desktop-macos, build-desktop-linux]",
    );
    expect(release).toContain('find artifacts -type f \\(');
    expect(release).toContain('-name "*.exe"');
    expect(release).toContain('-name "*.exe.sha256"');
    expect(release).toContain('-name "*.blockmap"');
    expect(release).toContain('-name "*.dmg"');
    expect(release).toContain('-name "*.zip"');
    expect(release).toContain('-name "*.AppImage"');
    expect(release).toContain('-name "*.deb"');
    expect(release).toContain('-name "*.tar.gz"');
  });

  it("wires test-release collect job to wait for all desktop build jobs", async () => {
    const testRelease = await readRepoFile(".github/workflows/test-release.yml");

    expect(testRelease).toContain(
      "needs: [build-binaries, build-desktop-windows, build-desktop-macos, build-desktop-linux]",
    );
  });
});
