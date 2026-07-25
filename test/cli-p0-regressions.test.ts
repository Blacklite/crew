/**
 * P0 Regression Tests — Issue #333
 * Validates fixes for bugs found during Phase 1 hostile QA.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { TerminalHarness } from './acceptance/harness.js';

describe('P0 Bug Regressions', { timeout: 30_000 }, () => {
  let harness: TerminalHarness | null = null;

  afterEach(async () => {
    if (harness) {
      await harness.close();
      harness = null;
    }
  });

  // BUG-1: --version outputs bare semver (intentional per P0 UX decision)
  describe('BUG-1: --version bare semver', () => {
    it('outputs bare semver without "crew" prefix', async () => {
      harness = await TerminalHarness.spawnWithArgs(['--version']);
      await harness.waitForExit(15000);

      const output = harness.captureFrame().trim();
      const lines = output.split('\n').filter((l) => l.trim());

      expect(lines.length).toBe(1);
      expect(lines[0]).toMatch(/^\d+\.\d+\.\d+/);
      expect(lines[0]).not.toMatch(/^crew/);
    });

    it('-v also outputs bare semver', async () => {
      harness = await TerminalHarness.spawnWithArgs(['-v']);
      await harness.waitForExit(15000);

      const output = harness.captureFrame().trim();
      expect(output).toMatch(/^\d+\.\d+\.\d+/);
    });
  });

  // BUG-2: Empty/whitespace args should show help, not launch shell
  describe('BUG-2: empty/whitespace args show help', () => {
    it('empty string arg shows help and exits 0', async () => {
      harness = await TerminalHarness.spawnWithArgs(['']);
      await harness.waitForExit(15000);

      const output = harness.captureFrame();
      const exitCode = harness.getExitCode();

      expect(exitCode).toBe(0);
      expect(output).toContain('crew');
      expect(output).toMatch(/Usage|help/i);
    });

    it('whitespace-only arg shows help and exits 0', async () => {
      harness = await TerminalHarness.spawnWithArgs(['   ']);
      await harness.waitForExit(15000);

      const output = harness.captureFrame();
      const exitCode = harness.getExitCode();

      expect(exitCode).toBe(0);
      expect(output).toContain('crew');
      expect(output).toMatch(/Usage|help/i);
    });

    it('tab-only arg shows help and exits 0', async () => {
      harness = await TerminalHarness.spawnWithArgs(['\t']);
      await harness.waitForExit(15000);

      const output = harness.captureFrame();
      const exitCode = harness.getExitCode();

      expect(exitCode).toBe(0);
      expect(output).toMatch(/Usage|help/i);
    });
  });

  // Error messages include remediation hints
  describe('Error messages have remediation hints', () => {
    it('unknown command includes "crew help" hint', async () => {
      harness = await TerminalHarness.spawnWithArgs(['nonexistent-command']);
      await harness.waitForExit(15000);

      const output = harness.captureFrame();
      expect(output).toMatch(/crew help/i);
    });

    it('unknown command includes "crew doctor" hint', async () => {
      harness = await TerminalHarness.spawnWithArgs(['nonexistent-command']);
      await harness.waitForExit(15000);

      const output = harness.captureFrame();
      expect(output).toMatch(/crew doctor/i);
    });
  });
});
