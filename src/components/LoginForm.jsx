import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { login } from '../store/authSlice';
import { decodeToken } from '../utils/tokenUtils';
const REACT_APP_API_URL = process.env.REACT_APP_API_URL;

const LoginForm = () => {
  const [formData, setFormData] = useState({
    username: '', // For MD login, this will be username. For employee, this will be email
    password: '',
    loginType: 'md' // 'md' or 'employee'
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const formDataToSend = new FormData();
      
      if (formData.loginType === 'md') {
        // MD login - backend expects username and password
        formDataToSend.append('username', formData.username);
        formDataToSend.append('password', formData.password);
        
        const response = await fetch('https://priscomsales-software.onrender.com/auth/token', {
          method: 'POST',
          body: formDataToSend,
        });
        
        if (response.ok) {
          const data = await response.json();
          // Prefer API-provided username; fallback to token payload, then form field
          const payload = decodeToken(data.access_token);
          const username = data?.username || payload?.sub || formData.username;
          
          // Store username in localStorage
          localStorage.setItem('username', username);
          
          dispatch(login({
            token: data.access_token,
            role: 'md',
            username: username,
            permissions: data.permissions || [],
            permission_codes: data.permission_codes || []
          }));
          console.log('[RBAC] MD login, permission_codes:', data.permission_codes, 'username:', username);
          navigate('/dashboard');
        } else {
          const errorData = await response.json();
          setError(errorData.detail || 'Login failed');
        }
      } else {
        // Employee login - backend expects email and password
        formDataToSend.append('email', formData.username); // username field contains email for employee login
        formDataToSend.append('password', formData.password);
        
        const response = await fetch('https://priscomsales-software.onrender.com/auth/employee/token', {
          method: 'POST',
          body: formDataToSend,
        });
        
        if (response.ok) {
          const data = await response.json();
          console.log('[RBAC] Employee login response:', data);
          
          // Prefer API-provided username; fallback to token payload, then email
          const payload = decodeToken(data.access_token);
          const username = data?.username || payload?.username || payload?.sub || formData.username;
          
          console.log('[RBAC] JWT payload:', payload);
          console.log('[RBAC] Permissions from backend:', data.permissions);
          console.log('[RBAC] Permission codes from backend:', data.permission_codes);
          
          // Store username in localStorage
          localStorage.setItem('username', username);
          
          dispatch(login({
            token: data.access_token,
            role: 'employee',
            username: username,
            permissions: data.permissions || [],
            permission_codes: data.permission_codes || []
          }));
          
          console.log('[RBAC] Saved to Redux - permissions:', data.permissions, 'codes:', data.permission_codes);
          console.log('[RBAC] localStorage permissions:', localStorage.getItem('permissions'));
          console.log('[RBAC] localStorage permission_codes:', localStorage.getItem('permission_codes'));
          
          navigate('/dashboard');
        } else {
          const errorData = await response.json();
          setError(errorData.detail || 'Login failed');
        }
      }
    } catch (err) {
      setError('Network error. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo and Header */}
        <div className="text-center mb-8">
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 mb-6">
            <div className="w-16 h-16 bg-white rounded-xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">PriscomSales</h1>
            <p className="text-blue-100">Smart Sales, Smarter Decisions</p>
          </div>
        </div>

        {/* Login Form */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/10">
          <h2 className="text-xl font-semibold text-white mb-6 text-center">Sign in to continue</h2>
          
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-100 rounded-lg p-3 mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Login Type Selector */}
            <div className="grid grid-cols-2 gap-2 bg-white/5 rounded-lg p-1">
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, loginType: 'md' }))}
                className={`py-2 px-4 rounded-md text-sm font-medium transition-all duration-200 ${
                  formData.loginType === 'md'
                    ? 'bg-white/20 text-white shadow-sm'
                    : 'text-blue-100 hover:text-white'
                }`}
              >
                MD Login
              </button>
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, loginType: 'employee' }))}
                className={`py-2 px-4 rounded-md text-sm font-medium transition-all duration-200 ${
                  formData.loginType === 'employee'
                    ? 'bg-white/20 text-white shadow-sm'
                    : 'text-blue-100 hover:text-white'
                }`}
              >
                Employee Login
              </button>
            </div>

            {/* Username/Email Field */}
            <div className="space-y-2">
              <label className="text-blue-100 text-sm font-medium">
                {formData.loginType === 'md' ? 'Username' : 'Email'}
              </label>
              <div className="relative">
                <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-blue-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <input
                  type={formData.loginType === 'md' ? 'text' : 'email'}
                  value={formData.username}
                  onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
                  className="w-full bg-white/10 border border-white/20 text-white placeholder-blue-200 rounded-lg py-3 pl-12 pr-4 focus:outline-none focus:border-white/40 focus:bg-white/15 transition-all"
                  placeholder={formData.loginType === 'md' ? 'Enter your username' : 'Enter your email'}
                  required
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-2">
              <label className="text-blue-100 text-sm font-medium">Password</label>
              <div className="relative">
                <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-blue-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                  className="w-full bg-white/10 border border-white/20 text-white placeholder-blue-200 rounded-lg py-3 pl-12 pr-12 focus:outline-none focus:border-white/40 focus:bg-white/15 transition-all"
                  placeholder="Enter your password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-blue-200 hover:text-white"
                >
                  {showPassword ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-white text-blue-900 font-semibold py-3 rounded-lg hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105 active:scale-95"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          {/* Footer Links */}
          <div className="mt-6 text-center space-y-2">
            <div className="text-blue-100">
              <a href="/register" className="text-white hover:text-blue-200 font-medium hover:underline">
                Don't have an account? Sign up
              </a>
            </div>
            <div className="flex items-center justify-center space-x-4 text-sm text-blue-200">
              <a href="/" className="hover:text-white hover:underline">
                ← Back to Home
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginForm;
