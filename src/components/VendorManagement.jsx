import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { 
  Truck, Package, CheckCircle, XCircle, Clock, 
  Eye, AlertCircle, Search
} from 'lucide-react';
import api from '../services/api';

const VendorManagement = () => {
  const [vendorOrders, setVendorOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Mark Delivered Modal
  const [showDeliveredModal, setShowDeliveredModal] = useState(false);
  const [selectedOrderReference, setSelectedOrderReference] = useState('');
  const [vendorAccessCode, setVendorAccessCode] = useState('');
  const [orderItems, setOrderItems] = useState([]);

  // Fetch vendor orders
  const fetchVendorOrders = async () => {
    try {
      setLoading(true);
      const response = await api.get('/shop/vendor/orders');
      setVendorOrders(response.data.orders || []);
    } catch (error) {
      toast.error('Failed to fetch orders');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch order items for delivery
  const fetchOrderItems = async (reference) => {
    try {
      const response = await api.get(`/shop/vendor/orders/${reference}/items`);
      setOrderItems(response.data.orders || []);
    } catch (error) {
      toast.error('Failed to fetch order items');
      console.error(error);
    }
  };

  // Mark order as delivered
  const handleMarkDelivered = async () => {
    if (!vendorAccessCode.trim()) {
      toast.error('Please enter vendor access code');
      return;
    }
    
    try {
      setLoading(true);
      const formData = new FormData();
      formData.append('access_code', vendorAccessCode);
      
      await api.post(`/shop/vendor/orders/${selectedOrderReference}/mark-delivered`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      toast.success('Order marked as delivered successfully ✅');
      setShowDeliveredModal(false);
      setVendorAccessCode('');
      setSelectedOrderReference('');
      setOrderItems([]);
      fetchVendorOrders(); // Refresh orders
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to mark order as delivered');
    } finally {
      setLoading(false);
    }
  };

  // Open delivery modal
  const openDeliveryModal = (reference) => {
    setSelectedOrderReference(reference);
    fetchOrderItems(reference);
    setShowDeliveredModal(true);
  };

  useEffect(() => {
    fetchVendorOrders();
  }, []);

  // Filter orders
  const filteredOrders = vendorOrders.filter(order =>
    order.product_names?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    order.buyer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    order.payment_reference?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group orders by status
  const pendingOrders = filteredOrders.filter(o => o.order_status === 'pending_vendor_acceptance');
  const acceptedOrders = filteredOrders.filter(o => o.order_status === 'accepted');
  const deliveredOrders = filteredOrders.filter(o => o.order_status === 'delivered');
  const rejectedOrders = filteredOrders.filter(o => o.order_status === 'rejected');

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2 mb-4">
            <Package className="w-8 h-8 text-green-600" />
            Vendor Order Management
          </h1>
          
          {/* Search */}
          <div className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
            <Search className="w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search orders by product, buyer, or reference..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-transparent outline-none text-gray-700"
            />
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow-md p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Pending</p>
                <p className="text-2xl font-bold text-yellow-600">{pendingOrders.length}</p>
              </div>
              <Clock className="w-8 h-8 text-yellow-600" />
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-md p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Accepted</p>
                <p className="text-2xl font-bold text-blue-600">{acceptedOrders.length}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-blue-600" />
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-md p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Delivered</p>
                <p className="text-2xl font-bold text-green-600">{deliveredOrders.length}</p>
              </div>
              <Truck className="w-8 h-8 text-green-600" />
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-md p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Rejected</p>
                <p className="text-2xl font-bold text-red-600">{rejectedOrders.length}</p>
              </div>
              <XCircle className="w-8 h-8 text-red-600" />
            </div>
          </div>
        </div>

        {/* Orders List */}
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 text-lg">No orders found</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredOrders.map((order) => (
              <div key={order.order_id} className="bg-white rounded-lg shadow-md p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-xl font-bold text-gray-800">{order.product_names}</h3>
                    <p className="text-sm text-gray-600">Reference: {order.payment_reference}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    order.order_status === 'delivered' ? 'bg-green-100 text-green-800' :
                    order.order_status === 'accepted' ? 'bg-blue-100 text-blue-800' :
                    order.order_status === 'rejected' ? 'bg-red-100 text-red-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {order.order_status?.replace('_', ' ').toUpperCase()}
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div>
                    <p className="text-sm text-gray-600">Buyer</p>
                    <p className="font-medium text-gray-900">{order.buyer_name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Contact</p>
                    <p className="font-medium text-gray-900">{order.buyer_contact}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Quantity</p>
                    <p className="font-medium text-gray-900">{order.quantity}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Total</p>
                    <p className="font-bold text-green-600">₦{order.total_price?.toLocaleString('en-NG')}</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  {order.order_status === 'accepted' && (
                    <button
                      onClick={() => openDeliveryModal(order.payment_reference)}
                      className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
                    >
                      <Truck className="w-4 h-4" />
                      Mark as Delivered
                    </button>
                  )}
                  {order.order_status === 'delivered' && (
                    <div className="flex items-center gap-2 text-green-600">
                      <CheckCircle className="w-5 h-5" />
                      <span className="font-medium">Delivered</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Mark Delivered Modal */}
        {showDeliveredModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="bg-green-600 p-6 rounded-t-2xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Truck className="w-8 h-8 text-white" />
                    <h2 className="text-2xl font-bold text-white">Mark Order as Delivered</h2>
                  </div>
                  <button 
                    onClick={() => {
                      setShowDeliveredModal(false);
                      setVendorAccessCode('');
                      setOrderItems([]);
                    }} 
                    className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
                  >
                    <XCircle className="w-6 h-6" />
                  </button>
                </div>
              </div>
              
              <div className="p-6 space-y-4">
                <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
                  <p className="text-sm text-blue-800">
                    <strong>Reference:</strong> {selectedOrderReference}
                  </p>
                </div>

                {orderItems.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-3">Order Items:</h3>
                    <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                      {orderItems.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center border-b border-gray-200 pb-2 last:border-0">
                          <div>
                            <p className="font-medium text-gray-900">{item.product_names}</p>
                            <p className="text-sm text-gray-600">Quantity: {item.quantity}</p>
                            <p className="text-sm text-gray-600">Buyer: {item.buyer_name}</p>
                          </div>
                          <p className="font-bold text-green-600">₦{item.total_price?.toLocaleString('en-NG')}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Vendor Access Code <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={vendorAccessCode}
                    onChange={(e) => setVendorAccessCode(e.target.value)}
                    placeholder="Enter your vendor access code"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    This is the access code you received when your vendor account was approved
                  </p>
                </div>

                <div className="flex space-x-3 pt-4">
                  <button
                    onClick={() => {
                      setShowDeliveredModal(false);
                      setVendorAccessCode('');
                      setSelectedOrderReference('');
                      setOrderItems([]);
                    }}
                    className="flex-1 px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleMarkDelivered}
                    disabled={loading || !vendorAccessCode.trim()}
                    className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50 flex items-center justify-center"
                  >
                    <Truck className="w-5 h-5 mr-2" />
                    {loading ? 'Processing...' : 'Confirm Delivery'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VendorManagement;
