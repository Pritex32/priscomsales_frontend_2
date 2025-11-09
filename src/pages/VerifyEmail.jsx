import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle, XCircle, Loader2, Mail, ArrowLeft } from 'lucide-react';
import axios from 'axios';

const VerifyEmail = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const emailFromUrl = searchParams.get('email') || '';
  
  const [email, setEmail] = useState(emailFromUrl);
  const [code, setCode] = useState('');
  const [status, setStatus] = useState('input'); // 'input' | 'verifying' | 'success' | 'error'
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);


  const handleVerify = async (e) => {
    e.preventDefault();
    
    if (!email || !code) {
      setStatus('error');
      setMessage('Please enter both email and verification code.');
      return;
    }

    if (code.length !== 6) {
      setStatus('error');
      setMessage('Verification code must be 6 digits.');
      return;
    }

    setLoading(true);
    setStatus('verifying');
    setMessage('');

    try {
      const API_BASE_URL = process.env.REACT_APP_API_URL;
      
      if (!API_BASE_URL) {
        setStatus('error');
        setMessage('API configuration error. Please contact support.');
        setLoading(false);
        return;
      }
      
      const response = await axios.post(`${API_BASE_URL}/auth/verify-code`, {
        email: email.trim(),
        code: code.trim()
      });
      
      setStatus('success');
      setMessage(response.data?.msg || 'Email verified successfully!');
      
      // Redirect to login after 3 seconds
      setTimeout(() => {
        navigate('/login');
      }, 3000);
    } catch (error) {
      console.error('Verification error:', error);
      setStatus('error');
      setMessage(
        error?.response?.data?.detail || 
        'Verification failed. Please check your code and try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (!email) {
      setStatus('error');
      setMessage('Please enter your email address.');
      return;
    }

    setResending(true);
    setMessage('');

    try {
      const API_BASE_URL = process.env.REACT_APP_API_URL;
      
      const response = await axios.post(
        `${API_BASE_URL}/auth/resend-verification?email=${encodeURIComponent(email.trim())}`
      );
      
      
      setStatus('input');
      setMessage(response.data?.msg || 'Verification code sent to your email.');
      setCode(''); // Clear the code field
    } catch (error) {
      console.error('Resend error:', error);
      setStatus('error');
      setMessage(
        error?.response?.data?.detail || 
        'Failed to resend code. Please try again.'
      );
    } finally {
      setResending(false);
    }
  };

  const handleCodeChange = (e) => {
    const value = e.target.value.replace(/\D/g, ''); // Only allow digits
    if (value.length <= 6) {
      setCode(value);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-teal-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
        {/* Back Button */}
        <button
          onClick={() => navigate('/login')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">Back to Login</span>
        </button>

        {/* Icon */}
        <div className="flex justify-center mb-6">
          {status === 'verifying' && (
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center">
              <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
            </div>
          )}
          {status === 'success' && (
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="w-10 h-10 text-green-600" />
            </div>
          )}
          {(status === 'input' || status === 'error') && (
            <div className="w-20 h-20 bg-teal-100 rounded-full flex items-center justify-center">
              <Mail className="w-10 h-10 text-teal-600" />
            </div>
          )}
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-center text-gray-900 mb-2">
          {status === 'verifying' && 'Verifying Your Email'}
          {status === 'success' && 'Email Verified!'}
          {(status === 'input' || status === 'error') && 'Verify Your Email'}
        </h1>

        {/* Subtitle */}
        <p className="text-center text-gray-600 mb-6">
          {status === 'verifying' && 'Please wait while we verify your email address...'}
          {status === 'success' && message}
          {(status === 'input' || status === 'error') && 'Enter the 6-digit code sent to your email'}
        </p>

        {/* Message */}
        {message && (status === 'input' || status === 'error') && (
          <div className={`mb-4 p-3 rounded-lg ${
            status === 'error' 
              ? 'bg-red-50 border border-red-200 text-red-800' 
              : 'bg-green-50 border border-green-200 text-green-800'
          }`}>
            <p className="text-sm">{message}</p>
          </div>
        )}

        {/* Verification Form */}
        {(status === 'input' || status === 'error') && (
          <form onSubmit={handleVerify} className="space-y-4">
            {/* Email Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                placeholder="your@email.com"
                required
                disabled={loading}
              />
            </div>

            {/* Code Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Verification Code
              </label>
              <input
                type="text"
                value={code}
                onChange={handleCodeChange}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-center text-2xl font-mono tracking-widest"
                placeholder="000000"
                maxLength="6"
                pattern="[0-9]{6}"
                required
                disabled={loading}
                autoComplete="off"
              />
              <p className="mt-1 text-xs text-gray-500 text-center">
                Enter the 6-digit code from your email
              </p>
            </div>

            {/* Verify Button */}
            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className="w-full py-3 px-4 bg-teal-600 hover:bg-teal-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Verifying...
                </span>
              ) : (
                'Verify Email'
              )}
            </button>

            {/* Resend Code Button */}
            <button
              type="button"
              onClick={handleResendCode}
              disabled={resending || loading}
              className="w-full py-3 px-4 border-2 border-teal-600 text-teal-600 hover:bg-teal-50 font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {resending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Mail className="w-4 h-4" />
                  Resend Code
                </>
              )}
            </button>
          </form>
        )}

        {/* Success State */}
        {status === 'success' && (
          <div className="space-y-3">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
              <p className="text-sm text-green-800">
                Redirecting to login in 3 seconds...
              </p>
            </div>
            <button
              onClick={() => navigate('/login')}
              className="w-full py-3 px-4 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors"
            >
              Go to Login Now
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 pt-6 border-t border-gray-200 text-center">
          <p className="text-sm text-gray-600">
            Need help?{' '}
            <a href="mailto:support@priscomsales.online" className="text-teal-600 hover:text-teal-700 font-medium">
              Contact Support
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default VerifyEmail;
