import { Router } from 'express';
import { authenticateToken, requireAdminJWT } from '../middleware/auth';
import { createCorrugation, getCorrugationById, getAllCorrugations, updateCorrugation, deleteCorrugation, getCorrugationByNrcJobNo } from '../controllers/corrugationController';

const router = Router();

router.post('/', authenticateToken, createCorrugation);
router.get('/:id', authenticateToken, getCorrugationById);
router.get('/', authenticateToken, getAllCorrugations);
router.get('/by-job/:nrcJobNo', authenticateToken, getCorrugationByNrcJobNo);
router.put('/:id', requireAdminJWT, updateCorrugation);
router.delete('/:id', requireAdminJWT, deleteCorrugation);

export default router; 