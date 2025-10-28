import { useSelector } from 'react-redux';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { hasPermission, hasPermissionByCode, isMD, refreshPermissions } from '../utils/permissionUtils';

/**
 * Custom hook to check if user has required permissions.
 * 
 * @param {string|string[]} requiredPermissions - Single permission or array of permissions required
 * @param {boolean} redirectOnDeny - Whether to redirect to dashboard if permission denied (default: true)
 * @param {string} redirectPath - Path to redirect to if permission denied (default: '/dashboard')
 * @param {boolean} requireAll - If true, user must have ALL permissions. If false, user needs ANY permission (default: false)
 * @returns {{hasAccess: boolean, isLoading: boolean, isMD: boolean, checkPermission: function}}
 */
export const usePermissions = (requiredPermissions, redirectOnDeny = true, redirectPath = '/dashboard', requireAll = false) => {
  const navigate = useNavigate();
  const { isAuthenticated, user, permissions, permissionCodes } = useSelector((state) => state.auth);
  
  const userIsMD = isMD();
  
  // Check if user has the required permissions
  const hasAccess = () => {
    // MD users have all permissions
    if (userIsMD) {
      return true;
    }
    
    // If not authenticated, deny access
    if (!isAuthenticated) {
      return false;
    }
    
    // No permissions required
    if (!requiredPermissions || (Array.isArray(requiredPermissions) && requiredPermissions.length === 0)) {
      return true;
    }
    
    // Single permission check
    if (typeof requiredPermissions === 'string') {
      return hasPermission(requiredPermissions);
    }
    
    // Multiple permissions check
    if (Array.isArray(requiredPermissions)) {
      if (requireAll) {
        // User must have ALL permissions
        return requiredPermissions.every(perm => hasPermission(perm));
      } else {
        // User needs ANY permission
        return requiredPermissions.some(perm => hasPermission(perm));
      }
    }
    
    return false;
  };
  
  const userHasAccess = hasAccess();
  
  // Redirect if user doesn't have access
  useEffect(() => {
    if (!userHasAccess && redirectOnDeny && isAuthenticated) {
      toast.error('Admin access required. Contact admin to grant access.', {
        position: 'top-right',
        autoClose: 5000,
      });
      navigate(redirectPath);
    }
  }, [userHasAccess, redirectOnDeny, redirectPath, isAuthenticated, navigate]);
  
  // Utility function to check a specific permission programmatically
  const checkPermission = (permissionKey) => {
    if (userIsMD) return true;
    return hasPermission(permissionKey);
  };
  
  const checkPermissionByCode = (permissionCode) => {
    if (userIsMD) return true;
    return hasPermissionByCode(permissionCode);
  };
  
  return {
    hasAccess: userHasAccess,
    isLoading: false, // Can be extended to handle loading state
    isMD: userIsMD,
    checkPermission,
    checkPermissionByCode,
    permissions,
    permissionCodes,
  };
};

/**
 * Hook to check a single permission without redirect.
 * Useful for conditionally rendering UI elements.
 * 
 * @param {string} permissionKey - Permission key to check
 * @returns {boolean} - True if user has permission
 */
export const useHasPermission = (permissionKey) => {
  const userIsMD = isMD();
  
  if (userIsMD) return true;
  return hasPermission(permissionKey);
};

/**
 * Hook to refresh permissions from backend.
 * Call this when permissions might have changed.
 * 
 * @returns {{refresh: function, isRefreshing: boolean}}
 */
export const useRefreshPermissions = () => {
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  
  const refresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshPermissions();
      toast.success('Permissions refreshed', { autoClose: 2000 });
    } catch (error) {
      console.error('Failed to refresh permissions:', error);
      toast.error('Failed to refresh permissions');
    } finally {
      setIsRefreshing(false);
    }
  };
  
  return { refresh, isRefreshing };
};
