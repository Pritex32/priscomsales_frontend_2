import { useState, useEffect } from 'react';
import api from '../services/api';

/**
 * Hook to check subscription status and usage limits.
 * 
 * Returns:
 * - plan: "free" | "premium" | etc.
 * - isActive: boolean
 * - isBlocked: boolean (true if usage exceeded or subscription expired)
 * - loading: boolean
 * - error: string | null
 * - refetch: function to manually refresh subscription status
 */
export const useSubscription = () => {
  const [subscriptionData, setSubscriptionData] = useState({
    plan: 'free',
    isActive: false,
    isBlocked: false,
    transactionCount: 0,
    expiresAt: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchSubscriptionStatus = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await api.get('/subscription-status');
      const data = response.data;

      const plan = data.plan || 'free';
      const isActive = data.is_active || false;
      const transactionCount = data.transaction_count || 0;
      const expiresAt = data.expires_at;

      // Check if user is blocked
      // Blocked if: (free plan AND usage > 10) OR subscription inactive
      const FREE_PLAN_LIMIT = 10;
      const isBlocked = 
        (plan === 'free' && transactionCount > FREE_PLAN_LIMIT) || 
        !isActive;

      setSubscriptionData({
        plan,
        isActive,
        isBlocked,
        transactionCount,
        expiresAt,
      });
    } catch (err) {
      console.error('Error fetching subscription status:', err);
      setError(err.response?.data?.detail || 'Failed to fetch subscription status');
      // Default to blocked on error for safety
      setSubscriptionData({
        plan: 'free',
        isActive: false,
        isBlocked: true,
        transactionCount: 0,
        expiresAt: null,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscriptionStatus();
  }, []);

  return {
    ...subscriptionData,
    loading,
    error,
    refetch: fetchSubscriptionStatus,
  };
};

/**
 * Hook to protect a page/component by subscription status.
 * Redirects to dashboard if subscription is blocked.
 * 
 * Usage:
 * const { isAllowed, loading } = useSubscriptionGuard();
 * if (loading) return <Loader />;
 * if (!isAllowed) return null; // Already redirected
 */
export const useSubscriptionGuard = () => {
  const { isBlocked, loading } = useSubscription();
  const [isAllowed, setIsAllowed] = useState(true);

  useEffect(() => {
    if (!loading && isBlocked) {
      // Store redirect reason in sessionStorage for dashboard to display
      sessionStorage.setItem('subscription_blocked', 'true');
      sessionStorage.setItem(
        'subscription_message',
        'Your subscription is expired or limit reached. Please upgrade.'
      );
      
      // Redirect to dashboard
      window.location.href = '/dashboard';
      setIsAllowed(false);
    }
  }, [isBlocked, loading]);

  return { isAllowed, loading };
};

export default useSubscription;
