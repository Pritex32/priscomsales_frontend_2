import { createSlice } from '@reduxjs/toolkit';
import { isTokenExpired } from '../utils/tokenUtils';

// Check if token exists and is not expired
const token = localStorage.getItem('login_token');
const isValidToken = token && !isTokenExpired(token);

// Clear invalid token from localStorage if expired
if (token && isTokenExpired(token)) {
  localStorage.removeItem('login_token');
  localStorage.removeItem('role');
}

const initialState = {
  isAuthenticated: isValidToken,
  user: {
    role: isValidToken ? (localStorage.getItem('role') || 'user') : 'user',
    username: isValidToken ? localStorage.getItem('username') : null,
  },
  permissions: isValidToken ? JSON.parse(localStorage.getItem('permissions') || '[]') : [],
  permissionCodes: isValidToken ? JSON.parse(localStorage.getItem('permission_codes') || '[]') : [],
  adminUnlocked: false,
  lastActivity: Date.now(),
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    login(state, action) {
      const { token, role, username, permissions = [], permission_codes = [] } = action.payload || {};
      if (token) localStorage.setItem('login_token', token);
      if (role) localStorage.setItem('role', role);
      if (username) localStorage.setItem('username', username);
      // persist permissions
      localStorage.setItem('permissions', JSON.stringify(permissions || []));
      localStorage.setItem('permission_codes', JSON.stringify(permission_codes || []));
      state.isAuthenticated = true;
      state.user.role = role || state.user.role;
      state.user.username = username || state.user.username;
      state.permissions = permissions || [];
      state.permissionCodes = permission_codes || [];
    },
    logout(state) {
      localStorage.removeItem('login_token');
      localStorage.removeItem('role');
      localStorage.removeItem('username');
      localStorage.removeItem('permissions');
      localStorage.removeItem('permission_codes');
      sessionStorage.removeItem('admin_unlocked');
      state.isAuthenticated = false;
      state.user.role = 'user';
      state.user.username = null;
      state.permissions = [];
      state.permissionCodes = [];
      state.adminUnlocked = false;
    },
    checkTokenExpiry(state) {
      const token = localStorage.getItem('login_token');
      if (token && isTokenExpired(token)) {
        localStorage.removeItem('login_token');
        localStorage.removeItem('role');
        localStorage.removeItem('username');
        sessionStorage.removeItem('admin_unlocked');
        state.isAuthenticated = false;
        state.user.role = 'user';
        state.user.username = null;
        state.adminUnlocked = false;
        // Note: This should trigger a redirect to login page
        return { ...state, shouldRedirectToLogin: true };
      }
    },
    setPermissions(state, action) {
      const { permissions = [], permission_codes = [] } = action.payload || {};
      localStorage.setItem('permissions', JSON.stringify(permissions || []));
      localStorage.setItem('permission_codes', JSON.stringify(permission_codes || []));
      state.permissions = permissions || [];
      state.permissionCodes = permission_codes || [];
    },
    unlockAdmin(state) {
      state.adminUnlocked = true;
      state.lastActivity = Date.now();
      sessionStorage.setItem('admin_unlocked', 'true');
    },
    lockAdmin(state) {
      state.adminUnlocked = false;
      sessionStorage.removeItem('admin_unlocked');
    },
    updateActivity(state) {
      state.lastActivity = Date.now();
    },
  },
});

export const { login, logout, checkTokenExpiry, unlockAdmin, lockAdmin, updateActivity, setPermissions } = authSlice.actions;
export default authSlice.reducer;
