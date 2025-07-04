import { Router } from 'express';
import { createPurchaseOrder } from '../controllers/purchaseOrderController';
import { requireAdminJWT } from '../middleware/auth';

const router = Router();

// Create a new purchase order
router.post('/create', createPurchaseOrder);

// Update purchase order status by ID (admin only)
// router.patch('/:id/status', requireAdminJWT, updatePurchaseOrderStatus);

export default router; 