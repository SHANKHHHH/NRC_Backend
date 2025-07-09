import { Router } from 'express';
import { authenticateToken, requireAdminJWT } from '../middleware/auth';
import { createPaperStore, getPaperStoreById, getAllPaperStores, updatePaperStore, deletePaperStore } from '../controllers/paperStoreController';

const router = Router();

router.post('/', authenticateToken, createPaperStore);
router.get('/:id', authenticateToken, getPaperStoreById);
router.get('/', authenticateToken, getAllPaperStores);
router.put('/:id', requireAdminJWT, updatePaperStore);
router.delete('/:id', requireAdminJWT, deletePaperStore);

export default router; 