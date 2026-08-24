#!/usr/bin/env node

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = resolve(repositoryRoot, "..");

function firstExisting(...paths) {
  return paths.find((path) => existsSync(path)) ?? paths[0];
}

const fileVitalsManifest = firstExisting(
  resolve(workspaceRoot, "file-vitals/capabilities/provider.json"),
  resolve(workspaceRoot, "universal-inspector/capabilities/provider.json")
);

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    env: process.env,
    stdio: "inherit"
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with status ${result.status}`);
  }
}

const pilots = [
  {
    name: "Structured Data Preflight",
    implementationRoot: resolve(workspaceRoot, "structured-data-preflight"),
    implementationCheck: ["uv", ["run", "ruff", "check", "."]],
    secondaryCheck: ["uv", ["run", "pytest"]],
    profile: "structured-data-preflight.v0.1.json",
    manifest: "procedure/implementation-manifest.json",
    compositionSuite: "procedure/composition-conformance.json",
    capabilityManifests: [
      fileVitalsManifest,
      resolve(workspaceRoot, "data-transformer/capabilities/provider.json")
    ]
  },
  {
    name: "Brand Asset Prep",
    implementationRoot: resolve(workspaceRoot, "brand-asset-prep"),
    implementationCheck: ["uv", ["run", "ruff", "check", "."]],
    secondaryCheck: ["uv", ["run", "pytest"]],
    profile: "brand-asset-prepare.v0.1.json",
    manifest: "procedure/implementation-manifest.json",
    capabilityManifests: [
      resolve(workspaceRoot, "asset-prep/capabilities/provider.json"),
      resolve(workspaceRoot, "perspective-tool/capabilities/provider.json")
    ]
  },
  {
    name: "Dependency Preflight",
    implementationRoot: resolve(workspaceRoot, "dependency-preflight"),
    implementationCheck: ["npm", ["run", "check"]],
    secondaryCheck: ["node", ["--test", "test/contract-alignment.test.mjs"]],
    profile: "package-dependency-change-preflight.v0.1.json",
    manifest: "procedure/implementation-manifest.json",
    capabilityManifests: [
      resolve(workspaceRoot, "dependency-preflight/capabilities/provider.json")
    ]
  }
];

try {
  run("npm", ["run", "check"], repositoryRoot);
  const checkedImplementations = new Set();
  for (const pilot of pilots) {
    if (!checkedImplementations.has(pilot.implementationRoot)) {
      console.log(`\n[${pilot.name}] implementation drift check`);
      run(pilot.implementationCheck[0], pilot.implementationCheck[1], pilot.implementationRoot);
      run(pilot.secondaryCheck[0], pilot.secondaryCheck[1], pilot.implementationRoot);
      checkedImplementations.add(pilot.implementationRoot);
    }
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
    run(
      process.execPath,
      conformanceArgs,
      repositoryRoot
    );
    if (pilot.compositionSuite !== undefined) {
      console.log(`[${pilot.name}] Procedure composition conformance`);
      run(
        process.execPath,
        [
          ...conformanceArgs,
          "--composition-suite",
          resolve(pilot.implementationRoot, pilot.compositionSuite)
        ],
        repositoryRoot
      );
    }
    if (pilot.capabilityManifests !== undefined) {
      console.log(`[${pilot.name}] Procedure stage provider binding integrity`);
      run(
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
    }
  }
  console.log("\nPASS all pilot Procedure contracts and implementation conformance suites");
} catch (error) {
  console.error(`\nFAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
