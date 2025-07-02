import { RequestHandler, Router } from 'express';
import { asyncHandler, requireFields, validateEmail, validateLoginRequest } from '../middleware';
import { authenticateToken, requireAdminJWT } from '../middleware/auth';

import { login, getProfile, logout, addMember, getAllUsers, getUserById, updateUser, deleteUser, getRoles } from '../controllers/authControllers/authController';

const router = Router();

// Available roles
const VALID_ROLES = ['admin', 'planner', 'production_head', 'dispatch_executive', 'qc_manager','printer'];

//Unprotected Routes

// role base user login
router.post('/login', login as RequestHandler);

// User management routes
// Admin-only routes
router.post('/add-member', requireAdminJWT, addMember as RequestHandler);
router.get('/users', requireAdminJWT, getAllUsers as RequestHandler);
router.put('/users/:id', requireAdminJWT, updateUser as RequestHandler);
router.delete('/users/:id', requireAdminJWT, deleteUser as RequestHandler);

// Authenticated user routes
router.get('/profile', authenticateToken, getProfile as RequestHandler);
router.get('/users/:id', authenticateToken, getUserById as RequestHandler);
router.get('/roles', authenticateToken, getRoles as RequestHandler);
router.post('/logout', authenticateToken, logout as RequestHandler);

export default router;