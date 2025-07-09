import { Router } from 'express';
import { authenticateToken, requireAdminJWT } from '../middleware/auth';
import { createCorrugation, getCorrugationById, getAllCorrugations, updateCorrugation, deleteCorrugation } from '../controllers/corrugationController';

const router = Router();

router.post('/', authenticateToken, createCorrugation);
router.get('/:id', authenticateToken, getCorrugationById);
router.get('/', authenticateToken, getAllCorrugations);
router.put('/:id', requireAdminJWT, updateCorrugation);
router.delete('/:id', requireAdminJWT, deleteCorrugation);

export default router; 