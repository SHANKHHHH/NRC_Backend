import express from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  getAvailableMachines,
  startWorkOnMachine,
  completeWorkOnMachine,
  getMachineWorkStatus,
  autoAssignMachineForUrgentJob,
  holdWorkOnMachine,
  resumeWorkOnMachine,
  stopWorkOnMachine,
  getAllHeldMachines
} from '../controllers/jobStepMachineController';

const router = express.Router();

// All routes are protected
router.use(authenticateToken);

// Get all held machines with complete details (must be before other routes)
router.get('/held-machines', getAllHeldMachines);

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

// Hold work on a specific machine
router.post('/:nrcJobNo/steps/:stepNo/machines/:machineId/hold', holdWorkOnMachine);

// Resume work on a specific machine
router.post('/:nrcJobNo/steps/:stepNo/machines/:machineId/resume', resumeWorkOnMachine);

// Stop work on a specific machine
router.post('/:nrcJobNo/steps/:stepNo/machines/:machineId/stop', stopWorkOnMachine);

export default router;
