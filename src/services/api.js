import axios from 'axios';
import { isTokenExpired } from '../utils/tokenUtils';

// FastAPI serves routers at root (e.g., /auth, /sales, /b2b, ...)
const API_BASE_URL = process.env.REACT_APP_API_URL;
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add JWT token and check expiry
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('login_token');
    if (token) {
      // Check if token is expired before making the request
      if (isTokenExpired(token)) {
        localStorage.removeItem('login_token');
        localStorage.removeItem('role');
        sessionStorage.removeItem('admin_unlocked');
        // Redirect to login page
        window.location.href = '/login';
        return Promise.reject(new Error('Token expired'));
      }
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    // Add admin_unlocked header for admin routes
    const adminUnlocked = sessionStorage.getItem('admin_unlocked');
    if (adminUnlocked === 'true') {
      config.headers['X-Admin-Unlocked'] = 'true';
    }
    
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for errors (e.g., 401 redirect to login, 403 subscription block)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token is invalid or expired, clear all auth data
      localStorage.removeItem('login_token');
      localStorage.removeItem('role');
      sessionStorage.removeItem('admin_unlocked');
      // Redirect to login page
      window.location.href = '/login';
    } else if (error.response?.status === 403) {
      // Check if this is a subscription limit error
      const errorDetail = error.response?.data?.detail || '';
      if (errorDetail.includes('Subscription expired') || errorDetail.includes('limit exceeded')) {
        // Store subscription block info for dashboard display
        sessionStorage.setItem('subscription_blocked', 'true');
        sessionStorage.setItem(
          'subscription_message',
          'Your subscription is expired or limit reached. Please upgrade.'
        );
        
        // Show alert popup
        alert('Your subscription is expired or limit reached. Please upgrade.');
        
        // Redirect to dashboard
        window.location.href = '/dashboard';
      }
    }
    return Promise.reject(error);
  }
);

export const fetchTableData = async (tableType) => {
  try {
    const response = await api.get(`/filters/${tableType}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching table data:', error);
    throw error;
  }
};

export default api;
