import { Router } from 'express';
import { asyncHandler, requireFields, validateEmail } from '../middleware';
import { authenticateToken, requireAdminJWT } from '../middleware/auth';
import * as AuthController from '../controllers/authController';

const router = Router();

// Available roles
const VALID_ROLES = ['admin', 'planner', 'production_head', 'dispatch_executive', 'qc_manager'];

// 🔐 Login - issues JWT in response (header-only token usage)
router.post('/login', requireFields(['email', 'password', 'role']), asyncHandler(AuthController.login));

// 🔒 Get current user's profile - JWT required in header
router.get('/profile', authenticateToken, asyncHandler(AuthController.getProfile));

// 🔓 Logout - optional (e.g., for clearing token on client side)
router.post('/logout', AuthController.logout);

// 🛡️ Admin-only: Add a new member - requires admin role via JWT
router.post(
  '/add-member',
  requireAdminJWT,
  requireFields(['email', 'password', 'role']),
  asyncHandler(AuthController.addMember)
);

// 🛡️ Admin-only: Fetch all users
router.get('/users', requireAdminJWT, asyncHandler(AuthController.getAllUsers));

// 🛡️ Admin-only: Get user by ID
router.get('/users/:id', requireAdminJWT, asyncHandler(AuthController.getUserById));

// 🛡️ Admin-only: Update user by ID
router.put('/users/:id', requireAdminJWT, asyncHandler(AuthController.updateUser));

// 🛡️ Admin-only: Delete user by ID
router.delete('/users/:id', requireAdminJWT, asyncHandler(AuthController.deleteUser));

// 📄 Public: Get available user roles for registration UI etc.
router.get('/roles', AuthController.getRoles);

export default router;
