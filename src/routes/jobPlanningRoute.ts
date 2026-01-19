import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { asyncHandler } from '../middleware';
import { 
  restrictFlyingSquadToQC, 
  restrictStepStatusUpdate, 
  restrictMachineDetailsUpdate, 
  restrictStepTimingUpdate 
} from '../middleware/flyingSquadPermissions';
import { addMachineFiltering } from '../middleware';
import { validateStepTransition, autoCorrectStateInconsistencies } from '../middleware/stepValidation';
import { createJobPlanning, getAllJobPlannings, getJobPlanningByNrcJobNo, getJobPlanningByPurchaseOrderId, updateJobStepStatus, getStepsByNrcJobNo, getStepByNrcJobNoAndStepNo, updateStepByNrcJobNoAndStepNo, updateStepStatusByNrcJobNoAndStepNo, getAllJobPlanningsSimple, upsertStepByNrcJobNoAndStepNo, bulkUpdateJobSteps, updateJobStepById, continueStepByProductionHead } from '../controllers/jobPlanningController';

const router = Router();

// Test route to verify router is working
router.get('/test', (req, res) => {
  res.json({ message: 'Job planning router is working' });
});

// Place summary route BEFORE any parameterized routes
router.get('/summary', addMachineFiltering, asyncHandler(getAllJobPlanningsSimple));

// Create a new job planning
router.post('/', authenticateToken, asyncHandler(createJobPlanning));

// Get all job plannings
router.get('/', authenticateToken, addMachineFiltering, asyncHandler(getAllJobPlannings));

// Update a specific job step's status, startDate, endDate, and user
router.patch('/:nrcJobNo/:jobPlanId/steps/:jobStepNo/status', 
  authenticateToken, 
  restrictStepStatusUpdate, 
  restrictStepTimingUpdate, 
  asyncHandler(updateJobStepStatus)
);

// Get all steps for a given nrcJobNo
router.get('/:nrcJobNo/steps', authenticateToken, asyncHandler(getStepsByNrcJobNo));

// Get a specific step for a given nrcJobNo and stepNo
router.get('/:nrcJobNo/steps/:stepNo', authenticateToken, asyncHandler(getStepByNrcJobNoAndStepNo));

// Get job planning by Purchase Order ID (must be BEFORE /:nrcJobNo)
router.get('/po/:purchaseOrderId', authenticateToken, asyncHandler(getJobPlanningByPurchaseOrderId));

// Unified update: status and/or machineDetails in one call
router.put('/:nrcJobNo/steps/:stepNo', 
  authenticateToken, 
  asyncHandler(upsertStepByNrcJobNoAndStepNo)
);

// Add a test route to verify CORS is working
router.options('/:nrcJobNo/steps/:stepNo', (req, res) => {
  console.log('OPTIONS request received for step status update');
  res.status(200).end();
});

// Get a job planning by nrcJobNo (must be LAST to avoid conflicts)
router.get('/:nrcJobNo', authenticateToken, asyncHandler(getJobPlanningByNrcJobNo));

// Bulk update all job steps and their details
router.put('/:nrcJobNo/bulk-update', 
  authenticateToken, 
  restrictStepStatusUpdate, 
  restrictMachineDetailsUpdate, 
  restrictStepTimingUpdate, 
  asyncHandler(bulkUpdateJobSteps)
);

// Flying Squad QC-only update endpoint
router.patch('/:nrcJobNo/steps/:stepNo/qc', 
  authenticateToken, 
  restrictFlyingSquadToQC, 
  asyncHandler(updateJobStepStatus)
);

// Update job step by job step ID directly (solves multiple job plannings issue)
router.put('/step/:jobStepId', 
  authenticateToken, 
  restrictStepStatusUpdate, 
  restrictMachineDetailsUpdate, 
  restrictStepTimingUpdate, 
  asyncHandler(updateJobStepById)
);

// 🎯 NEW: Production Head continuation endpoint
router.post('/continue-step', 
  authenticateToken, 
  asyncHandler(continueStepByProductionHead)
);

export default router;