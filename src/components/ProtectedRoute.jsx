import React from 'react';
import { Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { usePermission } from '../hooks/usePermission';

/**
 * ProtectedRoute component that checks if user has permission to access a resource
 * @param {string} resourceKey - The permission resource key to check (e.g., 'sales', 'inventory', 'expenses')
 * @param {React.ReactNode} children - The component to render if permission is granted
 * @param {string} redirectTo - Where to redirect if not authenticated (default: /login)
 */
const ProtectedRoute = ({ resourceKey, children, redirectTo = '/login' }) => {
  const { user, isAuthenticated } = useSelector(state => state.auth);
  const role = (user?.role || localStorage.getItem('role') || '').toLowerCase();
  const { hasPermission, loading } = usePermission(resourceKey);
  // Log for debugging
  if (process.env.NODE_ENV !== 'production') {
    console.debug('[RBAC] ProtectedRoute check', { resourceKey, role, isAuthenticated, hasPermission, loading });
  }

  // If not authenticated, redirect to login
  if (!isAuthenticated) {
    return <Navigate to={redirectTo} replace />;
  }

  // MD users have full access to everything
  if (role === 'md') {
    return children;
  }

  // Show loading state while checking permissions
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 text-lg">Checking access permissions...</p>
        </div>
      </div>
    );
  }

  // If permission is not granted, show access denied screen
  if (!hasPermission) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full">
          <div className="bg-white shadow-lg rounded-lg p-8 text-center">
            {/* Lock Icon */}
            <div className="mx-auto flex items-center justify-center h-20 w-20 rounded-full bg-red-100 mb-6">
              <svg
                className="h-10 w-10 text-red-600"
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

            {/* Access Denied Message */}
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Admin Access Required
            </h2>
            <p className="text-gray-600 mb-6">
              You don't have permission to access this page. Please contact your administrator (MD) to grant you access.
            </p>

            {/* User Info */}
            <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Your Account:</span>
                <span className="text-sm text-gray-900 font-semibold">{user?.email || user?.name || 'Unknown'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Role:</span>
                <span className="text-sm text-gray-900">{role || 'Employee'}</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col space-y-3">
              <button
                onClick={() => window.history.back()}
                className="w-full px-4 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                Go Back
              </button>
              <button
                onClick={() => window.location.href = '/dashboard'}
                className="w-full px-4 py-3 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300 transition-colors"
              >
                Go to Dashboard
              </button>
            </div>

            {/* Help Text */}
            <p className="mt-6 text-xs text-gray-500">
              Need access? Ask your MD to enable permissions for this feature in the <strong>Settings → Manage Employee Access</strong> section.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Permission granted, render the protected component
  return children;
};

export default ProtectedRoute;
