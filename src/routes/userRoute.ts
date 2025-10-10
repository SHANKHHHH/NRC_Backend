import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { asyncHandler } from '../middleware';
import {
  getAllUsers,
  getUserById,
  addRoleToUser,
  removeRoleFromUser,
  setUserRoles,
  getUserMachines
} from '../controllers/userController';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Get all users with parsed roles
router.get('/', asyncHandler(getAllUsers));

// Get current user's machines (MUST be before /:id to avoid route conflict)
router.get('-machines', asyncHandler(getUserMachines));

// Get user by ID with parsed roles
router.get('/:id', asyncHandler(getUserById));

// Add role to user
router.post('/:id/roles', asyncHandler(addRoleToUser));

// Remove role from user
router.delete('/:id/roles', asyncHandler(removeRoleFromUser));

// Set multiple roles for user
router.put('/:id/roles', asyncHandler(setUserRoles));

export default router;
