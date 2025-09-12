import { Router } from 'express';
import { asyncHandler, addMachineFiltering } from '../middleware';
import { 
  createPurchaseOrder, 
  updatePurchaseOrder, 
  recalculatePurchaseOrderSharedCardDiffDate,
  getAllPurchaseOrders
} from '../controllers/purchaseOrderController';
import { requireAdminJWT, authenticateToken } from '../middleware/auth';

const router = Router();

// Get all purchase orders
router.get('/', authenticateToken, addMachineFiltering, asyncHandler(getAllPurchaseOrders));

// Create a new purchase order
router.post('/create', asyncHandler(createPurchaseOrder));

// Update purchase order by ID
router.put('/:id', asyncHandler(updatePurchaseOrder));

// Recalculate shared card diff dates for all purchase orders
router.post('/recalculate-shared-card-diff', requireAdminJWT, asyncHandler(recalculatePurchaseOrderSharedCardDiffDate));

// Update purchase order status by ID (admin only)
// router.patch('/:id/status', requireAdminJWT, updatePurchaseOrderStatus);

export default router;