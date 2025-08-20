import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

// Request logger middleware
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();

  logger.info('Incoming Request', {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    contentType: req.get('Content-Type'),
    contentLength: req.get('Content-Length'),
    query: Object.keys(req.query).length > 0 ? req.query : undefined,
    body: req.method !== 'GET' ? req.body : undefined
  });

  const originalEnd = res.end;
  res.end = function (chunk?: any, encoding?: any): Response {
    const duration = Date.now() - start;

    logger.info('Outgoing Response', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      contentType: res.get('Content-Type'),
      contentLength: res.get('Content-Length')
    });

    return originalEnd.call(this, chunk, encoding);
  };

  next();
};

// Performance monitor
export const performanceMonitor = (req: Request, res: Response, next: NextFunction) => {
  const start = process.hrtime();

  res.on('finish', () => {
    const [seconds, nanoseconds] = process.hrtime(start);
    const duration = seconds * 1000 + nanoseconds / 1000000;

    if (duration > 1000) {
      logger.warn('Slow request detected', {
        method: req.method,
        path: req.path,
        duration: `${duration.toFixed(2)}ms`
      });
    }
  });

  next();
};

// Simple logger for dev
export const simpleLogger = (req: Request, res: Response, next: NextFunction) => {
  logger.debug('Simple request log', { method: req.method, path: req.path });
  next();
};
