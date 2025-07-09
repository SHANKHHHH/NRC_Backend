import { Router } from 'express';
import { authenticateToken, requireAdminJWT } from '../middleware/auth';
import { createPrintingDetails, getPrintingDetailsById, getAllPrintingDetails, updatePrintingDetails, deletePrintingDetails } from '../controllers/printingDetailsController';

const router = Router();

router.post('/', authenticateToken, createPrintingDetails);
router.get('/:id', authenticateToken, getPrintingDetailsById);
router.get('/', authenticateToken, getAllPrintingDetails);
router.put('/:id', requireAdminJWT, updatePrintingDetails);
router.delete('/:id', requireAdminJWT, deletePrintingDetails);

export default router; 