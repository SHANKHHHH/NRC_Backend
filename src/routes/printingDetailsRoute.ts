import { Router } from 'express';
import { authenticateToken, requireAdminJWT } from '../middleware/auth';
import { asyncHandler, addMachineFiltering } from '../middleware';
import { createPrintingDetails, getPrintingDetailsById, getPrintingDetailsByJobStepId, getAllPrintingDetails, updatePrintingDetails, deletePrintingDetails, getPrintingDetailsByNrcJobNo, updatePrintingDetailsStatus } from '../controllers/printingDetailsController';

const router = Router();

router.post('/', authenticateToken, asyncHandler(createPrintingDetails));
router.get('/by-step-id/:jobStepId', authenticateToken, asyncHandler(getPrintingDetailsByJobStepId));
router.get('/by-job/:nrcJobNo', authenticateToken, asyncHandler(getPrintingDetailsByNrcJobNo));
router.get('/:id', authenticateToken, asyncHandler(getPrintingDetailsById));
router.get('/', authenticateToken, addMachineFiltering, asyncHandler(getAllPrintingDetails));

router.put('/:nrcJobNo', authenticateToken, asyncHandler(updatePrintingDetails));
router.patch('/:nrcJobNo/status', authenticateToken, asyncHandler(updatePrintingDetailsStatus));
router.delete('/:id', requireAdminJWT, asyncHandler(deletePrintingDetails));

export default router;    