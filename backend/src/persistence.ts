/**
 * Persistence Layer - handles optional file-based persistence for all data
 *
 * When /data is mounted, data persists across container restarts.
 * Environment variables control which data categories are persisted.
 */

import { promises as fs } from 'fs';
import * as fsSync from 'fs';
import path from 'path';

// Base path for persistent data
const DATA_PATH = process.env.TOLLBOOTH_DATA_PATH || '/data';

// Environment variable controls (all default to true if /data is mounted)
const PERSIST_TRAFFIC = process.env.TOLLBOOTH_PERSIST_TRAFFIC !== 'false';
const PERSIST_REPLAY = process.env.TOLLBOOTH_PERSIST_REPLAY !== 'false';
const PERSIST_RULES = process.env.TOLLBOOTH_PERSIST_RULES !== 'false';
const PERSIST_CONFIG = process.env.TOLLBOOTH_PERSIST_CONFIG !== 'false';
const PERSIST_STORE = process.env.TOLLBOOTH_PERSIST_STORE !== 'false';

// Directory structure
const DIRS = {
  config: path.join(DATA_PATH, 'config'),
  traffic: path.join(DATA_PATH, 'traffic'),
  replay: path.join(DATA_PATH, 'replay'),
  store: path.join(DATA_PATH, 'store'),
  storeResponses: path.join(DATA_PATH, 'store', 'responses'),
  storeRequests: path.join(DATA_PATH, 'store', 'requests'),
};

// Config file paths
const CONFIG_FILES = {
  rules: path.join(DIRS.config, 'rules.json'),
  settings: path.join(DIRS.config, 'settings.json'),
  presets: path.join(DIRS.config, 'presets.json'),
  templates: path.join(DIRS.config, 'templates.json'),
  refusalRules: path.join(DIRS.config, 'refusal-rules.json'),
};

class PersistenceManager {
  private enabled = false;
  private initialized = false;

  /**
   * Check if persistence is available and initialize directories
   */
  async initialize(): Promise<void> {
    // Check if /data exists and is writable
    try {
      await fs.access(DATA_PATH, fsSync.constants.W_OK);
      this.enabled = true;
      console.log(`[Persistence] Data directory found at ${DATA_PATH}`);
    } catch {
      this.enabled = false;
      console.log(`[Persistence] No data directory at ${DATA_PATH} - running in memory-only mode`);
      this.initialized = true;
      return;
    }

    // Create directory structure
    try {
      for (const dir of Object.values(DIRS)) {
        await fs.mkdir(dir, { recursive: true });
      }
      console.log('[Persistence] Directory structure initialized');
    } catch (err) {
      console.error('[Persistence] Failed to create directories:', err);
      this.enabled = false;
    }

    this.initialized = true;
    this.logConfig();
  }

  /**
   * Log current persistence configuration
   */
  private logConfig(): void {
    if (!this.enabled) return;

    console.log('[Persistence] Configuration:');
    console.log(`  - Traffic: ${PERSIST_TRAFFIC ? 'enabled' : 'disabled'}`);
    console.log(`  - Replay: ${PERSIST_REPLAY ? 'enabled' : 'disabled'}`);
    console.log(`  - Rules: ${PERSIST_RULES ? 'enabled' : 'disabled'}`);
    console.log(`  - Config: ${PERSIST_CONFIG ? 'enabled' : 'disabled'}`);
    console.log(`  - Store: ${PERSIST_STORE ? 'enabled' : 'disabled'}`);
  }

  /**
   * Check if persistence is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Check if a specific category is persisted
   */
  isPersisted(category: 'traffic' | 'replay' | 'rules' | 'config' | 'store'): boolean {
    if (!this.enabled) return false;

    switch (category) {
      case 'traffic': return PERSIST_TRAFFIC;
      case 'replay': return PERSIST_REPLAY;
      case 'rules': return PERSIST_RULES;
      case 'config': return PERSIST_CONFIG;
      case 'store': return PERSIST_STORE;
      default: return false;
    }
  }

  /**
   * Get paths for different data categories
   */
  getPaths() {
    return {
      dataPath: DATA_PATH,
      dirs: DIRS,
      configFiles: CONFIG_FILES,
    };
  }

  // ============ Traffic Persistence ============

  /**
   * Get the file path for a traffic flow
   */
  getTrafficFilePath(flowId: string): string {
    const sanitizedId = flowId.replace(/[^a-zA-Z0-9._-]/g, '_');
    return path.join(DIRS.traffic, `${sanitizedId}.json`);
  }

  /**
   * Save a traffic flow to disk
   */
  async saveTrafficFlow(flowId: string, flow: unknown): Promise<void> {
    if (!this.isPersisted('traffic')) return;

    const filePath = this.getTrafficFilePath(flowId);
    await fs.writeFile(filePath, JSON.stringify(flow, null, 2), 'utf-8');
  }

  /**
   * Load a traffic flow from disk
   */
  async loadTrafficFlow(flowId: string): Promise<unknown | null> {
    if (!this.isPersisted('traffic')) return null;

    const filePath = this.getTrafficFilePath(flowId);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch (err: any) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }

  /**
   * Load all traffic flows from disk
   */
  async loadAllTrafficFlows(): Promise<unknown[]> {
    if (!this.isPersisted('traffic')) return [];

    try {
      const files = await fs.readdir(DIRS.traffic);
      const jsonFiles = files.filter(f => f.endsWith('.json'));
      const flows: unknown[] = [];

      for (const file of jsonFiles) {
        try {
          const content = await fs.readFile(path.join(DIRS.traffic, file), 'utf-8');
          flows.push(JSON.parse(content));
        } catch (err) {
          console.error(`[Persistence] Failed to load traffic flow ${file}:`, err);
        }
      }

      console.log(`[Persistence] Loaded ${flows.length} traffic flows`);
      return flows;
    } catch (err: any) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
  }

  /**
   * Delete a traffic flow from disk
   */
  async deleteTrafficFlow(flowId: string): Promise<void> {
    if (!this.isPersisted('traffic')) return;

    const filePath = this.getTrafficFilePath(flowId);
    try {
      await fs.unlink(filePath);
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err;
    }
  }

  // ============ Config File Persistence ============

  /**
   * Save a config file
   */
  async saveConfigFile(name: keyof typeof CONFIG_FILES, data: unknown): Promise<void> {
    if (!this.isPersisted('config') && name !== 'rules') return;
    if (!this.isPersisted('rules') && name === 'rules') return;

    const filePath = CONFIG_FILES[name];
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  /**
   * Load a config file
   */
  async loadConfigFile<T>(name: keyof typeof CONFIG_FILES, defaultValue: T): Promise<T> {
    if (!this.isPersisted('config') && name !== 'rules') return defaultValue;
    if (!this.isPersisted('rules') && name === 'rules') return defaultValue;

    const filePath = CONFIG_FILES[name];
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as T;
    } catch (err: any) {
      if (err.code === 'ENOENT') return defaultValue;
      throw err;
    }
  }

  // ============ Replay Persistence ============

  /**
   * Get the file path for a replay variant
   */
  getReplayFilePath(variantId: string): string {
    const sanitizedId = variantId.replace(/[^a-zA-Z0-9._-]/g, '_');
    return path.join(DIRS.replay, `${sanitizedId}.json`);
  }

  /**
   * Get the replay names file path
   */
  getReplayNamesFilePath(): string {
    return path.join(DIRS.replay, '_names.json');
  }

  /**
   * Save a replay variant
   */
  async saveReplayVariant(variantId: string, variant: unknown): Promise<void> {
    if (!this.isPersisted('replay')) return;

    const filePath = this.getReplayFilePath(variantId);
    await fs.writeFile(filePath, JSON.stringify(variant, null, 2), 'utf-8');
  }

  /**
   * Load all replay variants
   */
  async loadAllReplayVariants(): Promise<unknown[]> {
    if (!this.isPersisted('replay')) return [];

    try {
      const files = await fs.readdir(DIRS.replay);
      const jsonFiles = files.filter(f => f.endsWith('.json') && !f.startsWith('_'));
      const variants: unknown[] = [];

      for (const file of jsonFiles) {
        try {
          const content = await fs.readFile(path.join(DIRS.replay, file), 'utf-8');
          variants.push(JSON.parse(content));
        } catch (err) {
          console.error(`[Persistence] Failed to load replay variant ${file}:`, err);
        }
      }

      console.log(`[Persistence] Loaded ${variants.length} replay variants`);
      return variants;
    } catch (err: any) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
  }

  /**
   * Delete a replay variant
   */
  async deleteReplayVariant(variantId: string): Promise<void> {
    if (!this.isPersisted('replay')) return;

    const filePath = this.getReplayFilePath(variantId);
    try {
      await fs.unlink(filePath);
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err;
    }
  }

  /**
   * Save replay names
   */
  async saveReplayNames(names: Record<string, string>): Promise<void> {
    if (!this.isPersisted('replay')) return;

    const filePath = this.getReplayNamesFilePath();
    await fs.writeFile(filePath, JSON.stringify(names, null, 2), 'utf-8');
  }

  /**
   * Load replay names
   */
  async loadReplayNames(): Promise<Record<string, string>> {
    if (!this.isPersisted('replay')) return {};

    const filePath = this.getReplayNamesFilePath();
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch (err: any) {
      if (err.code === 'ENOENT') return {};
      throw err;
    }
  }

  // ============ Store Persistence ============

  /**
   * Get the file path for a stored response
   */
  getStoreResponseFilePath(key: string): string {
    const sanitizedKey = key.replace(/[^a-zA-Z0-9._-]/g, '_');
    return path.join(DIRS.storeResponses, `${sanitizedKey}.json`);
  }

  /**
   * Get the file path for a stored request
   */
  getStoreRequestFilePath(key: string): string {
    const sanitizedKey = key.replace(/[^a-zA-Z0-9._-]/g, '_');
    return path.join(DIRS.storeRequests, `${sanitizedKey}.json`);
  }

  /**
   * Check if store persistence is enabled
   */
  isStoreEnabled(): boolean {
    return this.isPersisted('store');
  }

  /**
   * Get store directories
   */
  getStoreDirs() {
    return {
      responses: DIRS.storeResponses,
      requests: DIRS.storeRequests,
    };
  }

  // ============ Migration Support ============

  /**
   * Check if old datastore directory exists (for migration)
   */
  async hasLegacyDatastore(legacyPath: string): Promise<boolean> {
    try {
      await fs.access(legacyPath);
      return true;
    } catch {
      return false;
    }
  }
}

// Singleton instance
export const persistence = new PersistenceManager();
