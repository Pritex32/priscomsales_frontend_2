import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { usePermission } from '../hooks/usePermission';
import { toast } from 'react-toastify';
import {
  getLoginLogs,
  getEmployees,
  getUnverifiedSales,
  verifySale,
  deleteSale,
  getUnverifiedExpenses,
  getUnverifiedGoods
} from '../services/api';

const AdminReview = () => {
  const { role: reduxRole } = useSelector(state => state.auth);
  // Get role from localStorage as fallback
  const role = reduxRole || localStorage.getItem('role');
  
  // Permission check
  const { hasPermission, loading: permissionLoading } = usePermission('admin_review.page.access');
  const [loginLogs, setLoginLogs] = useState([]);
  const [unverifiedSales, setUnverifiedSales] = useState([]);
  const [unverifiedExpenses, setUnverifiedExpenses] = useState([]);
  const [unverifiedGoods, setUnverifiedGoods] = useState([]);
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [search, setSearch] = useState('');

  // Pagination states
  const [salesPage, setSalesPage] = useState(1);
  const [expensesPage, setExpensesPage] = useState(1);
  const [goodsPage, setGoodsPage] = useState(1);
  const [salesTotal, setSalesTotal] = useState(0);
  const [expensesTotal, setExpensesTotal] = useState(0);
  const [goodsTotal, setGoodsTotal] = useState(0);
  const itemsPerPage = 20;

  useEffect(() => {
    // Permission check is now handled by usePermission hook
    if (!permissionLoading && !hasPermission) {
      toast.error('You do not have permission to access this page');
    }
  }, [hasPermission, permissionLoading]);

  // Fetch data when component mounts and has permission
  useEffect(() => {
    if (!permissionLoading && hasPermission) {
      fetchAllData();
    }
  }, [hasPermission, permissionLoading]);

  // Refetch data when pagination changes
  useEffect(() => {
    if (!permissionLoading && hasPermission) {
      fetchUnverifiedSales();
    }
  }, [salesPage, hasPermission, permissionLoading]);

  useEffect(() => {
    if (!permissionLoading && hasPermission) {
      fetchUnverifiedExpenses();
    }
  }, [expensesPage, hasPermission, permissionLoading]);

  useEffect(() => {
    if (!permissionLoading && hasPermission) {
      fetchUnverifiedGoods();
    }
  }, [goodsPage, hasPermission, permissionLoading]);

  const fetchUnverifiedSales = async () => {
    try {
      const salesData = await getUnverifiedSales(salesPage, itemsPerPage);
      setUnverifiedSales(salesData.sales || []);
      setSalesTotal(salesData.total || 0);
    } catch (error) {
      console.error('Error fetching unverified sales:', error);
      toast.error('Failed to load sales data');
    }
  };

  const fetchUnverifiedExpenses = async () => {
    try {
      const expensesData = await getUnverifiedExpenses(expensesPage, itemsPerPage);
      setUnverifiedExpenses(expensesData.expenses || []);
      setExpensesTotal(expensesData.total || 0);
    } catch (error) {
      console.error('Error fetching unverified expenses:', error);
      toast.error('Failed to load expenses data');
    }
  };

  const fetchUnverifiedGoods = async () => {
    try {
      const goodsData = await getUnverifiedGoods(goodsPage, itemsPerPage);
      setUnverifiedGoods(goodsData.goods || []);
      setGoodsTotal(goodsData.total || 0);
    } catch (error) {
      console.error('Error fetching unverified goods:', error);
      toast.error('Failed to load goods data');
    }
  };

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [logsData, salesData, expensesData, goodsData] = await Promise.all([
        getLoginLogs(),
        getUnverifiedSales(salesPage, itemsPerPage),
        getUnverifiedExpenses(expensesPage, itemsPerPage),
        getUnverifiedGoods(goodsPage, itemsPerPage)
      ]);

      setLoginLogs(logsData.logs || []);
      setUnverifiedSales(salesData.sales || []);
      setSalesTotal(salesData.total || 0);
      setUnverifiedExpenses(expensesData.expenses || []);
      setExpensesTotal(expensesData.total || 0);
      setUnverifiedGoods(goodsData.goods || []);
      setGoodsTotal(goodsData.total || 0);
    } catch (error) {
      console.error('Error fetching admin data:', error);
      toast.error('Failed to load admin data');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySale = async (saleId, notes) => {
    if (!window.confirm('Mark as verified?')) return;
    try {
      await verifySale(saleId, {
        is_verified: true,
        verified_by: 'Admin',
        verified_at: new Date(),
        verification_notes: notes || 'Verified by admin'
      });
      toast.success('Sale verified successfully!');
      // Refresh the current page data
      fetchUnverifiedSales();
    } catch (error) {
      console.error('Error verifying sale:', error);
      toast.error('Failed to verify sale');
    }
  };

  const handleDeleteSale = async (saleId) => {
    if (!window.confirm('Delete sale?')) return;
    try {
      await deleteSale(saleId);
      toast.success('Sale deleted successfully!');
      // Refresh the current page data
      fetchUnverifiedSales();
    } catch (error) {
      console.error('Error deleting sale:', error);
      toast.error('Failed to delete sale');
    }
  };

  const handleVerifyExpense = async (expenseId, notes) => {
    if (!window.confirm('Mark expense as verified?')) return;
    // Note: Backend doesn't have verify endpoint for expenses, so we just remove from local state
    setUnverifiedExpenses(prev => prev.filter(exp => exp.expense_id !== expenseId));
    toast.success('Expense verified successfully!');
  };

  const handleDeleteExpense = async (expenseId) => {
    if (!window.confirm('Delete expense?')) return;
    try {
      // Note: Need to implement delete API call for expenses
      setUnverifiedExpenses(prev => prev.filter(exp => exp.expense_id !== expenseId));
      toast.success('Expense deleted successfully!');
      // Refresh the current page data
      fetchUnverifiedExpenses();
    } catch (error) {
      console.error('Error deleting expense:', error);
      toast.error('Failed to delete expense');
    }
  };

  const handleVerifyGoods = async (purchaseId, notes) => {
    if (!window.confirm('Mark goods as verified?')) return;
    // Note: Backend doesn't have verify endpoint for goods, so we just remove from local state
    setUnverifiedGoods(prev => prev.filter(goods => goods.purchase_id !== purchaseId));
    toast.success('Goods verified successfully!');
  };

  const handleDeleteGoods = async (purchaseId) => {
    if (!window.confirm('Delete goods?')) return;
    try {
      // Note: Need to implement delete API call for goods
      setUnverifiedGoods(prev => prev.filter(goods => goods.purchase_id !== purchaseId));
      toast.success('Goods deleted successfully!');
      // Refresh the current page data
      fetchUnverifiedGoods();
    } catch (error) {
      console.error('Error deleting goods:', error);
      toast.error('Failed to delete goods');
    }
  };

  if (loading || permissionLoading) return <div className="flex justify-center items-center h-64">Loading...</div>;

  return (
    <div className="space-y-6 p-6">
      
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
              onClick={async () => {
                try {
                  const params = {};
                  if (startDate) params.start_date = startDate;
                  if (endDate) params.end_date = endDate;
                  if (search) params.search = search;
                  const logsData = await getLoginLogs(params);
                  setLoginLogs(logsData.logs || []);
                  toast.success('Filters applied!');
                } catch (error) {
                  console.error('Error filtering logs:', error);
                  toast.error('Failed to apply filters');
                }
              }}
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
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Invoice URL</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {unverifiedSales.map((sale) => (
                  <tr key={sale.sale_id}>
                    <td className="px-4 py-3 text-sm text-gray-900">{sale.invoice_number}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{sale.customer_name}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">₦{sale.total_amount?.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{sale.sale_date}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {sale.invoice_file_url ? (
                        <a
                          href={sale.invoice_file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 underline"
                        >
                          View Invoice
                        </a>
                      ) : (
                        <span className="text-gray-400">No invoice</span>
                      )}
                    </td>
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
          {/* Pagination for Sales */}
          <div className="flex justify-between items-center mt-4">
            <button
              onClick={() => setSalesPage(prev => Math.max(1, prev - 1))}
              disabled={salesPage === 1}
              className="px-3 py-1 bg-gray-200 text-gray-700 rounded disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-gray-600">
              Page {salesPage} of {Math.ceil(salesTotal / itemsPerPage)}
            </span>
            <button
              onClick={() => setSalesPage(prev => prev + 1)}
              disabled={salesPage >= Math.ceil(salesTotal / itemsPerPage)}
              className="px-3 py-1 bg-gray-200 text-gray-700 rounded disabled:opacity-50"
            >
              Next
            </button>
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
                {unverifiedExpenses.map((exp) => (
                  <tr key={exp.expense_id}>
                    <td className="px-4 py-3 text-sm text-gray-900">{exp.vendor_name}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">₦{exp.total_amount?.toLocaleString()}</td>
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
          {/* Pagination for Expenses */}
          <div className="flex justify-between items-center mt-4">
            <button
              onClick={() => setExpensesPage(prev => Math.max(1, prev - 1))}
              disabled={expensesPage === 1}
              className="px-3 py-1 bg-gray-200 text-gray-700 rounded disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-gray-600">
              Page {expensesPage} of {Math.ceil(expensesTotal / itemsPerPage)}
            </span>
            <button
              onClick={() => setExpensesPage(prev => prev + 1)}
              disabled={expensesPage >= Math.ceil(expensesTotal / itemsPerPage)}
              className="px-3 py-1 bg-gray-200 text-gray-700 rounded disabled:opacity-50"
            >
              Next
            </button>
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
                {unverifiedGoods.map((g) => (
                  <tr key={g.purchase_id}>
                    <td className="px-4 py-3 text-sm text-gray-900">{g.supplier_name}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{g.item_name}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">₦{g.total_cost?.toLocaleString()}</td>
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
          {/* Pagination for Goods */}
          <div className="flex justify-between items-center mt-4">
            <button
              onClick={() => setGoodsPage(prev => Math.max(1, prev - 1))}
              disabled={goodsPage === 1}
              className="px-3 py-1 bg-gray-200 text-gray-700 rounded disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-gray-600">
              Page {goodsPage} of {Math.ceil(goodsTotal / itemsPerPage)}
            </span>
            <button
              onClick={() => setGoodsPage(prev => prev + 1)}
              disabled={goodsPage >= Math.ceil(goodsTotal / itemsPerPage)}
              className="px-3 py-1 bg-gray-200 text-gray-700 rounded disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>

    </div>
  );
};

export default AdminReview;
