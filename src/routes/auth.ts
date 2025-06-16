import { Router, Request, Response } from 'express';
import { AuthService } from '../services/authService';
import { asyncHandler, requireFields, validateEmail } from '../middleware';
import { authenticateToken, requireAdminJWT } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();

// Available roles
const VALID_ROLES = ['admin', 'planner', 'production_head', 'dispatch_executive', 'qc_manager'];

// Login endpoint with JWT token
router.post('/login', requireFields(['email', 'password', 'role']), asyncHandler(async (req: Request, res: Response) => {
  const { email, password, role } = req.body;

  // Validate email format
  if (!validateEmail(email)) {
    throw new AppError('Invalid email format', 400);
  }

  // Validate role
  if (!VALID_ROLES.includes(role)) {
    throw new AppError(`Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`, 400);
  }

  const loginResult = await AuthService.login({ email, password, role });

  // Set HTTP-only cookie with JWT token
  res.cookie('accessToken', loginResult.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
    path: '/'
  });

  res.json({
    success: true,
    message: 'Login successful',
    data: {
      user: loginResult.user,
      token: loginResult.token // Still send in response for immediate use
    }
  });
}));

// Get current user profile (protected route with JWT)
router.get('/profile', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const user = await AuthService.getUserById(req.user!.userId);

  if (!user) {
    throw new AppError('User not found', 404);
  }

  res.json({
    success: true,
    data: user
  });
}));

// Logout endpoint (clears cookie)
router.post('/logout', (req: Request, res: Response) => {
  res.clearCookie('accessToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/'
  });

  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

// Admin-only: Add new member (requires JWT token with admin role)
router.post('/add-member', requireAdminJWT, requireFields(['email', 'password', 'role']), asyncHandler(async (req: Request, res: Response) => {
  const { email, password, role, firstName, lastName } = req.body;

  // Validate email format
  if (!validateEmail(email)) {
    throw new AppError('Invalid email format', 400);
  }

  // Validate role
  if (!VALID_ROLES.includes(role)) {
    throw new AppError(`Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`, 400);
  }

  // Validate password strength
  if (password.length < 6) {
    throw new AppError('Password must be at least 6 characters long', 400);
  }

  const newUser = await AuthService.register({
    email,
    password,
    role,
    firstName,
    lastName
  });

  res.status(201).json({
    success: true,
    message: 'Member added successfully',
    data: newUser
  });
}));

// Admin-only: Get all users (requires JWT token with admin role)
router.get('/users', requireAdminJWT, asyncHandler(async (req: Request, res: Response) => {
  const users = await AuthService.getAllUsers();

  res.json({
    success: true,
    data: users,
    count: users.length
  });
}));

// Admin-only: Get user by ID (requires JWT token with admin role)
router.get('/users/:id', requireAdminJWT, asyncHandler(async (req: Request, res: Response) => {
  const user = await AuthService.getUserById(req.params.id);

  if (!user) {
    throw new AppError('User not found', 404);
  }

  res.json({
    success: true,
    data: user
  });
}));

// Admin-only: Update user (requires JWT token with admin role)
router.put('/users/:id', requireAdminJWT, asyncHandler(async (req: Request, res: Response) => {
  const { email, role, firstName, lastName, isActive } = req.body;

  // Validate email if provided
  if (email && !validateEmail(email)) {
    throw new AppError('Invalid email format', 400);
  }

  // Validate role if provided
  if (role && !VALID_ROLES.includes(role)) {
    throw new AppError(`Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`, 400);
  }

  const updateData: any = {};
  if (email) updateData.email = email;
  if (role) updateData.role = role;
  if (firstName !== undefined) updateData.firstName = firstName;
  if (lastName !== undefined) updateData.lastName = lastName;
  if (isActive !== undefined) updateData.isActive = isActive;

  const updatedUser = await AuthService.updateUser(req.params.id, updateData);

  res.json({
    success: true,
    message: 'User updated successfully',
    data: updatedUser
  });
}));

// Admin-only: Delete user (requires JWT token with admin role)
router.delete('/users/:id', requireAdminJWT, asyncHandler(async (req: Request, res: Response) => {
  await AuthService.deleteUser(req.params.id);

  res.json({
    success: true,
    message: 'User deleted successfully'
  });
}));

// Get available roles (for frontend)
router.get('/roles', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: VALID_ROLES
  });
});

export default router; 