import express from 'express';
import { authenticateToken, requireAdminJWT } from '../middleware/auth';
import { asyncHandler } from '../middleware';
import {
  getActivityLogs,
  getUserActivityLogs,
  getJobActivityLogs,
  getActivitySummary
} from '../controllers/activityLogController';

const router = express.Router();


router.use(authenticateToken);
router.get('/', asyncHandler(getActivityLogs));
router.get('/summary', asyncHandler(getActivitySummary));
router.get('/user/:userId', asyncHandler(getUserActivityLogs));
router.get('/job/:nrcJobNo', asyncHandler(getJobActivityLogs));


export default router; 

