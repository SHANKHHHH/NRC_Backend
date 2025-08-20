import { Router } from 'express';
import { authenticateToken, requireAdminJWT } from '../middleware/auth';
import { asyncHandler } from '../middleware';
import { createCorrugation, getCorrugationById, getAllCorrugations, updateCorrugation, deleteCorrugation, getCorrugationByNrcJobNo } from '../controllers/corrugationController';

const router = Router();

router.post('/', authenticateToken, asyncHandler(createCorrugation));
router.get('/by-job/:nrcJobNo', authenticateToken, asyncHandler(getCorrugationByNrcJobNo));
router.get('/:id', authenticateToken, asyncHandler(getCorrugationById));
router.get('/', authenticateToken, asyncHandler(getAllCorrugations));

router.put('/:nrcJobNo', authenticateToken, asyncHandler(updateCorrugation));
router.delete('/:id', requireAdminJWT, asyncHandler(deleteCorrugation));

export default router; 