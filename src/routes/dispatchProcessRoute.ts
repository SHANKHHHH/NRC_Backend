import { Router } from 'express';
import { authenticateToken, requireAdminJWT } from '../middleware/auth';
import { asyncHandler, addMachineFiltering } from '../middleware';
import { createDispatchProcess, getDispatchProcessById, getAllDispatchProcesses, updateDispatchProcess, deleteDispatchProcess, getDispatchProcessByNrcJobNo, updateDispatchProcessStatus, holdDispatchProcess, resumeDispatchProcess, startDispatchWork } from '../controllers/dispatchProcessController';

const router = Router();

router.post('/', authenticateToken, asyncHandler(createDispatchProcess));
router.get('/by-job/:nrcJobNo', authenticateToken, asyncHandler(getDispatchProcessByNrcJobNo));
router.get('/:id', authenticateToken, asyncHandler(getDispatchProcessById));
router.get('/', authenticateToken, addMachineFiltering, asyncHandler(getAllDispatchProcesses));

router.put('/:nrcJobNo', authenticateToken, asyncHandler(updateDispatchProcess));
router.patch('/:nrcJobNo/status', authenticateToken, asyncHandler(updateDispatchProcessStatus));
router.post('/:nrcJobNo/start', authenticateToken, asyncHandler(startDispatchWork));
router.post('/:nrcJobNo/hold', authenticateToken, asyncHandler(holdDispatchProcess));
router.post('/:nrcJobNo/resume', authenticateToken, asyncHandler(resumeDispatchProcess));
router.delete('/:id', requireAdminJWT, asyncHandler(deleteDispatchProcess));

export default router; 