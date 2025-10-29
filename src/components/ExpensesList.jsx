import React, { useState, useEffect } from 'react';
import {
  Receipt,
  Filter,
  Search,
  Plus,
  Edit3,
  Trash2,
  DollarSign,
  Calendar,
  User,
  FileText,
  CreditCard,
  AlertCircle,
  CheckCircle,
  Clock,
  Eye
} from 'lucide-react';
import { expensesApi } from '../services/expensesApi';

const ExpensesList = ({ onCreateNew, onEdit, onAddPayment }) => {
  const [expenses, setExpenses] = useState([]);
  const [pendingExpenses, setPendingExpenses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'pending'

  // Fetch all expenses
  const fetchExpenses = async () => {
    setLoading(true);
    setError('');
    try {
      const skip = (currentPage - 1) * itemsPerPage;
      const response = await expensesApi.getExpenses(skip, itemsPerPage);
      // Backend returns {data: [...], total, skip, limit, has_more}
      setExpenses(response.data?.data || []);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to fetch expenses');
    } finally {
      setLoading(false);
    }
  };

  // Fetch pending expenses
  const fetchPendingExpenses = async () => {
    try {
      const response = await expensesApi.getPendingExpenses();
      // Backend returns {data: [...], total, skip, limit, has_more}
      setPendingExpenses(response.data?.data || []);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to fetch pending expenses');
    }
  };

  // Fetch expenses in date range
  const fetchExpensesInRange = async () => {
    if (!dateRange.start || !dateRange.end) {
      fetchExpenses();
      return;
    }

    setLoading(true);
    try {
      const response = await expensesApi.getExpensesInRange(dateRange.start, dateRange.end);
      setExpenses(response.data || []);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to fetch expenses in range');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExpenses();
    fetchPendingExpenses();
  }, [currentPage]);

  // Filter expenses locally
  const filterExpenses = (expenseList) => {
    let filtered = expenseList;

    if (searchTerm) {
      filtered = filtered.filter(expense =>
        expense.vendor_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        expense.invoice_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        expense.notes?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        expense.employee_name?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (statusFilter) {
      filtered = filtered.filter(expense => expense.payment_status === statusFilter);
    }

    return filtered;
  };

  // Delete expense
  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this expense?')) return;

    try {
      await expensesApi.deleteExpense(id);
      fetchExpenses();
      fetchPendingExpenses();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to delete expense');
    }
  };

  // Get status badge color
  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'paid': return 'bg-green-100 text-green-800';
      case 'credit': return 'bg-red-100 text-red-800';
      case 'partial': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Get status icon
  const getStatusIcon = (status) => {
    switch (status?.toLowerCase()) {
      case 'paid': return <CheckCircle className="w-4 h-4" />;
      case 'credit': return <AlertCircle className="w-4 h-4" />;
      case 'partial': return <Clock className="w-4 h-4" />;
      default: return <Eye className="w-4 h-4" />;
    }
  };

  const currentExpenses = activeTab === 'pending' ? filterExpenses(pendingExpenses) : filterExpenses(expenses);
  const safeCurrentExpenses = Array.isArray(currentExpenses) ? currentExpenses : [];
  const totalPages = Math.ceil(safeCurrentExpenses.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedExpenses = safeCurrentExpenses.slice(startIndex, endIndex);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Receipt className="w-7 h-7 text-green-600" />
              Expenses
            </h1>
            <p className="text-gray-600 mt-1">Manage business expenses and payments</p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <Filter className="w-4 h-4" />
              Filters
            </button>

            <button
              onClick={onCreateNew}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Expense
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-4 mt-6 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('all')}
            className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'all'
                ? 'border-green-500 text-green-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            All Expenses ({expenses.length})
          </button>
          <button
            onClick={() => setActiveTab('pending')}
            className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'pending'
                ? 'border-green-500 text-green-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Pending Payments ({pendingExpenses.length})
          </button>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="mt-6 p-4 bg-gray-50 rounded-lg border">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Search
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search expenses..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Payment Status
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                >
                  <option value="">All Statuses</option>
                  <option value="paid">Paid</option>
                  <option value="credit">Credit</option>
                  <option value="partial">Partial</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={dateRange.start}
                  onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  value={dateRange.end}
                  onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 mt-4">
              <button
                onClick={fetchExpensesInRange}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm transition-colors"
              >
                Apply Filters
              </button>
              <button
                onClick={() => {
                  setSearchTerm('');
                  setDateRange({ start: '', end: '' });
                  setStatusFilter('');
                  fetchExpenses();
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 text-sm transition-colors"
              >
                Clear All
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Expenses Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-gray-600">Loading expenses...</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Date & Vendor
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Invoice
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Payment Info
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Employee
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {paginatedExpenses.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="px-6 py-12 text-center text-gray-500">
                        <Receipt className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <p className="text-lg font-medium text-gray-900 mb-2">No expenses found</p>
                        <p className="text-gray-600">Get started by adding your first expense</p>
                      </td>
                    </tr>
                  ) : (
                    paginatedExpenses.map((expense) => (
                      <tr key={expense.expense_id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {expense.vendor_name}
                            </div>
                            <div className="text-sm text-gray-500 flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {new Date(expense.expense_date).toLocaleDateString()}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {expense.invoice_number || '-'}
                          </div>
                          {expense.invoice_file_url && (
                            <a
                              href={expense.invoice_file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                            >
                              <FileText className="w-3 h-3" />
                              View File
                            </a>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            ₦{Number(expense.total_amount || 0).toLocaleString()}
                          </div>
                          <div className="text-sm text-gray-500">
                            Paid: ₦{Number(expense.amount_paid || 0).toLocaleString()}
                          </div>
                          {expense.amount_balance > 0 && (
                            <div className="text-sm text-red-600">
                              Balance: ₦{Number(expense.amount_balance).toLocaleString()}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900 flex items-center gap-1">
                            <CreditCard className="w-3 h-3" />
                            {expense.payment_method}
                          </div>
                          {expense.due_date && (
                            <div className="text-sm text-gray-500">
                              Due: {new Date(expense.due_date).toLocaleDateString()}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(expense.payment_status)}`}>
                            {getStatusIcon(expense.payment_status)}
                            {expense.payment_status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900 flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {expense.employee_name || 'Unknown'}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex items-center justify-end gap-2">
                            {expense.payment_status !== 'paid' && (
                              <button
                                onClick={() => onAddPayment(expense)}
                                className="text-green-600 hover:text-green-900 p-1 hover:bg-green-50 rounded transition-colors"
                                title="Add Payment"
                              >
                                <DollarSign className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => onEdit(expense)}
                              className="text-blue-600 hover:text-blue-900 p-1 hover:bg-blue-50 rounded transition-colors"
                              title="Edit Expense"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(expense.expense_id)}
                              className="text-red-600 hover:text-red-900 p-1 hover:bg-red-50 rounded transition-colors"
                              title="Delete Expense"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex-1 flex justify-between sm:hidden">
                    <button
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                      className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                      disabled={currentPage === totalPages}
                      className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                  <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm text-gray-700">
                        Showing <span className="font-medium">{startIndex + 1}</span> to{' '}
                        <span className="font-medium">{Math.min(endIndex, safeCurrentExpenses.length)}</span> of{' '}
                        <span className="font-medium">{safeCurrentExpenses.length}</span> results
                      </p>
                    </div>
                    <div>
                      <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                        <button
                          onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                          disabled={currentPage === 1}
                          className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Previous
                        </button>
                        {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                          const page = i + 1;
                          return (
                            <button
                              key={page}
                              onClick={() => setCurrentPage(page)}
                              className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                                page === currentPage
                                  ? 'z-10 bg-green-50 border-green-500 text-green-600'
                                  : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                              }`}
                            >
                              {page}
                            </button>
                          );
                        })}
                        <button
                          onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                          disabled={currentPage === totalPages}
                          className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Next
                        </button>
                      </nav>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ExpensesList;
