import express from 'express';
import { authenticateToken, requireAdminJWT } from '../middleware/auth';
import {
  getActivityLogs,
  getUserActivityLogs,
  getJobActivityLogs,
  getActivitySummary
} from '../controllers/activityLogController';

const router = express.Router();


router.use(authenticateToken);
//checking the route file 

router.get('/',  getActivityLogs);


router.get('/summary', getActivitySummary);

// Get activity logs for a specific user
router.get('/user/:userId', getUserActivityLogs);

// Get activity logs for a specific job
router.get('/job/:nrcJobNo', getJobActivityLogs);

export default router; 

