import { Router } from 'express';
import { authenticateToken, requireAdminJWT } from '../middleware/auth';
import { asyncHandler } from '../middleware';
import { createPaperStore, getPaperStoreById, getPaperStoreByJobStepId, getAllPaperStores, updatePaperStore, deletePaperStore, getPaperStoreByNrcJobNo, updatePaperStoreStatus, holdPaperStore, resumePaperStore, startPaperStoreWork } from '../controllers/paperStoreController';

const router = Router();

router.post('/', authenticateToken, asyncHandler(createPaperStore));
router.get('/by-step-id/:jobStepId', authenticateToken, asyncHandler(getPaperStoreByJobStepId));
router.get('/by-job/:nrcJobNo', authenticateToken, asyncHandler(getPaperStoreByNrcJobNo));
router.get('/:id', authenticateToken, asyncHandler(getPaperStoreById));
router.get('/', authenticateToken, asyncHandler(getAllPaperStores));

router.put('/:nrcJobNo', authenticateToken, asyncHandler(updatePaperStore));
router.patch('/:nrcJobNo/status', authenticateToken, asyncHandler(updatePaperStoreStatus));
router.post('/:nrcJobNo/start', authenticateToken, asyncHandler(startPaperStoreWork));
router.post('/:nrcJobNo/hold', authenticateToken, asyncHandler(holdPaperStore));
router.post('/:nrcJobNo/resume', authenticateToken, asyncHandler(resumePaperStore));
router.delete('/:id', requireAdminJWT, asyncHandler(deletePaperStore));

export default router; 