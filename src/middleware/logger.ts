import { Request, Response, NextFunction } from 'express';

// Request logger middleware
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  
  // Log request
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    contentType: req.get('Content-Type'),
    contentLength: req.get('Content-Length'),
    query: Object.keys(req.query).length > 0 ? req.query : undefined,
    body: req.method !== 'GET' ? req.body : undefined
  });

  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function(chunk?: any, encoding?: any): Response {
    const duration = Date.now() - start;
    
    // Log response
    console.log(` ${new Date().toISOString()} - ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`, {
      statusCode: res.statusCode,
      contentLength: res.get('Content-Length'),
      contentType: res.get('Content-Type'),
      duration: `${duration}ms`
    });

    return originalEnd.call(this, chunk, encoding);
  };

  next();
};

// Performance monitoring middleware
export const performanceMonitor = (req: Request, res: Response, next: NextFunction) => {
  const start = process.hrtime();
  
  res.on('finish', () => {
    const [seconds, nanoseconds] = process.hrtime(start);
    const duration = seconds * 1000 + nanoseconds / 1000000; // Convert to milliseconds
    
    if (duration > 1000) { // Log slow requests (> 1 second)
      console.warn(` Slow request detected: ${req.method} ${req.path} took ${duration.toFixed(2)}ms`);
    }
  });

  next();
};

// Simple logger for development
export const simpleLogger = (req: Request, res: Response, next: NextFunction) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
}; 