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
router.get('/',  getActivityLogs);
router.get('/summary', getActivitySummary);
router.get('/user/:userId', getUserActivityLogs);
router.get('/job/:nrcJobNo', getJobActivityLogs);


export default router; 

