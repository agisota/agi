#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { execSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

function parseArgs(argv = process.argv.slice(2)) {
  const apply = argv.includes("--apply");
  const missionArg = argv.find((arg) => arg.startsWith("--mission="));
  return {
    dryRun: !apply,
    apply,
    missionId: missionArg ? missionArg.slice("--mission=".length).trim() || undefined : undefined,
  };
}

function resolveProjectRoot() {
  const commonDir = execSync("git rev-parse --git-common-dir", { encoding: "utf8" }).trim();
  return path.resolve(commonDir, "..");
}

function loadFeatures(db, missionId) {
  const sql = `
    SELECT f.id, f.title, f.description, f.acceptanceCriteria, s.milestoneId
    FROM mission_features f
    INNER JOIN slices s ON s.id = f.sliceId
    INNER JOIN milestones m ON m.id = s.milestoneId
    ${missionId ? "WHERE m.missionId = ?" : ""}
    ORDER BY f.createdAt ASC
  `;
  return missionId ? db.prepare(sql).all(missionId) : db.prepare(sql).all();
}

function deriveAssertionText(feature) {
  const acceptanceCriteria = typeof feature.acceptanceCriteria === "string" ? feature.acceptanceCriteria.trim() : "";
  if (acceptanceCriteria.length > 0) {
    return { text: acceptanceCriteria, textSource: "acceptanceCriteria" };
  }

  const description = typeof feature.description === "string" ? feature.description.trim() : "";
  if (description.length > 0) {
    return { text: description, textSource: "description" };
  }

  return {
    text: `Verify implementation of: ${feature.title}`,
    textSource: "fallback",
  };
}

function createAssertionId(db) {
  const row = db.prepare("SELECT COALESCE(MAX(CAST(SUBSTR(id, 3) AS INTEGER)), 0) AS maxId FROM mission_contract_assertions").get();
  const next = Number(row?.maxId ?? 0) + 1;
  return `CA${String(next).padStart(4, "0")}`;
}

function hasSourceFeatureIdColumn(db) {
  const columns = db.prepare("PRAGMA table_info('mission_contract_assertions')").all();
  return columns.some((column) => column?.name === "sourceFeatureId");
}

function backfillFeatureAssertions({ db, dryRun = true, missionId }) {
  const features = loadFeatures(db, missionId);
  const now = new Date().toISOString();
  const report = {
    scanned: features.length,
    alreadyLinked: 0,
    repaired: [],
    skippedErrors: [],
  };

  const listLinks = db.prepare("SELECT assertionId FROM mission_feature_assertions WHERE featureId = ?");
  const includeSourceFeatureId = hasSourceFeatureIdColumn(db);
  const insertAssertion = includeSourceFeatureId
    ? db.prepare(`
      INSERT INTO mission_contract_assertions
        (id, milestoneId, title, assertion, status, orderIndex, sourceFeatureId, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?)
    `)
    : db.prepare(`
      INSERT INTO mission_contract_assertions
        (id, milestoneId, title, assertion, status, orderIndex, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)
    `);
  const nextOrder = db.prepare("SELECT COALESCE(MAX(orderIndex), -1) + 1 AS nextOrder FROM mission_contract_assertions WHERE milestoneId = ?");
  const insertLink = db.prepare(
    "INSERT OR IGNORE INTO mission_feature_assertions (featureId, assertionId, createdAt) VALUES (?, ?, ?)"
  );

  for (const feature of features) {
    try {
      const links = listLinks.all(feature.id);
      if (links.length > 0) {
        report.alreadyLinked += 1;
        continue;
      }

      const { text, textSource } = deriveAssertionText(feature);

      if (dryRun) {
        report.repaired.push({
          featureId: feature.id,
          milestoneId: feature.milestoneId,
          assertionId: "(dry-run)",
          textSource,
        });
        continue;
      }

      const assertionId = createAssertionId(db);
      const orderIndex = Number(nextOrder.get(feature.milestoneId)?.nextOrder ?? 0);
      if (includeSourceFeatureId) {
        insertAssertion.run(assertionId, feature.milestoneId, feature.title, text, orderIndex, feature.id, now, now);
      } else {
        insertAssertion.run(assertionId, feature.milestoneId, feature.title, text, orderIndex, now, now);
      }
      insertLink.run(feature.id, assertionId, now);
      report.repaired.push({
        featureId: feature.id,
        milestoneId: feature.milestoneId,
        assertionId,
        textSource,
      });
    } catch (error) {
      report.skippedErrors.push({
        featureId: feature.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return report;
}

function printReport(report, { dryRun, missionId }) {
  console.log(dryRun ? "Mode: DRY RUN" : "Mode: APPLY");
  console.log(`Mission scope: ${missionId ?? "all"}`);
  console.log(`Scanned: ${report.scanned}`);
  console.log(`Already linked: ${report.alreadyLinked}`);
  console.log(`Repaired: ${report.repaired.length}`);
  for (const row of report.repaired) {
    console.log(`  - ${row.featureId} -> ${row.assertionId} (${row.textSource})`);
  }
  console.log(`Errors: ${report.skippedErrors.length}`);
  for (const row of report.skippedErrors) {
    console.log(`  - ${row.featureId}: ${row.message}`);
  }
}

function main(argv = process.argv.slice(2)) {
  const { dryRun, missionId } = parseArgs(argv);
  const projectRoot = resolveProjectRoot();
  const dbPath = path.join(projectRoot, ".fusion", "fusion.db");
  const db = new DatabaseSync(dbPath);

  try {
    const report = backfillFeatureAssertions({ db, dryRun, missionId });
    printReport(report, { dryRun, missionId });
    if (report.skippedErrors.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    db.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
