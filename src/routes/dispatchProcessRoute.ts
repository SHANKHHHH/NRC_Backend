import { Router } from 'express';
import { authenticateToken, requireAdminJWT } from '../middleware/auth';
import { asyncHandler } from '../middleware';
import { createDispatchProcess, getDispatchProcessById, getAllDispatchProcesses, updateDispatchProcess, deleteDispatchProcess, getDispatchProcessByNrcJobNo } from '../controllers/dispatchProcessController';

const router = Router();

router.post('/', authenticateToken, asyncHandler(createDispatchProcess));
router.get('/by-job/:nrcJobNo', authenticateToken, asyncHandler(getDispatchProcessByNrcJobNo));
router.get('/:id', authenticateToken, asyncHandler(getDispatchProcessById));
router.get('/', authenticateToken, asyncHandler(getAllDispatchProcesses));

router.put('/:nrcJobNo', authenticateToken, asyncHandler(updateDispatchProcess));
router.delete('/:id', requireAdminJWT, asyncHandler(deleteDispatchProcess));

export default router; 