import { Router } from 'express';
import { authenticateToken, requireAdminJWT } from '../middleware/auth';
import { createDispatchProcess, getDispatchProcessById, getAllDispatchProcesses, updateDispatchProcess, deleteDispatchProcess, getDispatchProcessByNrcJobNo } from '../controllers/dispatchProcessController';

const router = Router();

router.post('/', authenticateToken, createDispatchProcess);
router.get('/by-job/:nrcJobNo', authenticateToken, getDispatchProcessByNrcJobNo);
router.get('/:id', authenticateToken, getDispatchProcessById);
router.get('/', authenticateToken, getAllDispatchProcesses);

router.put('/:nrcJobNo', authenticateToken, updateDispatchProcess);
router.delete('/:id', requireAdminJWT, deleteDispatchProcess);

export default router; 