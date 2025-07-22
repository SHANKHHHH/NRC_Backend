import { Router } from 'express';
import { authenticateToken, requireAdminJWT } from '../middleware/auth';
import { createPunching, getPunchingById, getAllPunchings, updatePunching, deletePunching, getPunchingByNrcJobNo } from '../controllers/punchingController';

const router = Router();

router.post('/', authenticateToken, createPunching);
router.get('/by-job/:nrcJobNo', authenticateToken, getPunchingByNrcJobNo);
router.get('/:id', authenticateToken, getPunchingById);
router.get('/', authenticateToken, getAllPunchings);

router.put('/:nrcJobNo', requireAdminJWT, updatePunching);
router.delete('/:id', requireAdminJWT, deletePunching);

export default router; 