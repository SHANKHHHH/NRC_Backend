import { Router } from 'express';
import { authenticateToken, requireAdminJWT } from '../middleware/auth';
import { asyncHandler, addMachineFiltering } from '../middleware';
import { createPaperStore, getPaperStoreById, getAllPaperStores, updatePaperStore, deletePaperStore, getPaperStoreByNrcJobNo } from '../controllers/paperStoreController';

const router = Router();

router.post('/', authenticateToken, asyncHandler(createPaperStore));
router.get('/by-job/:nrcJobNo', authenticateToken, asyncHandler(getPaperStoreByNrcJobNo));
router.get('/:id', authenticateToken, asyncHandler(getPaperStoreById));
router.get('/', authenticateToken, addMachineFiltering, asyncHandler(getAllPaperStores));

router.put('/:nrcJobNo', authenticateToken, asyncHandler(updatePaperStore));
router.delete('/:id', requireAdminJWT, asyncHandler(deletePaperStore));

export default router; 