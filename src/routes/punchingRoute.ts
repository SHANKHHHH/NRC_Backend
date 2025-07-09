import { Router } from 'express';
import { authenticateToken, requireAdminJWT } from '../middleware/auth';
import { createPunching, getPunchingById, getAllPunchings, updatePunching, deletePunching } from '../controllers/punchingController';

const router = Router();

router.post('/', authenticateToken, createPunching);
router.get('/:id', authenticateToken, getPunchingById);
router.get('/', authenticateToken, getAllPunchings);
router.put('/:id', requireAdminJWT, updatePunching);
router.delete('/:id', requireAdminJWT, deletePunching);

export default router; 