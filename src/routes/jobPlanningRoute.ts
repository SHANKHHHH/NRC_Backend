import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { createJobPlanning, getAllJobPlannings, getJobPlanningByNrcJobNo, updateJobStepStatus, getStepsByNrcJobNo, getStepByNrcJobNoAndStepNo, updateStepByNrcJobNoAndStepNo, getAllJobPlanningsSimple } from '../controllers/jobPlanningController';

const router = Router();

// Place summary route BEFORE any parameterized routes
router.get('/summary', getAllJobPlanningsSimple);

// Create a new job planning
router.post('/', authenticateToken, createJobPlanning);

// Get all job plannings
router.get('/', authenticateToken, getAllJobPlannings);

// Get all steps for a given nrcJobNo
router.get('/:nrcJobNo/steps', authenticateToken, getStepsByNrcJobNo);

// Get a specific step for a given nrcJobNo and stepNo
router.get('/:nrcJobNo/steps/:stepNo', authenticateToken, getStepByNrcJobNoAndStepNo);

// Update any field of a specific step for a given nrcJobNo and stepNo
router.patch('/:nrcJobNo/steps/:stepNo', authenticateToken, updateStepByNrcJobNoAndStepNo);

// Get a job planning by nrcJobNo
router.get('/:nrcJobNo', authenticateToken, getJobPlanningByNrcJobNo);

// Update a specific job step's status, startDate, endDate, and user
router.patch('/:nrcJobNo/:jobPlanId/steps/:jobStepNo/status', authenticateToken, updateJobStepStatus);

export default router; 