import { Router } from 'express';
import { 
  createPurchaseOrder, 
  updatePurchaseOrder, 
  recalculatePurchaseOrderSharedCardDiffDate,
  getAllPurchaseOrders
} from '../controllers/purchaseOrderController';
import { requireAdminJWT, authenticateToken } from '../middleware/auth';

const router = Router();

// Get all purchase orders
router.get('/', authenticateToken, getAllPurchaseOrders);

// Create a new purchase order
router.post('/create', createPurchaseOrder);

// Update purchase order by ID
router.put('/:id', updatePurchaseOrder);

// Recalculate shared card diff dates for all purchase orders
router.post('/recalculate-shared-card-diff', requireAdminJWT, recalculatePurchaseOrderSharedCardDiffDate);

// Update purchase order status by ID (admin only)
// router.patch('/:id/status', requireAdminJWT, updatePurchaseOrderStatus);

export default router;