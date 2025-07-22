import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { createJobPlanning, getAllJobPlannings, getJobPlanningByNrcJobNo, updateJobStepStatus } from '../controllers/jobPlanningController';

const router = Router();

// Create a new job planning
router.post('/', authenticateToken, createJobPlanning);

// Get all job plannings
router.get('/', authenticateToken, getAllJobPlannings);

// Get a job planning by nrcJobNo
router.get('/:nrcJobNo', authenticateToken, getJobPlanningByNrcJobNo);

// Update a specific job step's status, startDate, endDate, and user
router.patch('/:nrcJobNo/:jobPlanId/steps/:jobStepNo/status', authenticateToken, updateJobStepStatus);

export default router; 