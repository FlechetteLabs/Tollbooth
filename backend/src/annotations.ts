/**
 * Annotations Manager - handles traffic annotations and tagging
 *
 * Annotations have:
 * - title: brief description (like git commit subject)
 * - body: optional longer description (like git commit body)
 * - tags: hierarchical tags using colon separator (e.g., "refusal:soft")
 */

import { promises as fs } from 'fs';
import { Annotation, AnnotationTargetType } from './types';

export class AnnotationsManager {
  private annotations: Map<string, Annotation> = new Map();
  private filePath: string;
  private loaded = false;

  constructor(filePath: string = './datastore/annotations.json') {
    this.filePath = filePath;
  }

  /**
   * Load annotations from file
   */
  async load(): Promise<void> {
    try {
      const content = await fs.readFile(this.filePath, 'utf-8');
      const data = JSON.parse(content) as Annotation[];
      this.annotations.clear();
      for (const annotation of data) {
        this.annotations.set(annotation.id, annotation);
      }
      this.loaded = true;
      console.log(`[AnnotationsManager] Loaded ${this.annotations.size} annotations`);
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        this.annotations.clear();
        this.loaded = true;
        console.log('[AnnotationsManager] No annotations file found, starting empty');
      } else {
        throw err;
      }
    }
  }

  /**
   * Save annotations to file
   */
  async save(): Promise<void> {
    const data = Array.from(this.annotations.values());
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  /**
   * Create a new annotation
   * Title is optional - can create tag-only annotations
   */
  async create(data: {
    target_type: AnnotationTargetType;
    target_id: string;
    title?: string;
    body?: string;
    tags?: string[];
  }): Promise<Annotation> {
    const now = Date.now();
    const annotation: Annotation = {
      id: `ann_${now}_${Math.random().toString(36).slice(2, 8)}`,
      target_type: data.target_type,
      target_id: data.target_id,
      title: data.title || '',
      body: data.body,
      tags: data.tags || [],
      created_at: now,
      updated_at: now,
    };

    this.annotations.set(annotation.id, annotation);
    await this.save();
    return annotation;
  }

  /**
   * Add tags to a target, creating annotation if needed
   * Used by rules engine to automatically tag traffic
   */
  async addTags(
    targetType: AnnotationTargetType,
    targetId: string,
    newTags: string[]
  ): Promise<Annotation> {
    const existing = this.getForTarget(targetType, targetId);

    if (existing) {
      // Merge tags, avoiding duplicates
      const tagSet = new Set([...existing.tags, ...newTags]);
      return await this.update(existing.id, { tags: Array.from(tagSet) }) as Annotation;
    } else {
      // Create new annotation with just tags
      return await this.create({
        target_type: targetType,
        target_id: targetId,
        tags: newTags,
      });
    }
  }

  /**
   * Get annotation by ID
   */
  get(id: string): Annotation | null {
    return this.annotations.get(id) || null;
  }

  /**
   * Get annotation for a specific target
   */
  getForTarget(targetType: AnnotationTargetType, targetId: string): Annotation | null {
    for (const annotation of this.annotations.values()) {
      if (annotation.target_type === targetType && annotation.target_id === targetId) {
        return annotation;
      }
    }
    return null;
  }

  /**
   * Get all annotations, optionally filtered
   */
  getAll(filter?: {
    target_type?: AnnotationTargetType;
    tag?: string;
    search?: string;
  }): Annotation[] {
    let results = Array.from(this.annotations.values());

    if (filter?.target_type) {
      results = results.filter(a => a.target_type === filter.target_type);
    }

    if (filter?.tag) {
      const searchTag = filter.tag.toLowerCase();
      results = results.filter(a =>
        a.tags.some(t => t.toLowerCase() === searchTag || t.toLowerCase().startsWith(searchTag + ':'))
      );
    }

    if (filter?.search) {
      const searchLower = filter.search.toLowerCase();
      results = results.filter(a =>
        a.title.toLowerCase().includes(searchLower) ||
        (a.body && a.body.toLowerCase().includes(searchLower)) ||
        a.tags.some(t => t.toLowerCase().includes(searchLower))
      );
    }

    // Sort by updated_at descending
    return results.sort((a, b) => b.updated_at - a.updated_at);
  }

  /**
   * Update an annotation
   */
  async update(id: string, updates: Partial<Pick<Annotation, 'title' | 'body' | 'tags'>>): Promise<Annotation | null> {
    const annotation = this.annotations.get(id);
    if (!annotation) {
      return null;
    }

    if (updates.title !== undefined) {
      annotation.title = updates.title;
    }
    if (updates.body !== undefined) {
      annotation.body = updates.body;
    }
    if (updates.tags !== undefined) {
      annotation.tags = updates.tags;
    }
    annotation.updated_at = Date.now();

    await this.save();
    return annotation;
  }

  /**
   * Delete an annotation
   */
  async delete(id: string): Promise<boolean> {
    if (!this.annotations.has(id)) {
      return false;
    }
    this.annotations.delete(id);
    await this.save();
    return true;
  }

  /**
   * Delete annotations for a specific target
   */
  async deleteForTarget(targetType: AnnotationTargetType, targetId: string): Promise<number> {
    let count = 0;
    for (const [id, annotation] of this.annotations) {
      if (annotation.target_type === targetType && annotation.target_id === targetId) {
        this.annotations.delete(id);
        count++;
      }
    }
    if (count > 0) {
      await this.save();
    }
    return count;
  }

  /**
   * Get all unique tags (for autocomplete)
   */
  getAllTags(): string[] {
    const tagSet = new Set<string>();
    for (const annotation of this.annotations.values()) {
      for (const tag of annotation.tags) {
        tagSet.add(tag);
        // Also add parent tags for hierarchical tags
        const parts = tag.split(':');
        let current = '';
        for (const part of parts) {
          current = current ? `${current}:${part}` : part;
          tagSet.add(current);
        }
      }
    }
    return Array.from(tagSet).sort();
  }

  /**
   * Search by tag (supports hierarchical matching)
   */
  searchByTag(tag: string): Annotation[] {
    const searchTag = tag.toLowerCase();
    return Array.from(this.annotations.values()).filter(a =>
      a.tags.some(t => {
        const lowerT = t.toLowerCase();
        return lowerT === searchTag || lowerT.startsWith(searchTag + ':');
      })
    );
  }

  /**
   * Search by text in title or body
   */
  searchByText(query: string): Annotation[] {
    const searchLower = query.toLowerCase();
    return Array.from(this.annotations.values()).filter(a =>
      a.title.toLowerCase().includes(searchLower) ||
      (a.body && a.body.toLowerCase().includes(searchLower))
    );
  }
}

// Singleton instance
const annotationsPath = process.env.ANNOTATIONS_PATH || './datastore/annotations.json';
export const annotationsManager = new AnnotationsManager(annotationsPath);

// Load on module initialization
annotationsManager.load().catch(err => {
  console.error('[AnnotationsManager] Failed to load:', err);
});
