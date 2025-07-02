import { RequestHandler, Router } from 'express';
import { asyncHandler, requireFields, validateEmail, validateLoginRequest } from '../middleware';
import { authenticateToken, requireAdminJWT } from '../middleware/auth';

import { login, getProfile, logout, addMember} from '../controllers/authControllers/authController';

const router = Router();

// Available roles
const VALID_ROLES = ['admin', 'planner', 'production_head', 'dispatch_executive', 'qc_manager'];

//Unprotected Routes

// role base user login
router.post('/login', login as RequestHandler);


export default router;