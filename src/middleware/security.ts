import { Request, Response, NextFunction } from 'express';

// Basic security headers middleware
export const securityHeaders = (req: Request, res: Response, next: NextFunction) => {
  // Remove X-Powered-By header
  res.removeHeader('X-Powered-By');
  
  // Security headers - but skip for OPTIONS to avoid conflicts
  if (req.method !== 'OPTIONS') {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    // More permissive CSP for development
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' http://localhost:* https://nrc-backend-his4.onrender.com;"
    );
  }
  
  next();
};

// CORS middleware
export const corsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const allowedOrigins = [
    'http://localhost:3000', 
    'http://localhost:3001', 
    'http://localhost:5173',
    'https://nrc-backend-his4.onrender.com',
    'https://nrc-frontend.vercel.app',
    'https://nrc-frontend-y5wf.vercel.app',
    'https://nrc-frontend-y5wf.vercel.app/dashboard',
    'https://nrc-shankh-62gr.vercel.app'
  ];
  const origin = req.headers.origin;
  
  // Debug logging
  console.log('CORS Debug:', {
    method: req.method,
    origin,
    allowedOrigins,
    isAllowed: origin && allowedOrigins.includes(origin),
    url: req.url,
    headers: req.headers
  });
  
  // Always set CORS headers for both preflight and actual requests
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    console.log('OPTIONS preflight request handled');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
    res.status(200).end();
    return;
  }
  
  next();
};

// Rate limiting middleware (simple in-memory implementation)
const requestCounts = new Map<string, { count: number; resetTime: number }>();

export const rateLimiter = (maxRequests: number = 1000, windowMs: number = 15 * 60 * 1000) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();

    // this particular things expires entries to prevent memory leaks
    for (const [key, value] of requestCounts.entries()) {
      if (value.resetTime <= now) {
        requestCounts.delete(key);
      }
    }

    let userRequests = requestCounts.get(ip);

    if (!userRequests || now > userRequests.resetTime) {
      // Reset or initialize
      userRequests = { count: 1, resetTime: now + windowMs };
      requestCounts.set(ip, userRequests);
    } else {
      userRequests.count++;
      
      if (userRequests.count > maxRequests) {
        return res.status(429).json({
          success: false,
          error: 'Too many requests, please try again later.',
          retryAfter: Math.ceil((userRequests.resetTime - now) / 1000)
        });
      }
    }
    
    // Add rate limit headers
    res.setHeader('X-RateLimit-Limit', maxRequests.toString());
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - (userRequests?.count || 0)).toString());
    res.setHeader('X-RateLimit-Reset', new Date(userRequests.resetTime).toISOString());
    
    next();
  };
};

// Request size limiter
export const requestSizeLimiter = (maxSize: string = '10mb') => {
  return (req: Request, res: Response, next: NextFunction) => {
    const contentLength = parseInt(req.headers['content-length'] || '0');
    const maxSizeBytes = parseSize(maxSize);
    
    if (contentLength > maxSizeBytes) {
      return res.status(413).json({
        success: false,
        error: 'Request entity too large'
      });
    }
    
    next();
  };
};

// Helper function to parse size strings like '10mb', '1gb', etc.
function parseSize(size: string): number {
  const units: { [key: string]: number } = {
    'b': 1,
    'kb': 1024,
    'mb': 1024 * 1024,
    'gb': 1024 * 1024 * 1024
  };
  
  const match = size.toLowerCase().match(/^(\d+)([kmg]?b)$/);
  if (!match) return 1024 * 1024; // Default to 1MB
  
  const [, value, unit] = match;
  return parseInt(value) * (units[unit] || 1);
}
