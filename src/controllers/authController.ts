import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { validateEmail } from '../middleware';
import { AppError } from '../middleware/errorHandler';

const VALID_ROLES = ['admin', 'planner', 'production_head', 'dispatch_executive', 'qc_manager'];

export const login = async (req: Request, res: Response) => {
  const { id, password, role } = req.body;
  
  // Validate NRC ID format (NRC followed by 3 digits)
  const nrcIdPattern = /^NRC\d{3}$/;
  if (!nrcIdPattern.test(id)) {
    throw new AppError('Invalid NRC ID format. Must be in format: NRC001, NRC002, etc.', 400);
  }
  
  if (!VALID_ROLES.includes(role)) {
    throw new AppError(`Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`, 400);
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new AppError('NRC ID not found in database', 401);
  if (!user.isActive) throw new AppError('Account is deactivated', 401);

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) throw new AppError('Password does not match', 401);
  if (user.role !== role) {
    throw new AppError(`Role mismatch. Expected: ${user.role}, Provided: ${role}`, 401);
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });

  const token = jwt.sign(
    { userId: user.id, email: user.email || null, role: user.role },
    process.env.JWT_SECRET!,
    { expiresIn: '7d' }
  );

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

export const logout = (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Logout successful. (Token can now be discarded client-side)'
  });
};

export const getProfile = async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.user?.userId } });
  if (!user) throw new AppError('User not found', 404);
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

export const addMember = async (req: Request, res: Response) => {
  const { email, password, role, firstName, lastName } = req.body;
  
  // Email is optional now, but if provided, validate format
  if (email && !validateEmail(email)) {
    throw new AppError('Invalid email format', 400);
  }
  
  if (!VALID_ROLES.includes(role)) {
    throw new AppError(`Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`, 400);
  }
  if (password.length < 6) {
    throw new AppError('Password must be at least 6 characters long', 400);
  }
  
  // Check for existing user with same email only if email is provided
  if (email) {
    const existing = await prisma.user.findFirst({ where: { email } });
    if (existing) {
      throw new AppError('User with this email already exists', 400);
    }
  }

  // Generate custom id in NRC format
  const existingUsers = await prisma.user.count();
  const serialNumber = (existingUsers + 1).toString().padStart(3, '0');
  const customId = `NRC${serialNumber}`;

  const hashedPassword = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      id: customId,
      email,
      password: hashedPassword,
      role,
      isActive: true,
      firstName,
      lastName
    }
  });

  res.status(201).json({
    success: true,
    message: 'User created successfully',
    data: {
      id: user.id,
      email: user.email,
      role: user.role
    }
  });
};

export const getAllUsers = async (_req: Request, res: Response) => {
  const users = await prisma.user.findMany();
  res.json({
    success: true,
    data: users
  });
};

export const getUserById = async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new AppError('User not found', 404);

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
  const { id } = req.params;
  const { email, role, firstName, lastName, isActive } = req.body;

  const user = await prisma.user.update({
    where: { id },
    data: { email, role, firstName, lastName, isActive }
  });

  res.json({
    success: true,
    message: 'User updated successfully',
    data: user
  });
};

export const deleteUser = async (req: Request, res: Response) => {
  const { id } = req.params;
  await prisma.user.delete({ where: { id } });
  res.json({
    success: true,
    message: 'User deleted successfully'
  });
};

export const getRoles = (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: VALID_ROLES
  });
};
