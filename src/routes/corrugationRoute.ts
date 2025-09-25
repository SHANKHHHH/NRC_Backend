import { Router } from 'express';
import { authenticateToken, requireAdminJWT } from '../middleware/auth';
import { asyncHandler, addMachineFiltering } from '../middleware';
import { autoCorrectStateInconsistencies, validateStepTransition } from '../middleware/stepValidation';
import { createCorrugation, getCorrugationById, getAllCorrugations, updateCorrugation, deleteCorrugation, getCorrugationByNrcJobNo } from '../controllers/corrugationController';

const router = Router();

router.post('/', authenticateToken, asyncHandler(createCorrugation));
router.get('/by-job/:nrcJobNo', authenticateToken, asyncHandler(getCorrugationByNrcJobNo));
router.get('/:id', authenticateToken, asyncHandler(getCorrugationById));
router.get('/', authenticateToken, addMachineFiltering, asyncHandler(getAllCorrugations));

router.put('/:nrcJobNo', authenticateToken, autoCorrectStateInconsistencies, validateStepTransition, asyncHandler(updateCorrugation));
router.delete('/:id', requireAdminJWT, asyncHandler(deleteCorrugation));

export default router; 