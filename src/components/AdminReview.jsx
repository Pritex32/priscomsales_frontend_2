import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { usePermission } from '../hooks/usePermission';

const AdminReview = () => {
  const { role: reduxRole } = useSelector(state => state.auth);
  // Get role from localStorage as fallback
  const role = reduxRole || localStorage.getItem('role');
  
  // Permission check
  const { hasPermission, loading: permissionLoading } = usePermission('admin_review.page.access');
  const [loginLogs, setLoginLogs] = useState([
    { id: 1, login_time: '2024-01-15 10:30', role: 'employee', username: 'john.doe', ip_address: '192.168.1.100', device: 'Chrome/Windows' },
    { id: 2, login_time: '2024-01-15 09:45', role: 'md', username: 'admin', ip_address: '192.168.1.101', device: 'Firefox/Mac' },
  ]);
  const [unverifiedSales, setUnverifiedSales] = useState([
    { sale_id: 1, invoice_number: 'INV-001', customer_name: 'John Customer', total_amount: 50000, sale_date: '2024-01-15' },
    { sale_id: 2, invoice_number: 'INV-002', customer_name: 'Jane Buyer', total_amount: 75000, sale_date: '2024-01-14' },
  ]);
  const [unverifiedExpenses, setUnverifiedExpenses] = useState([
    { expense_id: 1, vendor_name: 'Office Supplies Co', total_amount: 25000, expense_date: '2024-01-15', payment_status: 'pending' },
    { expense_id: 2, vendor_name: 'Tech Equipment Ltd', total_amount: 150000, expense_date: '2024-01-14', payment_status: 'paid' },
  ]);
  const [unverifiedGoods, setUnverifiedGoods] = useState([
    { purchase_id: 1, supplier_name: 'ABC Supplier', item_name: 'Office Chair', total_cost: 45000, purchase_date: '2024-01-15' },
    { purchase_id: 2, supplier_name: 'XYZ Vendor', item_name: 'Laptop', total_cost: 350000, purchase_date: '2024-01-14' },
  ]);
  const [employees, setEmployees] = useState([
    { employee_id: 1, name: 'John Doe', email: 'john@company.com', role: 'Sales', access_choice: 'Full Access' },
    { employee_id: 2, name: 'Jane Smith', email: 'jane@company.com', role: 'Inventory', access_choice: 'Limited Access' },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    // Permission check is now handled by usePermission hook
    if (!permissionLoading && !hasPermission) {
      setError('You do not have permission to access this page');
    } else {
      setError('');
    }
  }, [hasPermission, permissionLoading]);

  const handleVerifySale = (saleId, notes) => {
    if (!window.confirm('Mark as verified?')) return;
    setUnverifiedSales(prev => prev.filter(sale => sale.sale_id !== saleId));
    setSuccess('Sale verified successfully!');
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleDeleteSale = (saleId) => {
    if (!window.confirm('Delete sale?')) return;
    setUnverifiedSales(prev => prev.filter(sale => sale.sale_id !== saleId));
    setSuccess('Sale deleted successfully!');
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleVerifyExpense = (expenseId, notes) => {
    if (!window.confirm('Mark expense as verified?')) return;
    setUnverifiedExpenses(prev => prev.filter(exp => exp.expense_id !== expenseId));
    setSuccess('Expense verified successfully!');
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleDeleteExpense = (expenseId) => {
    if (!window.confirm('Delete expense?')) return;
    setUnverifiedExpenses(prev => prev.filter(exp => exp.expense_id !== expenseId));
    setSuccess('Expense deleted successfully!');
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleVerifyGoods = (purchaseId, notes) => {
    if (!window.confirm('Mark goods as verified?')) return;
    setUnverifiedGoods(prev => prev.filter(goods => goods.purchase_id !== purchaseId));
    setSuccess('Goods verified successfully!');
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleDeleteGoods = (purchaseId) => {
    if (!window.confirm('Delete goods?')) return;
    setUnverifiedGoods(prev => prev.filter(goods => goods.purchase_id !== purchaseId));
    setSuccess('Goods deleted successfully!');
    setTimeout(() => setSuccess(''), 3000);
  };

  if (loading || permissionLoading) return <div className="flex justify-center items-center h-64">Loading...</div>;
  if (error) return (
    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
      {error}
    </div>
  );

  return (
    <div className="space-y-6 p-6">
      {success && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
          {success}
        </div>
      )}
      
      <div className="bg-white rounded-lg shadow p-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Login Logs</h2>
          <div className="flex gap-4 mb-4">
            <input 
              type="date" 
              placeholder="Start Date" 
              value={startDate} 
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input 
              type="date" 
              placeholder="End Date" 
              value={endDate} 
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input 
              type="text" 
              placeholder="Search" 
              value={search} 
              onChange={(e) => setSearch(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button 
              onClick={() => setSuccess('Filters applied!')}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Filter
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full table-auto">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Username</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">IP</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Device</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loginLogs.map((log) => (
                <tr key={log.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{log.login_time}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                      {log.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{log.username}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{log.ip_address}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{log.device}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Unverified Sales */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-4">Unverified Sales</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Invoice</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {unverifiedSales.slice(0, 5).map((sale) => (
                  <tr key={sale.sale_id}>
                    <td className="px-4 py-3 text-sm text-gray-900">{sale.invoice_number}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{sale.customer_name}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">₦{sale.total_amount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{sale.sale_date}</td>
                    <td className="px-4 py-3 text-sm space-x-2">
                      <button 
                        onClick={() => handleVerifySale(sale.sale_id, 'Verified by admin')}
                        className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                      >
                        Verify
                      </button>
                      <button 
                        onClick={() => handleDeleteSale(sale.sale_id)}
                        className="px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Unverified Expenses */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-4">Unverified Expenses</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {unverifiedExpenses.slice(0, 5).map((exp) => (
                  <tr key={exp.expense_id}>
                    <td className="px-4 py-3 text-sm text-gray-900">{exp.vendor_name}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">₦{exp.total_amount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{exp.expense_date}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        exp.payment_status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {exp.payment_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm space-x-2">
                      <button 
                        onClick={() => handleVerifyExpense(exp.expense_id, 'Verified')}
                        className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                      >
                        Verify
                      </button>
                      <button 
                        onClick={() => handleDeleteExpense(exp.expense_id)}
                        className="px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Unverified Goods */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-4">Unverified Goods Bought</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Supplier</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Cost</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {unverifiedGoods.slice(0, 5).map((g) => (
                  <tr key={g.purchase_id}>
                    <td className="px-4 py-3 text-sm text-gray-900">{g.supplier_name}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{g.item_name}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">₦{g.total_cost.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{g.purchase_date}</td>
                    <td className="px-4 py-3 text-sm space-x-2">
                      <button 
                        onClick={() => handleVerifyGoods(g.purchase_id, 'Verified')}
                        className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                      >
                        Verify
                      </button>
                      <button 
                        onClick={() => handleDeleteGoods(g.purchase_id)}
                        className="px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Employees</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full table-auto">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Access</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {employees.map((emp) => (
                <tr key={emp.employee_id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{emp.employee_id}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{emp.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{emp.email}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-purple-100 text-purple-800">
                      {emp.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{emp.access_choice}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminReview;
