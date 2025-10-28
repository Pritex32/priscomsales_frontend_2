import React from 'react';
import { Navigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { usePermissions, useHasPermission } from '../hooks/usePermissions';
import { isMD } from '../utils/permissionUtils';

/**
 * Protected Route component that requires specific permissions.
 * Redirects to dashboard with error notification if access is denied.
 * 
 * @param {object} props
 * @param {React.ReactNode} props.children - Component to render if access is granted
 * @param {string|string[]} props.requiredPermissions - Permission(s) required to access this route
 * @param {boolean} props.requireAll - If true, user must have ALL permissions (default: false)
 * @param {string} props.redirectTo - Path to redirect to if access denied (default: '/dashboard')
 * @returns {React.ReactElement}
 * 
 * @example
 * <ProtectedRoute requiredPermissions="restock.page.access">
 *   <RestockPage />
 * </ProtectedRoute>
 * 
 * @example
 * <ProtectedRoute requiredPermissions={["settings.page.access", "admin.access"]} requireAll={true}>
 *   <SettingsPage />
 * </ProtectedRoute>
 */
export const ProtectedRoute = ({ 
  children, 
  requiredPermissions, 
  requireAll = false, 
  redirectTo = '/dashboard' 
}) => {
  const { hasAccess } = usePermissions(requiredPermissions, false, redirectTo, requireAll);
  
  if (!hasAccess) {
    // Show notification when access is denied
    toast.error('Admin access required. Contact admin to grant access.', {
      position: 'top-right',
      autoClose: 5000,
    });
    return <Navigate to={redirectTo} replace />;
  }
  
  return <>{children}</>;
};

/**
 * Protected Button component that only renders if user has permission.
 * Shows disabled state with tooltip if no permission.
 * 
 * @param {object} props
 * @param {React.ReactNode} props.children - Button content
 * @param {string} props.requiredPermission - Permission required to enable this button
 * @param {function} props.onClick - Click handler
 * @param {string} props.className - Additional CSS classes
 * @param {boolean} props.hideIfDenied - If true, hide button instead of disabling (default: false)
 * @param {string} props.deniedMessage - Custom message to show when access is denied
 * @param {object} props...rest - Other button props
 * @returns {React.ReactElement|null}
 * 
 * @example
 * <ProtectedButton 
 *   requiredPermission="inventory.edit_button.access"
 *   onClick={handleEdit}
 *   className="btn btn-primary"
 * >
 *   Edit
 * </ProtectedButton>
 */
export const ProtectedButton = ({ 
  children, 
  requiredPermission, 
  onClick, 
  className = '', 
  hideIfDenied = false,
  deniedMessage = 'Admin access required. Contact admin to grant access.',
  ...rest 
}) => {
  const hasPermission = useHasPermission(requiredPermission);
  
  // Hide button if user doesn't have permission and hideIfDenied is true
  if (!hasPermission && hideIfDenied) {
    return null;
  }
  
  const handleClick = (e) => {
    if (!hasPermission) {
      e.preventDefault();
      toast.error(deniedMessage, {
        position: 'top-right',
        autoClose: 5000,
      });
      return;
    }
    
    if (onClick) {
      onClick(e);
    }
  };
  
  return (
    <button
      {...rest}
      className={`${className} ${!hasPermission ? 'opacity-50 cursor-not-allowed' : ''}`}
      onClick={handleClick}
      disabled={!hasPermission || rest.disabled}
      title={!hasPermission ? deniedMessage : rest.title}
    >
      {children}
    </button>
  );
};

/**
 * Protected Content component that conditionally renders based on permissions.
 * Can show fallback content if access is denied.
 * 
 * @param {object} props
 * @param {React.ReactNode} props.children - Content to show if permission granted
 * @param {string|string[]} props.requiredPermissions - Permission(s) required
 * @param {boolean} props.requireAll - If true, requires all permissions (default: false)
 * @param {React.ReactNode} props.fallback - Content to show if access denied
 * @param {boolean} props.showNotification - Show toast notification on access denial (default: false)
 * @returns {React.ReactElement|null}
 * 
 * @example
 * <ProtectedContent requiredPermission="sales.report_tab.access">
 *   <SalesReportTab />
 * </ProtectedContent>
 * 
 * @example
 * <ProtectedContent 
 *   requiredPermission="admin.access"
 *   fallback={<p>This feature requires admin access.</p>}
 * >
 *   <AdminPanel />
 * </ProtectedContent>
 */
export const ProtectedContent = ({ 
  children, 
  requiredPermissions, 
  requireAll = false, 
  fallback = null,
  showNotification = false 
}) => {
  const { hasAccess } = usePermissions(requiredPermissions, false, '', requireAll);
  
  React.useEffect(() => {
    if (!hasAccess && showNotification) {
      toast.error('Admin access required. Contact admin to grant access.', {
        position: 'top-right',
        autoClose: 5000,
      });
    }
  }, [hasAccess, showNotification]);
  
  if (!hasAccess) {
    return fallback;
  }
  
  return <>{children}</>;
};

/**
 * Protected Tab component for tab-based navigation.
 * Hides or disables tab if user doesn't have permission.
 * 
 * @param {object} props
 * @param {React.ReactNode} props.children - Tab content/label
 * @param {string} props.requiredPermission - Permission required for this tab
 * @param {function} props.onClick - Tab click handler
 * @param {boolean} props.isActive - Whether tab is currently active
 * @param {boolean} props.hideIfDenied - Hide tab instead of disabling (default: true)
 * @param {string} props.className - Additional CSS classes
 * @returns {React.ReactElement|null}
 * 
 * @example
 * <ProtectedTab 
 *   requiredPermission="sales.report_tab.access"
 *   onClick={() => setActiveTab('report')}
 *   isActive={activeTab === 'report'}
 * >
 *   Sales Report
 * </ProtectedTab>
 */
export const ProtectedTab = ({ 
  children, 
  requiredPermission, 
  onClick, 
  isActive = false, 
  hideIfDenied = true,
  className = ''
}) => {
  const hasPermission = useHasPermission(requiredPermission);
  
  // Hide tab if no permission
  if (!hasPermission && hideIfDenied) {
    return null;
  }
  
  const handleClick = (e) => {
    if (!hasPermission) {
      e.preventDefault();
      toast.error('Admin access required. Contact admin to grant access.', {
        position: 'top-right',
        autoClose: 5000,
      });
      return;
    }
    
    if (onClick) {
      onClick(e);
    }
  };
  
  return (
    <div
      className={`tab ${isActive ? 'active' : ''} ${!hasPermission ? 'disabled' : ''} ${className}`}
      onClick={handleClick}
      role="button"
      tabIndex={hasPermission ? 0 : -1}
      style={{ 
        cursor: hasPermission ? 'pointer' : 'not-allowed',
        opacity: hasPermission ? 1 : 0.5
      }}
    >
      {children}
    </div>
  );
};

/**
 * Higher-order component to wrap a page component with permission check.
 * 
 * @param {React.Component} Component - Page component to protect
 * @param {string|string[]} requiredPermissions - Permission(s) required
 * @param {object} options - Additional options
 * @returns {React.Component}
 * 
 * @example
 * export default withPermission(RestockPage, 'restock.page.access');
 */
export const withPermission = (Component, requiredPermissions, options = {}) => {
  return (props) => {
    const { hasAccess } = usePermissions(
      requiredPermissions, 
      true, 
      options.redirectTo || '/dashboard',
      options.requireAll || false
    );
    
    if (!hasAccess) {
      return null; // Will redirect via usePermissions hook
    }
    
    return <Component {...props} />;
  };
};

/**
 * MD-only component - only renders for MD users.
 * 
 * @param {object} props
 * @param {React.ReactNode} props.children - Content to show to MD users
 * @param {React.ReactNode} props.fallback - Content to show to non-MD users
 * @returns {React.ReactElement|null}
 * 
 * @example
 * <MDOnly>
 *   <AdminControls />
 * </MDOnly>
 */
export const MDOnly = ({ children, fallback = null }) => {
  const userIsMD = isMD();
  
  if (!userIsMD) {
    return fallback;
  }
  
  return <>{children}</>;
};
