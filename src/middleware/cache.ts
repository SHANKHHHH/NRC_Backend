import { Request, Response, NextFunction } from 'express';

interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
}

class MemoryCache {
  private cache = new Map<string, CacheEntry>();
  private readonly defaultTTL = 5 * 60 * 1000; // 5 minutes

  set(key: string, data: any, ttl: number = this.defaultTTL): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const isExpired = Date.now() - entry.timestamp > entry.ttl;
    if (isExpired) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  // Clean up expired entries periodically
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }
}

const cache = new MemoryCache();

// Run cleanup every 10 minutes
setInterval(() => cache.cleanup(), 10 * 60 * 1000);

export const cacheMiddleware = (ttl: number = 5 * 60 * 1000) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip caching for non-GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Create cache key from URL and query parameters
    const cacheKey = `${req.originalUrl}`;
    
    // Check if data exists in cache
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      return res.json(cachedData);
    }

    // Store original send method
    const originalSend = res.json;

    // Override send method to cache the response
    res.json = function(data: any) {
      cache.set(cacheKey, data, ttl);
      return originalSend.call(this, data);
    };

    next();
  };
};

// Middleware to invalidate cache for specific patterns
export const invalidateCache = (patterns: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Store original end method
    const originalEnd = res.end;

    // Override end method to invalidate cache after successful operations
    res.end = function(chunk?: any, encoding?: any) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        patterns.forEach(pattern => {
          // Simple pattern matching - you can enhance this
          if (req.path.includes(pattern)) {
            // Clear all cache entries that might be affected
            // This is a simple implementation - you might want more sophisticated invalidation
            cache.clear();
          }
        });
      }
      return originalEnd.call(this, chunk, encoding);
    };

    next();
  };
};

export { cache }; 