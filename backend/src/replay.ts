/**
 * Replay Manager - handles request replay variants
 *
 * Variants allow:
 * - Creating modified versions of captured requests
 * - Replaying them through the proxy
 * - Tracking results and comparing responses
 * - Chaining variants (variant of a variant)
 */

import { promises as fs } from 'fs';
import path from 'path';
import { ReplayVariant, ReplayStatus, TrafficFlow } from './types';
import { persistence } from './persistence';

export class ReplayManager {
  private variants: Map<string, ReplayVariant> = new Map();
  private replayNames: Map<string, string> = new Map(); // flowId -> name
  private basePath: string;
  private loaded = false;

  constructor() {
    // Get path from persistence layer (handles /data vs legacy paths)
    this.basePath = persistence.getReplayBasePath();
  }

  /**
   * Initialize - create directory and load existing variants
   */
  async initialize(): Promise<void> {
    await fs.mkdir(this.basePath, { recursive: true });
    await this.loadAll();
    await this.loadNames();
  }

  /**
   * Load all variants from disk
   */
  private async loadAll(): Promise<void> {
    try {
      const files = await fs.readdir(this.basePath);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      for (const file of jsonFiles) {
        try {
          const content = await fs.readFile(path.join(this.basePath, file), 'utf-8');
          const variant = JSON.parse(content) as ReplayVariant;
          this.variants.set(variant.variant_id, variant);
        } catch (err) {
          console.error(`[ReplayManager] Failed to load ${file}:`, err);
        }
      }

      this.loaded = true;
      console.log(`[ReplayManager] Loaded ${this.variants.size} variants`);
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        this.loaded = true;
        console.log('[ReplayManager] No replay directory, starting empty');
      } else {
        throw err;
      }
    }
  }

  /**
   * Save a variant to disk
   */
  private async saveVariant(variant: ReplayVariant): Promise<void> {
    const filePath = path.join(this.basePath, `${variant.variant_id}.json`);
    await fs.writeFile(filePath, JSON.stringify(variant, null, 2), 'utf-8');
  }

  /**
   * Delete a variant file from disk
   */
  private async deleteVariantFile(variantId: string): Promise<void> {
    const filePath = path.join(this.basePath, `${variantId}.json`);
    try {
      await fs.unlink(filePath);
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }
  }

  /**
   * Load replay names from disk
   */
  private async loadNames(): Promise<void> {
    const namesFile = path.join(this.basePath, '_names.json');
    try {
      const content = await fs.readFile(namesFile, 'utf-8');
      const names = JSON.parse(content) as Record<string, string>;
      this.replayNames = new Map(Object.entries(names));
      console.log(`[ReplayManager] Loaded ${this.replayNames.size} replay names`);
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        console.error('[ReplayManager] Failed to load names:', err);
      }
    }
  }

  /**
   * Save replay names to disk
   */
  private async saveNames(): Promise<void> {
    const namesFile = path.join(this.basePath, '_names.json');
    const names = Object.fromEntries(this.replayNames);
    await fs.writeFile(namesFile, JSON.stringify(names, null, 2), 'utf-8');
  }

  /**
   * Get the name for a replay (flow)
   */
  getReplayName(flowId: string): string | null {
    return this.replayNames.get(flowId) || null;
  }

  /**
   * Set the name for a replay (flow)
   */
  async setReplayName(flowId: string, name: string): Promise<void> {
    if (name.trim()) {
      this.replayNames.set(flowId, name.trim());
    } else {
      this.replayNames.delete(flowId);
    }
    await this.saveNames();
  }

  /**
   * Get all replay names
   */
  getAllReplayNames(): Record<string, string> {
    return Object.fromEntries(this.replayNames);
  }

  /**
   * Create a new variant from a traffic flow
   */
  async createFromFlow(
    flow: TrafficFlow,
    description: string,
    modifications?: {
      method?: string;
      url?: string;
      headers?: Record<string, string>;
      body?: string;
    }
  ): Promise<ReplayVariant> {
    const variant: ReplayVariant = {
      variant_id: `var_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      parent_flow_id: flow.flow_id,
      request: {
        method: modifications?.method || flow.request.method,
        url: modifications?.url || flow.request.url,
        headers: modifications?.headers || { ...flow.request.headers },
        body: modifications?.body || flow.request.content || '',
      },
      description,
      created_at: Date.now(),
      intercept_on_replay: false,
    };

    this.variants.set(variant.variant_id, variant);
    await this.saveVariant(variant);
    return variant;
  }

  /**
   * Create a variant from another variant (chaining)
   */
  async createFromVariant(
    parentVariant: ReplayVariant,
    description: string,
    modifications?: {
      method?: string;
      url?: string;
      headers?: Record<string, string>;
      body?: string;
    }
  ): Promise<ReplayVariant> {
    const variant: ReplayVariant = {
      variant_id: `var_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      parent_flow_id: parentVariant.parent_flow_id,
      parent_variant_id: parentVariant.variant_id,
      request: {
        method: modifications?.method || parentVariant.request.method,
        url: modifications?.url || parentVariant.request.url,
        headers: modifications?.headers || { ...parentVariant.request.headers },
        body: modifications?.body || parentVariant.request.body,
      },
      description,
      created_at: Date.now(),
      intercept_on_replay: false,
    };

    this.variants.set(variant.variant_id, variant);
    await this.saveVariant(variant);
    return variant;
  }

  /**
   * Create a variant with full control over properties
   */
  async create(data: {
    parent_flow_id: string;
    parent_variant_id?: string;
    request: {
      method: string;
      url: string;
      headers: Record<string, string>;
      body: string;
    };
    description: string;
    intercept_on_replay?: boolean;
  }): Promise<ReplayVariant> {
    const variant: ReplayVariant = {
      variant_id: `var_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      parent_flow_id: data.parent_flow_id,
      parent_variant_id: data.parent_variant_id,
      request: data.request,
      description: data.description,
      created_at: Date.now(),
      intercept_on_replay: data.intercept_on_replay || false,
    };

    this.variants.set(variant.variant_id, variant);
    await this.saveVariant(variant);
    return variant;
  }

  /**
   * Get a variant by ID
   */
  get(variantId: string): ReplayVariant | null {
    return this.variants.get(variantId) || null;
  }

  /**
   * Get all variants
   */
  getAll(): ReplayVariant[] {
    return Array.from(this.variants.values()).sort((a, b) => b.created_at - a.created_at);
  }

  /**
   * Get variants for a specific flow (including chained variants)
   */
  getForFlow(flowId: string): ReplayVariant[] {
    return Array.from(this.variants.values())
      .filter(v => v.parent_flow_id === flowId)
      .sort((a, b) => a.created_at - b.created_at);
  }

  /**
   * Get variant tree for a flow (organized hierarchically)
   */
  getVariantTree(flowId: string): {
    flow_id: string;
    variants: Array<ReplayVariant & { children: ReplayVariant[] }>;
  } {
    const flowVariants = this.getForFlow(flowId);

    // Separate root variants (no parent_variant_id) from children
    const rootVariants = flowVariants.filter(v => !v.parent_variant_id);
    const childVariants = flowVariants.filter(v => v.parent_variant_id);

    // Build tree structure
    const buildChildren = (parentId: string): ReplayVariant[] => {
      return childVariants
        .filter(v => v.parent_variant_id === parentId)
        .map(v => ({
          ...v,
          children: buildChildren(v.variant_id),
        }));
    };

    const tree = rootVariants.map(v => ({
      ...v,
      children: buildChildren(v.variant_id),
    }));

    return {
      flow_id: flowId,
      variants: tree,
    };
  }

  /**
   * Update a variant
   */
  async update(
    variantId: string,
    updates: Partial<Pick<ReplayVariant, 'description' | 'request' | 'intercept_on_replay'>>
  ): Promise<ReplayVariant | null> {
    const variant = this.variants.get(variantId);
    if (!variant) {
      return null;
    }

    if (updates.description !== undefined) {
      variant.description = updates.description;
    }
    if (updates.request !== undefined) {
      variant.request = updates.request;
    }
    if (updates.intercept_on_replay !== undefined) {
      variant.intercept_on_replay = updates.intercept_on_replay;
    }

    await this.saveVariant(variant);
    return variant;
  }

  /**
   * Delete a variant (and optionally its children)
   */
  async delete(variantId: string, deleteChildren = false): Promise<boolean> {
    if (!this.variants.has(variantId)) {
      return false;
    }

    if (deleteChildren) {
      // Find and delete all descendants
      const toDelete = [variantId];
      let i = 0;
      while (i < toDelete.length) {
        const currentId = toDelete[i];
        for (const variant of this.variants.values()) {
          if (variant.parent_variant_id === currentId && !toDelete.includes(variant.variant_id)) {
            toDelete.push(variant.variant_id);
          }
        }
        i++;
      }

      for (const id of toDelete) {
        this.variants.delete(id);
        await this.deleteVariantFile(id);
      }
    } else {
      this.variants.delete(variantId);
      await this.deleteVariantFile(variantId);
    }

    return true;
  }

  /**
   * Update variant result after replay
   */
  async updateResult(
    variantId: string,
    result: ReplayVariant['result']
  ): Promise<ReplayVariant | null> {
    const variant = this.variants.get(variantId);
    if (!variant) {
      return null;
    }

    variant.result = result;
    await this.saveVariant(variant);
    return variant;
  }

  /**
   * Mark variant as sent (replay started)
   */
  async markSent(variantId: string): Promise<ReplayVariant | null> {
    return this.updateResult(variantId, {
      sent_at: Date.now(),
      status: 'sent',
    });
  }

  /**
   * Mark variant as completed with result flow ID
   */
  async markCompleted(variantId: string, resultFlowId: string): Promise<ReplayVariant | null> {
    const variant = this.variants.get(variantId);
    if (!variant || !variant.result) {
      return null;
    }

    return this.updateResult(variantId, {
      ...variant.result,
      result_flow_id: resultFlowId,
      status: 'completed',
    });
  }

  /**
   * Mark variant as failed
   */
  async markFailed(variantId: string, error: string): Promise<ReplayVariant | null> {
    const variant = this.variants.get(variantId);
    if (!variant) {
      return null;
    }

    return this.updateResult(variantId, {
      sent_at: variant.result?.sent_at || Date.now(),
      status: 'failed',
      error,
    });
  }

  /**
   * Get flows that have variants
   */
  getFlowsWithVariants(): string[] {
    const flowIds = new Set<string>();
    for (const variant of this.variants.values()) {
      flowIds.add(variant.parent_flow_id);
    }
    return Array.from(flowIds);
  }

  /**
   * Check if a flow has variants
   */
  hasVariants(flowId: string): boolean {
    for (const variant of this.variants.values()) {
      if (variant.parent_flow_id === flowId) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get variant count for a flow
   */
  getVariantCount(flowId: string): number {
    let count = 0;
    for (const variant of this.variants.values()) {
      if (variant.parent_flow_id === flowId) {
        count++;
      }
    }
    return count;
  }
}

// Singleton instance
export const replayManager = new ReplayManager();

// Initialize on module load
replayManager.initialize().catch(err => {
  console.error('[ReplayManager] Failed to initialize:', err);
});
