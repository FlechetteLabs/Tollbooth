/**
 * File-based data store for mock requests/responses
 *
 * Stores data that can be served by rules to mock API responses
 */

import { promises as fs } from 'fs';
import path from 'path';
import { StoredResponse, StoredRequest } from './types';
import { shortIdRegistry } from './short-id-registry';
import { persistence } from './persistence';

export class DataStore {
  private basePath: string;
  private responsesPath: string;
  private requestsPath: string;

  constructor() {
    // Get path from persistence layer (handles /data vs legacy paths)
    this.basePath = persistence.getDatastoreBasePath();
    this.responsesPath = path.join(this.basePath, 'responses');
    this.requestsPath = path.join(this.basePath, 'requests');
  }

  /**
   * Initialize the data store directories
   */
  async initialize(): Promise<void> {
    await fs.mkdir(this.responsesPath, { recursive: true });
    await fs.mkdir(this.requestsPath, { recursive: true });
  }

  /**
   * Initialize short ID registry from existing entries and assign IDs to entries without them
   */
  async initializeShortIds(): Promise<void> {
    // Load all existing items and collect their shortIds
    const responses = await this.getAllResponses();
    const requests = await this.getAllRequests();

    // Initialize registry with existing shortIds
    shortIdRegistry.initializeFromExisting({
      responses: responses.map(r => ({ key: r.key, shortId: r.data.metadata.shortId })),
      requests: requests.map(r => ({ key: r.key, shortId: r.data.metadata.shortId })),
    });

    // Assign shortIds to any items that don't have them
    for (const resp of responses) {
      if (!resp.data.metadata.shortId) {
        resp.data.metadata.shortId = shortIdRegistry.assignDatastoreResponseShortId(resp.key);
        await this.saveResponse(resp.key, resp.data);
        console.log(`[DataStore] Assigned shortId ${resp.data.metadata.shortId} to response ${resp.key}`);
      }
    }

    for (const req of requests) {
      if (!req.data.metadata.shortId) {
        req.data.metadata.shortId = shortIdRegistry.assignDatastoreRequestShortId(req.key);
        await this.saveRequest(req.key, req.data);
        console.log(`[DataStore] Assigned shortId ${req.data.metadata.shortId} to request ${req.key}`);
      }
    }
  }

  // ============ Response Operations ============

  /**
   * Save a response to the store
   */
  async saveResponse(key: string, data: StoredResponse): Promise<StoredResponse> {
    // Assign shortId if not present
    if (!data.metadata.shortId) {
      data.metadata.shortId = shortIdRegistry.assignDatastoreResponseShortId(key);
    }
    const filePath = this.getResponsePath(key);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return data;
  }

  /**
   * Get a response from the store
   */
  async getResponse(key: string): Promise<StoredResponse | null> {
    const filePath = this.getResponsePath(key);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as StoredResponse;
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return null;
      }
      throw err;
    }
  }

  /**
   * List all stored response keys
   */
  async listResponses(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.responsesPath);
      return files
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace(/\.json$/, ''));
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return [];
      }
      throw err;
    }
  }

  /**
   * Delete a response from the store
   */
  async deleteResponse(key: string): Promise<boolean> {
    const filePath = this.getResponsePath(key);
    try {
      await fs.unlink(filePath);
      // Remove from registry (shortId will never be reused)
      shortIdRegistry.removeMapping(key);
      return true;
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return false;
      }
      throw err;
    }
  }

  /**
   * Get all responses with their metadata
   */
  async getAllResponses(): Promise<Array<{ key: string; data: StoredResponse }>> {
    const keys = await this.listResponses();
    const results: Array<{ key: string; data: StoredResponse }> = [];

    for (const key of keys) {
      const data = await this.getResponse(key);
      if (data) {
        results.push({ key, data });
      }
    }

    return results;
  }

  // ============ Request Operations ============

  /**
   * Save a request to the store
   */
  async saveRequest(key: string, data: StoredRequest): Promise<StoredRequest> {
    // Assign shortId if not present
    if (!data.metadata.shortId) {
      data.metadata.shortId = shortIdRegistry.assignDatastoreRequestShortId(key);
    }
    const filePath = this.getRequestPath(key);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return data;
  }

  /**
   * Get a request from the store
   */
  async getRequest(key: string): Promise<StoredRequest | null> {
    const filePath = this.getRequestPath(key);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as StoredRequest;
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return null;
      }
      throw err;
    }
  }

  /**
   * List all stored request keys
   */
  async listRequests(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.requestsPath);
      return files
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace(/\.json$/, ''));
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return [];
      }
      throw err;
    }
  }

  /**
   * Delete a request from the store
   */
  async deleteRequest(key: string): Promise<boolean> {
    const filePath = this.getRequestPath(key);
    try {
      await fs.unlink(filePath);
      // Remove from registry (shortId will never be reused)
      shortIdRegistry.removeMapping(key);
      return true;
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return false;
      }
      throw err;
    }
  }

  /**
   * Get all requests with their metadata
   */
  async getAllRequests(): Promise<Array<{ key: string; data: StoredRequest }>> {
    const keys = await this.listRequests();
    const results: Array<{ key: string; data: StoredRequest }> = [];

    for (const key of keys) {
      const data = await this.getRequest(key);
      if (data) {
        results.push({ key, data });
      }
    }

    return results;
  }

  // ============ Utility Methods ============

  /**
   * Generate a store key from request properties
   * Creates a sanitized key suitable for filenames
   */
  generateKey(method: string, host: string, pathName: string): string {
    // Sanitize components for use as filename
    const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9.-]/g, '_').toLowerCase();

    const sanitizedHost = sanitize(host);
    const sanitizedPath = sanitize(pathName.replace(/^\//, ''));
    const timestamp = Date.now();

    return `${method.toLowerCase()}_${sanitizedHost}_${sanitizedPath}_${timestamp}`;
  }

  /**
   * Check if a response exists
   */
  async hasResponse(key: string): Promise<boolean> {
    const filePath = this.getResponsePath(key);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if a request exists
   */
  async hasRequest(key: string): Promise<boolean> {
    const filePath = this.getRequestPath(key);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  // ============ Private Methods ============

  private getResponsePath(key: string): string {
    // Sanitize key to prevent directory traversal
    const sanitizedKey = key.replace(/[^a-zA-Z0-9._-]/g, '_');
    return path.join(this.responsesPath, `${sanitizedKey}.json`);
  }

  private getRequestPath(key: string): string {
    // Sanitize key to prevent directory traversal
    const sanitizedKey = key.replace(/[^a-zA-Z0-9._-]/g, '_');
    return path.join(this.requestsPath, `${sanitizedKey}.json`);
  }
}

// Singleton instance
export const dataStore = new DataStore();

// Initialize on module load
dataStore.initialize().catch(err => {
  console.error('Failed to initialize data store:', err);
});
