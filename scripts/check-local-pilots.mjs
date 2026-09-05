#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  firstRootContainingFile,
  planPilotSources,
  resolvePilotRoot
} from "./local-pilot-paths.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = resolve(repositoryRoot, "..");
const pilotRoot = (relativeDefault, environmentName) => (
  resolvePilotRoot(workspaceRoot, relativeDefault, environmentName)
);

function run(command, args, cwd, environment = process.env) {
  const result = spawnSync(command, args, {
    cwd,
    env: environment,
    stdio: "inherit"
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with status ${result.status}`);
  }
}

function failureReason(error) {
  return error instanceof Error ? error.message : String(error);
}

function runCheck(failures, name, check, command, args, cwd, environment) {
  try {
    run(command, args, cwd, environment);
    return true;
  } catch (error) {
    failures.push({ name, check, reason: failureReason(error) });
    return false;
  }
}

try {
  const capabilityContractsRoot = pilotRoot(
    "capability-contracts",
    "OPENADAM_CAPABILITY_CONTRACTS_SOURCE_ROOT"
  );
  const fileVitalsDefault = firstRootContainingFile([
    resolve(workspaceRoot, "file-vitals"),
    resolve(workspaceRoot, "universal-inspector")
  ], "capabilities/provider.json");
  const fileVitalsRoot = pilotRoot(
    fileVitalsDefault,
    "OPENADAM_FILE_VITALS_SOURCE_ROOT"
  );
  const batchTicketRoot = pilotRoot(
    "data-transformer",
    "OPENADAM_BATCHTICKET_SOURCE_ROOT"
  );
  const assetPrepRoot = pilotRoot("asset-prep", "OPENADAM_ASSET_PREP_SOURCE_ROOT");
  const worldbendRoot = pilotRoot("perspective-tool", "OPENADAM_WORLDBEND_SOURCE_ROOT");
  const structuredDataPreflightRoot = pilotRoot(
    "structured-data-preflight",
    "OPENADAM_STRUCTURED_DATA_PREFLIGHT_SOURCE_ROOT"
  );
  const brandAssetPrepRoot = pilotRoot(
    "brand-asset-prep",
    "OPENADAM_BRAND_ASSET_PREP_SOURCE_ROOT"
  );
  const dependencyPreflightRoot = pilotRoot(
    "standards-pilots/packages/dependency-preflight",
    "OPENADAM_DEPENDENCY_PREFLIGHT_SOURCE_ROOT"
  );

  const pilots = [
  {
    name: "Structured Data Preflight",
    environment: {
      ...process.env,
      OPENADAM_FILE_INSPECTOR_ROOT: fileVitalsRoot,
      OPENADAM_DATA_TRANSFORMER_ROOT: batchTicketRoot
    },
    implementationRoot: structuredDataPreflightRoot,
    implementationFiles: [
      "pyproject.toml",
      "src/structured_data_preflight/adapter.py"
    ],
    sourceEnvironments: [
      "OPENADAM_STRUCTURED_DATA_PREFLIGHT_SOURCE_ROOT",
      "OPENADAM_FILE_VITALS_SOURCE_ROOT",
      "OPENADAM_BATCHTICKET_SOURCE_ROOT"
    ],
    implementationCheck: ["uv", ["run", "ruff", "check", "."]],
    secondaryCheck: ["uv", ["run", "pytest"]],
    profile: "structured-data-preflight.v0.3.json",
    manifest: "procedure/implementation-manifest.json",
    compositionSuite: "procedure/composition-conformance.json",
    capabilityManifests: [
      resolve(fileVitalsRoot, "capabilities/provider.json"),
      resolve(batchTicketRoot, "capabilities/provider.json")
    ]
  },
  {
    name: "Brand Asset Prep",
    environment: {
      ...process.env,
      OPENADAM_ASSET_PREP_ROOT: assetPrepRoot,
      OPENADAM_WORLDBEND_ROOT: worldbendRoot
    },
    implementationRoot: brandAssetPrepRoot,
    implementationFiles: [
      "pyproject.toml",
      "src/brand_asset_prep/adapter.py"
    ],
    sourceEnvironments: [
      "OPENADAM_BRAND_ASSET_PREP_SOURCE_ROOT",
      "OPENADAM_ASSET_PREP_SOURCE_ROOT",
      "OPENADAM_WORLDBEND_SOURCE_ROOT"
    ],
    implementationCheck: ["uv", ["run", "ruff", "check", "."]],
    secondaryCheck: ["uv", ["run", "pytest"]],
    profile: "brand-asset-prepare.v0.3.json",
    manifest: "procedure/implementation-manifest.json",
    capabilityManifests: [
      resolve(assetPrepRoot, "capabilities/provider.json"),
      resolve(worldbendRoot, "capabilities/provider.json")
    ]
  },
  {
    name: "Dependency Preflight",
    implementationRoot: dependencyPreflightRoot,
    implementationFiles: ["package.json", "src/procedure-adapter.mjs"],
    sourceEnvironments: ["OPENADAM_DEPENDENCY_PREFLIGHT_SOURCE_ROOT"],
    implementationCheck: ["npm", ["run", "check"]],
    secondaryCheck: ["node", ["--test", "test/contract-alignment.test.mjs"]],
    profile: "package-dependency-change-preflight.v0.2.json",
    manifest: "procedure/implementation-manifest.json",
    capabilityManifests: [
      resolve(dependencyPreflightRoot, "capabilities/provider.json")
    ]
  }
  ];

  const checkedImplementations = new Set();
  const completed = [];
  const notRun = [];
  const skipped = [];
  const failures = [];
  const sourcePlan = planPilotSources(pilots, capabilityContractsRoot);
  const { capabilityCatalog } = sourcePlan;
  const capabilitySourceAvailable = sourcePlan.capabilityMissing.length === 0;
  const runnable = [];
  for (const entry of sourcePlan.entries) {
    if (entry.missing.length > 0) {
      notRun.push({
        name: entry.pilot.name,
        reason: `source inputs are unavailable; set ${entry.pilot.sourceEnvironments.join(", ")} to absolute checkouts`,
        missing: entry.missing
      });
    } else if (!capabilitySourceAvailable) {
      notRun.push({
        name: entry.pilot.name,
        reason: "Capability Contracts source input is unavailable",
        missing: sourcePlan.capabilityMissing
      });
    } else {
      runnable.push(entry.pilot);
    }
  }

  if (!capabilitySourceAvailable) {
    notRun.push({
      name: "Capability Contracts",
      reason: "source input is unavailable; set OPENADAM_CAPABILITY_CONTRACTS_SOURCE_ROOT to an absolute checkout",
      missing: sourcePlan.capabilityMissing
    });
  }

  const sharedChecksPassed = [
    runCheck(
      failures,
      "Procedure Contracts",
      "repository check",
      "npm",
      ["run", "check"],
      repositoryRoot
    )
  ];
  if (capabilitySourceAvailable) {
    sharedChecksPassed.push(
      runCheck(
        failures,
        "Capability Contracts",
        "repository check",
        "npm",
        ["run", "check"],
        capabilityContractsRoot
      )
    );
    sharedChecksPassed.push(
      runCheck(
        failures,
        "Procedure Contracts",
        "Capability reference validation",
        process.execPath,
        [
          "src/validate-capability-refs.mjs",
          "--capability-catalog",
          capabilityCatalog,
          "--procedure-catalog",
          resolve(repositoryRoot, "catalog/procedures")
        ],
        repositoryRoot
      )
    );
  }

  if (sharedChecksPassed.includes(false)) {
    for (const pilot of runnable) {
      skipped.push({
        name: pilot.name,
        reason: "shared Procedure or Capability contract prerequisites did not pass"
      });
    }
  }

  const bindingReady = [];
  if (!sharedChecksPassed.includes(false)) {
    for (const pilot of runnable) {
      console.log(`\n[${pilot.name}] Procedure stage provider binding integrity`);
      const passed = runCheck(
        failures,
        pilot.name,
        "stage provider binding integrity",
        process.execPath,
        [
          "src/validate-stage-bindings.mjs",
          "--profile",
          `catalog/procedures/${pilot.profile}`,
          "--suite",
          `catalog/conformance/${pilot.profile}`,
          "--manifest",
          resolve(pilot.implementationRoot, pilot.manifest),
          ...pilot.capabilityManifests.flatMap((path) => [
            "--capability-manifest",
            path
          ])
        ],
        repositoryRoot
      );
      if (passed) bindingReady.push(pilot);
    }
  }

  for (const pilot of bindingReady) {
    let passed = true;
    if (!checkedImplementations.has(pilot.implementationRoot)) {
      console.log(`\n[${pilot.name}] implementation drift check`);
      passed = runCheck(
        failures,
        pilot.name,
        "implementation check",
        pilot.implementationCheck[0],
        pilot.implementationCheck[1],
        pilot.implementationRoot,
        pilot.environment
      );
      if (passed) {
        passed = runCheck(
          failures,
          pilot.name,
          "secondary implementation check",
          pilot.secondaryCheck[0],
          pilot.secondaryCheck[1],
          pilot.implementationRoot,
          pilot.environment
        );
      }
      if (passed) checkedImplementations.add(pilot.implementationRoot);
    }
    if (!passed) continue;
    console.log(`[${pilot.name}] Procedure conformance`);
    const conformanceArgs = [
      "src/run-conformance.mjs",
      "--profile",
      `catalog/procedures/${pilot.profile}`,
      "--suite",
      `catalog/conformance/${pilot.profile}`,
      "--manifest",
      resolve(pilot.implementationRoot, pilot.manifest),
      "--implementation-root",
      pilot.implementationRoot
    ];
    passed = runCheck(
      failures,
      pilot.name,
      "Procedure conformance",
      process.execPath,
      conformanceArgs,
      repositoryRoot,
      pilot.environment
    );
    if (passed && pilot.compositionSuite !== undefined) {
      console.log(`[${pilot.name}] Procedure composition conformance`);
      passed = runCheck(
        failures,
        pilot.name,
        "Procedure composition conformance",
        process.execPath,
        [
          ...conformanceArgs,
          "--composition-suite",
          resolve(pilot.implementationRoot, pilot.compositionSuite)
        ],
        repositoryRoot,
        pilot.environment
      );
    }
    if (passed) completed.push(pilot.name);
  }
  if (failures.length > 0) {
    console.log(`\n${JSON.stringify({ status: "failed", completed, failed: failures, notRun, skipped })}`);
    process.exitCode = 1;
  } else if (notRun.length > 0) {
    console.log(`\n${JSON.stringify({ status: "incomplete", completed, notRun, skipped })}`);
    process.exitCode = 2;
  } else {
    console.log(`\n${JSON.stringify({ status: "pass", completed, failed: [], notRun, skipped })}`);
  }
} catch (error) {
  console.error(`\nFAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
