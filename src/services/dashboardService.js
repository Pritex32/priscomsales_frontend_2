import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

// Get auth token from localStorage
const getAuthHeaders = () => {
  const token = localStorage.getItem('login_token');
  return {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  };
};

const dashboardService = {
  /**
   * Get subscription status for current user
   */
  getSubscriptionStatus: async () => {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/api/dashboard/subscription-status`,
        getAuthHeaders()
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching subscription status:', error);
      throw error;
    }
  },

  /**
   * Get dashboard statistics
   */
  getDashboardStats: async () => {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/api/dashboard/dashboard-stats`,
        getAuthHeaders()
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      throw error;
    }
  },

  /**
   * Create a new employee account (MD only)
   */
  createEmployee: async (employeeData) => {
    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/dashboard/create-employee`,
        employeeData,
        getAuthHeaders()
      );
      return response.data;
    } catch (error) {
      console.error('Error creating employee:', error);
      throw error;
    }
  },

  /**
   * Get all employees (MD only)
   */
  getEmployees: async () => {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/api/dashboard/employees`,
        getAuthHeaders()
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching employees:', error);
      throw error;
    }
  },

  /**
   * Get available subscription plans
   */
  getSubscriptionPlans: async () => {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/api/dashboard/plans`,
        getAuthHeaders()
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching plans:', error);
      throw error;
    }
  },

  /**
   * Initialize payment for subscription upgrade (MD only)
   */
  initializePayment: async (planKey) => {
    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/dashboard/initialize-payment?plan_key=${planKey}`,
        {},
        getAuthHeaders()
      );
      return response.data;
    } catch (error) {
      console.error('Error initializing payment:', error);
      throw error;
    }
  },

  /**
   * Verify payment after Paystack callback
   */
  verifyPayment: async (reference) => {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/api/dashboard/verify-payment?reference=${reference}`,
        getAuthHeaders()
      );
      return response.data;
    } catch (error) {
      console.error('Error verifying payment:', error);
      throw error;
    }
  }
};

export default dashboardService;
