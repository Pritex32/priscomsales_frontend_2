import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { 
  Store, Package, CheckCircle, XCircle, Clock, Search, 
  Eye, Phone, MapPin, Calendar, AlertCircle, FileText,
  Trash2, ChevronLeft, ChevronRight, Lock, Home
} from 'lucide-react';
import api from '../services/api';

const VendorAdminDashboard = () => {
  const navigate = useNavigate();
  const { user, role } = useSelector(state => state.auth);
  const [activeTab, setActiveTab] = useState('vendors');
  // Disputes
  const [showDisputesModal, setShowDisputesModal] = useState(false);
  const [disputes, setDisputes] = useState([]);
  const [vendorSearchQuery, setVendorSearchQuery] = useState('');
  const [vendorSuggestions, setVendorSuggestions] = useState([]);
  const [selectedDispute, setSelectedDispute] = useState(null);
  const [pendingVendors, setPendingVendors] = useState([]);
  const [pendingProducts, setPendingProducts] = useState([]);
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
  const [rejectType, setRejectType] = useState('');
  const [rejectId, setRejectId] = useState(null);
  const [deleteProductId, setDeleteProductId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({
    totalPendingVendors: 0,
    totalPendingProducts: 0,
    approvedToday: 0,
    rejectedToday: 0
  });

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // Access code authentication
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [accessCode, setAccessCode] = useState('');
  const ACCESS_CODE = 'y7$Tq9vR!m4B#xZ2pL8wHs6k';

  const handleLogin = () => {
    if (accessCode === ACCESS_CODE) {
      setIsAuthenticated(true);
      toast.success('Access granted. Welcome Admin ✅');
      fetchPendingVendors();
      fetchPendingProducts();
    } else {
      toast.error('❌ Invalid access code');
    }
  };

  const fetchPendingVendors = async () => {
    try {
      setLoading(true);
      const response = await api.get('/vendors/pending');
      setPendingVendors(response.data);
      setStats(prev => ({ ...prev, totalPendingVendors: response.data.length }));
    } catch (error) {
      toast.error('Failed to fetch pending vendors');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPendingProducts = async () => {
    try {
      setLoading(true);
      const response = await api.get('/vendors/products/pending');
      setPendingProducts(response.data);
      setStats(prev => ({ ...prev, totalPendingProducts: response.data.length }));
    } catch (error) {
      toast.error('Failed to fetch pending products');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveVendor = async (vendorId) => {
    try {
      setLoading(true);
      const response = await api.put(`/vendors/${vendorId}/approve`);
      toast.success(`Vendor approved! Access code: ${response.data.access_code}`);
      fetchPendingVendors();
      setStats(prev => ({ ...prev, approvedToday: prev.approvedToday + 1 }));
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to approve vendor');
    } finally {
      setLoading(false);
    }
  };

  const handleRejectVendor = async () => {
    if (!rejectReason.trim()) {
      toast.error('Please provide a rejection reason');
      return;
    }
    try {
      setLoading(true);
      const formData = new FormData();
      formData.append('reason', rejectReason);
      await api.put(`/vendors/${rejectId}/reject`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.success('Vendor rejected');
      fetchPendingVendors();
      setIsRejectModalOpen(false);
      setRejectReason('');
      setStats(prev => ({ ...prev, rejectedToday: prev.rejectedToday + 1 }));
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to reject vendor');
    } finally {
      setLoading(false);
    }
  };

  const handleApproveProduct = async (productId) => {
    try {
      setLoading(true);
      await api.put(`/vendors/products/${productId}/approve`);
      toast.success('Product approved successfully');
      fetchPendingProducts();
      setStats(prev => ({ ...prev, approvedToday: prev.approvedToday + 1 }));
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to approve product');
    } finally {
      setLoading(false);
    }
  };

  const handleRejectProduct = async () => {
    if (!rejectReason.trim()) {
      toast.error('Please provide a rejection reason');
      return;
    }
    try {
      setLoading(true);
      const formData = new FormData();
      formData.append('reason', rejectReason);
      await api.put(`/vendors/products/${rejectId}/reject`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.success('Product rejected');
      fetchPendingProducts();
      setIsRejectModalOpen(false);
      setRejectReason('');
      setStats(prev => ({ ...prev, rejectedToday: prev.rejectedToday + 1 }));
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to reject product');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProduct = async () => {
    if (!deleteReason.trim()) {
      toast.error('Please provide a reason for deletion');
      return;
    }
    try {
      setLoading(true);
      const formData = new FormData();
      formData.append('reason', deleteReason);
      await api.delete(`/vendors/products/${deleteProductId}`, {
        data: formData,
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.success('Product deleted successfully');
      fetchPendingProducts();
      setIsDeleteModalOpen(false);
      setDeleteReason('');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete product');
    } finally {
      setLoading(false);
    }
  };
  // Fetch all disputes
  const fetchDisputes = async () => {
    try {
      const response = await api.get('/shop/admin/disputes');
      setDisputes(response.data.disputes || []);
    } catch (error) {
      toast.error('Failed to fetch disputes');
      console.error(error);
    }
  };

  // Search vendors
  const searchVendors = async (query) => {
    if (query.length < 2) {
      setVendorSuggestions([]);
      return;
    }
    
    try {
      const response = await api.get('/shop/admin/vendors/search', {
        params: { query }
      });
      setVendorSuggestions(response.data.vendors || []);
    } catch (error) {
      console.error('Failed to search vendors:', error);
    }
  };

  // Resolve dispute
  const handleResolveDispute = async (disputeId) => {
    try {
      setLoading(true);
      await api.put(`/shop/admin/disputes/${disputeId}/resolve`);
      toast.success('Dispute resolved successfully');
      fetchDisputes();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to resolve dispute');
    } finally {
      setLoading(false);
    }
  };

  const openRejectModal = (type, id) => {
    setRejectType(type);
    setRejectId(id);
    setRejectReason('');
    setIsRejectModalOpen(true);
  };

  const openDeleteModal = (productId) => {
    setDeleteProductId(productId);
    setDeleteReason('');
    setIsDeleteModalOpen(true);
  };

  const handleViewVendor = (vendor) => {
    setSelectedVendor(vendor);
    setIsViewModalOpen(true);
  };

  const handleViewProduct = (product) => {
    setSelectedProduct(product);
    setIsProductModalOpen(true);
  };

  // Filter vendors and products based on search
  const filteredVendors = pendingVendors.filter(vendor =>
    vendor.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    vendor.vendor_phone?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    vendor.category?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredProducts = pendingProducts.filter(product =>
    product.product_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    product.category?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Pagination logic
  const getCurrentPageItems = (items) => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return items.slice(startIndex, endIndex);
  };

  const totalPages = activeTab === 'vendors' 
    ? Math.ceil(filteredVendors.length / itemsPerPage)
    : Math.ceil(filteredProducts.length / itemsPerPage);

  const handlePreviousPage = () => {
    if (currentPage > 1) setCurrentPage(currentPage - 1);
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) setCurrentPage(currentPage + 1);
  };

  // Reset pagination when switching tabs
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchQuery]);

  // Stats Card Component
  const StatsCard = ({ title, value, icon: Icon, color }) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600 mb-1">{title}</p>
          <h3 className="text-3xl font-bold text-gray-900">{value}</h3>
        </div>
        <div className={`p-4 rounded-full ${color}`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
    </div>
  );

  // Render Pending Vendors Tab
  const renderPendingVendorsTab = () => {
    const pageVendors = getCurrentPageItems(filteredVendors);

    return (
      <div className="space-y-6">
        {loading && (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          </div>
        )}
        
        {!loading && filteredVendors.length === 0 && (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <Store className="w-16 h-16 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Pending Vendors</h3>
            <p className="text-gray-500">All vendor applications have been processed</p>
          </div>
        )}

        <div className="space-y-4">
          {pageVendors.map((vendor) => (
            <div key={vendor.vendor_id} className="bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-all p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="bg-indigo-100 p-2 rounded-lg">
                    <Store className="w-6 h-6 text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">{vendor.name}</h3>
                    <p className="text-sm text-gray-600">{vendor.category}</p>
                  </div>
                </div>
                <span className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-xs font-semibold flex items-center">
                  <Clock className="w-3 h-3 mr-1" />
                  Pending
                </span>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="flex items-center space-x-2">
                  <Phone className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-700">{vendor.vendor_phone}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <MapPin className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-700">{vendor.location}</span>
                </div>
              </div>
              
              <p className="text-sm text-gray-600 mb-4 line-clamp-2">{vendor.description}</p>
              
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleViewVendor(vendor)}
                  className="flex-1 flex items-center justify-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
                >
                  <Eye className="w-4 h-4 mr-2" />
                  View Details
                </button>
                <button
                  onClick={() => handleApproveVendor(vendor.vendor_id)}
                  disabled={loading}
                  className="flex-1 flex items-center justify-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50"
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Approve
                </button>
                <button
                  onClick={() => openRejectModal('vendor', vendor.vendor_id)}
                  disabled={loading}
                  className="flex items-center justify-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Pagination */}
        {filteredVendors.length > itemsPerPage && (
          <div className="flex items-center justify-between bg-white rounded-lg p-4 border border-gray-200">
            <button
              onClick={handlePreviousPage}
              disabled={currentPage === 1}
              className="flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Previous
            </button>
            <span className="text-sm text-gray-600">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={handleNextPage}
              disabled={currentPage === totalPages}
              className="flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
              <ChevronRight className="w-4 h-4 ml-1" />
            </button>
          </div>
        )}
      </div>
    );
  };

  // Render Pending Products Tab
  const renderPendingProductsTab = () => {
    const pageProducts = getCurrentPageItems(filteredProducts);

    return (
      <div className="space-y-6">
        {loading && (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          </div>
        )}
        
        {!loading && filteredProducts.length === 0 && (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <Package className="w-16 h-16 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Pending Products</h3>
            <p className="text-gray-500">All product submissions have been reviewed</p>
          </div>
        )}

        <div className="space-y-4">
          {pageProducts.map((product) => (
            <div key={product.id} className="bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-all overflow-hidden">
              <div className="flex">
                <div className="w-48 h-48 bg-gray-200 flex items-center justify-center">
                  {product.product_images && product.product_images.length > 0 ? (
                    <img
                      src={product.product_images[0]}
                      alt={product.product_name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.target.src = 'https://via.placeholder.com/200x200?text=No+Image';
                      }}
                    />
                  ) : (
                    <Package className="w-16 h-16 text-gray-400" />
                  )}
                </div>
                
                <div className="flex-1 p-6">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h4 className="text-xl font-bold text-gray-900">{product.product_name}</h4>
                      <p className="text-sm text-gray-600">{product.category}</p>
                    </div>
                    <span className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-xs font-semibold">
                      Pending
                    </span>
                  </div>
                  
                  <p className="text-sm text-gray-600 mb-3 line-clamp-2">{product.product_description}</p>
                  
                  <div className="flex items-center space-x-6 mb-4">
                    <div>
                      <p className="text-xs text-gray-500">Price</p>
                      <p className="text-lg font-bold text-indigo-600">₦{product.price?.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Stock</p>
                      <p className="text-lg font-bold text-gray-900">{product.stock_quantity}</p>
                    </div>
                    {product.nafdac_number && (
                      <div>
                        <p className="text-xs text-gray-500">NAFDAC</p>
                        <p className="text-sm font-medium text-gray-900">{product.nafdac_number}</p>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleViewProduct(product)}
                      className="flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      View
                    </button>
                    <button
                      onClick={() => handleApproveProduct(product.id)}
                      disabled={loading}
                      className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium disabled:opacity-50"
                    >
                      <CheckCircle className="w-4 h-4 mr-1" />
                      Approve
                    </button>
                    <button
                      onClick={() => openRejectModal('product', product.id)}
                      disabled={loading}
                      className="flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4 mr-1" />
                      Reject
                    </button>
                    <button
                      onClick={() => openDeleteModal(product.id)}
                      disabled={loading}
                      className="flex items-center px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Pagination */}
        {filteredProducts.length > itemsPerPage && (
          <div className="flex items-center justify-between bg-white rounded-lg p-4 border border-gray-200">
            <button
              onClick={handlePreviousPage}
              disabled={currentPage === 1}
              className="flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Previous
            </button>
            <span className="text-sm text-gray-600">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={handleNextPage}
              disabled={currentPage === totalPages}
              className="flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
              <ChevronRight className="w-4 h-4 ml-1" />
            </button>
          </div>
        )}
      </div>
    );
  };

  // Show access code form if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8 max-w-md w-full">
          <div className="flex items-center justify-center mb-6">
            <div className="p-4 bg-indigo-100 rounded-full">
              <Lock className="w-12 h-12 text-indigo-600" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-center text-gray-900 mb-2">Admin Access Required</h2>
          <p className="text-center text-gray-600 mb-6">Enter the admin access code to continue</p>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                🔐 Access Code
              </label>
              <input
                type="password"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="Enter admin access code"
              />
            </div>
            <button
              onClick={handleLogin}
              className="w-full px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium flex items-center justify-center"
            >
              <Lock className="w-5 h-5 mr-2" />
              Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatsCard
          title="Pending Vendors"
          value={stats.totalPendingVendors}
          icon={Clock}
          color="bg-yellow-500"
        />
        <StatsCard
          title="Pending Products"
          value={stats.totalPendingProducts}
          icon={Package}
          color="bg-orange-500"
        />
        <StatsCard
          title="Approved Today"
          value={stats.approvedToday}
          icon={CheckCircle}
          color="bg-green-500"
        />
        <StatsCard
          title="Rejected Today"
          value={stats.rejectedToday}
          icon={XCircle}
          color="bg-red-500"
        />
      </div>

      {/* Search Bar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        <div className="flex items-center space-x-3">
          <Search className="w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search vendors or products..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 outline-none text-gray-700 placeholder-gray-400"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6">
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('vendors')}
            className={`flex-1 px-6 py-4 text-center font-medium transition-colors ${
              activeTab === 'vendors'
                ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center justify-center space-x-2">
              <Clock className="w-5 h-5" />
              <span>Pending Vendors</span>
              {stats.totalPendingVendors > 0 && (
                <span className="bg-yellow-400 text-yellow-900 px-2 py-0.5 rounded-full text-xs font-semibold">
                  {stats.totalPendingVendors}
                </span>
              )}
            </div>
          </button>
          <button
            onClick={() => setActiveTab('products')}
            className={`flex-1 px-6 py-4 text-center font-medium transition-colors ${
              activeTab === 'products'
                ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center justify-center space-x-2">
              <Package className="w-5 h-5" />
              <span>Pending Products</span>
              {stats.totalPendingProducts > 0 && (
                <span className="bg-orange-400 text-orange-900 px-2 py-0.5 rounded-full text-xs font-semibold">
                  {stats.totalPendingProducts}
                </span>
              )}
            </div>
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'vendors' && renderPendingVendorsTab()}
        {activeTab === 'products' && renderPendingProductsTab()}
      </div>
       {/* Resolve Disputes Button - Floating Action Button */}
      <button
        onClick={() => {
          setShowDisputesModal(true);
          fetchDisputes();
        }}
        className="fixed bottom-8 right-8 bg-orange-600 text-white px-6 py-4 rounded-full shadow-2xl hover:bg-orange-700 transition-all hover:scale-110 flex items-center gap-2 z-50"
        style={{ zIndex: 9999 }}
      >
        <AlertTriangle className="w-6 h-6" />
        <span className="font-medium">Resolve Disputes</span>
      </button>

      {/* View Vendor Modal */}
      {isViewModalOpen && selectedVendor && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setIsViewModalOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-gradient-to-r from-indigo-500 to-purple-600 p-6 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-white">Vendor Details</h2>
                <button onClick={() => setIsViewModalOpen(false)} className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors">
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500 mb-1">Vendor Name</p>
                  <p className="font-semibold text-gray-900">{selectedVendor.name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Category</p>
                  <p className="font-semibold text-gray-900">{selectedVendor.category}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Phone</p>
                  <p className="font-semibold text-gray-900">{selectedVendor.vendor_phone}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Location</p>
                  <p className="font-semibold text-gray-900">{selectedVendor.location}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-sm text-gray-500 mb-1">Contact Link</p>
                  <a href={selectedVendor.contact_link} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
                    {selectedVendor.contact_link}
                  </a>
                </div>
                <div className="col-span-2">
                  <p className="text-sm text-gray-500 mb-1">Description</p>
                  <p className="text-gray-700">{selectedVendor.description}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Delivery Scope</p>
                  <p className="font-semibold text-gray-900">{selectedVendor.delivery_scope}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Submitted</p>
                  <p className="font-semibold text-gray-900">{new Date(selectedVendor.created_at).toLocaleDateString()}</p>
                </div>
              </div>
              
              {/* Document Links */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-3">Submitted Documents</h3>
                <div className="grid grid-cols-2 gap-3">
                  {selectedVendor.gov_id_url && (
                    <a href={selectedVendor.gov_id_url} target="_blank" rel="noreferrer" className="flex items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                      <Eye className="w-4 h-4 mr-2 text-indigo-600" />
                      <span className="text-sm font-medium">Government ID</span>
                    </a>
                  )}
                  {selectedVendor.cac_url && (
                    <a href={selectedVendor.cac_url} target="_blank" rel="noreferrer" className="flex items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                      <Eye className="w-4 h-4 mr-2 text-indigo-600" />
                      <span className="text-sm font-medium">CAC Certificate</span>
                    </a>
                  )}
                  {selectedVendor.location_proof_url && (
                    <a href={selectedVendor.location_proof_url} target="_blank" rel="noreferrer" className="flex items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                      <Eye className="w-4 h-4 mr-2 text-indigo-600" />
                      <span className="text-sm font-medium">Location Proof</span>
                    </a>
                  )}
                  {selectedVendor.bulk_invoice_url && (
                    <a href={selectedVendor.bulk_invoice_url} target="_blank" rel="noreferrer" className="flex items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                      <Eye className="w-4 h-4 mr-2 text-indigo-600" />
                      <span className="text-sm font-medium">Bulk Invoice</span>
                    </a>
                  )}
                  {selectedVendor.warehouse_photo_url && (
                    <a href={selectedVendor.warehouse_photo_url} target="_blank" rel="noreferrer" className="flex items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                      <Eye className="w-4 h-4 mr-2 text-indigo-600" />
                      <span className="text-sm font-medium">Warehouse Photo</span>
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Product Modal */}
      {isProductModalOpen && selectedProduct && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setIsProductModalOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-gradient-to-r from-indigo-500 to-purple-600 p-6 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-white">Product Details</h2>
                <button onClick={() => setIsProductModalOpen(false)} className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors">
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-4">
              {selectedProduct.product_images && selectedProduct.product_images.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {selectedProduct.product_images.map((img, idx) => (
                    <img key={idx} src={img} alt={`Product ${idx + 1}`} className="w-full h-32 object-cover rounded-lg" />
                  ))}
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <p className="text-sm text-gray-500 mb-1">Product Name</p>
                  <p className="font-bold text-xl text-gray-900">{selectedProduct.product_name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Category</p>
                  <p className="font-semibold text-gray-900">{selectedProduct.category}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Price</p>
                  <p className="font-bold text-xl text-indigo-600">₦{selectedProduct.price?.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Stock Quantity</p>
                  <p className="font-semibold text-gray-900">{selectedProduct.stock_quantity}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">NAFDAC Number</p>
                  <p className="font-semibold text-gray-900">{selectedProduct.nafdac_number || 'N/A'}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-sm text-gray-500 mb-1">Description</p>
                  <p className="text-gray-700">{selectedProduct.product_description}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {isRejectModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setIsRejectModalOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="bg-red-600 p-6 rounded-t-2xl">
              <div className="flex items-center space-x-3">
                <AlertCircle className="w-8 h-8 text-white" />
                <h2 className="text-2xl font-bold text-white">Reject {rejectType === 'vendor' ? 'Vendor' : 'Product'}</h2>
              </div>
            </div>
            
            <div className="p-6">
              <p className="text-gray-700 mb-4">Please provide a reason for rejection:</p>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                rows="4"
                placeholder="Enter rejection reason..."
              />
              
              <div className="flex space-x-3 mt-6">
                <button
                  onClick={() => setIsRejectModalOpen(false)}
                  className="flex-1 px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={rejectType === 'vendor' ? handleRejectVendor : handleRejectProduct}
                  disabled={loading || !rejectReason.trim()}
                  className="flex-1 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium disabled:opacity-50"
                >
                  {loading ? 'Rejecting...' : 'Confirm Rejection'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setIsDeleteModalOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gray-800 p-6 rounded-t-2xl">
              <div className="flex items-center space-x-3">
                <Trash2 className="w-8 h-8 text-white" />
                <h2 className="text-2xl font-bold text-white">Delete Product</h2>
              </div>
            </div>
            
            <div className="p-6">
              <p className="text-gray-700 mb-4">Please provide a reason for deletion:</p>
              <textarea
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500"
                rows="4"
                placeholder="Enter deletion reason..."
              />
              
              <div className="flex space-x-3 mt-6">
                <button
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="flex-1 px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteProduct}
                  disabled={loading || !deleteReason.trim()}
                  className="flex-1 px-4 py-3 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors font-medium disabled:opacity-50"
                >
                  {loading ? 'Deleting...' : 'Confirm Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Disputes Resolution Modal */}
      {showDisputesModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setShowDisputesModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="bg-orange-600 p-6 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <AlertTriangle className="w-8 h-8 text-white" />
                  <h2 className="text-2xl font-bold text-white">Resolve Disputes</h2>
                </div>
                <button onClick={() => setShowDisputesModal(false)} className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors">
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
            </div>
            
            <div className="p-6">
              {/* Vendor Search */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Search Vendor
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={vendorSearchQuery}
                    onChange={(e) => {
                      setVendorSearchQuery(e.target.value);
                      searchVendors(e.target.value);
                    }}
                    placeholder="Type vendor name..."
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  {vendorSuggestions.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {vendorSuggestions.map((vendor) => (
                        <button
                          key={vendor.vendor_id}
                          onClick={() => {
                            setVendorSearchQuery(vendor.name);
                            setVendorSuggestions([]);
                          }}
                          className="w-full text-left px-4 py-2 hover:bg-gray-100 transition-colors"
                        >
                          {vendor.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Disputes List */}
              <div className="space-y-4">
                <h3 className="font-semibold text-gray-900 text-lg">All Disputes</h3>
                {disputes.length === 0 ? (
                  <div className="text-center py-12 bg-gray-50 rounded-lg">
                    <AlertTriangle className="w-16 h-16 mx-auto text-gray-400 mb-4" />
                    <p className="text-gray-600">No disputes found</p>
                  </div>
                ) : (
                  disputes.map((dispute) => (
                    <div key={dispute.dispute_id} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h4 className="font-bold text-gray-900">Dispute #{dispute.dispute_id}</h4>
                          <p className="text-sm text-gray-600">Order ID: {dispute.order_id}</p>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          dispute.status === 'Resolved'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {dispute.status}
                        </span>
                      </div>
                      
                      <div className="space-y-2 mb-3">
                        <div>
                          <p className="text-sm font-medium text-gray-700">Reason:</p>
                          <p className="text-sm text-gray-900">{dispute.reason}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-700">Description:</p>
                          <p className="text-sm text-gray-900">{dispute.description}</p>
                        </div>
                        {dispute.evidence_url && (
                          <div>
                            <p className="text-sm font-medium text-gray-700">Evidence:</p>
                            <a
                              href={dispute.evidence_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sm text-blue-600 hover:underline"
                            >
                              View Evidence
                            </a>
                          </div>
                        )}
                        <div>
                          <p className="text-sm text-gray-500">
                            Created: {new Date(dispute.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>

                      {dispute.status === 'Pending' && (
                        <button
                          onClick={() => handleResolveDispute(dispute.dispute_id)}
                          disabled={loading}
                          className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50 flex items-center justify-center"
                        >
                          <CheckCircle className="w-4 h-4 mr-2" />
                          {loading ? 'Resolving...' : 'Mark as Resolved'}
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VendorAdminDashboard;
