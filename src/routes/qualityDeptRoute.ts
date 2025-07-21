import { Router } from 'express';
import { authenticateToken, requireAdminJWT } from '../middleware/auth';
import { createQualityDept, getQualityDeptById, getAllQualityDepts, updateQualityDept, deleteQualityDept, getQualityDeptByNrcJobNo } from '../controllers/qualityDeptController';

const router = Router();

router.post('/', authenticateToken, createQualityDept);
router.get('/by-job/:nrcJobNo', authenticateToken, getQualityDeptByNrcJobNo);
router.get('/:id', authenticateToken, getQualityDeptById);
router.get('/', authenticateToken, getAllQualityDepts);

router.put('/:id', requireAdminJWT, updateQualityDept);
router.delete('/:id', requireAdminJWT, deleteQualityDept);

export default router; 