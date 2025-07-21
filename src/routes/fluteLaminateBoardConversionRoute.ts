import { Router } from 'express';
import { authenticateToken, requireAdminJWT } from '../middleware/auth';
import { createFluteLaminateBoardConversion, getFluteLaminateBoardConversionById, getAllFluteLaminateBoardConversions, updateFluteLaminateBoardConversion, deleteFluteLaminateBoardConversion, getFluteLaminateBoardConversionByNrcJobNo } from '../controllers/fluteLaminateBoardConversionController';

const router = Router();

router.post('/', authenticateToken, createFluteLaminateBoardConversion);
router.get('/:id', authenticateToken, getFluteLaminateBoardConversionById);
router.get('/', authenticateToken, getAllFluteLaminateBoardConversions);
router.get('/by-job/:nrcJobNo', authenticateToken, getFluteLaminateBoardConversionByNrcJobNo);
router.put('/:id', requireAdminJWT, updateFluteLaminateBoardConversion);
router.delete('/:id', requireAdminJWT, deleteFluteLaminateBoardConversion);

export default router; 