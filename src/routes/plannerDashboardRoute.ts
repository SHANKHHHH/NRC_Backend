import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { asyncHandler } from '../middleware';
import { getPlannerDashboard, getJobPlanningDetails } from '../controllers/plannerDashboardController';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Get planner dashboard overview
router.get('/', asyncHandler(getPlannerDashboard));

// Get detailed planning information for a specific job
router.get('/job/:nrcJobNo', asyncHandler(getJobPlanningDetails));

export default router;
