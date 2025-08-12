import { Router } from 'express';
import { authenticateToken, requireAdminJWT } from '../middleware/auth';
import { createPrintingDetails, getPrintingDetailsById, getAllPrintingDetails, updatePrintingDetails, deletePrintingDetails, getPrintingDetailsByNrcJobNo } from '../controllers/printingDetailsController';

const router = Router();

router.post('/', authenticateToken, createPrintingDetails);
router.get('/by-job/:nrcJobNo', authenticateToken, getPrintingDetailsByNrcJobNo);
router.get('/:id', authenticateToken, getPrintingDetailsById);
router.get('/', authenticateToken, getAllPrintingDetails);

router.put('/:nrcJobNo', authenticateToken, updatePrintingDetails);
router.delete('/:id', requireAdminJWT, deletePrintingDetails);

export default router;    