import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { asyncHandler } from '../middleware';
import { getAllFinishQuantities, getFinishQuantitiesByJob, getAvailableFinishedGoodsQty } from '../controllers/finishQuantityController';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Get all finish quantities (admin/planner only)
router.get('/', asyncHandler(getAllFinishQuantities));

// Get finish quantities by job number (admin/planner only)
router.get('/by-job/:nrcJobNo', asyncHandler(getFinishQuantitiesByJob));

// Get available finished goods quantity for a job (for UI)
router.get('/available/:nrcJobNo', asyncHandler(getAvailableFinishedGoodsQty));

export default router;
