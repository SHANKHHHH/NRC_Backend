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

const VALID_ROLES = ['admin', 'planner', 'production_head', 'dispatch_executive', 'qc_manager','printer', 'corrugator','flutelaminator','pasting_operator','punching_operator', 'paperstore'];

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

    // Parse roles from JSON string or handle single role
    let userRoles: string[];
    try {
      userRoles = JSON.parse(user.role);
    } catch {
      // Fallback for existing single roles
      userRoles = [user.role];
    }

    return res.status(200).json({
      success: true,
      acessToken: accessToken,
      data: {
        id: user.id,
        userActive,
        roles: userRoles
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
  
  // Parse roles from JSON string or handle single role
  let userRoles: string[];
  try {
    userRoles = JSON.parse(user.role);
  } catch {
    // Fallback for existing single roles
    userRoles = [user.role];
  }
  
  res.json({
    success: true,
    data: {
      id: user.id,
      email: user.email,
      roles: userRoles,
      isActive: user.isActive,
      lastLogin: user.lastLogin,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    }
  });
};

export const addMember = async (req: Request, res: Response) => {
  const { email, password, role, roles, firstName, lastName } = req.body;
  
  // Email is optional now, but if provided, validate format
  if (email && !validateEmail(email)) {
    throw new AppError('Invalid email format', 400);
  }
  
  // Handle both single role (backward compatibility) and multiple roles
  let userRoles: string[];
  if (Array.isArray(roles)) {
    // Multiple roles provided
    if (roles.length === 0) {
      throw new AppError('At least one role must be provided', 400);
    }
    
    // Validate all roles
    for (const roleItem of roles) {
      if (!VALID_ROLES.includes(roleItem)) {
        throw new AppError(`Invalid role: ${roleItem}. Must be one of: ${VALID_ROLES.join(', ')}`, 400);
      }
    }
    userRoles = roles;
  } else if (role) {
    // Single role provided (backward compatibility)
    if (!VALID_ROLES.includes(role)) {
      throw new AppError(`Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`, 400);
    }
    userRoles = [role];
  } else {
    throw new AppError('Role or roles are required', 400);
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

  // Generate unique custom id in NRC format
  let customId: string;
  let attempts = 0;
  const maxAttempts = 10;
  
  do {
    attempts++;
    if (attempts > maxAttempts) {
      throw new AppError('Unable to generate unique user ID after multiple attempts', 500);
    }
    
    // Get the highest existing NRC ID
    const highestUser = await prisma.user.findFirst({
      where: {
        id: {
          startsWith: 'NRC'
        }
      },
      orderBy: {
        id: 'desc'
      }
    });
    
    let nextNumber = 1;
    if (highestUser) {
      const lastNumber = parseInt(highestUser.id.replace('NRC', ''));
      nextNumber = lastNumber + 1;
    }
    
    customId = `NRC${nextNumber.toString().padStart(3, '0')}`;
    
    // Check if this ID already exists (double-check for race conditions)
    const existingUser = await prisma.user.findUnique({
      where: { id: customId }
    });
    
    if (!existingUser) {
      break; // Found a unique ID
    }
  } while (true);

  const hashedPassword = await bcrypt.hash(password, 12);

  // Store roles as JSON string
  const rolesJson = JSON.stringify(userRoles);

  const user = await prisma.user.create({
    data: {
      id: customId,
      email,
      password: hashedPassword,
      role: rolesJson, // Store as JSON string
      isActive: true,
      name: `${firstName} ${lastName}`,
    }
  });

  // Log the user creation action
  if (req.user?.userId) {
    await logUserActionWithResource(
      req.user.userId,
      ActionTypes.USER_CREATED,
      `Created user: ${customId} with roles: ${userRoles.join(', ')}`,
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
      roles: userRoles
    }
  });
};

export const getAllUsers = async (_req: Request, res: Response) => {
  const users = await prisma.user.findMany();
  
  // Parse roles for each user
  const usersWithParsedRoles = users.map(user => {
    let userRoles: string[];
    try {
      userRoles = JSON.parse(user.role);
    } catch {
      // Fallback for existing single roles
      userRoles = [user.role];
    }
    
    return {
      ...user,
      roles: userRoles
    };
  });
  
  res.json({
    success: true,
    data: usersWithParsedRoles
  });
};

export const getUserById = async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new AppError('User not found', 404);
  
  // Parse roles from JSON string or handle single role
  let userRoles: string[];
  try {
    userRoles = JSON.parse(user.role);
  } catch {
    // Fallback for existing single roles
    userRoles = [user.role];
  }

  res.json({
    success: true,
    data: {
      id: user.id,
      email: user.email,
      roles: userRoles,
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
  const { email, role, roles, firstName, lastName, isActive } = req.body;

  // Handle both single role and multiple roles
  let rolesToUpdate: string;
  if (Array.isArray(roles)) {
    // Multiple roles provided
    if (roles.length === 0) {
      throw new AppError('At least one role must be provided', 400);
    }
    
    // Validate all roles
    for (const roleItem of roles) {
      if (!VALID_ROLES.includes(roleItem)) {
        throw new AppError(`Invalid role: ${roleItem}. Must be one of: ${VALID_ROLES.join(', ')}`, 400);
      }
    }
    rolesToUpdate = JSON.stringify(roles);
  } else if (role) {
    // Single role provided (backward compatibility)
    if (!VALID_ROLES.includes(role)) {
      throw new AppError(`Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`, 400);
    }
    rolesToUpdate = JSON.stringify([role]);
  } else {
    throw new AppError('Role or roles are required', 400);
  }

  // Check for existing user with same email only if email is provided
  if (email) {
    const existing = await prisma.user.findFirst({ where: { email } });
    if (existing && existing.id !== id) { // Exclude the current user from the check
      throw new AppError('User with this email already exists', 400);
    }
  }

  const updatedUser = await prisma.user.update({
    where: { id },
    data: {
      email,
      role: rolesToUpdate,
      name: firstName && lastName ? `${firstName} ${lastName}` : undefined,
      isActive
    }
  });

  // Parse roles for response
  let userRoles: string[];
  try {
    userRoles = JSON.parse(updatedUser.role);
  } catch {
    userRoles = [updatedUser.role];
  }

  res.json({
    success: true,
    message: 'User updated successfully',
    data: {
      ...updatedUser,
      roles: userRoles
    }
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

export const getRoles = async (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      roles: VALID_ROLES,
      description: 'Available roles for user assignment. You can assign multiple roles by sending an array.'
    }
  });
};
