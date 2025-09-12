import { Router } from 'express';
<<<<<<< Updated upstream
import { createPurchaseOrder, updatePurchaseOrderStatus } from '../controllers/purchaseOrderController';
import { requireAdminJWT } from '../middleware/auth';

const router = Router();

=======
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

>>>>>>> Stashed changes
// Create a new purchase order
router.post('/create', createPurchaseOrder);

// Update purchase order status by ID (admin only)
router.patch('/:id/status', requireAdminJWT, updatePurchaseOrderStatus);

export default router; 