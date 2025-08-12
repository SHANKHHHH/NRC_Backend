import { Router } from 'express';
import { authenticateToken, requireAdminJWT } from '../middleware/auth';
import { createSideFlapPasting, getSideFlapPastingById, getAllSideFlapPastings, updateSideFlapPasting, deleteSideFlapPasting, getSideFlapPastingByNrcJobNo } from '../controllers/sideFlapPastingController';

const router = Router();

router.post('/', authenticateToken, createSideFlapPasting);
router.get('/by-job/:nrcJobNo', authenticateToken, getSideFlapPastingByNrcJobNo);
router.get('/:id', authenticateToken, getSideFlapPastingById);
router.get('/', authenticateToken, getAllSideFlapPastings);

router.put('/:nrcJobNo', authenticateToken, updateSideFlapPasting);
router.delete('/:id', requireAdminJWT, deleteSideFlapPasting);

export default router; 