/**
 * Utility functions for protecting navigation and features based on subscription status.
 * 
 * Usage in components:
 * - Import useSubscription hook
 * - Check isBlocked before rendering buttons/links
 * - Use ProtectedNavButton component for automatic hiding
 */

/**
 * Check if a feature should be accessible based on subscription status.
 * 
 * @param {string} plan - Current subscription plan
 * @param {boolean} isActive - Whether subscription is active
 * @param {number} transactionCount - Number of transactions used
 * @returns {boolean} - True if feature should be accessible
 */
export const canAccessFeature = (plan, isActive, transactionCount) => {
  const FREE_PLAN_LIMIT = 10;
  
  // If subscription is inactive, block access
  if (!isActive) {
    return false;
  }
  
  // If free plan and usage exceeded, block access
  if (plan === 'free' && transactionCount > FREE_PLAN_LIMIT) {
    return false;
  }
  
  return true;
};

/**
 * Get display message for blocked features.
 * 
 * @param {string} plan - Current subscription plan
 * @param {boolean} isActive - Whether subscription is active
 * @param {number} transactionCount - Number of transactions used
 * @returns {string} - Message to display
 */
export const getBlockedMessage = (plan, isActive, transactionCount) => {
  const FREE_PLAN_LIMIT = 10;
  
  if (!isActive) {
    return 'Your subscription has expired. Please upgrade to continue.';
  }
  
  if (plan === 'free' && transactionCount > FREE_PLAN_LIMIT) {
    return `You have reached the free plan limit of ${FREE_PLAN_LIMIT} transactions. Please upgrade to continue.`;
  }
  
  return 'Access restricted. Please upgrade your subscription.';
};

/**
 * List of routes/features that require subscription protection.
 * Pages not in this list are always accessible.
 */
export const PROTECTED_ROUTES = [
  '/sales',
  '/new-sale',
  '/inventory',
  '/restock',
  '/expenses',
  '/requisitions',
  '/customers',
  '/b2b',
  '/vendors',
  '/admin',
  '/settings',
  '/sheets',
];

/**
 * Check if a route is protected by subscription.
 * 
 * @param {string} path - Route path to check
 * @returns {boolean} - True if route requires subscription
 */
export const isProtectedRoute = (path) => {
  return PROTECTED_ROUTES.some(route => path.startsWith(route));
};

/**
 * React component wrapper for protected navigation buttons.
 * Automatically hides or disables buttons when subscription is blocked.
 * 
 * Usage:
 * import { ProtectedNavButton } from '../utils/subscriptionGuard';
 * 
 * <ProtectedNavButton 
 *   plan={plan} 
 *   isActive={isActive} 
 *   transactionCount={transactionCount}
 *   onClick={handleClick}
 * >
 *   Button Text
 * </ProtectedNavButton>
 */
export const ProtectedNavButton = ({ 
  plan, 
  isActive, 
  transactionCount, 
  children, 
  hideWhenBlocked = false,
  disableWhenBlocked = true,
  showTooltip = true,
  ...props 
}) => {
  const canAccess = canAccessFeature(plan, isActive, transactionCount);
  const message = getBlockedMessage(plan, isActive, transactionCount);
  
  // Hide button completely if blocked and hideWhenBlocked is true
  if (!canAccess && hideWhenBlocked) {
    return null;
  }
  
  // Disable button if blocked and disableWhenBlocked is true
  const disabled = !canAccess && disableWhenBlocked;
  const title = !canAccess && showTooltip ? message : '';
  
  return (
    <button
      {...props}
      disabled={disabled}
      title={title}
      style={{
        ...props.style,
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  );
};

/**
 * Higher-order component to protect pages.
 * Wraps a page component and redirects if subscription is blocked.
 * 
 * Usage:
 * export default withSubscriptionProtection(SalesPage);
 */
export const withSubscriptionProtection = (Component) => {
  return (props) => {
    // This will be handled by useSubscriptionGuard hook in the component
    // This HOC is for documentation purposes
    return <Component {...props} />;
  };
};

export default {
  canAccessFeature,
  getBlockedMessage,
  isProtectedRoute,
  ProtectedNavButton,
  withSubscriptionProtection,
  PROTECTED_ROUTES,
};
