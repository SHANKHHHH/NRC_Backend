import express from 'express';
import { authenticateToken } from '../middleware/auth';
import { asyncHandler } from '../middleware';
import { getDashboardData, getJobAggregatedData } from '../controllers/dashboardController';

const router = express.Router();

// Get aggregated dashboard data (replaces multiple individual API calls)
router.get('/', authenticateToken, asyncHandler(getDashboardData));

// Get aggregated data for a specific job (replaces multiple job-related API calls)
router.get('/job/:nrcJobNo', authenticateToken, asyncHandler(getJobAggregatedData));

export default router; 