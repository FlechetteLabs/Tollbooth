/**
 * Short ID Registry - Assigns and tracks permanent short IDs
 *
 * Short IDs are:
 * - Permanent: Once assigned, never changes
 * - Unique: Never reused, even after deletion
 * - Authoritative: The shortId is stored with the item itself
 *
 * Format:
 * - Rules: r1, r2, r3...
 * - Datastore responses: ds1, ds2...
 * - Datastore requests: rq1, rq2...
 */

export type ShortIdType = 'rule' | 'datastore_response' | 'datastore_request';

class ShortIdRegistry {
  // Maps: shortId -> fullId (for resolution)
  private shortToFull: Map<string, string> = new Map();
  // Maps: fullId -> shortId (for lookup)
  private fullToShort: Map<string, string> = new Map();

  // Counters for each type - only ever increase, never reset
  private ruleCounter = 0;
  private dsResponseCounter = 0;
  private dsRequestCounter = 0;

  /**
   * Initialize the registry with existing items that already have shortIds.
   * This sets the counters to be higher than any existing ID.
   */
  initializeFromExisting(items: {
    rules?: Array<{ id: string; shortId?: string }>;
    responses?: Array<{ key: string; shortId?: string }>;
    requests?: Array<{ key: string; shortId?: string }>;
  }): void {
    // Process rules
    if (items.rules) {
      for (const rule of items.rules) {
        if (rule.shortId) {
          this.registerExisting(rule.shortId, rule.id);
          // Update counter to be at least as high as this ID
          const num = this.extractNumber(rule.shortId);
          if (num !== null && num >= this.ruleCounter) {
            this.ruleCounter = num;
          }
        }
      }
    }

    // Process responses
    if (items.responses) {
      for (const resp of items.responses) {
        if (resp.shortId) {
          this.registerExisting(resp.shortId, resp.key);
          const num = this.extractNumber(resp.shortId);
          if (num !== null && num >= this.dsResponseCounter) {
            this.dsResponseCounter = num;
          }
        }
      }
    }

    // Process requests
    if (items.requests) {
      for (const req of items.requests) {
        if (req.shortId) {
          this.registerExisting(req.shortId, req.key);
          const num = this.extractNumber(req.shortId);
          if (num !== null && num >= this.dsRequestCounter) {
            this.dsRequestCounter = num;
          }
        }
      }
    }

    console.log(`[ShortIdRegistry] Initialized - counters: rules=${this.ruleCounter}, responses=${this.dsResponseCounter}, requests=${this.dsRequestCounter}`);
  }

  /**
   * Extract the numeric part from a short ID (e.g., "r5" -> 5)
   */
  private extractNumber(shortId: string): number | null {
    const match = shortId.match(/\d+$/);
    return match ? parseInt(match[0], 10) : null;
  }

  /**
   * Register an existing shortId -> fullId mapping
   */
  private registerExisting(shortId: string, fullId: string): void {
    this.shortToFull.set(shortId, fullId);
    this.fullToShort.set(fullId, shortId);
  }

  /**
   * Assign a new permanent short ID for a rule.
   * Returns the new shortId. The caller is responsible for storing it on the rule.
   */
  assignRuleShortId(ruleId: string): string {
    // Check if already assigned
    const existing = this.fullToShort.get(ruleId);
    if (existing) {
      return existing;
    }

    // Assign new ID
    this.ruleCounter++;
    const shortId = `r${this.ruleCounter}`;
    this.shortToFull.set(shortId, ruleId);
    this.fullToShort.set(ruleId, shortId);
    console.log(`[ShortIdRegistry] Assigned rule shortId: ${shortId} -> ${ruleId}`);
    return shortId;
  }

  /**
   * Assign a new permanent short ID for a datastore response.
   * Returns the new shortId. The caller is responsible for storing it.
   */
  assignDatastoreResponseShortId(key: string): string {
    const existing = this.fullToShort.get(key);
    if (existing) {
      return existing;
    }

    this.dsResponseCounter++;
    const shortId = `ds${this.dsResponseCounter}`;
    this.shortToFull.set(shortId, key);
    this.fullToShort.set(key, shortId);
    console.log(`[ShortIdRegistry] Assigned response shortId: ${shortId} -> ${key}`);
    return shortId;
  }

  /**
   * Assign a new permanent short ID for a datastore request.
   * Returns the new shortId. The caller is responsible for storing it.
   */
  assignDatastoreRequestShortId(key: string): string {
    const existing = this.fullToShort.get(key);
    if (existing) {
      return existing;
    }

    this.dsRequestCounter++;
    const shortId = `rq${this.dsRequestCounter}`;
    this.shortToFull.set(shortId, key);
    this.fullToShort.set(key, shortId);
    console.log(`[ShortIdRegistry] Assigned request shortId: ${shortId} -> ${key}`);
    return shortId;
  }

  /**
   * Remove a mapping (when an item is deleted).
   * The shortId is NOT reused - counter is never decremented.
   */
  removeMapping(fullId: string): void {
    const shortId = this.fullToShort.get(fullId);
    if (shortId) {
      this.shortToFull.delete(shortId);
      this.fullToShort.delete(fullId);
      console.log(`[ShortIdRegistry] Removed mapping: ${shortId} -> ${fullId}`);
    }
  }

  /**
   * Resolve an ID to full ID (accepts either short or full ID)
   */
  resolveId(id: string): string | null {
    // Check if it's a short ID
    const fullFromShort = this.shortToFull.get(id);
    if (fullFromShort) {
      return fullFromShort;
    }

    // Check if it's already a full ID we know about
    if (this.fullToShort.has(id)) {
      return id;
    }

    // Unknown ID - return as-is for backward compatibility
    return id;
  }

  /**
   * Resolve a rule ID (accepts r1, r2 or full ID)
   */
  resolveRuleId(id: string): string | null {
    if (/^r\d+$/.test(id)) {
      return this.shortToFull.get(id) || null;
    }
    return id;
  }

  /**
   * Resolve a datastore response key (accepts ds1, ds2 or full key)
   */
  resolveDatastoreResponseKey(key: string): string | null {
    if (/^ds\d+$/.test(key)) {
      return this.shortToFull.get(key) || null;
    }
    return key;
  }

  /**
   * Resolve a datastore request key (accepts rq1, rq2 or full key)
   */
  resolveDatastoreRequestKey(key: string): string | null {
    if (/^rq\d+$/.test(key)) {
      return this.shortToFull.get(key) || null;
    }
    return key;
  }

  /**
   * Get the short ID for a full ID
   */
  getShortId(fullId: string): string | null {
    return this.fullToShort.get(fullId) || null;
  }

  /**
   * Get rule short ID
   */
  getRuleShortId(fullId: string): string | null {
    const shortId = this.fullToShort.get(fullId);
    if (shortId && /^r\d+$/.test(shortId)) {
      return shortId;
    }
    return null;
  }

  /**
   * Get datastore response short ID
   */
  getDatastoreResponseShortId(key: string): string | null {
    const shortId = this.fullToShort.get(key);
    if (shortId && shortId.startsWith('ds')) {
      return shortId;
    }
    return null;
  }

  /**
   * Get datastore request short ID
   */
  getDatastoreRequestShortId(key: string): string | null {
    const shortId = this.fullToShort.get(key);
    if (shortId && shortId.startsWith('rq')) {
      return shortId;
    }
    return null;
  }

  /**
   * Get current counters (for debugging)
   */
  getCounters(): { rules: number; responses: number; requests: number } {
    return {
      rules: this.ruleCounter,
      responses: this.dsResponseCounter,
      requests: this.dsRequestCounter,
    };
  }
}

// Singleton instance
export const shortIdRegistry = new ShortIdRegistry();
