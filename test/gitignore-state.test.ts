/**
 * Unit tests for gitignore-state helpers.
 *
 * Tests addCrewStateGitignoreBlock and removeCrewStateGitignoreBlock
 * using the InMemoryStorageProvider — no filesystem access required.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { join } from 'node:path';
import { InMemoryStorageProvider } from '../packages/crew-sdk/src/storage/in-memory-storage-provider.js';
import {
  addCrewStateGitignoreBlock,
  removeCrewStateGitignoreBlock,
  CREW_STATE_GITIGNORE_OPEN_MARKER,
  CREW_STATE_GITIGNORE_CLOSE_MARKER,
} from '../packages/crew-sdk/src/config/gitignore-state.js';

const GITIGNORE_PATH = join('/project', '.gitignore');

describe('addCrewStateGitignoreBlock', () => {
  let storage: InMemoryStorageProvider;

  beforeEach(() => {
    storage = new InMemoryStorageProvider();
  });

  it('adds the marker block when .gitignore does not exist', () => {
    const added = addCrewStateGitignoreBlock(GITIGNORE_PATH, storage);
    expect(added).toBe(true);
    const content = storage.readSync(GITIGNORE_PATH) ?? '';
    expect(content).toContain(CREW_STATE_GITIGNORE_OPEN_MARKER);
    expect(content).toContain('.crew/decisions.md');
    expect(content).toContain('.crew/agents/*/history.md');
    expect(content).toContain(CREW_STATE_GITIGNORE_CLOSE_MARKER);
  });

  it('adds the marker block when .gitignore has existing content without a trailing newline', () => {
    storage.writeSync(GITIGNORE_PATH, 'node_modules/\ndist/');
    const added = addCrewStateGitignoreBlock(GITIGNORE_PATH, storage);
    expect(added).toBe(true);
    const content = storage.readSync(GITIGNORE_PATH) ?? '';
    expect(content).toContain('node_modules/');
    expect(content).toContain('dist/');
    expect(content).toContain(CREW_STATE_GITIGNORE_OPEN_MARKER);
    expect(content).toContain('.crew/decisions.md');
    expect(content).toContain('.crew/agents/*/history.md');
    expect(content).toContain(CREW_STATE_GITIGNORE_CLOSE_MARKER);
  });

  it('adds the marker block when .gitignore has existing content with a trailing newline', () => {
    storage.writeSync(GITIGNORE_PATH, 'node_modules/\ndist/\n');
    const added = addCrewStateGitignoreBlock(GITIGNORE_PATH, storage);
    expect(added).toBe(true);
    const content = storage.readSync(GITIGNORE_PATH) ?? '';
    expect(content).toContain(CREW_STATE_GITIGNORE_OPEN_MARKER);
  });

  it('is idempotent — returns false if block already present', () => {
    addCrewStateGitignoreBlock(GITIGNORE_PATH, storage);
    const contentAfterFirst = storage.readSync(GITIGNORE_PATH);

    const added = addCrewStateGitignoreBlock(GITIGNORE_PATH, storage);
    expect(added).toBe(false);

    // Content must be exactly the same after second call
    expect(storage.readSync(GITIGNORE_PATH)).toBe(contentAfterFirst);
  });

  it('does not duplicate the block on repeated calls', () => {
    addCrewStateGitignoreBlock(GITIGNORE_PATH, storage);
    addCrewStateGitignoreBlock(GITIGNORE_PATH, storage);
    addCrewStateGitignoreBlock(GITIGNORE_PATH, storage);
    const content = storage.readSync(GITIGNORE_PATH) ?? '';
    const occurrences = (content.match(/# Crew: state owned by crew-state branch/g) ?? []).length;
    expect(occurrences).toBe(1);
  });
});

describe('removeCrewStateGitignoreBlock', () => {
  let storage: InMemoryStorageProvider;

  beforeEach(() => {
    storage = new InMemoryStorageProvider();
  });

  it('returns false when .gitignore does not exist', () => {
    const removed = removeCrewStateGitignoreBlock(GITIGNORE_PATH, storage);
    expect(removed).toBe(false);
  });

  it('returns false when block is not present in existing .gitignore', () => {
    storage.writeSync(GITIGNORE_PATH, 'node_modules/\ndist/\n');
    const removed = removeCrewStateGitignoreBlock(GITIGNORE_PATH, storage);
    expect(removed).toBe(false);
    expect(storage.readSync(GITIGNORE_PATH)).toBe('node_modules/\ndist/\n');
  });

  it('removes the marker block when present', () => {
    addCrewStateGitignoreBlock(GITIGNORE_PATH, storage);
    const removed = removeCrewStateGitignoreBlock(GITIGNORE_PATH, storage);
    expect(removed).toBe(true);
    const content = storage.readSync(GITIGNORE_PATH) ?? '';
    expect(content).not.toContain(CREW_STATE_GITIGNORE_OPEN_MARKER);
    expect(content).not.toContain('.crew/decisions.md');
    expect(content).not.toContain('.crew/agents/*/history.md');
    expect(content).not.toContain(CREW_STATE_GITIGNORE_CLOSE_MARKER);
  });

  it('is idempotent — returns false if block already removed', () => {
    addCrewStateGitignoreBlock(GITIGNORE_PATH, storage);
    removeCrewStateGitignoreBlock(GITIGNORE_PATH, storage);
    const removed = removeCrewStateGitignoreBlock(GITIGNORE_PATH, storage);
    expect(removed).toBe(false);
  });

  it('preserves content before the block', () => {
    storage.writeSync(GITIGNORE_PATH, 'node_modules/\ndist/\n');
    addCrewStateGitignoreBlock(GITIGNORE_PATH, storage);
    removeCrewStateGitignoreBlock(GITIGNORE_PATH, storage);
    const content = storage.readSync(GITIGNORE_PATH) ?? '';
    expect(content).toContain('node_modules/');
    expect(content).toContain('dist/');
  });

  it('preserves content after the block', () => {
    // Manually write a .gitignore that has content both before and after the block
    const withBlock = [
      'node_modules/',
      'dist/',
      CREW_STATE_GITIGNORE_OPEN_MARKER,
      '.crew/decisions.md',
      '.crew/agents/*/history.md',
      CREW_STATE_GITIGNORE_CLOSE_MARKER,
      '# custom entry after block',
      'build/',
      '',
    ].join('\n');
    storage.writeSync(GITIGNORE_PATH, withBlock);
    removeCrewStateGitignoreBlock(GITIGNORE_PATH, storage);
    const content = storage.readSync(GITIGNORE_PATH) ?? '';
    expect(content).toContain('node_modules/');
    expect(content).toContain('dist/');
    expect(content).toContain('# custom entry after block');
    expect(content).toContain('build/');
    expect(content).not.toContain(CREW_STATE_GITIGNORE_OPEN_MARKER);
  });
});

describe('round-trip: add then remove', () => {
  it('leaves .gitignore byte-identical (empty file)', () => {
    const storage = new InMemoryStorageProvider();
    storage.writeSync(GITIGNORE_PATH, '');
    addCrewStateGitignoreBlock(GITIGNORE_PATH, storage);
    removeCrewStateGitignoreBlock(GITIGNORE_PATH, storage);
    expect(storage.readSync(GITIGNORE_PATH)).toBe('');
  });

  it('leaves .gitignore byte-identical (file with content ending in newline)', () => {
    const storage = new InMemoryStorageProvider();
    const original = '# existing entries\nnode_modules/\ndist/\n';
    storage.writeSync(GITIGNORE_PATH, original);
    addCrewStateGitignoreBlock(GITIGNORE_PATH, storage);
    removeCrewStateGitignoreBlock(GITIGNORE_PATH, storage);
    expect(storage.readSync(GITIGNORE_PATH)).toBe(original);
  });

  it('leaves .gitignore byte-identical (file without trailing newline)', () => {
    const storage = new InMemoryStorageProvider();
    const original = '# existing entries\nnode_modules/\ndist/';
    storage.writeSync(GITIGNORE_PATH, original);
    addCrewStateGitignoreBlock(GITIGNORE_PATH, storage);
    removeCrewStateGitignoreBlock(GITIGNORE_PATH, storage);
    const result = storage.readSync(GITIGNORE_PATH) ?? '';
    // Files without a trailing newline gain one after round-trip (acceptable for .gitignore)
    expect(result.trimEnd()).toBe(original.trimEnd());
    expect(result).not.toContain('# Crew: state owned by crew-state branch');
  });
});
