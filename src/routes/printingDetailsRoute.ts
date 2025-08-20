import { Router } from 'express';
import { authenticateToken, requireAdminJWT } from '../middleware/auth';
import { asyncHandler } from '../middleware';
import { createPrintingDetails, getPrintingDetailsById, getAllPrintingDetails, updatePrintingDetails, deletePrintingDetails, getPrintingDetailsByNrcJobNo } from '../controllers/printingDetailsController';

const router = Router();

router.post('/', authenticateToken, asyncHandler(createPrintingDetails));
router.get('/by-job/:nrcJobNo', authenticateToken, asyncHandler(getPrintingDetailsByNrcJobNo));
router.get('/:id', authenticateToken, asyncHandler(getPrintingDetailsById));
router.get('/', authenticateToken, asyncHandler(getAllPrintingDetails));

router.put('/:nrcJobNo', authenticateToken, asyncHandler(updatePrintingDetails));
router.delete('/:id', requireAdminJWT, asyncHandler(deletePrintingDetails));

export default router;    