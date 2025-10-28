import api from '../services/api';
import { store } from '../store/store';
import { setPermissions } from '../store/authSlice';

/**
 * Check if the current user has a specific permission.
 * 
 * @param {string} permissionKey - Permission key (e.g., 'restock.page.access', 'sales.delete_button.access')
 * @returns {boolean} - True if user has permission or is MD, false otherwise
 */
export const hasPermission = (permissionKey) => {
  try {
    const state = store.getState();
    const { user, permissions, permissionCodes } = state.auth;
    
    // MD users have all permissions
    const role = user?.role?.toLowerCase();
    if (role === 'md') {
      return true;
    }
    
    // Check if permission exists in user's permissions array
    if (!permissions || permissions.length === 0) {
      return false;
    }
    
    // Normalize the permission key
    const normalizedKey = permissionKey.toLowerCase().trim();
    
    // Check direct match
    if (permissions.some(p => p.toLowerCase() === normalizedKey)) {
      return true;
    }
    
    // Check with common suffixes
    const variants = [
      normalizedKey,
      `${normalizedKey}.page.access`,
      `${normalizedKey}.access`,
      normalizedKey.replace('.page.access', ''),
      normalizedKey.replace('.access', ''),
    ];
    
    return permissions.some(p => 
      variants.some(v => p.toLowerCase() === v)
    );
  } catch (error) {
    console.error('Error checking permission:', error);
    return false;
  }
};

/**
 * Check if the current user has a permission by code.
 * 
 * @param {string} permissionCode - Permission code (e.g., 'PAGE_RESTOCK', 'BTN_SALES_DELETE')
 * @returns {boolean} - True if user has permission or is MD, false otherwise
 */
export const hasPermissionByCode = (permissionCode) => {
  try {
    const state = store.getState();
    const { user, permissionCodes } = state.auth;
    
    // MD users have all permissions
    const role = user?.role?.toLowerCase();
    if (role === 'md') {
      return true;
    }
    
    // Check if permission code exists in user's permission codes array
    if (!permissionCodes || permissionCodes.length === 0) {
      return false;
    }
    
    const normalizedCode = permissionCode.toUpperCase().trim();
    return permissionCodes.some(code => code.toUpperCase() === normalizedCode);
  } catch (error) {
    console.error('Error checking permission by code:', error);
    return false;
  }
};

/**
 * Refresh permissions from the backend.
 * Call this on login, page reload, or when permissions might have changed.
 * 
 * @returns {Promise<{permissions: string[], permission_codes: string[], is_md: boolean}>}
 */
export const refreshPermissions = async () => {
  try {
    const response = await api.get('/auth/employee/permissions');
    const { permissions = [], permission_codes = [], is_md = false } = response.data;
    
    // Update Redux store with fresh permissions
    store.dispatch(setPermissions({
      permissions,
      permission_codes,
    }));
    
    return { permissions, permission_codes, is_md };
  } catch (error) {
    console.error('Error refreshing permissions:', error);
    // Return empty permissions on error
    return { permissions: [], permission_codes: [], is_md: false };
  }
};

/**
 * Check multiple permissions at once.
 * 
 * @param {string[]} permissionKeys - Array of permission keys
 * @returns {Object} - Object mapping permission keys to boolean values
 */
export const checkPermissions = (permissionKeys) => {
  const result = {};
  permissionKeys.forEach(key => {
    result[key] = hasPermission(key);
  });
  return result;
};

/**
 * Require at least one permission from a list.
 * 
 * @param {string[]} permissionKeys - Array of permission keys
 * @returns {boolean} - True if user has at least one permission
 */
export const hasAnyPermission = (permissionKeys) => {
  return permissionKeys.some(key => hasPermission(key));
};

/**
 * Require all permissions from a list.
 * 
 * @param {string[]} permissionKeys - Array of permission keys
 * @returns {boolean} - True if user has all permissions
 */
export const hasAllPermissions = (permissionKeys) => {
  return permissionKeys.every(key => hasPermission(key));
};

/**
 * Get the current user's role.
 * 
 * @returns {string} - User role ('md', 'employee', etc.)
 */
export const getCurrentRole = () => {
  try {
    const state = store.getState();
    return state.auth.user?.role?.toLowerCase() || 'employee';
  } catch (error) {
    console.error('Error getting current role:', error);
    return 'employee';
  }
};

/**
 * Check if the current user is MD.
 * 
 * @returns {boolean} - True if user is MD
 */
export const isMD = () => {
  return getCurrentRole() === 'md';
};
