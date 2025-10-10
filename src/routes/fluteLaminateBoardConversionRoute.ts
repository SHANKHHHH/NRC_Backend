import { Router } from 'express';
import { authenticateToken, requireAdminJWT } from '../middleware/auth';
import { asyncHandler, addMachineFiltering } from '../middleware';
import { createFluteLaminateBoardConversion, getFluteLaminateBoardConversionById, getAllFluteLaminateBoardConversions, updateFluteLaminateBoardConversion, deleteFluteLaminateBoardConversion, getFluteLaminateBoardConversionByNrcJobNo, updateFluteLaminateBoardConversionStatus } from '../controllers/fluteLaminateBoardConversionController';

const router = Router();

router.post('/', authenticateToken, asyncHandler(createFluteLaminateBoardConversion));
router.get('/by-job/:nrcJobNo', authenticateToken, asyncHandler(getFluteLaminateBoardConversionByNrcJobNo));
router.get('/:id', authenticateToken, asyncHandler(getFluteLaminateBoardConversionById));
router.get('/', authenticateToken, addMachineFiltering, asyncHandler(getAllFluteLaminateBoardConversions));

router.put('/:nrcJobNo', authenticateToken, asyncHandler(updateFluteLaminateBoardConversion));
router.patch('/:nrcJobNo/status', authenticateToken, asyncHandler(updateFluteLaminateBoardConversionStatus));
router.delete('/:id', requireAdminJWT, asyncHandler(deleteFluteLaminateBoardConversion));

export default router; 