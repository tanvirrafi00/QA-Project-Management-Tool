/**
 * In-Memory Result Cache
 * Caches test generation results by requirement hash
 * Prevents redundant AI calls for identical requests
 */

import crypto from 'crypto';
import logger from '../logger';

interface CacheEntry<T> {
    data: T;
    timestamp: number;
    expiresAt: number;
}

class ResultCacheService {
    private cache = new Map<string, CacheEntry<any>>();
    private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
    private readonly MAX_ENTRIES = 50;

    /**
     * Generate a hash key from the input parameters
     */
    hashInput(input: {
        moduleName?: string;
        featureName?: string;
        description: string;
        testType?: string;
    }): string {
        const normalized = JSON.stringify({
            module: (input.moduleName || '').trim().toLowerCase(),
            feature: (input.featureName || '').trim().toLowerCase(),
            description: (input.description || '').trim().toLowerCase(),
            testType: input.testType || 'all',
        });

        return crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 16);
    }

    /**
     * Get cached result if available and not expired
     */
    get<T>(key: string): T | null {
        const entry = this.cache.get(key);

        if (!entry) {
            return null;
        }

        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            return null;
        }

        logger.info(`Cache HIT: returning cached result (age: ${Date.now() - entry.timestamp}ms)`);
        return entry.data as T;
    }

    /**
     * Store result in cache
     */
    set<T>(key: string, data: T, ttl: number = this.DEFAULT_TTL): void {
        // Evict oldest entries if cache is full
        if (this.cache.size >= this.MAX_ENTRIES) {
            this.evictOldest();
        }

        this.cache.set(key, {
            data,
            timestamp: Date.now(),
            expiresAt: Date.now() + ttl,
        });
    }

    /**
     * Clear all cached results
     */
    clear(): void {
        this.cache.clear();
        logger.info('Result cache cleared');
    }

    /**
     * Get cache statistics
     */
    getStats() {
        return {
            entries: this.cache.size,
            maxEntries: this.MAX_ENTRIES,
        };
    }

    /**
     * Evict the oldest entry
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

export default new ResultCacheService();
