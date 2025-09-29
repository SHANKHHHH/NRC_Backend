// Define role types directly since we removed the UserRole enum
type UserRole = 'admin' | 'planner' | 'production_head' | 'dispatch_executive' | 'qc_manager' | 'printer' | 'corrugator' | 'flutelaminator' | 'pasting_operator' | 'punching_operator'|'paperstore'|'flyingsquad';

// Role utility functions for handling multiple roles stored as JSON strings
export class RoleManager {
  /**
   * Check if a user has a specific role
   */
  static hasRole(userRole: string, requiredRole: UserRole): boolean {
    try {
      const roles = JSON.parse(userRole);
      return Array.isArray(roles) && roles.includes(requiredRole);
    } catch {
      // Fallback for existing single roles
      return userRole === requiredRole;
    }
  }

  /**
   * Check if a user has any of the required roles
   */
  static hasAnyRole(userRole: string, requiredRoles: UserRole[]): boolean {
    try {
      const roles = JSON.parse(userRole);
      if (Array.isArray(roles)) {
        return requiredRoles.some(role => roles.includes(role));
      }
    } catch {
      // Fallback for existing single roles
      return requiredRoles.includes(userRole as UserRole);
    }
    return false;
  }

  /**
   * Check if a user has all of the required roles
   */
  static hasAllRoles(userRole: string, requiredRoles: UserRole[]): boolean {
    try {
      const roles = JSON.parse(userRole);
      if (Array.isArray(roles)) {
        return requiredRoles.every(role => roles.includes(role));
      }
    } catch {
      // Fallback for existing single roles
      return requiredRoles.length === 1 && requiredRoles[0] === userRole;
    }
    return false;
  }

  /**
   * Get all roles for a user
   */
  static getUserRoles(userRole: string): UserRole[] {
    try {
      const roles = JSON.parse(userRole);
      return Array.isArray(roles) ? roles : [userRole as UserRole];
    } catch {
      // Fallback for existing single roles
      return [userRole as UserRole];
    }
  }

  /**
   * Add a role to a user
   */
  static addRole(userRole: string, newRole: UserRole): string {
    try {
      const roles = JSON.parse(userRole);
      if (Array.isArray(roles)) {
        if (!roles.includes(newRole)) {
          roles.push(newRole);
        }
        return JSON.stringify(roles);
      }
    } catch {
      // Convert single role to array
      return JSON.stringify([userRole, newRole]);
    }
    return JSON.stringify([newRole]);
  }

  /**
   * Remove a role from a user
   */
  static removeRole(userRole: string, roleToRemove: UserRole): string {
    try {
      const roles = JSON.parse(userRole);
      if (Array.isArray(roles)) {
        const filteredRoles = roles.filter(role => role !== roleToRemove);
        return filteredRoles.length > 0 ? JSON.stringify(filteredRoles) : JSON.stringify(['user']);
      }
    } catch {
      // If single role matches, return default role
      if (userRole === roleToRemove) {
        return JSON.stringify(['user']);
      }
    }
    return userRole;
  }

  /**
   * Set multiple roles for a user
   */
  static setRoles(roles: UserRole[]): string {
    return JSON.stringify(roles);
  }

  /**
   * Check if user has admin privileges
   */
  static isAdmin(userRole: string): boolean {
    return this.hasRole(userRole, 'admin');
  }

  /**
   * Check if user has planner privileges
   */
  static isPlanner(userRole: string): boolean {
    return this.hasRole(userRole, 'planner');
  }

  /**
   * Check if user has production head privileges
   */
  static isProductionHead(userRole: string): boolean {
    return this.hasRole(userRole, 'production_head');
  }

  /**
   * Check if user can perform admin actions
   */
  static canPerformAdminAction(userRole: string): boolean {
    return this.hasAnyRole(userRole, ['admin']);
  }

  /**
   * Check if user can perform planner actions
   */
  static canPerformPlannerAction(userRole: string): boolean {
    return this.hasAnyRole(userRole, ['admin', 'planner']);
  }

  /**
   * Check if user can perform production actions
   */
  static canPerformProductionAction(userRole: string): boolean {
    return this.hasAnyRole(userRole, ['admin', 'planner', 'production_head']);
  }

  /**
   * Check if user is flying squad member
   */
  static isFlyingSquad(userRole: string): boolean {
    return this.hasRole(userRole, 'flyingsquad');
  }

  /**
   * Check if user can perform QC check actions (flying squad, admin, or qc_manager)
   */
  static canPerformQCCheck(userRole: string): boolean {
    return this.hasAnyRole(userRole, ['admin', 'flyingsquad', 'qc_manager']);
  }

  /**
   * Check if user can access all job steps (flying squad, admin, planner)
   */
  static canAccessAllJobSteps(userRole: string): boolean {
    return this.hasAnyRole(userRole, ['admin', 'planner', 'flyingsquad']);
  }

  /**
   * Check if user can update step status (not flying squad)
   */
  static canUpdateStepStatus(userRole: string): boolean {
    return this.hasAnyRole(userRole, ['admin', 'planner', 'production_head', 'printer', 'corrugator', 'flutelaminator', 'pasting_operator', 'punching_operator', 'paperstore', 'dispatch_executive']);
  }

  /**
   * Check if user can update machine details (not flying squad)
   */
  static canUpdateMachineDetails(userRole: string): boolean {
    return this.hasAnyRole(userRole, ['admin', 'planner', 'production_head']);
  }

  /**
   * Check if user can update step timing (not flying squad)
   */
  static canUpdateStepTiming(userRole: string): boolean {
    return this.hasAnyRole(userRole, ['admin', 'planner', 'production_head', 'printer', 'corrugator', 'flutelaminator', 'pasting_operator', 'punching_operator', 'paperstore', 'qc_manager', 'dispatch_executive']);
  }

  /**
   * Check if user can only perform QC operations (flying squad)
   */
  static canOnlyPerformQC(userRole: string): boolean {
    return this.hasRole(userRole, 'flyingsquad');
  }
}
