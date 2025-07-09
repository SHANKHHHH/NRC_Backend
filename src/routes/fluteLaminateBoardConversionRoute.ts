import { Router } from 'express';
import { authenticateToken, requireAdminJWT } from '../middleware/auth';
import { createFluteLaminateBoardConversion, getFluteLaminateBoardConversionById, getAllFluteLaminateBoardConversions, updateFluteLaminateBoardConversion, deleteFluteLaminateBoardConversion } from '../controllers/fluteLaminateBoardConversionController';

const router = Router();

router.post('/', authenticateToken, createFluteLaminateBoardConversion);
router.get('/:id', authenticateToken, getFluteLaminateBoardConversionById);
router.get('/', authenticateToken, getAllFluteLaminateBoardConversions);
router.put('/:id', requireAdminJWT, updateFluteLaminateBoardConversion);
router.delete('/:id', requireAdminJWT, deleteFluteLaminateBoardConversion);

export default router; 