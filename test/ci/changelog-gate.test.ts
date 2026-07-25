/**
 * Reads the live SDK_CLI_PATH_REGEX from the changelog gate workflow so this
 * suite stays in sync with CI path matching. Guards issue #1156 against
 * regressions in governed source/template paths.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const workflowPath = path.resolve(__dirname, '..', '..', '.github', 'workflows', 'crew-ci.yml');
const workflow = readFileSync(workflowPath, 'utf-8');
const patternMatch = workflow.match(/SDK_CLI_PATH_REGEX='([^']+)'/);

let regex: RegExp;

beforeAll(() => {
  expect(
    patternMatch,
    'Expected changelog gate SDK_CLI_PATH_REGEX to be defined in crew-ci.yml',
  ).not.toBeNull();
  regex = new RegExp(patternMatch?.[1] ?? '');
});

const governedPaths = [
  'packages/crew-sdk/src/index.ts',
  'packages/crew-cli/src/cli/core/bootstrap.ts',
  'packages/crew-sdk/templates/skills/example/SKILL.md',
  'packages/crew-cli/templates/scaffold/agent.md',
  '.crew-templates/crew.agent.md',
  '.crew-templates/scribe-charter.md',
  'templates/skills/release-process/SKILL.md',
  'templates/casting/policy.json',
  '.crew/agents/troi/charter.md',
];

const unrelatedPaths = [
  'README.md',
  'docs/guide/intro.md',
  '.github/workflows/crew-ci.yml',
  'package.json',
  'packages/crew-cli/package.json',
  'scripts/bump-build.mjs',
  'test/ci/changelog-gate.test.ts',
  '.crew/agents/troi/notes.md',
  '.crew/routing.md',
];

describe('changelog gate path matching', () => {
  describe('governed paths require a changeset', () => {
    it.each(governedPaths)('%s', filePath => {
      expect(regex.test(filePath)).toBe(true);
    });
  });

  describe('unrelated paths are not gated', () => {
    it.each(unrelatedPaths)('%s', filePath => {
      expect(regex.test(filePath)).toBe(false);
    });
  });
});
