import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { 
  Package, Upload, DollarSign, TrendingDown, Palette, 
  Ruler, Weight, FileText, Image, Video, ArrowLeft, CheckCircle
} from 'lucide-react';
import api from '../services/api';

const VendorProductUpload = () => {
  const navigate = useNavigate();
  const { user } = useSelector(state => state.auth);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    product_name: '',
    product_description: '',
    price: '',
    category: '',
    stock_quantity: '',
    seller_state: '',
    within_state_fee: '',
    outside_state_fee: '',
    min_order_quantity: '1',
    max_quantity: '',
    discount_type: 'None',
    discount_value: '0',
    colors: '',
    product_size: '',
    nafdac_number: '',
    product_weight: ''
  });
  const [images, setImages] = useState([]);
  const [video, setVideo] = useState(null);

  const categories = [
    'Electronics', 'Fashion', 'Food & Beverages', 'Health & Beauty',
    'Home & Garden', 'Sports & Outdoors', 'Toys & Games', 'Automotive',
    'Books & Media', 'Office Supplies', 'Other'
  ];

  const nigerianStates = [
    'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno',
    'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'Gombe', 'Imo',
    'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos',
    'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers',
    'Sokoto', 'Taraba', 'Yobe', 'Zamfara', 'FCT'
  ];

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleImageChange = (e) => {
    const selectedFiles = Array.from(e.target.files);
    if (selectedFiles.length > 2) {
      toast.error('Maximum 2 images allowed');
      return;
    }
    
    const validFiles = selectedFiles.filter(file => {
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name} is too large (max 10MB)`);
        return false;
      }
      return true;
    });
    
    setImages(validFiles);
  };

  const handleVideoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 15 * 1024 * 1024) {
        toast.error('Video size must be less than 15MB');
        return;
      }
      setVideo(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (images.length === 0) {
      toast.error('At least one product image is required');
      return;
    }

    setLoading(true);
    try {
      const submitData = new FormData();
      
      // Add form data
      const productData = {
        ...formData,
        price: parseFloat(formData.price),
        stock_quantity: parseInt(formData.stock_quantity),
        within_state_fee: parseFloat(formData.within_state_fee),
        outside_state_fee: parseFloat(formData.outside_state_fee),
        min_order_quantity: parseInt(formData.min_order_quantity),
        max_quantity: parseInt(formData.max_quantity),
        discount_value: parseFloat(formData.discount_value),
        colors: formData.colors ? formData.colors.split(',').map(c => c.trim()) : [],
        product_size: formData.product_size ? formData.product_size.split(',').map(s => s.trim()) : []
      };

      // Append as JSON string to match backend expectations
      Object.keys(productData).forEach(key => {
        if (Array.isArray(productData[key])) {
          submitData.append(key, JSON.stringify(productData[key]));
        } else {
          submitData.append(key, productData[key]);
        }
      });

      // Add images
      images.forEach((img, index) => {
        submitData.append('images', img);
      });

      // Add video if present
      if (video) {
        submitData.append('video', video);
      }

      const response = await api.post('/vendors/products', submitData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      toast.success('Product uploaded successfully! Awaiting approval.');
      // Reset form
      setFormData({
        product_name: '',
        product_description: '',
        price: '',
        category: '',
        stock_quantity: '',
        seller_state: '',
        within_state_fee: '',
        outside_state_fee: '',
        min_order_quantity: '1',
        max_quantity: '',
        discount_type: 'None',
        discount_value: '0',
        colors: '',
        product_size: '',
        nafdac_number: '',
        product_weight: ''
      });
      setImages([]);
      setVideo(null);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to upload product');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="max-w-5xl mx-auto">

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-lg border border-gray-200 p-8 space-y-6">
          {/* Product Information */}
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
              <Package className="w-5 h-5 mr-2 text-indigo-600" />
              Product Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Product Name *
                </label>
                <input
                  type="text"
                  name="product_name"
                  value={formData.product_name}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="Enter product name"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Product Description *
                </label>
                <textarea
                  name="product_description"
                  value={formData.product_description}
                  onChange={handleInputChange}
                  required
                  rows="3"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="Describe your product..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Category *
                </label>
                <select
                  name="category"
                  value={formData.category}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="">Select category</option>
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <DollarSign className="w-4 h-4 inline mr-1" />
                  Price (₦) *
                </label>
                <input
                  type="number"
                  name="price"
                  value={formData.price}
                  onChange={handleInputChange}
                  required
                  min="0"
                  step="0.01"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Stock Quantity *
                </label>
                <input
                  type="number"
                  name="stock_quantity"
                  value={formData.stock_quantity}
                  onChange={handleInputChange}
                  required
                  min="0"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Min Order Quantity *
                </label>
                <input
                  type="number"
                  name="min_order_quantity"
                  value={formData.min_order_quantity}
                  onChange={handleInputChange}
                  required
                  min="1"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Max Quantity *
                </label>
                <input
                  type="number"
                  name="max_quantity"
                  value={formData.max_quantity}
                  onChange={handleInputChange}
                  required
                  min="1"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  NAFDAC Number
                </label>
                <input
                  type="text"
                  name="nafdac_number"
                  value={formData.nafdac_number}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="Optional"
                />
              </div>
            </div>
          </div>

          {/* Delivery & Location */}
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
              <FileText className="w-5 h-5 mr-2 text-indigo-600" />
              Delivery Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Seller State *
                </label>
                <select
                  name="seller_state"
                  value={formData.seller_state}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="">Select state</option>
                  {nigerianStates.map(state => (
                    <option key={state} value={state}>{state}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Within State Fee (₦) *
                </label>
                <input
                  type="number"
                  name="within_state_fee"
                  value={formData.within_state_fee}
                  onChange={handleInputChange}
                  required
                  min="0"
                  step="0.01"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Outside State Fee (₦) *
                </label>
                <input
                  type="number"
                  name="outside_state_fee"
                  value={formData.outside_state_fee}
                  onChange={handleInputChange}
                  required
                  min="0"
                  step="0.01"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Discount */}
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
              <TrendingDown className="w-5 h-5 mr-2 text-indigo-600" />
              Discount (Optional)
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Discount Type
                </label>
                <select
                  name="discount_type"
                  value={formData.discount_type}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="None">None</option>
                  <option value="Percentage">Percentage</option>
                  <option value="Fixed">Fixed Amount</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Discount Value
                </label>
                <input
                  type="number"
                  name="discount_value"
                  value={formData.discount_value}
                  onChange={handleInputChange}
                  min="0"
                  step="0.01"
                  disabled={formData.discount_type === 'None'}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-100"
                  placeholder={formData.discount_type === 'Percentage' ? '0-100' : '0.00'}
                />
              </div>
            </div>
          </div>

          {/* Product Specifications */}
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
              <Ruler className="w-5 h-5 mr-2 text-indigo-600" />
              Product Specifications (Optional)
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Palette className="w-4 h-4 inline mr-1" />
                  Colors (comma separated)
                </label>
                <input
                  type="text"
                  name="colors"
                  value={formData.colors}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="Red, Blue, Green"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Ruler className="w-4 h-4 inline mr-1" />
                  Sizes (comma separated)
                </label>
                <input
                  type="text"
                  name="product_size"
                  value={formData.product_size}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="S, M, L, XL"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Weight className="w-4 h-4 inline mr-1" />
                  Weight
                </label>
                <input
                  type="text"
                  name="product_weight"
                  value={formData.product_weight}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="e.g., 500g"
                />
              </div>
            </div>
          </div>

          {/* Media Uploads */}
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
              <Image className="w-5 h-5 mr-2 text-indigo-600" />
              Product Media
            </h2>
            <div className="space-y-4">
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 hover:border-indigo-400 transition-colors">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Upload className="w-4 h-4 inline mr-1" />
                  Product Images * (Select 1-2 images)
                </label>
                <p className="text-xs text-gray-500 mb-3">
                  💡 Tip: Hold Ctrl (or Cmd on Mac) to select multiple images, or select them one at a time
                </p>
                <input
                  type="file"
                  onChange={handleImageChange}
                  accept="image/*"
                  multiple
                  required
                  className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                />
                {images.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs text-green-600 font-medium flex items-center">
                      <CheckCircle className="w-4 h-4 mr-1" />
                      {images.length} of 2 image{images.length > 1 ? 's' : ''} selected
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {images.map((img, index) => (
                        <div key={index} className="relative bg-gray-50 rounded-lg p-2 border border-gray-200">
                          <div className="flex items-center space-x-2">
                            <Image className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                            <span className="text-xs text-gray-700 truncate">{img.name}</span>
                          </div>
                          <span className="text-xs text-gray-500">{(img.size / 1024).toFixed(1)} KB</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 hover:border-indigo-400 transition-colors">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Video className="w-4 h-4 inline mr-1" />
                  Product Video (Optional, Max 15MB)
                </label>
                <input
                  type="file"
                  onChange={handleVideoChange}
                  accept="video/*"
                  className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                />
                {video && (
                  <p className="text-xs text-green-600 mt-2 flex items-center">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    {video.name}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex items-center justify-end space-x-4 pt-6 border-t">
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  Uploading...
                </>
              ) : (
                <>
                  <Package className="w-5 h-5 mr-2" />
                  Upload Product
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default VendorProductUpload;
