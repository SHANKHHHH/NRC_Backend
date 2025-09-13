import { Router } from 'express';
import { asyncHandler, authenticateToken, requireAdminJWT } from '../middleware';
import {
  assignMachinesToUser,
  removeMachinesFromUser,
  getUserMachines,
  assignMachinesToPO,
  removeMachinesFromPO,
  getPOMachines
} from '../controllers/machineAssignmentController';

const router = Router();

// User Machine Assignments (Admin only)
router.post('/users/assign-machines', authenticateToken, requireAdminJWT, asyncHandler(assignMachinesToUser));
router.post('/users/remove-machines', authenticateToken, requireAdminJWT, asyncHandler(removeMachinesFromUser));
router.get('/users/:userId/machines', authenticateToken, requireAdminJWT, asyncHandler(getUserMachines));

// Purchase Order Machine Assignments (Admin/Planner)
router.post('/purchase-orders/assign-machines', authenticateToken, asyncHandler(assignMachinesToPO));
router.post('/purchase-orders/remove-machines', authenticateToken, asyncHandler(removeMachinesFromPO));
router.get('/purchase-orders/:poId/machines', authenticateToken, asyncHandler(getPOMachines));

export default router;
