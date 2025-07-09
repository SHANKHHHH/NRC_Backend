import { Router } from 'express';
import { authenticateToken, requireAdminJWT } from '../middleware/auth';
import { createDispatchProcess, getDispatchProcessById, getAllDispatchProcesses, updateDispatchProcess, deleteDispatchProcess } from '../controllers/dispatchProcessController';

const router = Router();

router.post('/', authenticateToken, createDispatchProcess);
router.get('/:id', authenticateToken, getDispatchProcessById);
router.get('/', authenticateToken, getAllDispatchProcesses);
router.put('/:id', requireAdminJWT, updateDispatchProcess);
router.delete('/:id', requireAdminJWT, deleteDispatchProcess);

export default router; 