import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { 
  Store, Upload, FileText, CheckCircle, AlertCircle, 
  Phone, MapPin, Link, Package, ArrowLeft
} from 'lucide-react';
import api from '../services/api';

const VendorRegistration = () => {
  const navigate = useNavigate();
  const { user } = useSelector(state => state.auth);
  const [loading, setLoading] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    location: '',
    contact_link: '',
    description: '',
    nin: '',
    cac: '',
    vendor_phone: '',
    delivery_scope: 'Within State',
    accept_vendor_terms: false
  });
  const [files, setFiles] = useState({
    gov_id: null,
    cac_cert: null,
    location_proof: null,
    bulk_proof: null,
    warehouse: null
  });

  const categories = [
    'Electronics', 'Fashion', 'Food & Beverages', 'Health & Beauty',
    'Home & Garden', 'Sports & Outdoors', 'Toys & Games', 'Automotive',
    'Books & Media', 'Office Supplies', 'Other'
  ];

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleFileChange = (e) => {
    const { name, files: selectedFiles } = e.target;
    if (selectedFiles && selectedFiles[0]) {
      const file = selectedFiles[0];
      if (file.size > 10 * 1024 * 1024) {
        toast.error('File size must be less than 10MB');
        return;
      }
      setFiles(prev => ({ ...prev, [name]: file }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.accept_vendor_terms) {
      toast.error('You must accept the vendor terms and conditions');
      return;
    }

    setLoading(true);
    try {
      const submitData = new FormData();
      
      // Add form data
      Object.keys(formData).forEach(key => {
        submitData.append(key, formData[key]);
      });

      // Add files
      Object.keys(files).forEach(key => {
        if (files[key]) {
          submitData.append(key, files[key]);
        }
      });

      const response = await api.post('/vendors/register', submitData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      toast.success('Vendor registration submitted successfully! Awaiting approval.');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to register vendor');
    } finally {
      setLoading(false);
    }
  };

  const fetchTerms = async () => {
    try {
      const response = await fetch('http://localhost:8000/vendors/terms');
      const html = await response.text();
      return html;
    } catch (error) {
      return '<p>Failed to load terms</p>';
    }
  };

  return (
    <div>
      <div className="max-w-4xl mx-auto">

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-lg border border-gray-200 p-8 space-y-6">
          {/* Basic Information */}
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
              <Store className="w-5 h-5 mr-2 text-indigo-600" />
              Business Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Business Name *
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="Enter business name"
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
                  <Phone className="w-4 h-4 inline mr-1" />
                  Phone Number *
                </label>
                <input
                  type="tel"
                  name="vendor_phone"
                  value={formData.vendor_phone}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="e.g., 08012345678"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <MapPin className="w-4 h-4 inline mr-1" />
                  Location *
                </label>
                <input
                  type="text"
                  name="location"
                  value={formData.location}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="City, State"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Delivery Scope *
                </label>
                <select
                  name="delivery_scope"
                  value={formData.delivery_scope}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="Within State">Within State</option>
                  <option value="Anywhere in Nigeria">Anywhere in Nigeria</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Link className="w-4 h-4 inline mr-1" />
                  Contact Link
                </label>
                <input
                  type="url"
                  name="contact_link"
                  value={formData.contact_link}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="https://wa.me/..."
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Business Description *
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  required
                  rows="3"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="Describe your business and products..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  NIN (Optional)
                </label>
                <input
                  type="text"
                  name="nin"
                  value={formData.nin}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="National ID Number"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  CAC Number (Optional)
                </label>
                <input
                  type="text"
                  name="cac"
                  value={formData.cac}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="Business registration number"
                />
              </div>
            </div>
          </div>

          {/* Document Uploads */}
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
              <FileText className="w-5 h-5 mr-2 text-indigo-600" />
              Required Documents
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { key: 'gov_id', label: 'Government ID', required: true },
                { key: 'cac_cert', label: 'CAC Certificate', required: false },
                { key: 'location_proof', label: 'Location Proof', required: true },
                { key: 'bulk_proof', label: 'Bulk Purchase Invoice', required: true },
                { key: 'warehouse', label: 'Warehouse Photo', required: false }
              ].map(doc => (
                <div key={doc.key} className="border-2 border-dashed border-gray-300 rounded-lg p-4 hover:border-indigo-400 transition-colors">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Upload className="w-4 h-4 inline mr-1" />
                    {doc.label} {doc.required && '*'}
                  </label>
                  <input
                    type="file"
                    name={doc.key}
                    onChange={handleFileChange}
                    accept="image/*"
                    required={doc.required}
                    className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                  />
                  {files[doc.key] && (
                    <p className="text-xs text-green-600 mt-1 flex items-center">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      {files[doc.key].name}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Terms and Conditions */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
            <div className="space-y-3">
              {/* Clickable wrapper for checkbox */}
              <div 
                onClick={() => {
                  setFormData(prev => ({
                    ...prev,
                    accept_vendor_terms: !prev.accept_vendor_terms
                  }));
                }}
                className="flex items-center gap-3 cursor-pointer select-none hover:bg-yellow-100 p-2 rounded transition-colors"
              >
                {/* Visual checkbox */}
                <div className="flex-shrink-0">
                  <div 
                    className={`w-6 h-6 border-2 rounded flex items-center justify-center transition-all ${
                      formData.accept_vendor_terms 
                        ? 'bg-indigo-600 border-indigo-600' 
                        : 'bg-white border-gray-400'
                    }`}
                  >
                    {formData.accept_vendor_terms && (
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
                
                {/* Hidden native checkbox for form validation */}
                <input
                  type="checkbox"
                  name="accept_vendor_terms"
                  checked={formData.accept_vendor_terms}
                  onChange={() => {}} 
                  required
                  className="sr-only"
                  tabIndex={-1}
                />
                
                <span className="text-sm font-medium text-gray-900">
                  I accept the vendor terms and conditions *
                </span>
              </div>
              
              <div className="pl-10">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowTerms(true);
                  }}
                  className="text-sm text-indigo-600 hover:text-indigo-800 underline font-medium flex items-center gap-1"
                >
                  <FileText className="w-4 h-4" />
                  View Terms and Conditions
                </button>
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
              disabled={loading || !formData.accept_vendor_terms}
              className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  Submitting...
                </>
              ) : (
                <>
                  <CheckCircle className="w-5 h-5 mr-2" />
                  Submit Application
                </>
              )}
            </button>
          </div>
        </form>

        {/* Terms Modal */}
        {showTerms && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setShowTerms(false)}>
            <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="sticky top-0 bg-indigo-600 p-6 rounded-t-2xl">
                <h2 className="text-2xl font-bold text-white">Vendor Terms and Conditions</h2>
              </div>
              <div className="p-6">
                <iframe
                  src="http://localhost:8000/vendors/terms"
                  className="w-full h-96 border-0"
                  title="Vendor Terms"
                />
                <button
                  onClick={() => setShowTerms(false)}
                  className="mt-4 w-full px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VendorRegistration;
