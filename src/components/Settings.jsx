import React, { useState, useEffect } from 'react';
import api from '../services/api';
import ManageEmployeeAccess from '../pages/ManageEmployeeAccess';
import Tooltip from './Tooltip';

const TabButton = ({ active, onClick, children }) => (
  <button onClick={onClick} className={`px-4 py-2 rounded-md text-sm font-medium ${
    active ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
  }`}>
    {children}
  </button>
);

const Settings = () => {
  const [tab, setTab] = useState('Company');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Bank & POS (Mono) state
  const [linkedAccounts, setLinkedAccounts] = useState([]);
  const [monoAccessCode, setMonoAccessCode] = useState('');
  const [monoLoading, setMonoLoading] = useState(false);
  const MONO_PUBLIC_KEY = process.env.REACT_APP_MONO_PUBLIC_KEY || (window.MONO_PUBLIC_KEY || 'test_pk_oo68ydjramhiz7d2ojlm');

  // Company/Receipt Customization State
  const [tenantName, setTenantName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [address, setAddress] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountName, setAccountName] = useState('');
  const [logoFile, setLogoFile] = useState(null);

  // Access Code State
  const [accessCode, setAccessCode] = useState('');
  const [customAccessCode, setCustomAccessCode] = useState('');

  // Password Change State
  const [pwdEmail, setPwdEmail] = useState('');
  const [pwdAccessCode, setPwdAccessCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Inventory Officers State
  const [officers, setOfficers] = useState([]);
  const [newOfficerName, setNewOfficerName] = useState('');
  const [newOfficerEmail, setNewOfficerEmail] = useState('');
  const [editingOfficerId, setEditingOfficerId] = useState(null);
  const [editOfficerName, setEditOfficerName] = useState('');
  const [editOfficerEmail, setEditOfficerEmail] = useState('');

  // Delete Account State
  const [deleteAccountType, setDeleteAccountType] = useState('user');
  const [deleteEmail, setDeleteEmail] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteNameValue, setDeleteNameValue] = useState('');

  // Company Info Functions
  const updateCompanyInfo = async () => {
    setLoading(true); setError(''); setSuccess('');
    try {
      await api.put('/sales/company', {
        tenant_name: tenantName || null,
        phone_number: phoneNumber || null,
        address: address || null,
        account_number: accountNumber || null,
        bank_name: bankName || null,
        account_name: accountName || null,
      });
      setSuccess('Company details updated successfully!');
    } catch (e) {
      setError('Failed to update company details: ' + (e.response?.data?.detail || e.message));
    } finally { setLoading(false); }
  };

  const uploadLogo = async () => {
    if (!logoFile) {
      setError('Please select a logo file');
      return;
    }
    setLoading(true); setError(''); setSuccess('');
    try {
      const formData = new FormData();
      formData.append('logo_file', logoFile);
      await api.post('/sales/company/logo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setSuccess('Logo uploaded successfully!');
      setLogoFile(null);
    } catch (e) {
      setError('Failed to upload logo: ' + (e.response?.data?.detail || e.message));
    } finally { setLoading(false); }
  };

  // Access Code Functions
  const generateAccessCode = async () => {
    setLoading(true); setError(''); setSuccess('');
    try {
      const res = await api.put('/settings/access-code/generate');
      setAccessCode(res.data.access_code);
      setSuccess(`New access code generated: ${res.data.access_code}`);
    } catch (e) {
      setError('Failed to generate access code: ' + (e.response?.data?.detail || e.message));
    } finally { setLoading(false); }
  };

  const setAccessCodeCustom = async () => {
    if (!customAccessCode.trim()) {
      setError('Please enter an access code');
      return;
    }
    setLoading(true); setError(''); setSuccess('');
    try {
      await api.put('/settings/access-code', { code: customAccessCode });
      setSuccess('Access code updated successfully!');
      setAccessCode(customAccessCode);
      setCustomAccessCode('');
    } catch (e) {
      setError('Failed to set access code: ' + (e.response?.data?.detail || e.message));
    } finally { setLoading(false); }
  };

  // Password Change Functions
  const changePassword = async () => {
    if (!pwdEmail.trim() || !pwdAccessCode.trim() || !newPassword.trim()) {
      setError('All fields are required');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true); setError(''); setSuccess('');
    try {
      await api.post('/settings/change-password', {
        email: pwdEmail,
        access_code: pwdAccessCode,
        new_password: newPassword,
      });
      setSuccess('Password changed successfully!');
      setPwdEmail('');
      setPwdAccessCode('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (e) {
      setError('Failed to change password: ' + (e.response?.data?.detail || e.message));
    } finally { setLoading(false); }
  };

  // Inventory Officers Functions
  const loadOfficers = async () => {
    setLoading(true); setError('');
    try {
      const res = await api.get('/settings/inventory-officers');
      setOfficers(res.data || []);
    } catch (e) {
      setError('Failed to load officers: ' + (e.response?.data?.detail || e.message));
    } finally { setLoading(false); }
  };

  useEffect(() => { if (tab === 'Officers') loadOfficers(); }, [tab]);

  const addOfficer = async () => {
    if (!newOfficerName.trim() || !newOfficerEmail.trim()) {
      setError('Officer name and email are required');
      return;
    }
    setLoading(true); setError(''); setSuccess('');
    try {
      await api.post('/settings/inventory-officers', {
        officer_name: newOfficerName,
        officer_email: newOfficerEmail,
      });
      setSuccess('Officer added successfully!');
      setNewOfficerName('');
      setNewOfficerEmail('');
      loadOfficers();
    } catch (e) {
      setError('Failed to add officer: ' + (e.response?.data?.detail || e.message));
    } finally { setLoading(false); }
  };

  const updateOfficer = async (officerId) => {
    setLoading(true); setError(''); setSuccess('');
    try {
      await api.put(`/settings/inventory-officers/${officerId}`, {
        officer_name: editOfficerName || null,
        officer_email: editOfficerEmail || null,
      });
      setSuccess('Officer updated successfully!');
      setEditingOfficerId(null);
      setEditOfficerName('');
      setEditOfficerEmail('');
      loadOfficers();
    } catch (e) {
      setError('Failed to update officer: ' + (e.response?.data?.detail || e.message));
    } finally { setLoading(false); }
  };

  const deleteOfficer = async (officerId) => {
    if (!window.confirm('Are you sure you want to delete this officer?')) return;
    setLoading(true); setError(''); setSuccess('');
    try {
      await api.delete(`/settings/inventory-officers/${officerId}`);
      setSuccess('Officer deleted successfully!');
      loadOfficers();
    } catch (e) {
      setError('Failed to delete officer: ' + (e.response?.data?.detail || e.message));
    } finally { setLoading(false); }
  };

  const startEditOfficer = (officer) => {
    setEditingOfficerId(officer.officer_id);
    setEditOfficerName(officer.officer_name);
    setEditOfficerEmail(officer.officer_email);
  };


  // Load data when tab changes
  useEffect(() => {
    const loadInitialData = async () => {
      if (tab === 'Company') {
        // Load company data (if endpoint exists)
        try {
          const res = await api.get('/sales/company');
          if (res.data) {
            const data = res.data;
            setTenantName(data.tenant_name || '');
            setPhoneNumber(data.phone_number || '');
            setAddress(data.address || '');
            setAccountNumber(data.account_number || '');
            setBankName(data.bank_name || '');
            setAccountName(data.account_name || '');
          }
        } catch (e) {
          // Company data endpoint might not exist, ignore error
          console.log('Company data not available:', e.response?.data?.detail || e.message);
        }
      }
      
      if (tab === 'Access Code') {
        try {
          // Try to get user info which might include access code
          const res = await api.get('/auth/me');
          if (res.data && res.data.access_code) {
            setAccessCode(res.data.access_code);
          }
        } catch (e) {
          // Access code endpoint might not exist, ignore error
          console.log('Current access code not available:', e.response?.data?.detail || e.message);
        }
      }

      if (tab === 'Bank & POS') {
        try {
          const res = await api.get('/settings/linked-accounts');
          setLinkedAccounts(res.data || []);
        } catch (e) {
          console.log('No linked accounts or failed to load:', e.response?.data?.detail || e.message);
          setLinkedAccounts([]);
        }
        
        await ensureMonoScript();
      }
    };

    loadInitialData();
  }, [tab]);

  // Mono helpers
  const ensureMonoScript = async () => {
    const waitForMono = (timeoutMs = 15000, pollMs = 100) => new Promise((res) => {
      const start = Date.now();
      const t = setInterval(() => {
        if (window.MonoConnect) {
          clearInterval(t);
          res(true);
        } else if (Date.now() - start > timeoutMs) {
          clearInterval(t);
          res(false);
        }
      }, pollMs);
    });

    return new Promise((resolve) => {
      // Check if already loaded
      if (window.MonoConnect) {
        console.log('DEBUG: MonoConnect already available');
        return resolve(true);
      }

      // Check if script already exists
      const existingScript = document.querySelector('script[src*="mono"]');
      if (existingScript) {
        console.log('DEBUG: Mono script already in DOM, waiting for it to load');
        waitForMono().then(resolve);
        return;
      }

      const tryLoad = (src, onFail) => {
        console.log('DEBUG: Loading Mono script:', src);
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.type = 'text/javascript';
        
        s.onload = async () => {
          console.log('DEBUG: Mono script onload event fired from', src);
          
          // Wait for MonoConnect to be available
          const ok = await waitForMono();
          if (ok) {
            console.log('DEBUG: MonoConnect successfully loaded and available');
            resolve(true);
          } else {
            console.error('DEBUG: MonoConnect script loaded but window.MonoConnect not available');
            if (onFail) onFail();
            else resolve(false);
          }
        };
        
        s.onerror = (e) => {
          console.error('DEBUG: Mono script onerror from', src, e);
          // Remove failed script
          if (s.parentNode) {
            s.parentNode.removeChild(s);
          }
          if (onFail) onFail();
          else resolve(false);
        };
        
        document.head.appendChild(s);
      };

      // Try the correct Mono Connect URL
      console.log('DEBUG: Starting Mono script load sequence');
      tryLoad('https://connect.mono.co/connect.js', () => {
        console.log('DEBUG: Primary URL failed, trying CDN fallback');
        tryLoad('https://cdn.mono.co/v1/connect.js', () => {
          console.error('DEBUG: Both Mono script URLs failed');
          resolve(false);
        });
      });
    });
  };


  const handleMonoConnect = async () => {
    console.log('DEBUG: Initiating Mono Connect, access_code provided?', !!monoAccessCode, 'publicKeyPresent?', !!MONO_PUBLIC_KEY);
    setError(''); setSuccess('');
    
    if (!monoAccessCode.trim()) {
      setError('Please enter your access code');
      return;
    }

    if (!MONO_PUBLIC_KEY) {
      setError('Mono public key is not configured. Please contact support.');
      return;
    }

    setMonoLoading(true);
    
    try {
      // Ensure Mono script is loaded
      const ok = await ensureMonoScript();
      if (!ok || !window.MonoConnect) {
        setError('Failed to load Mono Connect. Please check your internet connection and try again. If the problem persists, try refreshing the page.');
        setMonoLoading(false);
        return;
      }

      console.log('DEBUG: MonoConnect available, initializing widget');
      
      // Initialize and open
      const connect = new window.MonoConnect({
        key: MONO_PUBLIC_KEY,
        onClose: function() {
          console.log('DEBUG: Mono widget closed');
          setMonoLoading(false);
        },
        onSuccess: function(response) {
          console.log('DEBUG: Mono onSuccess callback triggered with code');
          const code = response.code;
          api.post('/settings/mono/link', { code: code, access_code: monoAccessCode })
            .then(function(resp) {
              console.log('DEBUG: /settings/mono/link response:', resp.status, resp.data);
              setSuccess(resp.data?.msg || 'Account successfully linked and secured with your access code.');
              setMonoAccessCode('');
              return loadLinkedAccounts();
            })
            .catch(function(e) {
              console.error('DEBUG: /settings/mono/link error:', e?.response?.status, e?.response?.data || e?.message);
              setError(e.response?.data?.detail || 'Failed to link account. Please try again.');
            })
            .finally(function() {
              setMonoLoading(false);
            });
        }
      });
      
      connect.setup();
      connect.open();
      console.log('DEBUG: Mono widget opened');
    } catch (e) {
      console.error('DEBUG: Mono Connect initialization error:', e);
      setError(e.message || 'Mono Connect failed to initialize. Please try again.');
      setMonoLoading(false);
    }
  };

  const disconnectAccount = async (accountId) => {
    if (!window.confirm('Disconnect this account?')) return;
    try {
      setMonoLoading(true);
      await api.delete(`/settings/linked-accounts/${accountId}`);
      setSuccess('Account disconnected');
      await loadLinkedAccounts();
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to disconnect');
    } finally { setMonoLoading(false); }
  };

  // Delete Account Function
  const deleteAccount = async () => {
    if (!deleteEmail.trim() || !deletePassword.trim()) {
      setError('Email and password are required');
      return;
    }
    if (!window.confirm(`Are you sure you want to delete this ${deleteAccountType} account? This action cannot be undone.`)) {
      return;
    }
    setLoading(true); setError(''); setSuccess('');
    try {
      await api.post('/settings/delete-account', {
        account_type: deleteAccountType,
        email: deleteEmail,
        password: deletePassword,
        name_value: deleteNameValue || null,
      });
      setSuccess('Account deleted successfully!');
      setDeleteEmail('');
      setDeletePassword('');
      setDeleteNameValue('');
    } catch (e) {
      setError('Failed to delete account: ' + (e.response?.data?.detail || e.message));
    } finally { setLoading(false); }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <div className="flex gap-2 flex-wrap">
          {['Company', 'Access Code', 'Password', 'Officers', 'Manage Access', 'Bank & POS', 'Delete Account'].map(t => (
            <TabButton key={t} active={tab === t} onClick={() => setTab(t)}>{t}</TabButton>
          ))}
        </div>
      </div>

      {error && <div className="bg-red-50 text-red-700 border border-red-200 px-3 py-2 rounded">{error}</div>}
      {success && <div className="bg-green-50 text-green-700 border border-green-200 px-3 py-2 rounded">{success}</div>}
      {loading && <div className="bg-blue-50 text-blue-700 border border-blue-200 px-3 py-2 rounded">Loading...</div>}

      {tab === 'Company' && (
        <div className="space-y-4">
          <div className="bg-white rounded shadow p-6 space-y-4">
            <h2 className="text-lg font-semibold">Company / Receipt Customization</h2>
            <p className="text-sm text-gray-600">Update your company information that appears on receipts and invoices.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                  Company Name
                  <Tooltip text="This name will appear on all receipts and invoices" />
                </label>
                <input value={tenantName} onChange={e => setTenantName(e.target.value)} className="border rounded px-3 py-2 w-full" placeholder="Enter company name" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                  Phone Number
                  <Tooltip text="Contact number displayed on customer receipts" />
                </label>
                <input value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} className="border rounded px-3 py-2 w-full" placeholder="Enter phone number" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <textarea value={address} onChange={e => setAddress(e.target.value)} className="border rounded px-3 py-2 w-full" rows="2" placeholder="Enter company address" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                  Bank Name
                  <Tooltip text="Bank where your business account is held" />
                </label>
                <input value={bankName} onChange={e => setBankName(e.target.value)} className="border rounded px-3 py-2 w-full" placeholder="Enter bank name" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                  Account Number
                  <Tooltip text="Your business bank account number for customer payments" />
                </label>
                <input value={accountNumber} onChange={e => setAccountNumber(e.target.value)} className="border rounded px-3 py-2 w-full" placeholder="Enter account number" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                  Account Name
                  <Tooltip text="Name registered to your business bank account" />
                </label>
                <input value={accountName} onChange={e => setAccountName(e.target.value)} className="border rounded px-3 py-2 w-full" placeholder="Enter account name" />
              </div>
            </div>

            <button onClick={updateCompanyInfo} disabled={loading} className="px-6 py-3 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
              {loading ? 'Updating...' : 'Update Company Info'}
            </button>
          </div>

          <div className="bg-white rounded shadow p-6 space-y-4">
            <h2 className="text-lg font-semibold">Company Logo</h2>
            <p className="text-sm text-gray-600">Upload your company logo to appear on receipts and invoices.</p>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Select Logo File</label>
              <input type="file" accept="image/*" onChange={e => setLogoFile(e.target.files[0])} className="border rounded px-3 py-2 w-full" />
              {logoFile && <p className="text-sm text-gray-600 mt-1">Selected: {logoFile.name}</p>}
            </div>

            <button onClick={uploadLogo} disabled={loading || !logoFile} className="px-6 py-3 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">
              {loading ? 'Uploading...' : 'Upload Logo'}
            </button>
          </div>
        </div>
      )}

      {tab === 'Access Code' && (
        <div className="bg-white rounded shadow p-6 space-y-4">
          <h2 className="text-lg font-semibold">Access Code Management</h2>
          <p className="text-sm text-gray-600">Generate or set a custom access code for your account.</p>

          {accessCode && (
            <div className="bg-blue-50 border border-blue-200 rounded p-4">
              <p className="text-sm font-medium text-blue-900">Current Access Code:</p>
              <p className="text-2xl font-bold text-blue-600 mt-1">{accessCode}</p>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <button onClick={generateAccessCode} disabled={loading} className="px-6 py-3 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                {loading ? 'Generating...' : 'Generate Random Access Code'}
              </button>
              <Tooltip text="Generate a secure random code for employee access control" position="right" />
            </div>

            <div className="border-t pt-3">
              <label className="block text-sm font-medium text-gray-700 mb-2">Or Set Custom Access Code</label>
              <div className="flex gap-2">
                <input value={customAccessCode} onChange={e => setCustomAccessCode(e.target.value)} className="border rounded px-3 py-2 flex-1" placeholder="Enter custom access code" />
                <button onClick={setAccessCodeCustom} disabled={loading} className="px-6 py-3 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">
                  {loading ? 'Setting...' : 'Set Code'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'Password' && (
        <div className="bg-white rounded shadow p-6 space-y-4">
          <h2 className="text-lg font-semibold">Change Password</h2>
          <p className="text-sm text-gray-600">Update your account password by verifying your email and access code.</p>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
              <input type="email" value={pwdEmail} onChange={e => setPwdEmail(e.target.value)} className="border rounded px-3 py-2 w-full" placeholder="Enter your email" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Access Code</label>
              <input value={pwdAccessCode} onChange={e => setPwdAccessCode(e.target.value)} className="border rounded px-3 py-2 w-full" placeholder="Enter access code" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="border rounded px-3 py-2 w-full" placeholder="Enter new password" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
              <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="border rounded px-3 py-2 w-full" placeholder="Confirm new password" />
            </div>
          </div>

          <button onClick={changePassword} disabled={loading} className="px-6 py-3 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
            {loading ? 'Changing...' : 'Change Password'}
          </button>
        </div>
      )}

      {tab === 'Officers' && (
        <div className="space-y-4">
          <div className="bg-white rounded shadow p-6 space-y-4">
            <h2 className="text-lg font-semibold">Add Inventory Officer</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                Officer Name
                <Tooltip text="Full name of the inventory officer" />
              </label>
              <input value={newOfficerName} onChange={e => setNewOfficerName(e.target.value)} className="border rounded px-3 py-2 w-full" placeholder="Enter officer name" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                Officer Email
                <Tooltip text="Email address for inventory notifications and reports" />
              </label>
              <input type="email" value={newOfficerEmail} onChange={e => setNewOfficerEmail(e.target.value)} className="border rounded px-3 py-2 w-full" placeholder="Enter officer email" />
            </div>
            </div>
            <button onClick={addOfficer} disabled={loading} className="px-6 py-3 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">
              {loading ? 'Adding...' : 'Add Officer'}
            </button>
          </div>

          <div className="bg-white rounded shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Inventory Officers</h2>
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2 px-3">Name</th>
                    <th className="py-2 px-3">Email</th>
                    <th className="py-2 px-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {officers.map(officer => (
                    <tr key={officer.officer_id} className="border-b hover:bg-gray-50">
                      <td className="py-2 px-3">
                        {editingOfficerId === officer.officer_id ? (
                          <input value={editOfficerName} onChange={e => setEditOfficerName(e.target.value)} className="border rounded px-2 py-1 w-full" />
                        ) : (
                          officer.officer_name
                        )}
                      </td>
                      <td className="py-2 px-3">
                        {editingOfficerId === officer.officer_id ? (
                          <input type="email" value={editOfficerEmail} onChange={e => setEditOfficerEmail(e.target.value)} className="border rounded px-2 py-1 w-full" />
                        ) : (
                          officer.officer_email
                        )}
                      </td>
                      <td className="py-2 px-3">
                        {editingOfficerId === officer.officer_id ? (
                          <div className="flex gap-2">
                            <button onClick={() => updateOfficer(officer.officer_id)} className="px-3 py-1 rounded bg-green-600 text-white text-xs hover:bg-green-700">Save</button>
                            <button onClick={() => setEditingOfficerId(null)} className="px-3 py-1 rounded bg-gray-600 text-white text-xs hover:bg-gray-700">Cancel</button>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <button onClick={() => startEditOfficer(officer)} className="px-3 py-1 rounded bg-blue-600 text-white text-xs hover:bg-blue-700">Edit</button>
                            <button onClick={() => deleteOfficer(officer.officer_id)} className="px-3 py-1 rounded bg-red-600 text-white text-xs hover:bg-red-700">Delete</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {officers.length === 0 && (
                    <tr>
                      <td colSpan="3" className="py-4 text-center text-gray-500">No officers found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'Manage Access' && (
        <ManageEmployeeAccess />
      )}

      {tab === 'Bank & POS' && (
        <div className="bg-white rounded shadow p-6 space-y-4">
          <h2 className="text-lg font-semibold">Bank & POS Connection (Mono)</h2>
          <p className="text-sm text-gray-600">Connect your bank account securely using Mono. Only MD can link accounts.</p>

          {linkedAccounts && linkedAccounts.length > 0 ? (
            <div className="space-y-3">
              <h3 className="font-medium">Connected Account</h3>
              {linkedAccounts.map((acc) => (
                <div key={acc.account_id} className="border rounded p-3 bg-gray-50 flex items-center justify-between">
                  <div className="text-sm">
                    <div><span className="text-gray-600">Bank:</span> <span className="font-medium">{acc.bank_name || '—'}</span></div>
                    <div><span className="text-gray-600">Account Name:</span> <span className="font-medium">{acc.account_name || '—'}</span></div>
                    <div><span className="text-gray-600">Account Number:</span> <span className="font-medium">{acc.account_number || '—'}</span></div>
                  </div>
                  <button onClick={() => disconnectAccount(acc.account_id)} disabled={monoLoading} className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
                    {monoLoading ? 'Disconnecting...' : 'Disconnect Account'}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-800">
                <strong>Note:</strong> Make sure you have a stable internet connection. If you encounter issues, try:
                <ul className="list-disc ml-5 mt-1">
                  <li>Disabling browser extensions (especially ad blockers)</li>
                  <li>Refreshing the page and trying again</li>
                  <li>Using a different browser</li>
                </ul>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Access Code</label>
                <input
                  value={monoAccessCode}
                  onChange={e => setMonoAccessCode(e.target.value)}
                  className="border rounded px-3 py-2 w-full"
                  placeholder="Enter your access code"
                  disabled={monoLoading}
                />
                <div className="text-xs text-gray-500 mt-1">Your access code will be verified before linking your account.</div>
              </div>
              
              <button
                onClick={handleMonoConnect}
                disabled={monoLoading || !monoAccessCode.trim()}
                className="px-6 py-3 rounded bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {monoLoading ? 'Connecting...' : 'Connect via Mono'}
              </button>
              
              <div className="text-xs text-gray-500 space-y-1">
                <div>Mono Public Key: {MONO_PUBLIC_KEY ? '✓ Loaded' : '✗ Missing (set REACT_APP_MONO_PUBLIC_KEY)'}</div>
                <div>Script Status: {window.MonoConnect ? '✓ Ready' : '⏳ Will load when needed'}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'Delete Account' && (
        <div className="bg-white rounded shadow p-6 space-y-4">
          <h2 className="text-lg font-semibold text-red-600">Delete Account</h2>
          <div className="bg-red-50 border border-red-200 rounded p-4">
            <p className="text-sm text-red-800">
              <strong>Warning:</strong> This action is permanent and cannot be undone. All data associated with the account will be deleted.
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Account Type</label>
              <select value={deleteAccountType} onChange={e => setDeleteAccountType(e.target.value)} className="border rounded px-3 py-2 w-full">
                <option value="user">MD (Main User)</option>
                <option value="employee">Employee</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
              <input type="email" value={deleteEmail} onChange={e => setDeleteEmail(e.target.value)} className="border rounded px-3 py-2 w-full" placeholder="Enter email address" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input type="password" value={deletePassword} onChange={e => setDeletePassword(e.target.value)} className="border rounded px-3 py-2 w-full" placeholder="Enter password" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Username/Name (Optional)</label>
              <input value={deleteNameValue} onChange={e => setDeleteNameValue(e.target.value)} className="border rounded px-3 py-2 w-full" placeholder="Enter username for MD or name for employee" />
            </div>
          </div>

          <button onClick={deleteAccount} disabled={loading} className="px-6 py-3 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
            {loading ? 'Deleting...' : 'Delete Account Permanently'}
          </button>
        </div>
      )}
    </div>
  );
};

export default Settings;
