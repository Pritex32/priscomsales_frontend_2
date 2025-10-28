import React, { useState, useEffect } from 'react';

const BackendTest = () => {
  const [testResults, setTestResults] = useState({});
  const [loading, setLoading] = useState(false);
  const [backendStatus, setBackendStatus] = useState('unknown');

  const testBackendConnection = async () => {
    setLoading(true);
    const results = {};

    // Test 1: Basic backend connectivity
    try {
      const response = await fetch('http://localhost:8000/', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      if (response.ok) {
        const data = await response.json();
        results.backendRoot = { success: true, data, status: response.status };
        setBackendStatus('running');
      } else {
        results.backendRoot = { success: false, error: `HTTP ${response.status}`, status: response.status };
        setBackendStatus('error');
      }
    } catch (error) {
      results.backendRoot = { success: false, error: error.message };
      setBackendStatus('offline');
    }

    // Test 2: Test individual sales endpoints without auth
    const endpoints = [
      { name: 'sales_root', url: 'http://localhost:8000/sales' },
      { name: 'sales_warehouses', url: 'http://localhost:8000/sales/warehouses' },
      { name: 'sales_filter_options', url: 'http://localhost:8000/sales/filter-options' },
      { name: 'auth_root', url: 'http://localhost:8000/auth' },
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint.url, {
          method: 'GET',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('login_token') || 'no-token'}`
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          results[endpoint.name] = { 
            success: true, 
            data, 
            status: response.status,
            recordCount: Array.isArray(data) ? data.length : 'N/A'
          };
        } else {
          const errorData = await response.text();
          results[endpoint.name] = { 
            success: false, 
            error: errorData || `HTTP ${response.status}`, 
            status: response.status 
          };
        }
      } catch (error) {
        results[endpoint.name] = { 
          success: false, 
          error: error.message,
          status: 'Network Error'
        };
      }
    }

    // Test 3: CORS preflight
    try {
      const response = await fetch('http://localhost:8000/sales', {
        method: 'OPTIONS',
      });
      results.cors_preflight = {
        success: response.ok,
        status: response.status,
        headers: {
          'access-control-allow-origin': response.headers.get('access-control-allow-origin'),
          'access-control-allow-methods': response.headers.get('access-control-allow-methods'),
          'access-control-allow-headers': response.headers.get('access-control-allow-headers'),
        }
      };
    } catch (error) {
      results.cors_preflight = { success: false, error: error.message };
    }

    setTestResults(results);
    setLoading(false);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'running': return 'text-green-600';
      case 'offline': return 'text-red-600';
      case 'error': return 'text-orange-600';
      default: return 'text-gray-600';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'running': return '✅';
      case 'offline': return '❌';
      case 'error': return '⚠️';
      default: return '❓';
    }
  };

  useEffect(() => {
    testBackendConnection();
  }, []);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold mb-4">Backend Connection Test</h1>
        
        {/* Backend Status */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-3">Backend Status</h2>
          <div className="bg-gray-50 p-4 rounded">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{getStatusIcon(backendStatus)}</span>
              <div>
                <div className={`font-medium ${getStatusColor(backendStatus)}`}>
                  {backendStatus.charAt(0).toUpperCase() + backendStatus.slice(1)}
                </div>
                <div className="text-sm text-gray-600">
                  Backend API at http://localhost:8000
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Environment Info */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-3">Environment Info</h2>
          <div className="bg-blue-50 p-4 rounded">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div><strong>Frontend URL:</strong> {window.location.origin}</div>
              <div><strong>Backend URL:</strong> http://localhost:8000</div>
              <div><strong>Has Auth Token:</strong> {localStorage.getItem('login_token') ? '✅ Yes' : '❌ No'}</div>
              <div><strong>User Agent:</strong> {navigator.userAgent.split(' ')[0]}</div>
            </div>
          </div>
        </div>

        {/* Test Results */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-3">API Endpoint Tests</h2>
          {loading ? (
            <div className="text-blue-600">Running tests...</div>
          ) : (
            <div className="space-y-4">
              {Object.entries(testResults).map(([testName, result]) => (
                <div key={testName} className="border rounded p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium capitalize">{testName.replace('_', ' ')}</h3>
                    <span className={`px-2 py-1 rounded text-sm ${
                      result.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {result.success ? 'SUCCESS' : 'FAILED'}
                    </span>
                  </div>
                  
                  <div className="text-sm space-y-1">
                    <div><strong>Status:</strong> {result.status}</div>
                    {result.success ? (
                      <>
                        {result.recordCount && (
                          <div><strong>Records:</strong> {result.recordCount}</div>
                        )}
                        {result.headers && (
                          <div>
                            <strong>CORS Headers:</strong>
                            <pre className="mt-1 bg-gray-100 p-2 rounded text-xs overflow-auto">
                              {JSON.stringify(result.headers, null, 2)}
                            </pre>
                          </div>
                        )}
                        {result.data && !result.headers && (
                          <div>
                            <strong>Response Preview:</strong>
                            <pre className="mt-1 bg-gray-100 p-2 rounded text-xs overflow-auto max-h-32">
                              {typeof result.data === 'string' 
                                ? result.data.substring(0, 200) + (result.data.length > 200 ? '...' : '')
                                : JSON.stringify(result.data, null, 2).substring(0, 200) + '...'
                              }
                            </pre>
                          </div>
                        )}
                      </>
                    ) : (
                      <div><strong>Error:</strong> {result.error}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Backend Startup Instructions */}
        {backendStatus === 'offline' && (
          <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
            <h3 className="font-medium text-yellow-800 mb-2">Backend Server Offline</h3>
            <p className="text-yellow-700 text-sm mb-3">
              The backend server at http://localhost:8000 is not responding. To start the backend:
            </p>
            <ol className="text-yellow-700 text-sm list-decimal list-inside space-y-1">
              <li>Open a terminal/command prompt</li>
              <li>Navigate to the backend directory</li>
              <li>Run: <code className="bg-yellow-100 px-1 rounded">uvicorn main:app --reload --port 8000</code></li>
              <li>Wait for "Application startup complete" message</li>
              <li>Refresh this page to test again</li>
            </ol>
          </div>
        )}

        <div className="flex gap-3 pt-4 border-t">
          <button
            onClick={testBackendConnection}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Testing...' : 'Run Tests Again'}
          </button>
          
          {backendStatus === 'running' && (
            <a
              href="http://localhost:8000/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Open API Docs
            </a>
          )}
        </div>
      </div>
    </div>
  );
};

export default BackendTest;