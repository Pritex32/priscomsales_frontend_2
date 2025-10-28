import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import { Store, Package } from 'lucide-react';
import VendorRegistration from './VendorRegistration';
import VendorProductUpload from './VendorProductUpload';

const VendorListing = () => {
  const { role } = useSelector(state => state.auth);
  const [activeTab, setActiveTab] = useState('registration');

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-indigo-50 p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center space-x-3 mb-2">
          <div className="p-3 bg-indigo-600 rounded-lg">
            <Store className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Vendor Management</h1>
            <p className="text-gray-600">Register as a vendor, upload products, or manage approvals</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6">
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('registration')}
            className={`flex-1 px-6 py-4 text-center font-medium transition-colors ${
              activeTab === 'registration'
                ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center justify-center space-x-2">
              <Store className="w-5 h-5" />
              <span>Vendor Registration</span>
            </div>
          </button>
          <button
            onClick={() => setActiveTab('product-upload')}
            className={`flex-1 px-6 py-4 text-center font-medium transition-colors ${
              activeTab === 'product-upload'
                ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center justify-center space-x-2">
              <Package className="w-5 h-5" />
              <span>Product Upload</span>
            </div>
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'registration' && <VendorRegistration />}
        {activeTab === 'product-upload' && <VendorProductUpload />}
      </div>
    </div>
  );
};

export default VendorListing;
