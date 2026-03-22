import express from 'express';
import { authenticateToken } from '../middleware/auth';
import { asyncHandler } from '../middleware';
import { addMachineFiltering } from '../middleware/machineAccess';
import {
  getDashboardData,
  getJobAggregatedData,
  getJobCounts,
  getRoleDashboardBundle,
  getStepDetailsBatch,
  getJobsWithPODetailsBatch,
} from '../controllers/dashboardController';

const router = express.Router();

// Admin / Production Head: one HTTP request instead of job-planning + completed-jobs + held-machines + major-hold/count
router.get(
  '/role-bundle',
  authenticateToken,
  addMachineFiltering,
  asyncHandler(getRoleDashboardBundle)
);

// Replaces N× GET .../by-step-id/:id for dashboard step status (same payload per step)
router.post('/step-details-batch', authenticateToken, asyncHandler(getStepDetailsBatch));

// Replaces N× GET /api/jobs/:nrcJobNo/with-po-details for job list cards (same payload per job)
router.post(
  '/jobs-with-po-details-batch',
  authenticateToken,
  asyncHandler(getJobsWithPODetailsBatch)
);

// Get aggregated dashboard data (replaces multiple individual API calls)
router.get('/', authenticateToken, asyncHandler(getDashboardData));

// Get aggregated data for a specific job (replaces multiple job-related API calls)
router.get('/job/:nrcJobNo', authenticateToken, asyncHandler(getJobAggregatedData));

// Get accurate job counts for status overview
router.get('/counts', authenticateToken, asyncHandler(getJobCounts));

export default router; 