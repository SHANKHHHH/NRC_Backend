import { RequestHandler, Router } from 'express';
import { asyncHandler, requireFields, validateEmail, validateLoginRequest } from '../middleware';
import { authenticateToken, requireAdminJWT } from '../middleware/auth';

import { login, getProfile, logout, addMember, getAllUsers, getUserById, updateUser, deleteUser, getRoles } from '../controllers/authControllers/authController';

const router = Router();

// Available roles
const VALID_ROLES = ['admin', 'planner', 'production_head', 'dispatch_executive', 'qc_manager','printer'];

//Unprotected Routes

// role base user login
router.post('/login', asyncHandler(login));

// User management routes
// Admin-only routes
router.post('/add-member', requireAdminJWT, asyncHandler(addMember));
router.get('/users', requireAdminJWT, asyncHandler(getAllUsers));
router.put('/users/:id', requireAdminJWT, asyncHandler(updateUser));
router.delete('/users/:id', requireAdminJWT, asyncHandler(deleteUser));

// Authenticated user routes
router.get('/profile', authenticateToken, asyncHandler(getProfile));
router.get('/users/:id', authenticateToken, asyncHandler(getUserById));
router.get('/roles', authenticateToken, asyncHandler(getRoles));
router.post('/logout', authenticateToken, asyncHandler(logout));

export default router;