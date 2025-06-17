import { Router } from 'express';
import { asyncHandler, requireFields, validateEmail } from '../middleware';
import { authenticateToken, requireAdminJWT } from '../middleware/auth';
import * as AuthController from '../controllers/authController';

const router = Router();

// Available roles
const VALID_ROLES = ['admin', 'planner', 'production_head', 'dispatch_executive', 'qc_manager'];

// Login endpoint with JWT token
router.post('/login', requireFields(['email', 'password', 'role']), asyncHandler(AuthController.login));

// Get current user profile (protected route with JWT)
router.get('/profile', authenticateToken, asyncHandler(AuthController.getProfile));

// Logout endpoint (clears cookie)
router.post('/logout', AuthController.logout);

// Admin-only: Add new member (requires JWT token with admin role)
router.post('/add-member', requireAdminJWT, requireFields(['email', 'password', 'role']), asyncHandler(AuthController.addMember));

// Admin-only: Get all users (requires JWT token with admin role)
router.get('/users', requireAdminJWT, asyncHandler(AuthController.getAllUsers));

// Admin-only: Get user by ID (requires JWT token with admin role)
router.get('/users/:id', requireAdminJWT, asyncHandler(AuthController.getUserById));

// Admin-only: Update user (requires JWT token with admin role)
router.put('/users/:id', requireAdminJWT, asyncHandler(AuthController.updateUser));

// Admin-only: Delete user (requires JWT token with admin role)
router.delete('/users/:id', requireAdminJWT, asyncHandler(AuthController.deleteUser));

// Get available roles (for frontend)
router.get('/roles', AuthController.getRoles);

export default router; 