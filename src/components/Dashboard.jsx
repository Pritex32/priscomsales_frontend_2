import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { logout, unlockAdmin, lockAdmin, updateActivity } from '../store/authSlice';
import dashboardService from '../services/dashboardService';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import AdminKeyIcon from './AdminKeyIcon';
import PermissionGate from './PermissionGate';
import { usePermission } from '../hooks/usePermission';

// Import all pages and components
import Restock from '../pages/Restock';
import Expenses from '../pages/Expenses';
import Requisitions from '../pages/Requisitions';
import Sales from './Sales';
import Inventory from './Inventory';
import Report from './Report';
import Settings from './Settings';
import SettingsDebug from './SettingsDebug';
import SalesDebug from './SalesDebug';
import BackendTest from './BackendTest';
import AdminReview from './AdminReview';
import B2BStockMovement from './B2BStockMovement';
import CustomersPage from './CustomersPage';
import VendorListing from './VendorListing';
import VendorAdminDashboard from './VendorAdminDashboard';
import ShopFromWholesalers from './ShopFromWholesalers';
import VendorManagement from './VendorManagement';

const REACT_APP_API_URL = process.env.REACT_APP_API_URL;

const Dashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { page } = useParams();
  const dispatch = useDispatch();
  const { user, role, adminUnlocked } = useSelector(state => state.auth);
  const inactivityTimerRef = useRef(null);
  
  // State management
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [subscription, setSubscription] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showEmployeeForm, setShowEmployeeForm] = useState(false);
  const [showSubscriptionSection, setShowSubscriptionSection] = useState(false);
  const [plans, setPlans] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [employeeForm, setEmployeeForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'employee'
  });
  const [currentEmployeePage, setCurrentEmployeePage] = useState(1);
  const employeesPerPage = 2;

  // Get user info
  const username = user?.username || localStorage.getItem('username') || 'User';
  const userRole = role || localStorage.getItem('role') || 'user';
  const isMD = userRole?.toLowerCase() === 'md';
  
  // Permission check for employee management
  const { hasPermission: canManageEmployees } = usePermission('employees.manage.access');

  // Sidebar menu items with permission requirements
  // WHITELIST: Only Settings, Admin Review, Stock Movement, and Restock require explicit permission
  // All other pages are accessible by default (requirePermission: false)
  const menuItems = [
    { id: 'dashboard', name: 'Dashboard', icon: '🏠', component: null, permission: null, requirePermission: false },
    { id: 'sales', name: 'Sales', icon: '🛒', component: Sales, permission: 'sales', requirePermission: false },
    { id: 'inventory', name: 'Inventory', icon: '📊', component: Inventory, permission: 'inventory', requirePermission: false },
    { id: 'restock', name: 'Restock', icon: '📦', component: Restock, permission: 'restock.page.access', requirePermission: true },
    { id: 'expenses', name: 'Expenses', icon: '💰', component: Expenses, permission: 'expenses', requirePermission: false },
    { id: 'requisitions', name: 'Requisitions', icon: '📋', component: Requisitions, permission: 'requisitions', requirePermission: false },
    { id: 'shop', name: 'Shop', icon: '🛒', component: ShopFromWholesalers, permission: null, requirePermission: false },
    { id: 'customers', name: 'Customers', icon: '👥', component: CustomersPage, permission: 'customers', requirePermission: false },
    { id: 'admin-review', name: 'Admin Review', icon: '👨‍💼', component: AdminReview, permission: 'admin_review.page.access', requirePermission: true },
    { id: 'b2b-movement', name: 'Stock Movement', icon: '📦', component: B2BStockMovement, permission: 'stock_movement.page.access', requirePermission: true },
    { id: 'vendors', name: 'Vendors', icon: '🏢', component: VendorListing, permission: 'vendors', requirePermission: false },
    { id: 'vendor-orders', name: 'Vendor Orders', icon: '🚚', component: VendorManagement, permission: null, requirePermission: false },
    { id: 'settings', name: 'Settings', icon: '⚙️', component: Settings, permission: 'settings.page.access', requirePermission: true },
  ];

  // State for subscription lock
  const [isSubscriptionLocked, setIsSubscriptionLocked] = useState(false);
  
  // Feedback modal state
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackForm, setFeedbackForm] = useState({ name: '', email: '', feedback: '' });
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  
  // Admin unlock state
  const [isDraggingKey, setIsDraggingKey] = useState(false);
  const [dropZoneActive, setDropZoneActive] = useState(false);
  const INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 minutes

  // Check subscription status and lock pages if necessary
  const checkSubscriptionAccess = (subData) => {
    if (!subData) return false;
    
    const { plan, is_active, transaction_count } = subData;
    
    // If plan is 'pro' but not active, treat as free plan
    const effectivePlan = (plan === 'pro' && !is_active) ? 'free' : plan;
    
    // Free plan: check if transaction limit exceeded
    if (effectivePlan === 'free') {
      const transactionsUsed = transaction_count || 0;
      if (transactionsUsed >= 10) {
        setIsSubscriptionLocked(true);
        toast.warning('You have reached the free plan limit. Please upgrade to continue.', {
          autoClose: 5000,
          toastId: 'subscription-limit'
        });
        return true;
      }
    }
    
    // Active Pro plan: no restrictions
    if (plan === 'pro' && is_active) {
      setIsSubscriptionLocked(false);
      return false;
    }
    
    setIsSubscriptionLocked(false);
    return false;
  };

  // Load dashboard data on mount
  useEffect(() => {
    loadDashboardData();
    
    // Check for payment callback
    const params = new URLSearchParams(location.search);
    const reference = params.get('reference');
    if (reference) {
      verifyPaymentCallback(reference);
    }
    
    // Restore admin unlock state from sessionStorage
    if (isMD && sessionStorage.getItem('admin_unlocked') === 'true') {
      dispatch(unlockAdmin());
    }
  }, []);
  
  // Inactivity timeout effect
  useEffect(() => {
    const resetTimer = () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
      
      dispatch(updateActivity());
      
      inactivityTimerRef.current = setTimeout(() => {
        if (adminUnlocked && isMD) {
          dispatch(lockAdmin());
          toast.info('Admin access locked due to inactivity', { autoClose: 3000 });
        }
      }, INACTIVITY_TIMEOUT);
    };
    
    // Activity events
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    
    events.forEach(event => {
      document.addEventListener(event, resetTimer, true);
    });
    
    resetTimer();
    
    return () => {
      events.forEach(event => {
        document.removeEventListener(event, resetTimer, true);
      });
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    };
  }, [adminUnlocked, isMD, dispatch]);

  // Sync current page with route param
  useEffect(() => {
    if (page) {
      // Check if page is in menuItems or is the special vendor-admin page
      if (menuItems.find(m => m.id === page) || page === 'vendor-admin') {
        setCurrentPage(page);
      } else {
        setCurrentPage('dashboard');
      }
    } else {
      setCurrentPage('dashboard');
    }
  }, [page]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // Fetch subscription status
      const subData = await dashboardService.getSubscriptionStatus();
      setSubscription(subData);
      
      // Check if subscription allows access
      checkSubscriptionAccess(subData);
      
      // Fetch dashboard stats
      const statsData = await dashboardService.getDashboardStats();
      setStats(statsData);
      
      // Fetch plans for MD users
      if (isMD) {
        const plansData = await dashboardService.getSubscriptionPlans();
        setPlans(plansData.plans || []);
        
        // Fetch employees
        try {
          const empData = await dashboardService.getEmployees();
          setEmployees(empData.employees || []);
        } catch (err) {
          console.log('Could not fetch employees');
        }
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const verifyPaymentCallback = async (reference) => {
    try {
      const result = await dashboardService.verifyPayment(reference);
      if (result.success) {
        toast.success(result.message);
        // Reload subscription data
        const subData = await dashboardService.getSubscriptionStatus();
        setSubscription(subData);
        
        // Check if subscription allows access
        checkSubscriptionAccess(subData);
        
        // Remove reference from URL
        window.history.replaceState({}, '', '/dashboard');
      }
    } catch (error) {
      toast.error('Payment verification failed');
    }
  };

  const handleEmployeeSubmit = async (e) => {
    e.preventDefault();
    
    if (!employeeForm.name || !employeeForm.email || !employeeForm.password) {
      toast.error('All fields are required');
      return;
    }
    
    try {
      setLoading(true);
      const result = await dashboardService.createEmployee(employeeForm);
      
      if (result.success) {
        toast.success(result.message);
        setEmployeeForm({ name: '', email: '', password: '', role: 'employee' });
        setShowEmployeeForm(false);
        
        // Reload employees list
        const empData = await dashboardService.getEmployees();
        setEmployees(empData.employees || []);
      }
    } catch (error) {
      const message = error.response?.data?.detail || 'Failed to create employee';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = async (planKey) => {
    try {
      setLoading(true);
      const result = await dashboardService.initializePayment(planKey);
      
      if (result.authorization_url) {
        // Redirect to Paystack payment page
        window.location.href = result.authorization_url;
      }
    } catch (error) {
      const message = error.response?.data?.detail || 'Failed to initialize payment';
      toast.error(message);
      setLoading(false);
    }
  };

  const handlePageClick = (pageId) => {
    if (pageId === 'dashboard') {
      navigate('/dashboard');
    } else {
      navigate(`/dashboard/${pageId}`);
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    sessionStorage.clear();
    dispatch(logout());
    navigate('/login');
  };
  
  // Admin unlock handlers
  const handleDropZoneDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropZoneActive(true);
  };
  
  const handleDropZoneDragLeave = (e) => {
    e.preventDefault();
    setDropZoneActive(false);
  };
  
  const handleDropZoneDrop = (e) => {
    e.preventDefault();
    const data = e.dataTransfer.getData('text/plain');
    
    if (data === 'admin-key' && isMD) {
      dispatch(unlockAdmin());
      setDropZoneActive(false);
      setIsDraggingKey(false);
      toast.success('🔓 Vendor Admin Menu Unlocked!', {
        autoClose: 2000,
        position: 'top-center',
      });
    }
  };
  
  
  const handleKeyDragStart = () => {
    setIsDraggingKey(true);
  };
  
  const handleKeyDragEnd = () => {
    setIsDraggingKey(false);
    setDropZoneActive(false);
  };

  // Render plan status badge
  const renderPlanStatus = () => {
    if (!subscription) return null;
    
    const { plan, is_active, expires_at, created_at, transaction_count } = subscription;
    
    // Only show Pro badge if plan is 'pro' AND is_active is true
    if (plan === 'pro' && is_active) {
      const startDate = new Date(created_at || expires_at);
      const expiryDate = new Date(expires_at);
      const today = new Date();
      const daysLeft = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
      
      const formatDate = (date) => date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
      
      return (
        <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-100 to-emerald-100 text-green-800 rounded-lg border border-green-300 shadow-sm">
          <span className="font-semibold">💎 Pro Plan</span>
          <span className="text-sm">— Active until {formatDate(expiryDate)} ({daysLeft} days left)</span>
        </div>
      );
    }
    
    // If plan is 'pro' but not active, OR plan is 'free', show Free Plan badge
    const transactionsLeft = 10 - (transaction_count || 0);
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-100 to-sky-100 text-blue-800 rounded-lg border border-blue-300 shadow-sm">
        <span className="font-semibold">🆓 Free Plan</span>
        <span className="text-sm">— {transactionsLeft > 0 ? `${transactionsLeft} transactions remaining` : 'Limit reached! Upgrade to continue'}</span>
      </div>
    );
  };

  // Render main dashboard content
  const renderDashboardContent = () => {
    return (
      <div className="p-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Dashboard Overview</h1>
        
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
            <h3 className="text-lg font-semibold mb-2 text-gray-700">Total Sales</h3>
            <p className="text-3xl font-bold text-green-600">
              {stats?.total_sales || 0}
            </p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
            <h3 className="text-lg font-semibold mb-2 text-gray-700">Inventory Items</h3>
            <p className="text-3xl font-bold text-blue-600">
              {stats?.inventory_items || 0}
            </p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
            <h3 className="text-lg font-semibold mb-2 text-gray-700">Active Customers</h3>
            <p className="text-3xl font-bold text-purple-600">
              {stats?.active_customers || 0}
            </p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
            <h3 className="text-lg font-semibold mb-2 text-gray-700">Employees</h3>
            <p className="text-3xl font-bold text-orange-600">
              {stats?.employees || 0}
            </p>
          </div>
        </div>

        {/* Employee Management Section - Permission Protected */}
        {canManageEmployees && (
          <>
            {/* Employee Creation Section */}
            <div className="mb-8">
              <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-2xl font-bold text-gray-900">👨‍💼 Employee Management</h2>
                  <button
                    onClick={() => setShowEmployeeForm(!showEmployeeForm)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    {showEmployeeForm ? 'Hide Form' : 'Create Employee'}
                  </button>
                </div>

                {showEmployeeForm && (
                  <form onSubmit={handleEmployeeSubmit} className="bg-gray-50 p-6 rounded-lg border border-gray-300 mb-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Employee Name *
                        </label>
                        <input
                          type="text"
                          value={employeeForm.name}
                          onChange={(e) => setEmployeeForm({...employeeForm, name: e.target.value})}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          placeholder="John Doe"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Email Address *
                        </label>
                        <input
                          type="email"
                          value={employeeForm.email}
                          onChange={(e) => setEmployeeForm({...employeeForm, email: e.target.value})}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          placeholder="john@example.com"
                          required
                        />
                      </div>
                    </div>
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Password *
                      </label>
                      <input
                        type="password"
                        value={employeeForm.password}
                        onChange={(e) => setEmployeeForm({...employeeForm, password: e.target.value})}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="Secure password"
                        required
                      />
                      <p className="text-sm text-gray-500 mt-1">
                        Credentials will be sent to the employee's email
                      </p>
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-400"
                    >
                      {loading ? 'Creating...' : 'Create Employee Account'}
                    </button>
                  </form>
                )}

                {/* Employees List */}
                {employees.length > 0 && (() => {
                  // Pagination logic
                  const totalPages = Math.ceil(employees.length / employeesPerPage);
                  const startIndex = (currentEmployeePage - 1) * employeesPerPage;
                  const endIndex = startIndex + employeesPerPage;
                  const currentEmployees = employees.slice(startIndex, endIndex);
                  
                  return (
                    <div className="mt-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-lg font-semibold">
                          Current Employees <span className="text-sm text-gray-500">({employees.length} total)</span>
                        </h3>
                        <button
                          onClick={() => {
                            // Convert employees data to CSV
                            const headers = ['Name', 'Email', 'Role'];
                            const csvContent = [
                              headers.join(','),
                              ...employees.map(emp => 
                                [emp.name, emp.email, emp.role].join(',')
                              )
                            ].join('\n');
                            
                            // Create and download file
                            const blob = new Blob([csvContent], { type: 'text/csv' });
                            const url = window.URL.createObjectURL(blob);
                            const link = document.createElement('a');
                            link.href = url;
                            link.download = `employees_${new Date().toISOString().split('T')[0]}.csv`;
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                            window.URL.revokeObjectURL(url);
                            toast.success('Employee list downloaded successfully!');
                          }}
                          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 text-sm"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          Download CSV
                        </button>
                      </div>
                      <div className="bg-white border border-gray-300 rounded-lg overflow-hidden">
                        <table className="w-full">
                          <thead className="bg-gray-100">
                            <tr>
                              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Name</th>
                              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Email</th>
                              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Role</th>
                            </tr>
                          </thead>
                          <tbody>
                            {currentEmployees.map((emp, idx) => (
                              <tr key={emp.employee_id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                <td className="px-4 py-3 text-sm text-gray-900">{emp.name}</td>
                                <td className="px-4 py-3 text-sm text-gray-600">{emp.email}</td>
                                <td className="px-4 py-3 text-sm text-gray-600 capitalize">{emp.role}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      
                      {/* Pagination Controls */}
                      {totalPages > 1 && (
                        <div className="flex items-center justify-between mt-4">
                          <p className="text-sm text-gray-600">
                            Showing {startIndex + 1} to {Math.min(endIndex, employees.length)} of {employees.length} employees
                          </p>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setCurrentEmployeePage(prev => Math.max(1, prev - 1))}
                              disabled={currentEmployeePage === 1}
                              className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              Previous
                            </button>
                            
                            <div className="flex items-center gap-1">
                              {[...Array(totalPages)].map((_, idx) => (
                                <button
                                  key={idx + 1}
                                  onClick={() => setCurrentEmployeePage(idx + 1)}
                                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                                    currentEmployeePage === idx + 1
                                      ? 'bg-blue-600 text-white'
                                      : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                                  }`}
                                >
                                  {idx + 1}
                                </button>
                              ))}
                            </div>
                            
                            <button
                              onClick={() => setCurrentEmployeePage(prev => Math.min(totalPages, prev + 1))}
                              disabled={currentEmployeePage === totalPages}
                              className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              Next
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Subscription/Payment Section */}
            {subscription && (subscription.plan === 'free' || (subscription.plan === 'pro' && !subscription.is_active)) && (
              <div className="mb-8">
                <div className="bg-gradient-to-r from-purple-600 to-blue-600 rounded-lg shadow-xl p-8 text-white">
                  <h2 className="text-3xl font-bold mb-3">💎 Upgrade Your Business</h2>
                  <p className="mb-6 text-lg opacity-90">
                    Unlock unlimited features and take your business to the next level
                  </p>
                  
                  <button
                    onClick={() => setShowSubscriptionSection(!showSubscriptionSection)}
                    className="px-6 py-3 bg-white text-purple-700 rounded-lg font-semibold hover:bg-gray-100 transition-colors shadow-lg"
                  >
                    {showSubscriptionSection ? 'Hide Subscription Plans' : 'View Subscription Plans'}
                  </button>

                  {showSubscriptionSection && (
                    <div className="mt-8">
                      {/* Subscription Plans Comparison */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                        {/* Free Plan */}
                        <div className="bg-white text-gray-900 p-6 rounded-xl shadow-2xl border-2 border-gray-200">
                          <div className="text-center mb-4">
                            <h3 className="text-2xl font-bold mb-2">🆓 Free Plan</h3>
                            <p className="text-4xl font-extrabold text-blue-600 mb-2">₦0</p>
                            <p className="text-gray-600 text-sm">Default for new users</p>
                          </div>
                          <div className="border-t border-gray-200 pt-4">
                            <p className="font-semibold text-gray-700 mb-3">Features:</p>
                            <ul className="space-y-2 text-sm">
                              <li className="flex items-start gap-2">
                                <span className="text-green-600 font-bold">✓</span>
                                <span>Maximum 10 transactions</span>
                              </li>
                              <li className="flex items-start gap-2">
                                <span className="text-green-600 font-bold">✓</span>
                                <span>1 employee account only</span>
                              </li>
                              <li className="flex items-start gap-2">
                                <span className="text-red-600 font-bold">✗</span>
                                <span className="text-gray-500">No analytics dashboard</span>
                              </li>
                              <li className="flex items-start gap-2">
                                <span className="text-red-600 font-bold">✗</span>
                                <span className="text-gray-500">No report export</span>
                              </li>
                              <li className="flex items-start gap-2">
                                <span className="text-red-600 font-bold">✗</span>
                                <span className="text-gray-500">No POS/bank integration</span>
                              </li>
                              <li className="flex items-start gap-2">
                                <span className="text-red-600 font-bold">✗</span>
                                <span className="text-gray-500">No inventory auto-restock</span>
                              </li>
                            </ul>
                          </div>
                          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                            <p className="text-xs text-yellow-800 font-medium">
                              ⚠️ After 10 transactions, upgrade to continue
                            </p>
                          </div>
                        </div>

                        {/* Pro Monthly Plan */}
                        <div className="bg-white text-gray-900 p-6 rounded-xl shadow-2xl border-4 border-purple-500 relative transform scale-105">
                          <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                            <span className="bg-purple-500 text-white px-4 py-1 rounded-full text-xs font-bold uppercase">Popular</span>
                          </div>
                          <div className="text-center mb-4">
                            <h3 className="text-2xl font-bold mb-2">💎 Pro Monthly</h3>
                            <p className="text-4xl font-extrabold text-purple-600 mb-2">₦15,000</p>
                            <p className="text-gray-600 text-sm">Per month (30 days)</p>
                          </div>
                          <div className="border-t border-gray-200 pt-4">
                            <p className="font-semibold text-gray-700 mb-3">All Features:</p>
                            <ul className="space-y-2 text-sm">
                              <li className="flex items-start gap-2">
                                <span className="text-green-600 font-bold">✓</span>
                                <span>✅ Unlimited sales & transactions</span>
                              </li>
                              <li className="flex items-start gap-2">
                                <span className="text-green-600 font-bold">✓</span>
                                <span>✅ Unlimited employee accounts</span>
                              </li>
                              <li className="flex items-start gap-2">
                                <span className="text-green-600 font-bold">✓</span>
                                <span>✅ Business analytics dashboard</span>
                              </li>
                              <li className="flex items-start gap-2">
                                <span className="text-green-600 font-bold">✓</span>
                                <span>✅ POS & bank linking (Mono API)</span>
                              </li>
                              <li className="flex items-start gap-2">
                                <span className="text-green-600 font-bold">✓</span>
                                <span>✅ Inventory auto-restock & alerts</span>
                              </li>
                              <li className="flex items-start gap-2">
                                <span className="text-green-600 font-bold">✓</span>
                                <span>✅ Expense tracking</span>
                              </li>
                              <li className="flex items-start gap-2">
                                <span className="text-green-600 font-bold">✓</span>
                                <span>✅ Export reports (PDF, Excel)</span>
                              </li>
                              <li className="flex items-start gap-2">
                                <span className="text-green-600 font-bold">✓</span>
                                <span>✅ Multi-user with role control</span>
                              </li>
                              <li className="flex items-start gap-2">
                                <span className="text-green-600 font-bold">✓</span>
                                <span>✅ Priority customer support</span>
                              </li>
                              <li className="flex items-start gap-2">
                                <span className="text-green-600 font-bold">✓</span>
                                <span>✅ Cloud backup & data sync</span>
                              </li>
                            </ul>
                          </div>
                          <button
                            onClick={() => handleUpgrade('monthly_pro')}
                            disabled={loading}
                            className="w-full mt-4 px-4 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-semibold hover:from-purple-700 hover:to-blue-700 transition-all shadow-lg disabled:opacity-50"
                          >
                            {loading ? 'Processing...' : 'Upgrade to Pro Monthly'}
                          </button>
                        </div>

                        {/* Pro Yearly Plan */}
                        <div className="bg-white text-gray-900 p-6 rounded-xl shadow-2xl border-2 border-gold-400 relative">
                          <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                            <span className="bg-gradient-to-r from-yellow-500 to-orange-500 text-white px-4 py-1 rounded-full text-xs font-bold uppercase">Best Value</span>
                          </div>
                          <div className="text-center mb-4">
                            <h3 className="text-2xl font-bold mb-2">🌟 Pro Yearly</h3>
                            <p className="text-4xl font-extrabold text-orange-600 mb-2">₦180,000</p>
                            <p className="text-gray-600 text-sm">Per year (365 days)</p>
                            <p className="text-green-600 text-xs font-semibold mt-1">Save ₦0 compared to monthly!</p>
                          </div>
                          <div className="border-t border-gray-200 pt-4">
                            <p className="font-semibold text-gray-700 mb-3">All Pro Monthly + Extra:</p>
                            <ul className="space-y-2 text-sm">
                              <li className="flex items-start gap-2">
                                <span className="text-green-600 font-bold">✓</span>
                                <span>🌟 Send receipts via email</span>
                              </li>
                              <li className="flex items-start gap-2">
                                <span className="text-green-600 font-bold">✓</span>
                                <span>🌟 Custom branding (logo on receipts)</span>
                              </li>
                              <li className="flex items-start gap-2">
                                <span className="text-green-600 font-bold">✓</span>
                                <span>🌟 Dedicated account manager</span>
                              </li>
                              <li className="flex items-start gap-2">
                                <span className="text-green-600 font-bold">✓</span>
                                <span>🌟 Premium support response time</span>
                              </li>
                              <li className="flex items-start gap-2">
                                <span className="text-green-600 font-bold">✓</span>
                                <span>🌟 Free updates & new features</span>
                              </li>
                            </ul>
                            <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                              <p className="text-xs text-green-800 font-medium">
                                ✅ All Pro Monthly features included
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleUpgrade('yearly')}
                            disabled={loading}
                            className="w-full mt-4 px-4 py-3 bg-gradient-to-r from-yellow-500 to-orange-500 text-white rounded-lg font-semibold hover:from-yellow-600 hover:to-orange-600 transition-all shadow-lg disabled:opacity-50"
                          >
                            {loading ? 'Processing...' : 'Upgrade to Pro Yearly'}
                          </button>
                        </div>
                      </div>

                      {/* Additional Info */}
                      <div className="bg-white/20 backdrop-blur border border-white/30 rounded-lg p-6">
                        <h4 className="font-bold text-xl mb-3">🔒 Secure Payment via Paystack</h4>
                        <p className="text-sm opacity-90 mb-3">
                          All payments are processed securely through Paystack. Your subscription activates immediately after payment confirmation.
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                          <div className="flex items-start gap-2">
                            <span>📌</span>
                            <span>Subscription auto-renews unless cancelled</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <span>📌</span>
                            <span>Access locked after expiry until renewed</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <span>📌</span>
                            <span>Contact support for any billing issues</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <span>📌</span>
                            <span>Upgrade or downgrade anytime</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* Quick Access Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {menuItems.slice(1).map((item) => (
            <div
              key={item.id}
              onClick={() => handlePageClick(item.id)}
              className="bg-white p-6 rounded-lg shadow-md hover:shadow-xl transition-all cursor-pointer border border-gray-200 hover:border-blue-400"
            >
              <div className="text-4xl mb-3">{item.icon}</div>
              <h3 className="text-xl font-semibold text-gray-900 mb-1">{item.name}</h3>
              <p className="text-gray-600 text-sm">Access {item.name.toLowerCase()}</p>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Render subscription lock screen
  const renderSubscriptionLockScreen = () => {
    const { plan, is_active, transaction_count } = subscription || {};
    
    // Determine effective plan (expired pro = free)
    const effectivePlan = (plan === 'pro' && !is_active) ? 'free' : plan;
    const isLimitReached = (transaction_count || 0) >= 10;
    
    return (
      <div className="p-6 min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="max-w-3xl w-full">
          <div className="bg-white rounded-2xl shadow-2xl p-8 border-4 border-red-500">
            <div className="text-center mb-6">
              <div className="text-6xl mb-4">🔒</div>
              <h1 className="text-3xl font-bold text-gray-900 mb-3">
                Free Plan Limit Reached
              </h1>
              <p className="text-lg text-gray-600">
                You've used all {transaction_count || 10} free transactions. Upgrade to Pro to continue using PriscomSales.
              </p>
            </div>
            
            <div className="bg-yellow-50 border-2 border-yellow-400 rounded-lg p-6 mb-6">
              <h3 className="font-bold text-lg text-yellow-900 mb-2">⚠️ Access Restricted</h3>
              <p className="text-sm text-yellow-800">
                All features are currently locked. To continue managing your business with PriscomSales, please upgrade to a Pro plan.
              </p>
            </div>
            
            <div className="space-y-4 mb-6">
              <h3 className="font-bold text-xl text-gray-900">What you're missing:</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="flex items-start gap-2 text-sm">
                  <span className="text-red-600">❌</span>
                  <span>Sales & transaction management</span>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <span className="text-red-600">❌</span>
                  <span>Inventory tracking & restocking</span>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <span className="text-red-600">❌</span>
                  <span>Expense tracking & reports</span>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <span className="text-red-600">❌</span>
                  <span>Customer database access</span>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <span className="text-red-600">❌</span>
                  <span>Analytics dashboard</span>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <span className="text-red-600">❌</span>
                  <span>Export & print features</span>
                </div>
              </div>
            </div>
            
            {isMD ? (
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => {
                    setCurrentPage('dashboard');
                    navigate('/dashboard');
                    setTimeout(() => setShowSubscriptionSection(true), 100);
                  }}
                  className="flex-1 px-6 py-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl font-bold hover:from-purple-700 hover:to-blue-700 transition-all shadow-lg text-lg"
                >
                  💎 Upgrade to Pro Now
                </button>
                <button
                  onClick={() => {
                    setCurrentPage('dashboard');
                    navigate('/dashboard');
                  }}
                  className="px-6 py-4 bg-gray-200 text-gray-800 rounded-xl font-semibold hover:bg-gray-300 transition-all"
                >
                  View Dashboard
                </button>
              </div>
            ) : (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800 text-center">
                  💬 Please contact your Managing Director (MD) to upgrade the subscription.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderCurrentPage = () => {
    // If subscription is locked and not on dashboard page, show lock screen
    if (isSubscriptionLocked && currentPage !== 'dashboard') {
      return renderSubscriptionLockScreen();
    }
    
    if (currentPage === 'dashboard') {
      return renderDashboardContent();
    }
    
    // Handle vendor admin specially
    if (currentPage === 'vendor-admin') {
      if (!isMD || !adminUnlocked) {
        return (
          <div className="p-6">
            <h1 className="text-2xl font-bold mb-4 text-red-600">🚫 Access Denied</h1>
            <p>You do not have permission to access this page. Please unlock the admin menu first.</p>
          </div>
        );
      }
      const Component = VendorAdminDashboard;
      return <Component />;
    }
    
    const currentItem = menuItems.find(item => item.id === currentPage);
    if (currentItem && currentItem.component) {
      const Component = currentItem.component;
      
      // Wrap with PermissionGate - only restricts if requirePermission is true
      if (currentItem.permission) {
        return (
          <PermissionGate 
            resourceKey={currentItem.permission}
            requirePermission={currentItem.requirePermission}
          >
            <Component />
          </PermissionGate>
        );
      }
      
      return <Component />;
    }
    
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">{currentItem?.name || 'Page Not Found'}</h1>
        <p>This page is under development.</p>
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-gray-100">
      <ToastContainer position="top-right" autoClose={3000} />
      
      {/* Admin Key Icon - Only visible for MD when admin not unlocked */}
      {isMD && !adminUnlocked && (
        <AdminKeyIcon 
          isMD={isMD} 
          onDragStart={handleKeyDragStart}
          onDragEnd={handleKeyDragEnd}
        />
      )}
      
      {/* Sidebar */}
      <div className={`${sidebarOpen ? 'w-64' : 'w-16'} bg-white shadow-lg transition-all duration-300`}>
        <div className="p-4 border-b">
          <div className="flex items-center justify-between">
            <h1 className={`font-bold text-xl text-gray-800 ${!sidebarOpen && 'hidden'}`}>
              PriscomSales
            </h1>
            <div className="flex items-center space-x-2">
              <button
                onClick={handleLogout}
                className="p-2 rounded-lg hover:bg-red-100 text-red-600 hover:text-red-800 transition-colors"
                title="Logout"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-2 rounded-lg hover:bg-gray-100"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <nav className="mt-4 flex-1">
          {/* Hidden Admin Drop Zone */}
          {isMD && !adminUnlocked && (
            <div
              onDragOver={handleDropZoneDragOver}
              onDragLeave={handleDropZoneDragLeave}
              onDrop={handleDropZoneDrop}
              className={`w-full h-12 transition-all duration-300 ${
                dropZoneActive 
                  ? 'bg-gradient-to-r from-yellow-100 to-orange-100 border-2 border-dashed border-yellow-500' 
                  : 'bg-transparent border-2 border-transparent'
              }`}
              title={dropZoneActive ? 'Drop key here to unlock admin' : ''}
            >
              {dropZoneActive && sidebarOpen && (
                <div className="flex items-center justify-center h-full text-yellow-700 text-sm font-semibold animate-pulse">
                  🔓 Drop Key Here
                </div>
              )}
            </div>
          )}
          
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handlePageClick(item.id)}
              className={`w-full flex items-center px-4 py-3 text-left hover:bg-gray-50 transition-colors ${
                currentPage === item.id ? 'bg-blue-50 border-r-4 border-blue-500 text-blue-700' : 'text-gray-700'
              }`}
            >
              <span className="text-xl mr-3">{item.icon}</span>
              {sidebarOpen && <span className="font-medium">{item.name}</span>}
            </button>
          ))}
          
          {/* Vendor Admin - Only visible when unlocked */}
          {isMD && adminUnlocked && (
            <button
              onClick={() => handlePageClick('vendor-admin')}
              className={`w-full flex items-center px-4 py-3 text-left hover:bg-gray-50 transition-colors border-l-4 border-yellow-500 bg-gradient-to-r from-yellow-50 to-orange-50 ${
                currentPage === 'vendor-admin' ? 'bg-blue-50 border-r-4 border-blue-500 text-blue-700' : 'text-gray-700'
              }`}
            >
              <span className="text-xl mr-3">🔐</span>
              {sidebarOpen && <span className="font-medium">Vendor Admin</span>}
            </button>
          )}
        </nav>

        {/* User Info */}
        <div className="border-t p-4">
          <div className={`${!sidebarOpen && 'hidden'}`}>
            <p className="text-sm font-medium text-gray-900">{username}</p>
            <p className="text-xs text-gray-500 capitalize">{userRole}</p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        {/* Top Header Bar */}
        <div className="bg-white shadow-sm border-b px-6 py-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <h2 className="text-2xl font-semibold text-gray-900">
                {menuItems.find(item => item.id === currentPage)?.name || 'Dashboard'}
              </h2>
            </div>
            
            {/* Plan Status Badge and Actions */}
            <div className="flex items-center gap-3">
              {renderPlanStatus()}
              <button
                onClick={() => setShowFeedbackModal(true)}
                className="px-4 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-all shadow-md hover:shadow-lg flex items-center gap-2"
                title="Send us your feedback"
              >
                <span>💬</span>
                <span>Feedback</span>
              </button>
              {subscription && (subscription.plan === 'free' || (subscription.plan === 'pro' && !subscription.is_active)) && isMD && (
                <button
                  onClick={() => {
                    handlePageClick('dashboard');
                    setTimeout(() => setShowSubscriptionSection(true), 100);
                  }}
                  className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-semibold hover:from-purple-700 hover:to-blue-700 transition-all shadow-md hover:shadow-lg flex items-center gap-2"
                >
                  <span>⭐</span>
                  <span>Upgrade Now</span>
                </button>
              )}
              <span className="text-sm text-gray-600">
                Welcome, <span className="font-semibold">{username}</span>
              </span>
            </div>
          </div>
        </div>
        
        {/* Page Content */}
        <div className="p-0">
          {loading && currentPage === 'dashboard' ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            renderCurrentPage()
          )}
        </div>
      </div>
      
      {/* Feedback Modal */}
      {showFeedbackModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">💬 Send Feedback</h2>
                <button 
                  onClick={() => setShowFeedbackModal(false)} 
                  className="text-gray-500 hover:text-gray-700 text-2xl"
                >
                  ×
                </button>
              </div>
              
              <form onSubmit={async (e) => {
                e.preventDefault();
                setFeedbackLoading(true);
                
                try {
                  // Get user_id from Redux state or localStorage
                  const userId = user?.user_id || user?.id || localStorage.getItem('user_id');
                  
                  const response = await fetch(`${REACT_APP_API_URL}/feedback`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${localStorage.getItem('login_token')}`
                    },
                    body: JSON.stringify({
                      name: feedbackForm.name,
                      email: feedbackForm.email,
                      feedback: feedbackForm.feedback,
                      user_id: userId ? parseInt(userId) : null
                    })
                  });
                  
                  if (response.ok) {
                    toast.success('Thank you for your feedback!');
                    setShowFeedbackModal(false);
                    setFeedbackForm({ name: '', email: '', feedback: '' });
                  } else {
                    toast.error('Failed to submit feedback');
                  }
                } catch (error) {
                  toast.error('Error submitting feedback');
                } finally {
                  setFeedbackLoading(false);
                }
              }}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Your Name *</label>
                    <input
                      type="text"
                      value={feedbackForm.name}
                      onChange={(e) => setFeedbackForm({...feedbackForm, name: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      placeholder="John Doe"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Your Email *</label>
                    <input
                      type="email"
                      value={feedbackForm.email}
                      onChange={(e) => setFeedbackForm({...feedbackForm, email: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      placeholder="john@example.com"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Your Feedback *</label>
                    <textarea
                      value={feedbackForm.feedback}
                      onChange={(e) => setFeedbackForm({...feedbackForm, feedback: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      placeholder="Tell us what you think..."
                      rows="4"
                      required
                    />
                  </div>
                </div>
                
                <div className="flex gap-3 mt-6">
                  <button
                    type="submit"
                    disabled={feedbackLoading}
                    className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {feedbackLoading ? 'Submitting...' : 'Submit Feedback'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowFeedbackModal(false)}
                    className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
