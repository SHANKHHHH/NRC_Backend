import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { createJobPlanning, getAllJobPlannings, getJobPlanningByNrcJobNo, updateJobStepStatus, getStepsByNrcJobNo, getStepByNrcJobNoAndStepNo, updateStepByNrcJobNoAndStepNo, getAllJobPlanningsSimple } from '../controllers/jobPlanningController';

const router = Router();

// Test route to verify router is working
router.get('/test', (req, res) => {
  res.json({ message: 'Job planning router is working' });
});

// Place summary route BEFORE any parameterized routes
router.get('/summary', getAllJobPlanningsSimple);

// Create a new job planning
router.post('/', authenticateToken, createJobPlanning);

// Get all job plannings
router.get('/', authenticateToken, getAllJobPlannings);

// Update a specific job step's status, startDate, endDate, and user
router.patch('/:nrcJobNo/:jobPlanId/steps/:jobStepNo/status', authenticateToken, updateJobStepStatus);

// Get all steps for a given nrcJobNo
router.get('/:nrcJobNo/steps', authenticateToken, getStepsByNrcJobNo);

// Get a specific step for a given nrcJobNo and stepNo
router.get('/:nrcJobNo/steps/:stepNo', authenticateToken, getStepByNrcJobNoAndStepNo);

// Update any field of a specific step for a given nrcJobNo and stepNo
router.patch('/:nrcJobNo/steps/:stepNo', authenticateToken, (req, res) => {
  console.log('PATCH route hit:', req.params);
  updateStepByNrcJobNoAndStepNo(req, res);
});

// Get a job planning by nrcJobNo (must be LAST to avoid conflicts)
router.get('/:nrcJobNo', authenticateToken, getJobPlanningByNrcJobNo);

export default router; 