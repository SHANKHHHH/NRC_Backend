import { Router } from 'express';
import { authenticateToken, requireAdminJWT } from '../middleware/auth';
import { asyncHandler } from '../middleware';
import { createQualityDept, getQualityDeptById, getAllQualityDepts, updateQualityDept, deleteQualityDept, getQualityDeptByNrcJobNo } from '../controllers/qualityDeptController';

const router = Router();

router.post('/', authenticateToken, asyncHandler(createQualityDept));
router.get('/by-job/:nrcJobNo', authenticateToken, asyncHandler(getQualityDeptByNrcJobNo));
router.get('/:id', authenticateToken, asyncHandler(getQualityDeptById));
router.get('/', authenticateToken, asyncHandler(getAllQualityDepts));

router.put('/:nrcJobNo', authenticateToken, asyncHandler(updateQualityDept));
router.delete('/:id', requireAdminJWT, asyncHandler(deleteQualityDept));

export default router; 