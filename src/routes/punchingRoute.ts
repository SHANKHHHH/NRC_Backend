import { Router } from 'express';
import { authenticateToken, requireAdminJWT } from '../middleware/auth';
import { asyncHandler, addMachineFiltering } from '../middleware';
import { createPunching, getPunchingById, getAllPunchings, updatePunching, deletePunching, getPunchingByNrcJobNo } from '../controllers/punchingController';

const router = Router();

router.post('/', authenticateToken, asyncHandler(createPunching));
router.get('/by-job/:nrcJobNo', authenticateToken, asyncHandler(getPunchingByNrcJobNo));
router.get('/:id', authenticateToken, asyncHandler(getPunchingById));
router.get('/', authenticateToken, addMachineFiltering, asyncHandler(getAllPunchings));

router.put('/:nrcJobNo', authenticateToken, asyncHandler(updatePunching));
router.delete('/:id', requireAdminJWT, asyncHandler(deletePunching));

export default router; 