import React, { useState, useEffect } from 'react';
import api from '../services/api';

const SettingsDebug = () => {
  const [debugInfo, setDebugInfo] = useState({});
  const [apiTests, setApiTests] = useState({});
  const [loading, setLoading] = useState(false);

  const testAPI = async (endpoint, method = 'GET', data = null) => {
    try {
      let response;
      switch (method) {
        case 'GET':
          response = await api.get(endpoint);
          break;
        case 'PUT':
          response = await api.put(endpoint, data);
          break;
        case 'POST':
          response = await api.post(endpoint, data);
          break;
        default:
          response = await api.get(endpoint);
      }
      return { success: true, data: response.data, status: response.status };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.detail || error.message,
        status: error.response?.status 
      };
    }
  };

  const runDebugTests = async () => {
    setLoading(true);
    const tests = {};

    // Test authentication info
    const token = localStorage.getItem('login_token');
    const username = localStorage.getItem('username');
    const role = localStorage.getItem('role');
    
    setDebugInfo({
      hasToken: !!token,
      tokenPreview: token ? `${token.substring(0, 20)}...` : 'None',
      username: username || 'Not found',
      role: role || 'Not found'
    });

    // Test Settings API endpoints
    console.log('Testing Settings API endpoints...');
    
    tests.generateAccessCode = await testAPI('/settings/access-code/generate', 'PUT');
    tests.listOfficers = await testAPI('/settings/inventory-officers');
    tests.setAccessCode = await testAPI('/settings/access-code', 'PUT', { code: 'TEST123' });
    
    // Test company endpoints (may not exist)
    tests.companyInfo = await testAPI('/sales/company');
    tests.userInfo = await testAPI('/auth/me');

    setApiTests(tests);
    setLoading(false);
  };

  useEffect(() => {
    runDebugTests();
  }, []);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold mb-4">Settings Debug Dashboard</h1>
        
        {/* Authentication Info */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-3">Authentication Status</h2>
          <div className="bg-gray-50 p-4 rounded">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <strong>Has Token:</strong> {debugInfo.hasToken ? '✅ Yes' : '❌ No'}
              </div>
              <div>
                <strong>Username:</strong> {debugInfo.username}
              </div>
              <div>
                <strong>Role:</strong> {debugInfo.role}
              </div>
            </div>
            {debugInfo.tokenPreview && (
              <div className="mt-2">
                <strong>Token Preview:</strong> <code className="text-xs">{debugInfo.tokenPreview}</code>
              </div>
            )}
          </div>
        </div>

        {/* API Test Results */}
        <div>
          <h2 className="text-lg font-semibold mb-3">API Endpoint Tests</h2>
          {loading ? (
            <div className="text-blue-600">Running tests...</div>
          ) : (
            <div className="space-y-4">
              {Object.entries(apiTests).map(([testName, result]) => (
                <div key={testName} className="border rounded p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium">{testName}</h3>
                    <span className={`px-2 py-1 rounded text-sm ${
                      result.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {result.success ? 'SUCCESS' : 'FAILED'}
                    </span>
                  </div>
                  
                  <div className="text-sm text-gray-600">
                    <div><strong>Status:</strong> {result.status}</div>
                    {result.success ? (
                      <div>
                        <strong>Response:</strong> 
                        <pre className="mt-1 bg-gray-100 p-2 rounded text-xs overflow-auto">
                          {JSON.stringify(result.data, null, 2)}
                        </pre>
                      </div>
                    ) : (
                      <div><strong>Error:</strong> {result.error}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-6 pt-4 border-t">
          <button
            onClick={runDebugTests}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Running Tests...' : 'Refresh Tests'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsDebug;