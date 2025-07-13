import express from 'express';
import { authenticateToken, requireAdminJWT } from '../middleware/auth';
import {
  createMachine,
  getAllMachines,
  getAvailableMachines,
  getBusyMachines,
  getMachineById,
  updateMachine,
  updateMachineStatus,
  deleteMachine,
  getMachineStats
} from '../controllers/machineController';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Public routes (authenticated users can view)
router.get('/', getAllMachines);
router.get('/available', getAvailableMachines);
router.get('/busy', getBusyMachines);
router.get('/stats', getMachineStats);
router.get('/:id', getMachineById);

// Admin and Production Head routes
router.post('/', createMachine);
router.put('/:id', updateMachine);
router.patch('/:id/status', updateMachineStatus);

// Admin only routes
router.delete('/:id', requireAdminJWT, deleteMachine);

export default router; 