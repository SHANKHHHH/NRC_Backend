import { Router } from 'express';
import { authenticateToken, requireAdminJWT } from '../middleware/auth';
import { createCorrugation, getCorrugationById, getAllCorrugations, updateCorrugation, deleteCorrugation, getCorrugationByNrcJobNo } from '../controllers/corrugationController';

const router = Router();

router.post('/', authenticateToken, createCorrugation);
router.get('/by-job/:nrcJobNo', authenticateToken, getCorrugationByNrcJobNo);
router.get('/:id', authenticateToken, getCorrugationById);
router.get('/', authenticateToken, getAllCorrugations);

router.put('/:nrcJobNo', authenticateToken, updateCorrugation);
router.delete('/:id', requireAdminJWT, deleteCorrugation);

export default router; 