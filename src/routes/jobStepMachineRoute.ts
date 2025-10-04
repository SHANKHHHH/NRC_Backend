import express from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  getAvailableMachines,
  startWorkOnMachine,
  completeWorkOnMachine,
  getMachineWorkStatus,
  autoAssignMachineForUrgentJob
} from '../controllers/jobStepMachineController';

const router = express.Router();

// All routes are protected
router.use(authenticateToken);

// Get available machines for a job step
router.get('/:nrcJobNo/steps/:stepNo/machines', getAvailableMachines);

// Start work on a specific machine
router.post('/:nrcJobNo/steps/:stepNo/machines/:machineId/start', startWorkOnMachine);

// Complete work on a specific machine
router.post('/:nrcJobNo/steps/:stepNo/machines/:machineId/complete', completeWorkOnMachine);

// Get machine work status for a job step
router.get('/:nrcJobNo/steps/:stepNo/machines/status', getMachineWorkStatus);

// Auto-assign machine for urgent jobs
router.post('/:nrcJobNo/steps/:stepNo/urgent/start', autoAssignMachineForUrgentJob);

export default router;
