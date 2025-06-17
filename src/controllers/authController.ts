import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { validateEmail } from '../middleware';
import { AppError } from '../middleware/errorHandler';

const VALID_ROLES = ['admin', 'planner', 'production_head', 'dispatch_executive', 'qc_manager'];

export const login = async (req: Request, res: Response) => {
  const { email, password, role } = req.body;
  if (!validateEmail(email)) {
    throw new AppError('Invalid email format', 400);
  }
  if (!VALID_ROLES.includes(role)) {
    throw new AppError(`Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`, 400);
  }
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new AppError('Email not found in database', 401);
  }
  if (!user.isActive) {
    throw new AppError('Account is deactivated', 401);
  }
  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    throw new AppError('Password does not match', 401);
  }
  if (user.role !== role) {
    throw new AppError(`Role mismatch. Expected: ${user.role}, Provided: ${role}`, 401);
  }
  await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });
  const token = jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET!,
    { expiresIn: '7d' }
  );
  res.cookie('accessToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/'
  });
  res.json({
    success: true,
    message: 'Login successful',
    data: {
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
    }
  });
};

export const getProfile = async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
  if (!user) {
    throw new AppError('User not found', 404);
  }
  res.json({
    success: true,
    data: {
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      isActive: user.isActive,
      lastLogin: user.lastLogin,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    }
  });
};

export const logout = (req: Request, res: Response) => {
  res.clearCookie('accessToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/'
  });
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
};

export const addMember = async (req: Request, res: Response) => {
  const { email, password, role, firstName, lastName } = req.body;
  if (!validateEmail(email)) {
    throw new AppError('Invalid email format', 400);
  }
  if (!VALID_ROLES.includes(role)) {
    throw new AppError(`Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`, 400);
  }
  if (password.length < 6) {
    throw new AppError('Password must be at least 6 characters long', 400);
  }
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    throw new AppError('User with this email already exists', 400);
  }
  const saltRounds = 12;
  const hashedPassword = await bcrypt.hash(password, saltRounds);
  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      role: role as any,
      firstName,
      lastName
    }
  });
  res.status(201).json({
    success: true,
    message: 'Member added successfully',
    data: {
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      isActive: user.isActive,
      lastLogin: user.lastLogin,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    }
  });
};

export const getAllUsers = async (req: Request, res: Response) => {
  const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
  res.json({
    success: true,
    data: users.map(user => ({
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      isActive: user.isActive,
      lastLogin: user.lastLogin,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    })),
    count: users.length
  });
};

export const getUserById = async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) {
    throw new AppError('User not found', 404);
  }
  res.json({
    success: true,
    data: {
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      isActive: user.isActive,
      lastLogin: user.lastLogin,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    }
  });
};

export const updateUser = async (req: Request, res: Response) => {
  const { email, role, firstName, lastName, isActive } = req.body;
  if (email && !validateEmail(email)) {
    throw new AppError('Invalid email format', 400);
  }
  if (role && !VALID_ROLES.includes(role)) {
    throw new AppError(`Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`, 400);
  }
  const updateData: any = {};
  if (email) updateData.email = email;
  if (role) updateData.role = role;
  if (firstName !== undefined) updateData.firstName = firstName;
  if (lastName !== undefined) updateData.lastName = lastName;
  if (isActive !== undefined) updateData.isActive = isActive;
  const user = await prisma.user.update({ where: { id: req.params.id }, data: updateData });
  res.json({
    success: true,
    message: 'User updated successfully',
    data: {
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      isActive: user.isActive,
      lastLogin: user.lastLogin,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    }
  });
};

export const deleteUser = async (req: Request, res: Response) => {
  await prisma.user.delete({ where: { id: req.params.id } });
  res.json({
    success: true,
    message: 'User deleted successfully'
  });
};

export const getRoles = (req: Request, res: Response) => {
  res.json({
    success: true,
    data: VALID_ROLES
  });
}; 