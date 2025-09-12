// Error handling
export { errorHandler, asyncHandler, AppError } from '../utils/errorHandler';

// Logging
export { requestLogger, performanceMonitor, simpleLogger } from './logger';

// Security
export { 
  securityHeaders, 
  corsMiddleware, 
  rateLimiter, 
  requestSizeLimiter 
} from './security';

// Validation
export { 
  validateRequest, 
  validateEmail, 
  validatePassword, 
  validateNrcId,
  validateLoginRequest,
  sanitizeInput, 
  requireFields, 
  validateId 
} from './validation';

// Authentication
<<<<<<< Updated upstream
export {  
  requireRole, 
  requireAdmin, 
} from './auth'; 
=======
export { authenticateToken, requireAdminJWT } from './auth';

// Machine Access Control
export {
  checkMachineAccess,
  getUserMachineIds,
  checkJobMachineAccess,
  checkPOMachineAccess,
  requireJobMachineAccess,
  requirePOMachineAccess,
  addMachineFiltering
} from './machineAccess'; 
>>>>>>> Stashed changes
