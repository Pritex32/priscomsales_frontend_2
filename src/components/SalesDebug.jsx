import React, { useState, useEffect } from 'react';
import api from '../services/api';

const SalesDebug = () => {
  const [debugInfo, setDebugInfo] = useState({});
  const [apiTests, setApiTests] = useState({});
  const [loading, setLoading] = useState(false);
  const [salesData, setSalesData] = useState([]);
  const [sampleSaleData, setSampleSaleData] = useState({
    employee_id: null,
    employee_name: 'Debug User',
    sale_date: new Date().toISOString().split('T')[0],
    customer_name: 'John Doe',
    customer_phone: '123-456-7890',
    invoice_number: `INV-${Date.now()}`,
    notes: 'Test sale from debug component',
    items: [
      {
        item_id: null,
        item_name: 'Test Product',
        quantity: 2,
        unit_price: 100.00,
        total_amount: 200.00,
        warehouse_name: null
      }
    ],
    apply_vat: true,
    vat_rate: 7.5,
    discount_type: 'None',
    discount_value: 0,
    payment_method: 'cash',
    payment_status: 'paid',
    amount_customer_paid: 215.00,
    due_date: null,
    partial_payment_amount: null,
    partial_payment_date: null,
    partial_payment_note: null,
    invoice_file_url: null
  });

  const testAPI = async (endpoint, method = 'GET', data = null) => {
    try {
      let response;
      switch (method) {
        case 'GET':
          response = await api.get(endpoint);
          break;
        case 'POST':
          response = await api.post(endpoint, data);
          break;
        case 'PUT':
          response = await api.put(endpoint, data);
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

  const runSalesTests = async () => {
    setLoading(true);
    const tests = {};

    // Test authentication info
    const token = localStorage.getItem('login_token');
    const username = localStorage.getItem('username');
    const userRole = localStorage.getItem('role');
    
    setDebugInfo({
      hasToken: !!token,
      tokenPreview: token ? `${token.substring(0, 20)}...` : 'None',
      username: username || 'Not found',
      role: userRole || 'Not found'
    });

    // Test Sales API endpoints
    console.log('Testing Sales API endpoints...');
    
    tests.getSales = await testAPI('/sales');
    tests.getSalesWithLimit = await testAPI('/sales?limit=10');
    tests.getFilterOptions = await testAPI('/sales/filter-options');
    
    // Test warehouses with different roles
    tests.getWarehouses = await testAPI(`/sales/warehouses?role=${userRole || 'md'}`);
    
    tests.getPending = await testAPI('/sales/pending');
    tests.getReports = await testAPI('/sales/reports/summary?start_date=2024-01-01&end_date=2024-12-31');
    
    // Test inventory items if warehouses are available
    if (tests.getWarehouses.success && tests.getWarehouses.data && tests.getWarehouses.data.length > 0) {
      const firstWarehouse = tests.getWarehouses.data[0];
      tests.getInventoryItems = await testAPI(`/sales/inventory-items?warehouse_name=${encodeURIComponent(firstWarehouse)}`);
    } else {
      tests.getInventoryItems = { success: false, error: 'No warehouses available to test inventory items' };
    }

    // Test Sales Filter endpoint
    tests.filterSales = await testAPI('/sales/filter', 'POST', {
      keyword: null,
      filter_type: null,
      filter_values: null,
      start_date: null,
      end_date: null,
      limit: 10
    });
    
    // Test upload endpoints (without actual files)
    tests.uploadInvoiceEndpoint = { 
      success: false, 
      status: 'N/A', 
      error: 'File upload test requires actual file - endpoint available at /sales/upload-invoice' 
    };

    // Store sales data if successful
    if (tests.getSales.success) {
      setSalesData(tests.getSales.data);
    }

    setApiTests(tests);
    setLoading(false);
  };

  const createSampleSale = async () => {
    setLoading(true);
    try {
      const result = await testAPI('/sales/batch', 'POST', sampleSaleData);
      if (result.success) {
        alert('Sample sale created successfully!');
        // Refresh sales data
        runSalesTests();
      } else {
        alert(`Failed to create sample sale: ${result.error}`);
      }
    } catch (error) {
      alert(`Error creating sample sale: ${error.message}`);
    }
    setLoading(false);
  };

  const testRealSaleWithInventory = async () => {
    setLoading(true);
    try {
      // Get warehouses first
      const warehousesResult = await testAPI(`/sales/warehouses?role=${debugInfo.role || 'md'}`);
      if (!warehousesResult.success || !warehousesResult.data?.length) {
        alert('No warehouses available. Create inventory items first.');
        setLoading(false);
        return;
      }

      const firstWarehouse = warehousesResult.data[0];
      console.log('Using warehouse:', firstWarehouse);

      // Get inventory items for this warehouse
      const inventoryResult = await testAPI(`/sales/inventory-items?warehouse_name=${encodeURIComponent(firstWarehouse)}`);
      if (!inventoryResult.success) {
        alert(`Failed to load inventory: ${inventoryResult.error}`);
        setLoading(false);
        return;
      }

      const inventoryItems = inventoryResult.data || {};
      const itemNames = Object.keys(inventoryItems);
      
      console.log('Available items:', itemNames);
      console.log('Inventory data:', inventoryItems);

      if (itemNames.length === 0) {
        alert('No inventory items found. Add inventory items to the warehouse first.');
        setLoading(false);
        return;
      }

      // Use first available item
      const itemName = itemNames[0];
      const itemData = inventoryItems[itemName];

      console.log('Using item:', itemName, itemData);

      if (!itemData.item_id) {
        alert(`Item "${itemName}" has no item_id! This will cause the error.`);
        setLoading(false);
        return;
      }

      // Create realistic sale payload with proper employee_id
      const currentUserId = localStorage.getItem('user_id');
      const currentRole = localStorage.getItem('role');
      const employeeId = currentUserId && Number(currentUserId) > 0 ? Number(currentUserId) : null;
      
      console.log('SalesDebug employee resolution:', {
        currentUserId,
        currentRole,
        employeeId,
        username: debugInfo.username
      });
      
      const realSalePayload = {
        employee_id: employeeId, // Include employee_id in test
        employee_name: debugInfo.username || 'Test User',
        sale_date: new Date().toISOString().split('T')[0],
        customer_name: 'Test Customer - Real Sale',
        customer_phone: '0901234567',
        invoice_number: `TEST-${Date.now()}`,
        items: [{
          item_id: itemData.item_id,
          item_name: itemName,
          quantity: 1,
          unit_price: itemData.price || 100,
          total_amount: itemData.price || 100,
          warehouse_name: firstWarehouse
        }],
        apply_vat: false,
        vat_rate: 0,
        discount_type: 'None',
        discount_value: 0,
        payment_method: 'cash',
        payment_status: 'paid',
        amount_customer_paid: itemData.price || 100,
        notes: 'Test sale with real inventory data'
      };

      console.log('Real sale payload:', realSalePayload);

      const result = await testAPI('/sales/batch', 'POST', realSalePayload);
      if (result.success) {
        alert('✅ Real sale created successfully! The "Invalid reference" error is fixed.');
        runSalesTests();
      } else {
        const errorDetails = `❌ Real sale failed: ${result.error}\n\nPayload sent:\n${JSON.stringify(realSalePayload, null, 2)}\n\nDebug info:\n- Warehouse: ${firstWarehouse}\n- Item: ${itemName}\n- Item ID: ${itemData.item_id} (type: ${typeof itemData.item_id})\n- Item Price: ${itemData.price}\n- Employee ID: ${employeeId} (from localStorage user_id: ${currentUserId})\n- Role: ${currentRole}`;
        console.error('Sale error details:', result);
        console.error('Full payload:', realSalePayload);
        
        // Copy error details to clipboard for easy debugging
        navigator.clipboard.writeText(errorDetails).catch(() => {});
        
        alert(errorDetails + '\n\n(Error details copied to clipboard)');
      }
    } catch (error) {
      alert(`Error testing real sale: ${error.message}`);
      console.error('Test error:', error);
    }
    setLoading(false);
  };

  const createSampleData = async () => {
    if (!confirm('This will create sample warehouse and inventory data. Continue?')) return;
    
    setLoading(true);
    try {
      // Note: Since we don't have direct warehouse creation endpoints in the current sales.py,
      // we'll try to create via the inventory endpoint that might auto-create warehouses
      const inventorySample = {
        warehouse_name: 'Main Warehouse',
        item_name: 'Sample Product',
        price: 100.00,
        stock_in: 50,
        stock_out: 0
      };
      
      // This would typically be done via an inventory creation endpoint
      alert('Sample data creation requires inventory management endpoints. Use the inventory section to create warehouses and items first.');
      
    } catch (error) {
      alert(`Error creating sample data: ${error.message}`);
    }
    setLoading(false);
  };

  const updateSampleSaleField = (field, value) => {
    setSampleSaleData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const updateSampleSaleItem = (index, field, value) => {
    setSampleSaleData(prev => ({
      ...prev,
      items: prev.items.map((item, i) => 
        i === index ? { ...item, [field]: value } : item
      )
    }));
  };

  useEffect(() => {
    runSalesTests();
  }, []);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold mb-4">Sales API Debug Dashboard</h1>
        
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
          </div>
        </div>

        {/* Sales Data Summary */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-3">Sales Data Summary</h2>
          <div className="bg-blue-50 p-4 rounded">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <strong>Total Sales Records:</strong> {salesData.length}
              </div>
              <div>
                <strong>Data Source:</strong> {salesData.length > 0 ? 'Database has records' : 'No records found'}
              </div>
            </div>
          </div>
        </div>

        {/* Sample Sales Data */}
        {salesData.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-3">Recent Sales Data (Preview)</h2>
            <div className="bg-gray-50 p-4 rounded">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">Date</th>
                      <th className="text-left py-2">Customer</th>
                      <th className="text-left py-2">Item</th>
                      <th className="text-left py-2">Total</th>
                      <th className="text-left py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salesData.slice(0, 5).map((sale, idx) => (
                      <tr key={idx} className="border-b">
                        <td className="py-2">{sale.sale_date || sale.date || 'N/A'}</td>
                        <td className="py-2">{sale.customer_name || 'Unknown'}</td>
                        <td className="py-2">{sale.item_name || 'Unknown'}</td>
                        <td className="py-2">₦{Number(sale.total_amount || 0).toLocaleString()}</td>
                        <td className="py-2">{sale.payment_status || 'N/A'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* API Test Results */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-3">API Endpoint Tests</h2>
          {loading ? (
            <div className="text-blue-600">Running tests...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                        <strong>Records:</strong> {Array.isArray(result.data) ? result.data.length : (result.data ? 'Object returned' : 'No data')}
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

        {/* Sample Sale Creator */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-3">Create Sample Sale</h2>
          <div className="bg-yellow-50 border border-yellow-200 p-4 rounded">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium mb-1">Customer Name</label>
                <input
                  type="text"
                  value={sampleSaleData.customer_name}
                  onChange={(e) => updateSampleSaleField('customer_name', e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Customer Phone</label>
                <input
                  type="text"
                  value={sampleSaleData.customer_phone}
                  onChange={(e) => updateSampleSaleField('customer_phone', e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Item Name</label>
                <input
                  type="text"
                  value={sampleSaleData.items[0].item_name}
                  onChange={(e) => updateSampleSaleItem(0, 'item_name', e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Quantity</label>
                <input
                  type="number"
                  value={sampleSaleData.items[0].quantity}
                  onChange={(e) => updateSampleSaleItem(0, 'quantity', Number(e.target.value))}
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Unit Price</label>
                <input
                  type="number"
                  step="0.01"
                  value={sampleSaleData.items[0].unit_price}
                  onChange={(e) => updateSampleSaleItem(0, 'unit_price', Number(e.target.value))}
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Amount Paid</label>
                <input
                  type="number"
                  step="0.01"
                  value={sampleSaleData.amount_customer_paid}
                  onChange={(e) => updateSampleSaleField('amount_customer_paid', Number(e.target.value))}
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={createSampleSale}
                disabled={loading}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
              >
                {loading ? 'Creating...' : 'Create Sample Sale'}
              </button>
              <button
                onClick={testRealSaleWithInventory}
                disabled={loading}
                className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
              >
                {loading ? 'Testing...' : 'Test Real Sale (Fix Item Error)'}
              </button>
              <button
                onClick={createSampleData}
                disabled={loading}
                className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:opacity-50"
              >
                {loading ? 'Creating...' : 'Create Sample Data'}
              </button>
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-4 border-t">
          <button
            onClick={runSalesTests}
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

export default SalesDebug;