/**
 * In-Memory Requirement Cache
 *
 * Caches `ProcessedRequirement` by a requirement-content hash so the Phase-1
 * AI analysis is skipped entirely on repeat requirements (bottleneck B7).
 * Companion to `result-cache.service.ts` — this is the *requirement-level*
 * cache; that one is the *full-result* cache.
 *
 * Phase 9 moves this to Redis; the API is intentionally identical to
 * `result-cache.service.ts` so the seam stays swappable for local dev.
 */

import logger from '../logger';
import { ProcessedRequirement } from '../types';

interface CacheEntry {
  data: ProcessedRequirement;
  timestamp: number;
  expiresAt: number;
}

class RequirementCacheService {
  private cache = new Map<string, CacheEntry>();
  private readonly DEFAULT_TTL = 30 * 60 * 1000; // 30 minutes
  private readonly MAX_ENTRIES = 200;

  /**
   * Get a cached processed requirement by its content hash.
   * Returns a deep clone so callers cannot mutate the shared cached entry.
   */
  get<T = ProcessedRequirement>(hash: string): T | null {
    const entry = this.cache.get(hash);

    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(hash);
      return null;
    }

    logger.info(`💾 Requirement cache HIT (age: ${Date.now() - entry.timestamp}ms)`);
    return structuredClone(entry.data) as T;
  }

  /**
   * Store a processed requirement under its content hash.
   */
  set(hash: string, data: ProcessedRequirement, ttl: number = this.DEFAULT_TTL): void {
    // Evict oldest entry if cache is full
    if (this.cache.size >= this.MAX_ENTRIES) {
      this.evictOldest();
    }

    this.cache.set(hash, {
      data,
      timestamp: Date.now(),
      expiresAt: Date.now() + ttl,
    });
  }

  /**
   * Clear all cached requirements.
   */
  clear(): void {
    this.cache.clear();
    logger.info('Requirement cache cleared');
  }

  /**
   * Get cache statistics.
   */
  getStats() {
    return {
      entries: this.cache.size,
      maxEntries: this.MAX_ENTRIES,
    };
  }

  /**
   * Evict the oldest entry.
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }
}

export default new RequirementCacheService();
