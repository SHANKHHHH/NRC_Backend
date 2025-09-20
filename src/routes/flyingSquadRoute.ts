import express from 'express';
import { authenticateToken } from '../middleware/auth';
import { asyncHandler } from '../middleware';
import {
  getAllJobSteps,
  getJobStepsNeedingQCCheck,
  performQCCheck,
  getQCStats,
  getRecentActivities
} from '../controllers/flyingSquadController';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Flying Squad routes
router.get('/job-steps', asyncHandler(getAllJobSteps));
router.get('/job-steps/needing-qc', asyncHandler(getJobStepsNeedingQCCheck));
router.get('/qc-pending', asyncHandler(getJobStepsNeedingQCCheck)); // Alias for Flutter app
router.post('/job-steps/:id/qc-check', asyncHandler(performQCCheck));
router.post('/qc-check', asyncHandler(performQCCheck)); // Alias for Flutter app
router.get('/qc-stats', asyncHandler(getQCStats));
router.get('/recent-activities', asyncHandler(getRecentActivities)); // New endpoint for Flutter app

export default router;

