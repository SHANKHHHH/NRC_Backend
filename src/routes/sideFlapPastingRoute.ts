import { Router } from 'express';
import { authenticateToken, requireAdminJWT } from '../middleware/auth';
import { createSideFlapPasting, getSideFlapPastingById, getAllSideFlapPastings, updateSideFlapPasting, deleteSideFlapPasting } from '../controllers/sideFlapPastingController';

const router = Router();

router.post('/', authenticateToken, createSideFlapPasting);
router.get('/:id', authenticateToken, getSideFlapPastingById);
router.get('/', authenticateToken, getAllSideFlapPastings);
router.put('/:id', requireAdminJWT, updateSideFlapPasting);
router.delete('/:id', requireAdminJWT, deleteSideFlapPasting);

export default router; 