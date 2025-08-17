import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware';
import { RoleManager } from '../utils/roleUtils';
import { logUserActionWithResource, ActionTypes } from '../lib/logger';

/**
 * Get all users with their roles
 */
export const getAllUsers = async (req: Request, res: Response) => {
  const userRole = req.user?.role;
  if (!userRole || !RoleManager.canPerformAdminAction(userRole)) {
    throw new AppError('You are not authorized to perform this action. Required role: admin', 403);
  }

  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        lastLogin: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: { createdAt: 'desc' }
    });

    // Parse roles for each user
    const usersWithParsedRoles = users.map(user => ({
      ...user,
      roles: RoleManager.getUserRoles(user.role),
      roleCount: RoleManager.getUserRoles(user.role).length
    }));

    res.status(200).json({
      success: true,
      count: usersWithParsedRoles.length,
      data: usersWithParsedRoles,
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get user by ID with parsed roles
 */
export const getUserById = async (req: Request, res: Response) => {
  const userRole = req.user?.role;
  if (!userRole || !RoleManager.canPerformAdminAction(userRole)) {
    throw new AppError('You are not authorized to perform this action. Required role: admin', 403);
  }

  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        lastLogin: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    const userWithParsedRoles = {
      ...user,
      roles: RoleManager.getUserRoles(user.role),
      roleCount: RoleManager.getUserRoles(user.role).length
    };

    res.status(200).json({
      success: true,
      data: userWithParsedRoles,
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error fetching user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Add a role to a user
 */
export const addRoleToUser = async (req: Request, res: Response) => {
  const userRole = req.user?.role;
  if (!userRole || !RoleManager.canPerformAdminAction(userRole)) {
    throw new AppError('You are not authorized to perform this action. Required role: admin', 403);
  }

  try {
    const { userId, newRole } = req.body;

    if (!userId || !newRole) {
      throw new AppError('User ID and new role are required', 400);
    }

    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Add the new role
    const updatedRoleString = RoleManager.addRole(user.role, newRole);

    // Now we can use regular Prisma since role is a String
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { role: updatedRoleString },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        lastLogin: true,
        createdAt: true,
        updatedAt: true
      }
    });

    // Log the action
    if (req.user?.userId) {
      await logUserActionWithResource(
        req.user.userId,
        ActionTypes.USER_ROLE_ADDED,
        `Added role '${newRole}' to user ${userId}`,
        'User',
        userId
      );
    }

    const userWithParsedRoles = {
      ...updatedUser,
      roles: RoleManager.getUserRoles(updatedUser.role),
      roleCount: RoleManager.getUserRoles(updatedUser.role).length
    };

    res.status(200).json({
      success: true,
      data: userWithParsedRoles,
      message: `Role '${newRole}' added successfully to user`,
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error adding role to user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add role to user',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Remove a role from a user
 */
export const removeRoleFromUser = async (req: Request, res: Response) => {
  const userRole = req.user?.role;
  if (!userRole || !RoleManager.canPerformAdminAction(userRole)) {
    throw new AppError('You are not authorized to perform this action. Required role: admin', 403);
  }

  try {
    const { userId, roleToRemove } = req.body;

    if (!userId || !roleToRemove) {
      throw new AppError('User ID and role to remove are required', 400);
    }

    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Remove the role
    const updatedRoleString = RoleManager.removeRole(user.role, roleToRemove);

    // Now we can use regular Prisma since role is a String
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { role: updatedRoleString },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        lastLogin: true,
        createdAt: true,
        updatedAt: true
      }
    });

    // Log the action
    if (req.user?.userId) {
      await logUserActionWithResource(
        req.user.userId,
        ActionTypes.USER_ROLE_REMOVED,
        `Removed role '${roleToRemove}' from user ${userId}`,
        'User',
        userId
      );
    }

    const userWithParsedRoles = {
      ...updatedUser,
      roles: RoleManager.getUserRoles(updatedUser.role),
      roleCount: RoleManager.getUserRoles(updatedUser.role).length
    };

    res.status(200).json({
      success: true,
      data: userWithParsedRoles,
      message: `Role '${roleToRemove}' removed successfully from user`,
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error removing role from user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove role from user',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Set multiple roles for a user
 */
export const setUserRoles = async (req: Request, res: Response) => {
  const userRole = req.user?.role;
  if (!userRole || !RoleManager.canPerformAdminAction(userRole)) {
    throw new AppError('You are not authorized to perform this action. Required role: admin', 403);
  }

  try {
    const { userId, roles } = req.body;

    if (!userId || !Array.isArray(roles)) {
      throw new AppError('User ID and roles array are required', 400);
    }

    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Set the new roles
    const updatedRoleString = RoleManager.setRoles(roles);

    // Now we can use regular Prisma since role is a String
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { role: updatedRoleString },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        lastLogin: true,
        createdAt: true,
        updatedAt: true
      }
    });

    // Log the action
    if (req.user?.userId) {
      await logUserActionWithResource(
        req.user.userId,
        ActionTypes.USER_ROLES_UPDATED,
        `Updated roles for user ${userId} to: ${roles.join(', ')}`,
        'User',
        userId
      );
    }

    const userWithParsedRoles = {
      ...updatedUser,
      roles: RoleManager.getUserRoles(updatedUser.role),
      roleCount: RoleManager.getUserRoles(updatedUser.role).length
    };

    res.status(200).json({
      success: true,
      data: userWithParsedRoles,
      message: `User roles updated successfully`,
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error updating user roles:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user roles',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
