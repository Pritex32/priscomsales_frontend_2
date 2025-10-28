import { useState, useEffect, useCallback } from 'react';
import { useSelector } from 'react-redux';
import api from '../services/api';

/**
 * Custom hook for checking user permissions
 * @param {string} resourceKey - The permission resource key to check
 * @returns {boolean} - Whether user has permission for the resource
 */
export const usePermission = (resourceKey) => {
  const { user, permissions = [], permissionCodes = [] } = useSelector(state => state.auth);
  const role = (user?.role || localStorage.getItem('role') || '').toLowerCase();
  const [hasPermission, setHasPermission] = useState(false);
  const [loading, setLoading] = useState(true);

  const toCode = (key) => {
    if (!key) return '';
    try {
      const k = String(key).trim().toLowerCase();
      const parts = k.split('.');
      const base = parts[0] || k;
      let action = null;
      for (const p of parts.slice(1)) {
        if (["edit","delete","add","create","update","view","export","report","print"].includes(p)) { action = p.toUpperCase(); break; }
        if (p.endsWith('_button')) { action = p.replace('_button','').toUpperCase(); break; }
        if (p.endsWith('_tab')) { action = p.replace('_tab','').toUpperCase(); break; }
      }
      if (k.includes('button') || ["EDIT","DELETE","ADD","CREATE","UPDATE"].includes(action)) {
        return `BTN_${base.toUpperCase()}_${action || 'ACTION'}`.replace(/__+/g,'_');
      }
      if (k.includes('report') && (k.includes('tab') || k.includes('report_tab'))) {
        return `PAGE_${base.toUpperCase()}_REPORT`;
      }
      return `PAGE_${base.toUpperCase()}${action ? '_' + action : ''}`;
    } catch { return String(key).toUpperCase().replaceAll('.','_'); }
  };

  const aliasKeys = (key) => {
    const list = new Set();
    list.add(key);
    if (!key.endsWith('.page.access')) list.add(`${key}.page.access`);
    if (!key.endsWith('.access')) list.add(`${key}.access`);
    if (!key.endsWith('.view')) list.add(`${key}.view`);
    if (!key.endsWith('.page')) list.add(`${key}.page`);
    return Array.from(list);
  };

  useEffect(() => {
    const checkPermission = async () => {
      // MD users have all permissions by default
      if (role === 'md') {
        setHasPermission(true);
        setLoading(false);
        return;
      }

      try {
        // Check from local cached permissions first
        const code = toCode(resourceKey);
        const directHit = permissionCodes?.includes(code);
        const rawAliases = aliasKeys(resourceKey);
        const rawHit = (permissions || []).some(p => rawAliases.includes(p));
        if (directHit || rawHit) {
          setHasPermission(true);
          setLoading(false);
          return;
        }

        const userId = user?.user_id || user?.id || localStorage.getItem('user_id');
        // If no userId, deny access (security-first approach)
        if (!userId) {
          console.warn('[RBAC] No userId found - denying access to', resourceKey);
          setHasPermission(false);
          setLoading(false);
          return;
        }

        // Fallback to API check
        const response = await api.get(`/permissions/check`, {
          params: { user_id: userId, resource_key: resourceKey }
        });
        const allowed = !!response.data?.has_permission;
        setHasPermission(allowed);
        // Log for debugging
        console.log('[RBAC] check', { resourceKey, code, allowed, directHit, rawHit });
      } catch (error) {
        console.error('Error checking permission:', error);
        setHasPermission(false);
      } finally {
        setLoading(false);
      }
    };

    if (resourceKey) {
      checkPermission();
    } else {
      setLoading(false);
    }
  }, [resourceKey, user?.role, role, JSON.stringify(permissions), JSON.stringify(permissionCodes)]);

  return { hasPermission, loading };
};

/**
 * Hook to check multiple permissions at once
 * @param {string[]} resourceKeys - Array of resource keys to check
 * @returns {object} - Object with hasPermission and loading states
 */
export const usePermissions = (resourceKeys = []) => {
  const { user, permissions: rawPerms = [], permissionCodes = [] } = useSelector(state => state.auth);
  const role = (user?.role || localStorage.getItem('role') || '').toLowerCase();
  const [permissions, setPermissions] = useState({});
  const [loading, setLoading] = useState(true);
  const toCode = (key) => (String(key || '').toUpperCase().replaceAll('.', '_'));
  const aliasKeys = (key) => {
    const list = new Set(); list.add(key);
    if (!key.endsWith('.page.access')) list.add(`${key}.page.access`);
    if (!key.endsWith('.access')) list.add(`${key}.access`);
    if (!key.endsWith('.view')) list.add(`${key}.view`);
    if (!key.endsWith('.page')) list.add(`${key}.page`);
    return Array.from(list);
  };

  useEffect(() => {
    const checkPermissions = async () => {
      // MD users have all permissions by default
      if (role === 'md') {
        const allGranted = resourceKeys.reduce((acc, key) => {
          acc[key] = true;
          return acc;
        }, {});
        setPermissions(allGranted);
        setLoading(false);
        return;
      }

      try {
        const userId = user?.user_id || user?.id || localStorage.getItem('user_id');
        if (!userId || resourceKeys.length === 0) {
          setPermissions({});
          setLoading(false);
          return;
        }
        // Fill from cache first
        const init = {};
        resourceKeys.forEach(key => {
          const aliases = aliasKeys(key);
          const rawHit = rawPerms.some(p => aliases.includes(p));
          const codeHit = permissionCodes.includes(toCode(key));
          init[key] = !!(rawHit || codeHit);
        });
        setPermissions(init);

        const response = await api.post(`/permissions/check-multiple`, {
          user_id: userId,
          resource_keys: resourceKeys
        });
        
        setPermissions(prev => ({ ...prev, ...(response.data?.permissions || {}) }));
      } catch (error) {
        console.error('Error checking permissions:', error);
        setPermissions({});
      } finally {
        setLoading(false);
      }
    };

    checkPermissions();
  }, [JSON.stringify(resourceKeys), user?.role, role, JSON.stringify(rawPerms), JSON.stringify(permissionCodes)]);

  return { permissions, loading };
};

/**
 * Simple permission checker without hook
 * @param {string} resourceKey - The permission resource key to check
 * @returns {Promise<boolean>} - Whether user has permission
 */
export const checkPermission = async (resourceKey) => {
  try {
    const role = localStorage.getItem('role');
    
    // MD users have all permissions
    if (role?.toLowerCase() === 'md') {
      return true;
    }

    const userId = localStorage.getItem('user_id');
    if (!userId) {
      return false;
    }

    const response = await api.get(`/permissions/check`, {
      params: { user_id: userId, resource_key: resourceKey }
    });
    
    return response.data?.has_permission || false;
  } catch (error) {
    console.error('Error checking permission:', error);
    return false;
  }
};

export default usePermission;
