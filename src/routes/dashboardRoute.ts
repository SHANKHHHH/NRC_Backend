import express from 'express';
import { authenticateToken } from '../middleware/auth';
import { asyncHandler } from '../middleware';
import { getDashboardData, getJobAggregatedData, getJobCounts } from '../controllers/dashboardController';

const router = express.Router();

// Get aggregated dashboard data (replaces multiple individual API calls)
router.get('/', authenticateToken, asyncHandler(getDashboardData));

// Get aggregated data for a specific job (replaces multiple job-related API calls)
router.get('/job/:nrcJobNo', authenticateToken, asyncHandler(getJobAggregatedData));

// Get accurate job counts for status overview
router.get('/counts', authenticateToken, asyncHandler(getJobCounts));

export default router; 