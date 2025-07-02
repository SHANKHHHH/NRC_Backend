import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errorHandler';

// Basic validation middleware
export const validateRequest = (schema: any) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const { error } = schema.validate(req.body);
      if (error) {
        throw new AppError(error.details[0].message, 400);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
};

// Email validation
export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Password validation
export const validatePassword = (password: string): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  if (password.length < 6) {
    errors.push('Password must be at least 6 characters long');
  }
  
  // if (!/[A-Z]/.test(password)) {
  //   errors.push('Password must contain at least one uppercase letter');
  // }
  
  // if (!/[a-z]/.test(password)) {
  //   errors.push('Password must contain at least one lowercase letter');
  // }
  
  // if (!/\d/.test(password)) {
  //   errors.push('Password must contain at least one number');
  // }
  
  // if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
  //   errors.push('Password must contain at least one special character');
  // }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

// Input sanitization middleware
export const sanitizeInput = (req: Request, res: Response, next: NextFunction) => {
  // Sanitize body
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  
  // Sanitize query parameters
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }
  
  next();
};

// Helper function to sanitize objects recursively
function sanitizeObject(obj: any): any {
  if (typeof obj !== 'object' || obj === null) {
    return typeof obj === 'string' ? sanitizeString(obj) : obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }
  
  const sanitized: any = {};
  for (const [key, value] of Object.entries(obj)) {
    sanitized[key] = sanitizeObject(value);
  }
  
  return sanitized;
}

// Helper function to sanitize strings
function sanitizeString(str: string): string {
  return str
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, ''); // Remove event handlers
}

// NRC ID validation
export const validateNrcId = (id: string): boolean => {
  const nrcIdPattern = /^NRC\d{3}$/;
  return nrcIdPattern.test(id);
};

// Login request validation middleware
export const validateLoginRequest = (req: Request, res: Response, next: NextFunction) => {
  const { id, password, role } = req.body;
  
  if (!id || !password || !role) {
    return next(new AppError('Missing required fields: id, password, role', 400));
  }
  
  // Validate NRC ID format
  const nrcIdPattern = /^NRC\d{3}$/;
  if (!nrcIdPattern.test(id)) {
    return next(new AppError('Invalid NRC ID format. Must be in format: NRC001, NRC002, etc.', 400));
  }
  
  // Validate role
  const validRoles = ['admin', 'planner', 'production_head', 'dispatch_executive', 'qc_manager'];
  if (!validRoles.includes(role)) {
    return next(new AppError(`Invalid role. Must be one of: ${validRoles.join(', ')}`, 400));
  }
  
  next();
};

// Required fields validation
export const requireFields = (fields: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const missingFields: string[] = [];
    
    for (const field of fields) {
      if (!req.body[field] || req.body[field].toString().trim() === '') {
        missingFields.push(field);
      }
    }
    
    if (missingFields.length > 0) {
      return next(new AppError(`Missing required fields: ${missingFields.join(', ')}`, 400));
    }
    
    // Special validation for NRC ID if present
    if (req.body.id && !validateNrcId(req.body.id)) {
      return next(new AppError('Invalid NRC ID format. Must be in format: NRC001, NRC002, etc.', 400));
    }
    
    next();
  };
};

// URL parameter validation
export const validateId = (req: Request, res: Response, next: NextFunction) => {
  const id = req.params.id;
  
  if (!id || isNaN(Number(id))) {
    return next(new AppError('Invalid ID parameter', 400));
  }
  
  next();
}; 