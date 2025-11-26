import { NextFunction, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../lib/prisma';
import { validateEmail } from '../../middleware';
import { AppError } from '../../utils/errorHandler';
import { loginSchema } from '../../validator/authValidator';
import { generateAccessToken } from '../../utils/jwtService';
import { PhoneNumber } from 'libphonenumber-js';
import { error } from 'console';
import { logUserAction, logUserActionWithResource, ActionTypes } from '../../lib/logger';
import { RoleManager } from '../../utils/roleUtils';

const VALID_ROLES = ['admin', 'planner', 'production_head', 'dispatch_executive', 'qc_manager','printer', 'corrugator','flutelaminator','pasting_operator','punching_operator', 'paperstore','flyingsquad'];

export const login = async (req: Request, res: Response, next: NextFunction) => {

  try{
    const loginValidator = loginSchema.parse(req.body)
    const { email, password } = loginValidator;
    
    
    const user = await prisma.user.findFirst({ where: { email } });


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

    // 🔒 SINGLE SESSION ENFORCEMENT: Check if user is already logged in somewhere else
    if (user.activeSessionToken) {
      // User is already logged in on another device
      const deviceInfo = user.sessionDeviceInfo || 'Unknown device';
      const loginTime = user.sessionLoginTime ? new Date(user.sessionLoginTime).toLocaleString() : 'Unknown time';
      
      return res.status(403).json({
        success: false,
        message: "Already logged in on another device",
        details: {
          message: `This account is already logged in on another device (${deviceInfo}) since ${loginTime}. Please logout from that device first.`,
          sessionDevice: deviceInfo,
          sessionLoginTime: loginTime
        }
      });
    }

    // Generate new token for this fresh login
    const accessToken = generateAccessToken(user.id);
    const deviceInfo = req.headers['user-agent'] || 'Unknown device';
    
    // Save session token to database
    await prisma.user.update({ 
      where: { id: user.id }, 
      data: { 
        lastLogin: new Date(),
        activeSessionToken: accessToken,
        sessionLoginTime: new Date(),
        sessionDeviceInfo: deviceInfo
      } 
    });

    // Log the login action
    await logUserAction(user.id, ActionTypes.USER_LOGIN, `Login successful from IP: ${req.ip}, Device: ${deviceInfo}`);

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
  // 🔒 SINGLE SESSION ENFORCEMENT: Clear active session token
  if (req.user?.userId) {
    // Clear the active session token from database
    await prisma.user.update({
      where: { id: req.user.userId },
      data: { 
        activeSessionToken: null,
        sessionLoginTime: null,
        sessionDeviceInfo: null
      }
    });
  }
  
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
  const { email, password, role, roles, firstName, lastName, machineIds } = req.body;
  
  // Email is now required
  if (!email) {
    throw new AppError('Email is required', 400);
  }
  
  if (!validateEmail(email)) {
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
  
  // Check for existing user with same email
  const existing = await prisma.user.findFirst({ where: { email } });
  if (existing) {
    throw new AppError('User with this email already exists', 400);
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
  const rolesJson = RoleManager.serializeRoles(userRoles as any);

  const user = await prisma.user.create({
    data: {
      id: customId,
      email,
      password: hashedPassword,
      role: rolesJson, // Store as JSON string (or plain for admin/planner)
      isActive: true,
      name: `${firstName} ${lastName}`,
    }
  });

  // Assign machines to user if provided
  if (machineIds && Array.isArray(machineIds) && machineIds.length > 0) {
    // Validate machines exist
    const machines = await prisma.machine.findMany({
      where: { id: { in: machineIds } },
      select: { id: true }
    });
    
    if (machines.length !== machineIds.length) {
      const foundIds = machines.map(m => m.id);
      const missingIds = machineIds.filter(id => !foundIds.includes(id));
      throw new AppError(`Machines not found: ${missingIds.join(', ')}`, 404);
    }
    
    // Create machine assignments
    await prisma.userMachine.createMany({
      data: machineIds.map((machineId: string) => ({
        userId: customId,
        machineId: machineId,
        assignedBy: req.user?.userId
      }))
    });
  }

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
      roles: userRoles,
      assignedMachines: machineIds || []
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
  const { email, role, roles, firstName, lastName, isActive, password } = req.body;

  console.log(`🔍 [updateUser] Request body received:`, {
    email,
    firstName,
    lastName,
    roles,
    password: password ? `***${password.length} chars***` : 'not provided',
    isActive
  });

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
    rolesToUpdate = RoleManager.serializeRoles(roles as any);
  } else if (role) {
    // Single role provided (backward compatibility)
    if (!VALID_ROLES.includes(role)) {
      throw new AppError(`Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`, 400);
    }
    rolesToUpdate = RoleManager.serializeRoles([role] as any);
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

  // Build update data object, only including fields that are provided
  const updateData: any = {
    role: rolesToUpdate,
  };

  // Only update email if provided
  if (email !== undefined) {
    updateData.email = email;
  }

  // Only update name if both firstName and lastName are provided
  if (firstName && lastName) {
    updateData.name = `${firstName} ${lastName}`;
  }

  // Only update isActive if provided
  if (isActive !== undefined) {
    updateData.isActive = isActive;
  }

  // Handle password update
  if (password && typeof password === 'string' && password.trim().length > 0) {
    const trimmedPassword = password.trim();
    if (trimmedPassword.length < 6) {
      throw new AppError('Password must be at least 6 characters long', 400);
    }
    const hashedPassword = await bcrypt.hash(trimmedPassword, 12);
    updateData.password = hashedPassword;
    console.log(`🔐 [updateUser] Password update requested for user ${id}`);
    console.log(`🔐 [updateUser] Password length: ${trimmedPassword.length}, hash generated: ${hashedPassword.substring(0, 20)}...`);
  } else {
    console.log(`⚠️ [updateUser] Password not provided or invalid. password value:`, password, `type:`, typeof password);
  }

  console.log(`📝 [updateUser] Updating user ${id} with data keys:`, Object.keys(updateData));
  console.log(`📝 [updateUser] Will update password: ${!!updateData.password}`);

  const updatedUser = await prisma.user.update({
    where: { id },
    data: updateData
  });

  console.log(`✅ [updateUser] User ${id} updated successfully. Password updated: ${!!password}`);

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
