/**
 * Crew Observer Tests — File watcher OTel integration (Issue #268)
 *
 * Tests the CrewObserver class and classifyFile utility.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  BasicTracerProvider,
} from '@opentelemetry/sdk-trace-base';
import { trace } from '@opentelemetry/api';
import { CrewObserver, classifyFile } from '@blacklite/crew-sdk/runtime/crew-observer';
import { EventBus } from '@blacklite/crew-sdk/runtime/event-bus';

// ---------------------------------------------------------------------------
// Test OTel infrastructure
// ---------------------------------------------------------------------------

let exporter: InMemorySpanExporter;
let provider: BasicTracerProvider;

function setupTestProvider() {
  exporter = new InMemorySpanExporter();
  const processor = new SimpleSpanProcessor(exporter);
  provider = new BasicTracerProvider({ spanProcessors: [processor] });
  trace.setGlobalTracerProvider(provider);
}

function teardownTestProvider() {
  exporter.reset();
  trace.disable();
  provider.shutdown();
}

// ---------------------------------------------------------------------------
// Temp directory helper
// ---------------------------------------------------------------------------

let tmpDir: string;

function createTmpCrewDir(): string {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crew-observer-test-'));
  const crewDir = path.join(tmpDir, '.crew');
  fs.mkdirSync(crewDir, { recursive: true });
  fs.mkdirSync(path.join(crewDir, 'agents', 'fenster'), { recursive: true });
  fs.mkdirSync(path.join(crewDir, 'casting'), { recursive: true });
  fs.mkdirSync(path.join(crewDir, 'skills'), { recursive: true });
  fs.mkdirSync(path.join(crewDir, 'decisions'), { recursive: true });
  return crewDir;
}

function cleanupTmpDir() {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function isUnsupportedSymlinkError(error: unknown): boolean {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? (error as NodeJS.ErrnoException).code
    : undefined;
  return code === 'EPERM' || code === 'EACCES' || code === 'ENOSYS';
}

function canCreateSymlink(): boolean {
  const probeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crew-observer-symlink-probe-'));
  try {
    const targetDir = path.join(probeDir, 'target');
    const symlinkPath = path.join(probeDir, 'link');
    fs.mkdirSync(targetDir);
    fs.symlinkSync(targetDir, symlinkPath, 'dir');
    return true;
  } catch (error) {
    if (isUnsupportedSymlinkError(error)) return false;
    throw error;
  } finally {
    fs.rmSync(probeDir, { recursive: true, force: true });
  }
}

const symlinkSupported = canCreateSymlink();

// ---------------------------------------------------------------------------
// classifyFile tests
// ---------------------------------------------------------------------------

describe('classifyFile', () => {
  it('classifies agent files', () => {
    expect(classifyFile('agents/fenster/history.md')).toBe('agent');
    expect(classifyFile('agents/keaton/charter.md')).toBe('agent');
  });

  it('classifies casting files', () => {
    expect(classifyFile('casting/registry.json')).toBe('casting');
    expect(classifyFile('casting/history.json')).toBe('casting');
  });

  it('classifies skill files', () => {
    expect(classifyFile('skills/review/SKILL.md')).toBe('skill');
  });

  it('classifies decision files', () => {
    expect(classifyFile('decisions/inbox/test.md')).toBe('decision');
    expect(classifyFile('decisions.md')).toBe('decision');
  });

  it('classifies config files', () => {
    expect(classifyFile('config.json')).toBe('config');
    expect(classifyFile('team.md')).toBe('config');
  });

  it('returns unknown for unrecognized paths', () => {
    expect(classifyFile('random.txt')).toBe('unknown');
    expect(classifyFile('README.md')).toBe('unknown');
  });

  it('normalizes Windows backslashes', () => {
    expect(classifyFile('agents\\fenster\\history.md')).toBe('agent');
    expect(classifyFile('casting\\registry.json')).toBe('casting');
  });
});

// ---------------------------------------------------------------------------
// CrewObserver tests
// ---------------------------------------------------------------------------

describe('CrewObserver', () => {
  let crewDir: string;

  beforeEach(() => {
    setupTestProvider();
    crewDir = createTmpCrewDir();
  });

  afterEach(() => {
    teardownTestProvider();
    cleanupTmpDir();
  });

  it('starts and stops without errors', () => {
    const observer = new CrewObserver({ crewDir });
    observer.start();
    expect(observer.isRunning).toBe(true);
    observer.stop();
    expect(observer.isRunning).toBe(false);
  });

  it('throws when crew directory does not exist', () => {
    const observer = new CrewObserver({ crewDir: '/nonexistent/path/.crew' });
    expect(() => observer.start()).toThrow('Crew directory not found');
  });

  it('emits start span', async () => {
    const observer = new CrewObserver({ crewDir });
    observer.start();
    observer.stop();

    await provider.forceFlush();
    const spans = exporter.getFinishedSpans();
    const startSpan = spans.find(s => s.name === 'crew.observer.start');
    expect(startSpan).toBeDefined();
    expect(startSpan!.attributes['crew.dir']).toBe(crewDir);
  });

  it('emits stop span', async () => {
    const observer = new CrewObserver({ crewDir });
    observer.start();
    observer.stop();

    await provider.forceFlush();
    const spans = exporter.getFinishedSpans();
    const stopSpan = spans.find(s => s.name === 'crew.observer.stop');
    expect(stopSpan).toBeDefined();
  });

  it('emits file_change span when a file is modified', async () => {
    const observer = new CrewObserver({ crewDir, debounceMs: 50 });
    observer.start();

    // Write a file to trigger the watcher
    fs.writeFileSync(path.join(crewDir, 'agents', 'fenster', 'history.md'), 'test content');

    // Wait for debounce + watcher propagation
    await new Promise(r => setTimeout(r, 300));

    observer.stop();
    await provider.forceFlush();

    const spans = exporter.getFinishedSpans();
    const changeSpan = spans.find(s =>
      s.name === 'crew.observer.file_change' &&
      s.attributes['file.category'] === 'agent'
    );
    expect(changeSpan).toBeDefined();
    expect(changeSpan!.attributes['file.category']).toBe('agent');
    expect(changeSpan!.attributes['change.type']).toBe('modified');
  });

  it('emits EventBus events when configured', async () => {
    const eventBus = new EventBus();
    const events: unknown[] = [];
    eventBus.subscribeAll((event) => {
      events.push(event);
    });

    const observer = new CrewObserver({ crewDir, eventBus, debounceMs: 50 });
    observer.start();

    fs.writeFileSync(path.join(crewDir, 'casting', 'registry.json'), '{}');

    await new Promise(r => setTimeout(r, 300));

    observer.stop();

    expect(events.length).toBeGreaterThan(0);
  });

  it('does not emit a bogus path when a root directory event cannot be resolved', async () => {
    const observer = new CrewObserver({ crewDir });
    const processChange = (observer as unknown as { processChange(filename: string): void }).processChange.bind(observer);

    processChange(path.basename(crewDir));
    await provider.forceFlush();

    const spans = exporter.getFinishedSpans();
    expect(spans.some(s => s.name === 'crew.observer.file_change')).toBe(false);
  });

  (symlinkSupported ? it : it.skip)('skips symlinked directories when resolving root directory events', async () => {
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crew-observer-outside-'));
    try {
      fs.writeFileSync(path.join(outsideDir, 'newest.md'), 'outside');
      const symlinkPath = path.join(crewDir, 'linked-outside');
      fs.symlinkSync(outsideDir, symlinkPath, 'dir');

      const olderFile = path.join(crewDir, 'team.md');
      fs.writeFileSync(olderFile, 'inside');
      const olderTime = new Date(Date.now() - 10_000);
      fs.utimesSync(olderFile, olderTime, olderTime);

      const observer = new CrewObserver({ crewDir });
      const findMostRecentlyModifiedFile = (
        observer as unknown as { findMostRecentlyModifiedFile(dir: string): string | null }
      ).findMostRecentlyModifiedFile.bind(observer);

      expect(findMostRecentlyModifiedFile(crewDir)).toBe('team.md');
    } finally {
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  it('is idempotent on start/stop', () => {
    const observer = new CrewObserver({ crewDir });
    observer.start();
    observer.start(); // second start should be no-op
    expect(observer.isRunning).toBe(true);
    observer.stop();
    observer.stop(); // second stop should be no-op
    expect(observer.isRunning).toBe(false);
  });
});
