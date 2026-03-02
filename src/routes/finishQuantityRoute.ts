import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { asyncHandler } from '../middleware';
import { getAllFinishQuantities, getFinishQuantitiesByJob, getAvailableFinishedGoodsQty } from '../controllers/finishQuantityController';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Get all finish quantities
router.get('/', asyncHandler(getAllFinishQuantities));

// Get finish quantities by job number
router.get('/by-job/:nrcJobNo', asyncHandler(getFinishQuantitiesByJob));

// Get available finished goods quantity for a job (for UI)
router.get('/available/:nrcJobNo', asyncHandler(getAvailableFinishedGoodsQty));

export default router;
