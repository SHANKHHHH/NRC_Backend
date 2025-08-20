import express from 'express';
import { authenticateToken, requireAdminJWT } from '../middleware/auth';
import { asyncHandler } from '../middleware';
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
router.get('/', asyncHandler(getAllMachines));
router.get('/available', asyncHandler(getAvailableMachines));
router.get('/busy', asyncHandler(getBusyMachines));
router.get('/stats', asyncHandler(getMachineStats));
router.get('/:id', asyncHandler(getMachineById));

// Admin and Production Head routes
router.post('/', asyncHandler(createMachine));
router.put('/:id', asyncHandler(updateMachine));
router.patch('/:id/status', asyncHandler(updateMachineStatus));

// Admin only routes
router.delete('/:id', requireAdminJWT, asyncHandler(deleteMachine));

export default router; 