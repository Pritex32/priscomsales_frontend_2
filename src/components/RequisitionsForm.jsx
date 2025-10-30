import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowLeft, 
  Plus, 
  Minus, 
  Save, 
  Package, 
  User, 
  FileText,
  AlertCircle,
  CheckCircle,
  Camera,
  Upload
} from 'lucide-react';
import { requisitionsApi } from '../services/requisitionsApi';

const RequisitionsForm = ({ requisition, onBack, onSave }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form data
  const [formData, setFormData] = useState({
    warehouse_name: '',
    reason: '',
    employee_id: null,
    employee_name: '',
    signature_base64: null,
    items: [{ item: '', quantity: 1 }]
  });

  // Dropdown data
  const [warehouses, setWarehouses] = useState([]);
  const [inventoryItems, setInventoryItems] = useState({});
  const [employees, setEmployees] = useState([]);
  
  // UI states
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [itemSearches, setItemSearches] = useState(['']);
  const [showItemDropdowns, setShowItemDropdowns] = useState([false]);

  // Signature capture
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  // Get user role and info
  const role = localStorage.getItem('role')?.toLowerCase() || 'user';
  const username = localStorage.getItem('username') || '';

  // Initialize form with existing requisition data
  useEffect(() => {
    if (requisition) {
      setFormData({
        warehouse_name: requisition.warehouse_name || '',
        reason: requisition.reason || '',
        employee_id: requisition.employee_id,
        employee_name: requisition.employee_name || username,
        signature_base64: requisition.signature,
        items: [{ 
          item: requisition.item || '', 
          quantity: requisition.quantity || 1 
        }]
      });
      setSelectedWarehouse(requisition.warehouse_name || '');
      setHasSignature(!!requisition.signature);
    } else {
      // Initialize for new requisition
      setFormData(prev => ({
        ...prev,
        employee_name: username
      }));
    }
  }, [requisition, username]);

  // Load warehouses
  useEffect(() => {
    const loadWarehouses = async () => {
      try {
        const response = await requisitionsApi.getWarehouses(role);
        setWarehouses(response.data || []);
      } catch (err) {
        setError('Failed to load warehouses');
      }
    };
    loadWarehouses();
  }, [role]);

  // Load inventory items when warehouse changes
  useEffect(() => {
    const loadInventoryItems = async () => {
      if (!selectedWarehouse) {
        setInventoryItems({});
        return;
      }

      try {
        const response = await requisitionsApi.getInventoryItems(selectedWarehouse);
        setInventoryItems(response.data || {});
      } catch (err) {
        setError('Failed to load inventory items');
      }
    };
    loadInventoryItems();
  }, [selectedWarehouse]);

  // Load employees
  useEffect(() => {
    const loadEmployees = async () => {
      try {
        const response = await requisitionsApi.getEmployees();
        setEmployees(response.data || []);
      } catch (err) {
        // Non-critical error
      }
    };
    loadEmployees();
  }, []);

  // Handle warehouse change
  const handleWarehouseChange = (warehouse) => {
    setSelectedWarehouse(warehouse);
    setFormData(prev => ({ ...prev, warehouse_name: warehouse }));
  };

  // Handle item change
  const handleItemChange = (index, field, value) => {
    const newItems = [...formData.items];
    newItems[index] = { ...newItems[index], [field]: value };
    setFormData(prev => ({ ...prev, items: newItems }));
  };

  // Handle item search
  const handleItemSearch = (index, value) => {
    const newSearches = [...itemSearches];
    newSearches[index] = value;
    setItemSearches(newSearches);

    // Show/hide dropdown based on search term
    const newDropdowns = [...showItemDropdowns];
    newDropdowns[index] = value.length > 0;
    setShowItemDropdowns(newDropdowns);
  };

  // Select item from dropdown
  const selectItem = (index, itemName) => {
    handleItemChange(index, 'item', itemName);
    
    // Clear search and hide dropdown
    const newSearches = [...itemSearches];
    newSearches[index] = itemName;
    setItemSearches(newSearches);
    
    const newDropdowns = [...showItemDropdowns];
    newDropdowns[index] = false;
    setShowItemDropdowns(newDropdowns);
  };

  // Add new item row
  const addItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [{ item: '', quantity: 1 }, ...prev.items]
    }));
    setItemSearches([...itemSearches, '']);
    setShowItemDropdowns([...showItemDropdowns, false]);
  };

  // Remove item row
  const removeItem = (index) => {
    if (formData.items.length === 1) return;

    setFormData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
    setItemSearches(itemSearches.filter((_, i) => i !== index));
    setShowItemDropdowns(showItemDropdowns.filter((_, i) => i !== index));
  };

  // Signature canvas functions
  const startDrawing = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const ctx = canvas.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const ctx = canvas.getContext('2d');
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    
    // Convert canvas to base64
    const canvas = canvasRef.current;
    const dataURL = canvas.toDataURL('image/png');
    setFormData(prev => ({ ...prev, signature_base64: dataURL }));
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    setFormData(prev => ({ ...prev, signature_base64: null }));
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    // Validation
    if (!formData.warehouse_name) {
      setError('Please select a warehouse');
      setLoading(false);
      return;
    }

    if (!formData.reason.trim()) {
      setError('Please provide a reason for the requisition');
      setLoading(false);
      return;
    }

    if (formData.items.some(item => !item.item || item.quantity <= 0)) {
      setError('Please ensure all items have valid names and quantities');
      setLoading(false);
      return;
    }

    try {
      const payload = {
        warehouse_name: formData.warehouse_name,
        reason: formData.reason.trim(),
        employee_id: formData.employee_id,
        employee_name: formData.employee_name || username,
        signature_base64: formData.signature_base64,
        items: formData.items.map(item => ({
          item: item.item,
          quantity: parseInt(item.quantity)
        }))
      };

      let response;
      if (requisition) {
        // Update existing requisition
        response = await requisitionsApi.updateRequisition(requisition.requisition_id, {
          status: 'Pending', // Reset status when updating
          notes: formData.reason
        });
      } else {
        // Create new requisition(s)
        if (formData.items.length === 1) {
          // Single item - use form endpoint for backward compatibility
          const formDataObj = new FormData();
          formDataObj.append('warehouse_name', payload.warehouse_name);
          formDataObj.append('item', payload.items[0].item);
          formDataObj.append('quantity', payload.items[0].quantity);
          formDataObj.append('reason', payload.reason);
          if (payload.signature_base64) {
            formDataObj.append('signature', payload.signature_base64);
          }
          response = await requisitionsApi.createRequisition(formDataObj);
        } else {
          // Multiple items - use batch endpoint
          response = await requisitionsApi.createRequisitionsBatch(payload);
        }
      }

      const successMsg = response.data?.msg || (requisition ? 'Requisition updated successfully' : 'Requisition created successfully');
      
      // Check email notification status
      if (!requisition && response.data) {
        const emailSent = response.data.email_sent;
        const emailConfigured = response.data.officer_email_configured;
        
        if (emailSent) {
          setSuccess(`${successMsg}. Email notification sent to inventory officer.`);
        } else if (!emailConfigured) {
          setSuccess(`${successMsg}. Warning: No inventory officer email configured. Please set it up in Settings.`);
        } else {
          setSuccess(successMsg);
        }
      } else {
        setSuccess(successMsg);
      }
      
      if (onSave) {
        setTimeout(() => onSave(response.data), 2500);
      }
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to save requisition');
    } finally {
      setLoading(false);
    }
  };

  const availableItems = Object.keys(inventoryItems || {});
  const filteredItems = (searchTerm) => 
    availableItems.filter(item => 
      item.toLowerCase().includes(searchTerm.toLowerCase())
    );

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={onBack}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                  <FileText className="w-6 h-6 text-blue-600" />
                  {requisition ? 'Edit Requisition' : 'New Requisition'}
                </h1>
                <p className="text-sm text-gray-600 mt-1">
                  {requisition ? `Update requisition #${requisition.requisition_id}` : 'Create a new inventory requisition'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="p-6">
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-red-800">
                <AlertCircle className="w-5 h-5" />
                <span className="font-medium">Error</span>
              </div>
              <p className="mt-1 text-red-700">{error}</p>
            </div>
          )}

          {success && (
            <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-green-800">
                <CheckCircle className="w-5 h-5" />
                <span className="font-medium">Success</span>
              </div>
              <p className="mt-1 text-green-700">{success}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Package className="w-4 h-4 inline mr-1" />
                  Warehouse *
                </label>
                <select
                  value={selectedWarehouse}
                  onChange={(e) => handleWarehouseChange(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                >
                  <option value="">Select a warehouse...</option>
                  {warehouses.map((warehouse) => (
                    <option key={warehouse} value={warehouse}>
                      {warehouse}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <User className="w-4 h-4 inline mr-1" />
                  Employee
                </label>
                <input
                  type="text"
                  value={formData.employee_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, employee_name: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Employee name"
                />
              </div>
            </div>

            {/* Items */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <label className="block text-sm font-medium text-gray-700">
                  Requested Items *
                </label>
                <button
                  type="button"
                  onClick={addItem}
                  className="flex items-center gap-2 px-3 py-1 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Item
                </button>
              </div>

              <div className="space-y-3">
                {formData.items.map((item, index) => (
                  <div key={index} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <div className="flex-1 relative">
                      <input
                        type="text"
                        value={itemSearches[index] || item.item}
                        onChange={(e) => {
                          handleItemSearch(index, e.target.value);
                          handleItemChange(index, 'item', e.target.value);
                        }}
                        onFocus={() => {
                          const newDropdowns = [...showItemDropdowns];
                          newDropdowns[index] = itemSearches[index]?.length > 0;
                          setShowItemDropdowns(newDropdowns);
                        }}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Search for items..."
                        required
                      />
                      
                      {/* Item dropdown */}
                      {showItemDropdowns[index] && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                          {filteredItems(itemSearches[index] || '').map((itemName) => (
                            <button
                              key={itemName}
                              type="button"
                              onClick={() => selectItem(index, itemName)}
                              className="w-full px-3 py-2 text-left hover:bg-blue-50 focus:bg-blue-50 focus:outline-none"
                            >
                              <div className="font-medium">{itemName}</div>
                              <div className="text-sm text-gray-500">
                                ₦{Number(inventoryItems[itemName]?.price || 0).toLocaleString()}
                              </div>
                            </button>
                          ))}
                          {filteredItems(itemSearches[index] || '').length === 0 && (
                            <div className="px-3 py-2 text-gray-500 text-sm">
                              No items found
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="w-24">
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => handleItemChange(index, 'quantity', parseInt(e.target.value) || 1)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        required
                      />
                    </div>

                    {formData.items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Reason */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reason for Requisition *
              </label>
              <textarea
                value={formData.reason}
                onChange={(e) => setFormData(prev => ({ ...prev, reason: e.target.value }))}
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Explain why you need these items..."
                required
              />
            </div>

            {/* Signature */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Digital Signature (Optional)
              </label>
              <div className="border border-gray-300 rounded-lg p-4">
                <canvas
                  ref={canvasRef}
                  width={400}
                  height={150}
                  className="border border-gray-200 rounded cursor-crosshair w-full"
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  style={{ touchAction: 'none' }}
                />
                <div className="flex items-center justify-between mt-2">
                  <span className="text-sm text-gray-500">
                    {hasSignature ? 'Signature captured' : 'Draw your signature above'}
                  </span>
                  <button
                    type="button"
                    onClick={clearSignature}
                    className="text-sm text-gray-600 hover:text-gray-800 transition-colors"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex items-center justify-end gap-3 pt-6 border-t border-gray-200">
              <button
                type="button"
                onClick={onBack}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    {requisition ? 'Update Requisition' : 'Create Requisition'}
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default RequisitionsForm;
