import { Router } from 'express';
import { authenticateToken, requireAdminJWT } from '../middleware/auth';
import { asyncHandler, addMachineFiltering } from '../middleware';
import { createSideFlapPasting, getSideFlapPastingById, getSideFlapPastingByJobStepId, getAllSideFlapPastings, updateSideFlapPasting, deleteSideFlapPasting, getSideFlapPastingByNrcJobNo, updateSideFlapPastingStatus } from '../controllers/sideFlapPastingController';

const router = Router();

router.post('/', authenticateToken, asyncHandler(createSideFlapPasting));
router.get('/by-step-id/:jobStepId', authenticateToken, asyncHandler(getSideFlapPastingByJobStepId));
router.get('/by-job/:nrcJobNo', authenticateToken, asyncHandler(getSideFlapPastingByNrcJobNo));
router.get('/:id', authenticateToken, asyncHandler(getSideFlapPastingById));
router.get('/', authenticateToken, addMachineFiltering, asyncHandler(getAllSideFlapPastings));

router.put('/:nrcJobNo', authenticateToken, asyncHandler(updateSideFlapPasting));
router.patch('/:nrcJobNo/status', authenticateToken, asyncHandler(updateSideFlapPastingStatus));
router.delete('/:id', requireAdminJWT, asyncHandler(deleteSideFlapPasting));

export default router; 