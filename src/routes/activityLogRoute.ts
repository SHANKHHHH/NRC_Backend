import express from 'express';
import { authenticateToken, requireAdminJWT } from '../middleware/auth';
import {
  getActivityLogs,
  getUserActivityLogs,
  getJobActivityLogs,
  getActivitySummary
} from '../controllers/activityLogController';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Get all activity logs (admin only)
router.get('/', requireAdminJWT, getActivityLogs);

// Get activity summary (admin only)
router.get('/summary', requireAdminJWT, getActivitySummary);

// Get activity logs for a specific user
router.get('/user/:userId', getUserActivityLogs);

// Get activity logs for a specific job
router.get('/job/:nrcJobNo', getJobActivityLogs);

export default router; 

