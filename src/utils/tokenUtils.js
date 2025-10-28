/**
 * Token utility functions for JWT handling and automatic logout
 */

/**
 * Decode JWT token payload (without verification - client-side only)
 * @param {string} token - JWT token
 * @returns {object|null} - Decoded payload or null if invalid
 */
export function decodeToken(token) {
  if (!token) return null;
  
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    
    const decodedPayload = JSON.parse(atob(payload));
    return decodedPayload;
  } catch (error) {
    console.error('Error decoding token:', error);
    return null;
  }
}

/**
 * Check if token is expired
 * @param {string} token - JWT token
 * @returns {boolean} - True if token is expired
 */
export function isTokenExpired(token) {
  const payload = decodeToken(token);
  if (!payload || !payload.exp) return true;
  
  const currentTime = Math.floor(Date.now() / 1000);
  return payload.exp < currentTime;
}

/**
 * Get token expiration time in milliseconds
 * @param {string} token - JWT token
 * @returns {number|null} - Expiration time in milliseconds or null
 */
export function getTokenExpiration(token) {
  const payload = decodeToken(token);
  if (!payload || !payload.exp) return null;
  
  return payload.exp * 1000; // Convert to milliseconds
}

/**
 * Get time until token expires in milliseconds
 * @param {string} token - JWT token
 * @returns {number} - Time until expiration in milliseconds (0 if expired)
 */
export function getTimeUntilExpiry(token) {
  const expiration = getTokenExpiration(token);
  if (!expiration) return 0;
  
  const timeUntilExpiry = expiration - Date.now();
  return Math.max(timeUntilExpiry, 0);
}