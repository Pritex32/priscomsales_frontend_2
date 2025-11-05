import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { 
  ShoppingCart, 
  Package, 
  Trash2, 
  Plus, 
  Minus, 
  CreditCard,
  CheckCircle,
  XCircle,
  AlertCircle,
  Filter,
  Search
} from 'lucide-react';

const ShopFromWholesalers = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  // State management
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalProducts, setTotalProducts] = useState(0);
  const productsPerPage = 9;
  
  // Filters
  const [selectedCategory, setSelectedCategory] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Checkout
  const [showCheckout, setShowCheckout] = useState(false);
  const [checkoutData, setCheckoutData] = useState({
    buyer_name: '',
    buyer_contact: '',
    buyer_state: '',
    buyer_email: ''
  });
  
  // Payment verification
  const [verifying, setVerifying] = useState(false);

  // Fetch products
  const fetchProducts = async (page = 1, category = '') => {
    try {
      setLoading(true);
      const response = await api.get('/shop/products', {
        params: {
          page,
          per_page: productsPerPage,
          category: category || undefined
        }
      });
      
      setProducts(response.data.products || []);
      setTotalPages(response.data.total_pages || 1);
      setTotalProducts(response.data.total || 0);
      setCurrentPage(page);
      setError('');
    } catch (err) {
      setError('Failed to load products. Please try again.');
      console.error('Error fetching products:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch categories
  const fetchCategories = async () => {
    try {
      const response = await api.get('/shop/categories');
      setCategories(response.data.categories || []);
    } catch (err) {
      console.error('Error fetching categories:', err);
    }
  };

  // Fetch cart
  const fetchCart = async () => {
    try {
      const response = await api.get('/shop/cart');
      setCart(response.data.cart || []);
    } catch (err) {
      console.error('Error fetching cart:', err);
    }
  };

  // Add to cart
  const addToCart = async (product, quantity, size = null, color = null) => {
    try {
      await api.post('/shop/cart/add', {
        product_id: product.id,
        quantity,
        size,
        color
      });
      
      setSuccess(`${product.product_name} added to cart!`);
      setTimeout(() => setSuccess(''), 3000);
      fetchCart();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to add to cart');
      setTimeout(() => setError(''), 3000);
    }
  };

  // Remove from cart
  const removeFromCart = async (cartId) => {
    try {
      await api.delete(`/shop/cart/${cartId}`);
      setSuccess('Item removed from cart');
      setTimeout(() => setSuccess(''), 3000);
      fetchCart();
    } catch (err) {
      setError('Failed to remove item from cart');
      setTimeout(() => setError(''), 3000);
    }
  };

  // Calculate cart total
  const calculateCartTotal = () => {
    return cart.reduce((total, item) => {
      const itemPrice = parseFloat(item.price || 0);
      const quantity = parseInt(item.quantity || 0);
      const deliveryFee = parseFloat(
        checkoutData.buyer_state === item.seller_state 
          ? item.within_state_fee 
          : item.outside_state_fee
      ) || 0;
      
      return total + (itemPrice * quantity) + deliveryFee;
    }, 0);
  };

  // Handle checkout
  const handleCheckout = async () => {
    if (!checkoutData.buyer_name || !checkoutData.buyer_contact || 
        !checkoutData.buyer_state || !checkoutData.buyer_email) {
      setError('Please fill in all checkout fields');
      return;
    }

    try {
      setLoading(true);
      const response = await api.post('/shop/checkout', checkoutData);
      
      // Redirect to Paystack payment page
      window.location.href = response.data.payment_url;
    } catch (err) {
      setError(err.response?.data?.detail || 'Checkout failed. Please try again.');
      setLoading(false);
    }
  };

  // Verify payment
  const verifyPayment = async (reference) => {
    try {
      setVerifying(true);
      const response = await api.get(`/shop/verify-payment/${reference}`);
      
      if (response.data.success) {
        setSuccess('Payment successful! Your order has been placed.');
        setCart([]);
        setShowCheckout(false);
        
        // Show receipt
        setTimeout(() => {
          navigate('/dashboard/orders');
        }, 3000);
      } else {
        setError('Payment verification failed. Please contact support.');
      }
    } catch (err) {
      setError('Failed to verify payment. Please contact support.');
    } finally {
      setVerifying(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchProducts();
    fetchCategories();
    fetchCart();
    
    // Check for payment verification
    const reference = searchParams.get('reference') || searchParams.get('trxref');
    if (reference) {
      verifyPayment(reference);
    }
  }, [searchParams]);

  // Filter products
  const filteredProducts = products.filter(product => {
    const matchesSearch = product.product_name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
                <Package className="w-8 h-8 text-green-600" />
                Shop From Wholesalers
              </h1>
              <p className="text-gray-600 mt-2">Browse and order products from verified wholesalers</p>
            </div>
            <button
              onClick={() => setShowCheckout(!showCheckout)}
              className="flex items-center gap-2 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors"
            >
              <ShoppingCart className="w-5 h-5" />
              Cart ({cart.length})
            </button>
          </div>

          {/* Search and Filter */}
          <div className="flex gap-4 mt-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                fetchProducts(1, e.target.value);
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            >
              <option value="">All Categories</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6 rounded-lg flex items-center gap-2">
            <XCircle className="w-5 h-5 text-red-500" />
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {success && (
          <div className="bg-green-50 border-l-4 border-green-500 p-4 mb-6 rounded-lg flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-500" />
            <p className="text-green-700">{success}</p>
          </div>
        )}

        {verifying && (
          <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-blue-500 animate-spin" />
            <p className="text-blue-700">Verifying your payment...</p>
          </div>
        )}

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Products Grid */}
          <div className="lg:col-span-2">
            {loading ? (
              <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="bg-white rounded-lg shadow-md p-12 text-center">
                <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 text-lg">No products found</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {filteredProducts.map(product => (
                    <ProductCard 
                      key={product.id} 
                      product={product} 
                      onAddToCart={addToCart}
                    />
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex justify-center items-center gap-4 mt-8">
                    <button
                      onClick={() => fetchProducts(currentPage - 1, selectedCategory)}
                      disabled={currentPage === 1}
                      className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <span className="text-gray-600">
                      Page {currentPage} of {totalPages}
                    </span>
                    <button
                      onClick={() => fetchProducts(currentPage + 1, selectedCategory)}
                      disabled={currentPage === totalPages}
                      className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Cart Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-md p-6 sticky top-6">
              <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                <ShoppingCart className="w-6 h-6 text-green-600" />
                Your Cart
              </h2>

              {cart.length === 0 ? (
                <div className="text-center py-8">
                  <ShoppingCart className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                  <p className="text-gray-600">Your cart is empty</p>
                </div>
              ) : (
                <>
                  <div className="space-y-4 mb-6 max-h-96 overflow-y-auto">
                    {cart.map(item => (
                      <CartItem 
                        key={item.cart_id} 
                        item={item} 
                        onRemove={removeFromCart}
                        buyerState={checkoutData.buyer_state}
                      />
                    ))}
                  </div>

                  <div className="border-t pt-4">
                    <div className="flex justify-between text-lg font-bold mb-4">
                      <span>Total:</span>
                      <span className="text-green-600">
                        ₦{calculateCartTotal().toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    {!showCheckout ? (
                      <button
                        onClick={() => setShowCheckout(true)}
                        className="w-full bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                      >
                        <CreditCard className="w-5 h-5" />
                        Proceed to Checkout
                      </button>
                    ) : (
                      <CheckoutForm
                        data={checkoutData}
                        onChange={setCheckoutData}
                        onSubmit={handleCheckout}
                        onCancel={() => setShowCheckout(false)}
                        loading={loading}
                      />
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Product Card Component
const ProductCard = ({ product, onAddToCart }) => {
  const [quantity, setQuantity] = useState(product.min_order_quantity || 1);
  const [selectedSize, setSelectedSize] = useState('');
  const [selectedColor, setSelectedColor] = useState('');
  const [imageIndex, setImageIndex] = useState(0);

  const images = product.product_images || [];
  const hasDiscount = product.discounted_price < product.original_price;

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow">
      {/* Product Image */}
      <div className="relative h-48 bg-gray-200">
        {images.length > 0 ? (
          <>
            <img
              src={images[imageIndex]}
              alt={product.product_name}
              className="w-full h-full object-cover"
            />
            {images.length > 1 && (
              <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 flex gap-1">
                {images.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setImageIndex(idx)}
                    className={`w-2 h-2 rounded-full ${
                      idx === imageIndex ? 'bg-white' : 'bg-white/50'
                    }`}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center justify-center h-full">
            <Package className="w-16 h-16 text-gray-400" />
          </div>
        )}
        {hasDiscount && (
          <div className="absolute top-2 right-2 bg-red-500 text-white px-2 py-1 rounded-lg text-sm font-bold">
            SALE
          </div>
        )}
      </div>

      {/* Product Info */}
      <div className="p-4">
        <h3 className="font-bold text-gray-800 mb-2 line-clamp-2">{product.product_name}</h3>
        
        <div className="flex items-center gap-2 mb-2">
          {hasDiscount ? (
            <>
              <span className="text-gray-400 line-through text-sm">
                ₦{product.original_price?.toLocaleString('en-NG')}
              </span>
              <span className="text-green-600 font-bold text-lg">
                ₦{product.discounted_price?.toLocaleString('en-NG')}
              </span>
            </>
          ) : (
            <span className="text-green-600 font-bold text-lg">
              ₦{product.original_price?.toLocaleString('en-NG')}
            </span>
          )}
        </div>

        <div className="text-sm text-gray-600 space-y-1 mb-3">
          <p>📦 Stock: {product.stock_quantity}</p>
          <p>🔢 Min Order: {product.min_order_quantity}</p>
          {product.max_quantity && <p>🔢 Max Order: {product.max_quantity}</p>}
        </div>

        {/* Size Selection */}
        {product.product_size && product.product_size.length > 0 && (
          <div className="mb-3">
            <label className="text-sm font-medium text-gray-700 block mb-1">Size:</label>
            <select
              value={selectedSize}
              onChange={(e) => setSelectedSize(e.target.value)}
              className="w-full px-3 py-1 border border-gray-300 rounded-lg text-sm"
            >
              <option value="">Select size</option>
              {product.product_size.map(size => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </div>
        )}

        {/* Color Selection */}
        {product.colors && product.colors.length > 0 && (
          <div className="mb-3">
            <label className="text-sm font-medium text-gray-700 block mb-1">Color:</label>
            <select
              value={selectedColor}
              onChange={(e) => setSelectedColor(e.target.value)}
              className="w-full px-3 py-1 border border-gray-300 rounded-lg text-sm"
            >
              <option value="">Select color</option>
              {product.colors.map(color => (
                <option key={color} value={color}>{color}</option>
              ))}
            </select>
          </div>
        )}

        {/* Quantity Selection */}
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={() => setQuantity(Math.max(product.min_order_quantity || 1, quantity - 1))}
            className="p-1 border border-gray-300 rounded hover:bg-gray-100"
          >
            <Minus className="w-4 h-4" />
          </button>
          <input
            type="number"
            value={quantity}
            onChange={(e) => {
              const val = parseInt(e.target.value) || product.min_order_quantity || 1;
              setQuantity(Math.min(product.stock_quantity, Math.max(product.min_order_quantity || 1, val)));
            }}
            className="w-16 text-center border border-gray-300 rounded py-1"
          />
          <button
            onClick={() => setQuantity(Math.min(product.stock_quantity, quantity + 1))}
            className="p-1 border border-gray-300 rounded hover:bg-gray-100"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <button
          onClick={() => onAddToCart(product, quantity, selectedSize, selectedColor)}
          className="w-full bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add to Cart
        </button>
      </div>
    </div>
  );
};

// Cart Item Component
const CartItem = ({ item, onRemove, buyerState }) => {
  const deliveryFee = buyerState === item.seller_state 
    ? item.within_state_fee 
    : item.outside_state_fee;
  
  const itemTotal = (item.price * item.quantity) + (deliveryFee || 0);

  return (
    <div className="border-b pb-3">
      <div className="flex justify-between items-start mb-2">
        <div className="flex-1">
          <h4 className="font-medium text-gray-800 text-sm">{item.product_name}</h4>
          <p className="text-xs text-gray-600">Qty: {item.quantity}</p>
          {item.product_sizes && <p className="text-xs text-gray-600">Size: {item.product_sizes}</p>}
          {item.product_color && <p className="text-xs text-gray-600">Color: {item.product_color}</p>}
        </div>
        <button
          onClick={() => onRemove(item.cart_id)}
          className="text-red-500 hover:text-red-700 p-1"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      <div className="text-sm">
        <p className="text-gray-600">₦{item.price?.toLocaleString('en-NG')} × {item.quantity}</p>
        {deliveryFee > 0 && (
          <p className="text-gray-600">Delivery: ₦{deliveryFee?.toLocaleString('en-NG')}</p>
        )}
        <p className="font-bold text-green-600">₦{itemTotal?.toLocaleString('en-NG', { minimumFractionDigits: 2 })}</p>
      </div>
    </div>
  );
};

// Checkout Form Component
const CheckoutForm = ({ data, onChange, onSubmit, onCancel, loading }) => {
  return (
    <div className="space-y-3">
      <input
        type="text"
        placeholder="Your Name"
        value={data.buyer_name}
        onChange={(e) => onChange({ ...data, buyer_name: e.target.value })}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
      />
      <input
        type="tel"
        placeholder="Phone/WhatsApp"
        value={data.buyer_contact}
        onChange={(e) => onChange({ ...data, buyer_contact: e.target.value })}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
      />
      <input
        type="email"
        placeholder="Email Address"
        value={data.buyer_email}
        onChange={(e) => onChange({ ...data, buyer_email: e.target.value })}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
      />
      <input
        type="text"
        placeholder="Delivery State"
        value={data.buyer_state}
        onChange={(e) => onChange({ ...data, buyer_state: e.target.value })}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
      />
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg hover:bg-gray-300 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onSubmit}
          disabled={loading}
          className="flex-1 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              Processing...
            </>
          ) : (
            <>
              <CreditCard className="w-4 h-4" />
              Pay Now
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default ShopFromWholesalers;
