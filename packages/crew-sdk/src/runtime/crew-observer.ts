/**
 * Crew Observer — File watcher for .crew/ directory changes (Issue #268)
 *
 * Monitors the .crew/ directory for file changes and emits OTel spans
 * and EventBus events for real-time observability of crew state changes.
 * Ported from paulyuk/crew#1.
 *
 * @module runtime/crew-observer
 */

// fs.watch and fs.FSWatcher retained — not in StorageProvider scope
import { lstatSync, readdirSync, watch, type Dirent, type FSWatcher } from 'node:fs';
import path from 'node:path';
import { FSStorageProvider } from '../storage/fs-storage-provider.js';

const storage = new FSStorageProvider();
import { SpanStatusCode } from './otel-api.js';
import { getTracer } from './otel.js';
import { EventBus, type CrewEvent } from './event-bus.js';

// ============================================================================
// Types
// ============================================================================

/** Categories of .crew/ file changes. */
export type CrewFileCategory =
  | 'agent'
  | 'casting'
  | 'config'
  | 'decision'
  | 'skill'
  | 'unknown';

/** A detected file change in the .crew/ directory. */
export interface CrewFileChange {
  /** Relative path from .crew/ root */
  relativePath: string;
  /** Absolute path on disk */
  absolutePath: string;
  /** Type of change */
  changeType: 'created' | 'modified' | 'deleted';
  /** Category of the changed file */
  category: CrewFileCategory;
  /** Timestamp of detection */
  timestamp: Date;
}

/** Configuration for the observer. */
export interface CrewObserverConfig {
  /** Path to the .crew/ directory to watch */
  crewDir: string;
  /** Optional EventBus to emit events to */
  eventBus?: EventBus;
  /** Debounce interval in ms (default: 200) */
  debounceMs?: number;
}

// ============================================================================
// Category classification
// ============================================================================

/**
 * Classify a file path within .crew/ into a category.
 */
export function classifyFile(relativePath: string): CrewFileCategory {
  const normalized = relativePath.replace(/\\/g, '/');
  if (normalized.startsWith('agents/')) return 'agent';
  if (normalized.startsWith('casting/')) return 'casting';
  if (normalized.startsWith('skills/')) return 'skill';
  if (normalized.startsWith('decisions/') || normalized === 'decisions.md') return 'decision';
  if (normalized === 'config.json' || normalized === 'team.md' || normalized.startsWith('config/')) return 'config';
  return 'unknown';
}

// ============================================================================
// Observer implementation
// ============================================================================

/**
 * File watcher that monitors .crew/ directory and emits OTel events.
 *
 * Usage:
 * ```typescript
 * const observer = new CrewObserver({
 *   crewDir: '/path/to/.crew',
 *   eventBus: myEventBus,
 * });
 * observer.start();
 * // ... later
 * observer.stop();
 * ```
 */
export class CrewObserver {
  private config: Required<Pick<CrewObserverConfig, 'crewDir' | 'debounceMs'>> & Pick<CrewObserverConfig, 'eventBus'>;
  private watcher: FSWatcher | undefined;
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private running = false;

  constructor(config: CrewObserverConfig) {
    this.config = {
      crewDir: config.crewDir,
      eventBus: config.eventBus,
      debounceMs: config.debounceMs ?? 200,
    };
  }

  /**
   * Start watching the .crew/ directory for changes.
   * Emits OTel spans and EventBus events for each detected change.
   */
  start(): void {
    if (this.running) return;
    if (!storage.existsSync(this.config.crewDir)) {
      throw new Error(`Crew directory not found: ${this.config.crewDir}`);
    }

    const tracer = getTracer('crew-observer');
    const span = tracer.startSpan('crew.observer.start', {
      attributes: {
        'crew.dir': this.config.crewDir,
        'debounce_ms': this.config.debounceMs,
      },
    });

    try {
      this.watcher = watch(this.config.crewDir, { recursive: true }, (eventType, filename) => {
        if (!filename) return;
        // Skip high-churn directories that don't affect crew state
        const normalized = filename.replace(/\\/g, '/');
        if (normalized.startsWith('orchestration-log/') || normalized.startsWith('.git/')) return;
        this.handleChange(eventType, filename);
      });

      this.watcher.on('error', (err: Error) => {
        const errSpan = tracer.startSpan('crew.observer.error', {
          attributes: { 'error.message': err.message },
        });
        errSpan.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
        errSpan.recordException(err);
        errSpan.end();
      });

      this.running = true;
      span.end();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      span.recordException(error);
      span.end();
      throw err;
    }
  }

  /**
   * Stop watching and clean up.
   */
  stop(): void {
    if (!this.running) return;

    const tracer = getTracer('crew-observer');
    const span = tracer.startSpan('crew.observer.stop');

    // Clear all pending debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    this.watcher?.close();
    this.watcher = undefined;
    this.running = false;
    span.end();
  }

  /** Whether the observer is currently running. */
  get isRunning(): boolean {
    return this.running;
  }

  // --------------------------------------------------------------------------
  // Internal
  // --------------------------------------------------------------------------

  private handleChange(eventType: string, filename: string): void {
    // Debounce rapid changes to the same file
    const existing = this.debounceTimers.get(filename);
    if (existing) clearTimeout(existing);

    this.debounceTimers.set(filename, setTimeout(() => {
      this.debounceTimers.delete(filename);
      this.processChange(filename);
    }, this.config.debounceMs));
  }

  private processChange(filename: string): void {
    const relativePath = this.resolveChangedRelativePath(filename);
    const crewDirName = path.basename(this.config.crewDir);
    if (!relativePath || relativePath === crewDirName) return;

    const absolutePath = path.join(this.config.crewDir, relativePath);
    const category = classifyFile(relativePath);
    const exists = storage.existsSync(absolutePath);

    // Determine change type — basic heuristic since fs.watch doesn't tell us
    const changeType: CrewFileChange['changeType'] = exists ? 'modified' : 'deleted';

    const change: CrewFileChange = {
      relativePath,
      absolutePath,
      changeType,
      category,
      timestamp: new Date(),
    };

    // Emit OTel span
    this.emitSpan(change);

    // Emit EventBus event
    if (this.config.eventBus) {
      this.emitEvent(change);
    }
  }

  private resolveChangedRelativePath(filename: string): string {
    const normalized = filename.replace(/\\/g, '/');
    const crewDirName = path.basename(this.config.crewDir);
    const withoutCrewPrefix = normalized.startsWith(`${crewDirName}/`)
      ? normalized.slice(crewDirName.length + 1)
      : normalized;

    if (classifyFile(withoutCrewPrefix) !== 'unknown') return withoutCrewPrefix;

    if (normalized === crewDirName) {
      return this.findMostRecentlyModifiedFile(this.config.crewDir) ?? withoutCrewPrefix;
    }

    return withoutCrewPrefix;
  }

  private findMostRecentlyModifiedFile(dir: string, relativeTo = dir): string | null {
    let newest: { relativePath: string; mtimeMs: number } | null = null;

    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return null;
    }

    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;

      const absolutePath = path.join(dir, entry.name);
      let stat: ReturnType<typeof lstatSync>;
      try {
        stat = lstatSync(absolutePath);
      } catch {
        continue;
      }

      if (stat.isSymbolicLink()) continue;

      if (stat.isDirectory()) {
        const nested = this.findMostRecentlyModifiedFile(absolutePath, relativeTo);
        if (!nested) continue;

        try {
          const nestedStat = lstatSync(path.join(relativeTo, nested));
          if (!nestedStat.isSymbolicLink() && (!newest || nestedStat.mtimeMs > newest.mtimeMs)) {
            newest = { relativePath: nested, mtimeMs: nestedStat.mtimeMs };
          }
        } catch {
          continue;
        }
        continue;
      }

      const relativePath = path.relative(relativeTo, absolutePath).replace(/\\/g, '/');
      if (!newest || stat.mtimeMs > newest.mtimeMs) {
        newest = { relativePath, mtimeMs: stat.mtimeMs };
      }
    }

    return newest?.relativePath ?? null;
  }

  private emitSpan(change: CrewFileChange): void {
    const tracer = getTracer('crew-observer');
    const span = tracer.startSpan('crew.observer.file_change', {
      attributes: {
        'file.path': change.relativePath,
        'file.category': change.category,
        'change.type': change.changeType,
      },
    });
    span.end();
  }

  private emitEvent(change: CrewFileChange): void {
    if (!this.config.eventBus) return;

    // Map file categories to appropriate event types
    const event: CrewEvent = {
      type: 'agent:milestone',
      agentName: change.category === 'agent' ? path.basename(path.dirname(change.relativePath)) : undefined,
      payload: {
        action: 'file_change',
        file: change.relativePath,
        category: change.category,
        changeType: change.changeType,
      },
      timestamp: change.timestamp,
    };

    // Fire and forget — errors handled by EventBus
    void this.config.eventBus.emit(event);
  }
}
