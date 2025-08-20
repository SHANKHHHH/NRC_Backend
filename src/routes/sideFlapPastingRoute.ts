import { Router } from 'express';
import { authenticateToken, requireAdminJWT } from '../middleware/auth';
import { asyncHandler } from '../middleware';
import { createSideFlapPasting, getSideFlapPastingById, getAllSideFlapPastings, updateSideFlapPasting, deleteSideFlapPasting, getSideFlapPastingByNrcJobNo } from '../controllers/sideFlapPastingController';

const router = Router();

router.post('/', authenticateToken, asyncHandler(createSideFlapPasting));
router.get('/by-job/:nrcJobNo', authenticateToken, asyncHandler(getSideFlapPastingByNrcJobNo));
router.get('/:id', authenticateToken, asyncHandler(getSideFlapPastingById));
router.get('/', authenticateToken, asyncHandler(getAllSideFlapPastings));

router.put('/:nrcJobNo', authenticateToken, asyncHandler(updateSideFlapPasting));
router.delete('/:id', requireAdminJWT, asyncHandler(deleteSideFlapPasting));

export default router; 