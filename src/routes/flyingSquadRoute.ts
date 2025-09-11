import express from 'express';
import { authenticateToken } from '../middleware/auth';
import { asyncHandler } from '../middleware';
import {
  getAllJobSteps,
  getJobStepsNeedingQCCheck,
  performQCCheck,
  getQCStats
} from '../controllers/flyingSquadController';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Flying Squad routes
router.get('/job-steps', asyncHandler(getAllJobSteps));
router.get('/job-steps/needing-qc', asyncHandler(getJobStepsNeedingQCCheck));
router.post('/job-steps/:id/qc-check', asyncHandler(performQCCheck));
router.get('/qc-stats', asyncHandler(getQCStats));

export default router;

