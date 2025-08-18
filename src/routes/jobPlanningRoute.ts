import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { createJobPlanning, getAllJobPlannings, getJobPlanningByNrcJobNo, updateJobStepStatus, getStepsByNrcJobNo, getStepByNrcJobNoAndStepNo, updateStepByNrcJobNoAndStepNo, updateStepStatusByNrcJobNoAndStepNo, getAllJobPlanningsSimple, upsertStepByNrcJobNoAndStepNo, bulkUpdateJobSteps } from '../controllers/jobPlanningController';

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

// Unified update: status and/or machineDetails in one call
router.put('/:nrcJobNo/steps/:stepNo', authenticateToken, upsertStepByNrcJobNoAndStepNo);

// Add a test route to verify CORS is working
router.options('/:nrcJobNo/steps/:stepNo', (req, res) => {
  console.log('OPTIONS request received for step status update');
  res.status(200).end();
});

// Get a job planning by nrcJobNo (must be LAST to avoid conflicts)
router.get('/:nrcJobNo', authenticateToken, getJobPlanningByNrcJobNo);

// Bulk update all job steps and their details
router.put('/:nrcJobNo/bulk-update', authenticateToken, bulkUpdateJobSteps);

export default router;