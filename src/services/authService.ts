import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

// Simple interfaces for request/response
interface LoginRequest {
  email: string;
  password: string;
  role: string;
}

interface CreateUserRequest {
  email: string;
  password: string;
  role: string;
  firstName?: string;
  lastName?: string;
}

interface UserResponse {
  id: string;
  email: string;
  role: string;
  firstName?: string | null;
  lastName?: string | null;
  isActive: boolean;
  lastLogin?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface LoginResponse {
  user: UserResponse;
  token: string;
}

export class AuthService {
  // Register new user
  static async register(userData: CreateUserRequest): Promise<UserResponse> {
    const { email, password, role, firstName, lastName } = userData;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      throw new AppError('User with this email already exists', 400);
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        role: role as any,
        firstName,
        lastName
      }
    });

    // Return user without password
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      isActive: user.isActive,
      lastLogin: user.lastLogin,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };
  }

  // Login user with JWT token
  static async login(loginData: LoginRequest): Promise<LoginResponse> {
    const { email, password, role } = loginData;

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email }
    });

    // Check if user exists
    if (!user) {
      throw new AppError('Email not found in database', 401);
    }

    // Check if user is active
    if (!user.isActive) {
      throw new AppError('Account is deactivated', 401);
    }

    // Check if password matches
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new AppError('Password does not match', 401);
    }

    // Check if role matches
    if (user.role !== role) {
      throw new AppError(`Role mismatch. Expected: ${user.role}, Provided: ${role}`, 401);
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() }
    });

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user.id, 
        email: user.email, 
        role: user.role 
      },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );

    // Return user data with token
    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        isActive: user.isActive,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      },
      token
    };
  }

  // Get user by email (for admin authentication)
  static async getUserByIdByEmail(email: string): Promise<any> {
    const user = await prisma.user.findUnique({
      where: { email }
    });

    return user;
  }

  // Verify password (for admin authentication)
  static async verifyPassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }

  // Get user by ID
  static async getUserById(userId: string): Promise<UserResponse | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      isActive: user.isActive,
      lastLogin: user.lastLogin,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };
  }

  // Get all users (for admin)
  static async getAllUsers(): Promise<UserResponse[]> {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' }
    });

    return users.map((user: any) => ({
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      isActive: user.isActive,
      lastLogin: user.lastLogin,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    }));
  }

  // Update user
  static async updateUser(userId: string, updateData: any): Promise<UserResponse> {
    // Clean up the update data to match Prisma's expected format
    const cleanUpdateData: any = {};
    
    if (updateData.email) cleanUpdateData.email = updateData.email;
    if (updateData.role) cleanUpdateData.role = updateData.role as any;
    if (updateData.firstName !== undefined) cleanUpdateData.firstName = updateData.firstName;
    if (updateData.lastName !== undefined) cleanUpdateData.lastName = updateData.lastName;
    if (updateData.isActive !== undefined) cleanUpdateData.isActive = updateData.isActive;

    const user = await prisma.user.update({
      where: { id: userId },
      data: cleanUpdateData
    });

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      isActive: user.isActive,
      lastLogin: user.lastLogin,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };
  }

  // Delete user
  static async deleteUser(userId: string): Promise<void> {
    await prisma.user.delete({
      where: { id: userId }
    });
  }
} 