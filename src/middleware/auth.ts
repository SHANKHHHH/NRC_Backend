import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from './errorHandler';
import { AuthService } from '../services/authService';

// Extend Express Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        email: string;
        role: string;
      };
    }
  }
}

// JWT Authentication middleware
export const authenticateToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Check Authorization header first
    let token = req.headers.authorization?.split(' ')[1]; // Bearer TOKEN
    
    // If no token in header, check cookies
    if (!token) {
      token = req.cookies?.accessToken;
    }

    if (!token) {
      throw new AppError('Access token required', 401);
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    
    // Get user from database to ensure they still exist and are active
    const user = await AuthService.getUserById(decoded.userId);
    
    if (!user) {
      throw new AppError('User not found', 401);
    }

    if (!user.isActive) {
      throw new AppError('Account is deactivated', 401);
    }

    // Attach user to request
    req.user = {
      userId: user.id,
      email: user.email,
      role: user.role
    };

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(new AppError('Invalid token', 401));
    } else if (error instanceof jwt.TokenExpiredError) {
      next(new AppError('Token expired', 401));
    } else {
      next(error);
    }
  }
};

// Admin authentication middleware (no JWT - validates credentials from body)
export const authenticateAdmin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;

    // Check if required fields are present
    if (!email || !password) {
      throw new AppError('Email and password are required for admin authentication', 401);
    }

    // Find user by email
    const user = await AuthService.getUserByIdByEmail(email);
    
    if (!user) {
      throw new AppError('Admin user not found', 401);
    }

    if (!user.isActive) {
      throw new AppError('Admin account is deactivated', 401);
    }

    // Verify password
    const isPasswordValid = await AuthService.verifyPassword(password, user.password);
    if (!isPasswordValid) {
      throw new AppError('Invalid admin credentials', 401);
    }

    // Verify role is admin
    if (user.role !== 'admin') {
      throw new AppError('Admin role required for this operation', 403);
    }

    // Attach user to request
    req.user = {
      userId: user.id,
      email: user.email,
      role: user.role
    };

    next();
  } catch (error) {
    next(error);
  }
};

// Admin-only middleware with JWT authentication
export const requireAdminJWT = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Check Authorization header first
    let token = req.headers.authorization?.split(' ')[1]; // Bearer TOKEN
    
    // If no token in header, check cookies
    if (!token) {
      token = req.cookies?.accessToken;
    }

    if (!token) {
      throw new AppError('Access token required', 401);
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    
    // Get user from database to ensure they still exist and are active
    const user = await AuthService.getUserById(decoded.userId);
    
    if (!user) {
      throw new AppError('User not found', 401);
    }

    if (!user.isActive) {
      throw new AppError('Account is deactivated', 401);
    }

    // Verify role is admin
    if (user.role !== 'admin') {
      throw new AppError('Admin role required for this operation', 403);
    }

    // Attach user to request
    req.user = {
      userId: user.id,
      email: user.email,
      role: user.role
    };

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(new AppError('Invalid token', 401));
    } else if (error instanceof jwt.TokenExpiredError) {
      next(new AppError('Token expired', 401));
    } else {
      next(error);
    }
  }
};

// Role-based authorization middleware
export const requireRole = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(new AppError('Insufficient permissions', 403));
    }

    next();
  };
};

// Admin-only middleware (uses the new authenticateAdmin)
export const requireAdmin = authenticateAdmin; 