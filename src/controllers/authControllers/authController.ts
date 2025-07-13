import { NextFunction, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../lib/prisma';
import { validateEmail } from '../../middleware';
import  AppError  from '../../utils/AppErrors';
import { loginSchema } from '../../validator/authValidator';
import { generateAccessToken } from '../../utils/jwtService';
import { PhoneNumber } from 'libphonenumber-js';
import { error } from 'console';
import { logUserAction, logUserActionWithResource, ActionTypes } from '../../lib/logger';

const VALID_ROLES = ['admin', 'planner', 'production_head', 'dispatch_executive', 'qc_manager','printer'];

export const login = async (req: Request, res: Response, next: NextFunction) => {

  try{
    const loginValidator = loginSchema.parse(req.body)
    const { id, password } = loginValidator;
    
    
    const user = await prisma.user.findFirst({ where: { id } });


    if(!user){
      return res.status(401).json({
        message: "User not found"
      })
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
 
    if(!isPasswordValid){

      return res.status(401).json({
        message: "Invalid Password"
      })
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });

    // Log the login action
    await logUserAction(user.id, ActionTypes.USER_LOGIN, `Login successful from IP: ${req.ip}`);

    const accessToken = generateAccessToken(id);
    const userActive = user.isActive === true;
    // if (!user.isActive) throw new AppError('Account is deactivated', 401);

    return res.status(200).json({
      success: true,
      acessToken: accessToken,
      data: {
        id: user.id,
        userActive,
      }
    });

  }catch(err){
    // console.log(error,500)
     console.error('Login error:', err);
    return next(new AppError('An error occurred during login', 500 ))
  }
};

export const logout = async (req: Request, res: Response) => {
  // Log the logout action if user is authenticated
  if (req.user?.userId) {
    await logUserAction(req.user.userId, ActionTypes.USER_LOGOUT, `Logout from IP: ${req.ip}`);
  }

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
      name: `${firstName} ${lastName}`,
    }
  });

  // Log the user creation action
  if (req.user?.userId) {
    await logUserActionWithResource(
      req.user.userId,
      ActionTypes.USER_CREATED,
      `Created user: ${customId} with role: ${role}`,
      'User',
      customId
    );
  }

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
      name: user.name,
      isActive: user.isActive,
      lastLogin: user.lastLogin,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    }
  });
};

export const updateUser = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { email, role, name, isActive } = req.body;

  const user = await prisma.user.update({
    where: { id },
    data: { email, role, name , isActive }
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
