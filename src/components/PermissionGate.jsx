import React from 'react';
import { useSelector } from 'react-redux';
import { usePermission } from '../hooks/usePermission';

/**
 * PermissionGate - Lightweight permission check for dashboard internal pages
 * WHITELIST APPROACH: Only checks permissions for restricted pages
 * Pages are accessible by default unless in restricted list
 * MD users bypass all checks
 */
const PermissionGate = ({ resourceKey, children, requirePermission = false }) => {
  const { user, role } = useSelector(state => state.auth);
  const { hasPermission, loading } = usePermission(resourceKey);
  if (process.env.NODE_ENV !== 'production') {
    console.debug('[RBAC] PermissionGate', { resourceKey, role, hasPermission, loading });
  }

  // MD users have full access
  if (role?.toLowerCase() === 'md') {
    return children;
  }

  // If this page doesn't require explicit permission, allow access
  if (!requirePermission) {
    return children;
  }

  // Loading state
  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Checking permissions...</p>
        </div>
      </div>
    );
  }

  // Permission denied
  if (!hasPermission) {
    return (
      <div className="p-6">
        <div className="max-w-2xl mx-auto mt-8">
          <div className="bg-white shadow-lg rounded-lg p-8 border-2 border-red-300">
            {/* Lock Icon */}
            <div className="text-center mb-6">
              <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4">
                <svg
                  className="h-8 w-8 text-red-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
              </div>
              
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Admin Access Required
              </h2>
              <p className="text-gray-600 mb-4">
                You don't have permission to access this page.
              </p>
            </div>

            {/* User Info */}
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Your Account:</span>
                <span className="text-sm text-gray-900 font-semibold">
                  {user?.email || user?.name || 'Unknown'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Role:</span>
                <span className="text-sm text-gray-900">{role || 'Employee'}</span>
              </div>
            </div>

            {/* Help Text */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800 text-center">
                💡 Contact your MD to enable permissions for this feature in 
                <strong> Settings → Manage Employee Access</strong>
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Permission granted
  return children;
};

export default PermissionGate;
