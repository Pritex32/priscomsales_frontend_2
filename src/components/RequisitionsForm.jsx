import React, { useState, useEffect, useRef, useMemo } from 'react';
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
import { toast } from 'react-toastify';

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
    items: []
  });

  // Dropdown data
  const [warehouses, setWarehouses] = useState([]);
  const [inventoryItems, setInventoryItems] = useState({});
  const [employees, setEmployees] = useState([]);
  
  // UI states
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [itemSearchInput, setItemSearchInput] = useState('');
  const [showItemSuggestions, setShowItemSuggestions] = useState(false);

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

  // Calculate available items (exclude already selected items)
  const availableItemNames = useMemo(() => {
    const selectedItems = new Set(formData.items.map(it => (it.item || '').trim()).filter(Boolean));
    return Object.keys(inventoryItems).filter(name => !selectedItems.has(name));
  }, [inventoryItems, formData.items]);

  // Filter items based on search input for autocomplete
  const suggestedItems = useMemo(() => {
    if (!itemSearchInput.trim()) return availableItemNames;
    const searchLower = itemSearchInput.toLowerCase().trim();
    return availableItemNames.filter(name =>
      name.toLowerCase().includes(searchLower)
    );
  }, [itemSearchInput, availableItemNames]);

  // Handle warehouse change
  const handleWarehouseChange = (warehouse) => {
    setSelectedWarehouse(warehouse);
    setFormData(prev => ({ ...prev, warehouse_name: warehouse }));
  };

  // Handle item selection from dropdown (auto-add, no duplicates, increment qty)
  const handleItemSelect = (selectedName) => {
    if (!selectedName) return;
    const trimmed = selectedName.trim();
    if (!trimmed) return;
    
    // Check if item already exists
    const existingIdx = formData.items.findIndex(it => (it.item || '').trim() === trimmed);
    if (existingIdx !== -1) {
      // Item exists, increment quantity and move to top
      const updated = [...formData.items];
      const updatedItem = { ...updated[existingIdx], quantity: (parseInt(updated[existingIdx].quantity) || 0) + 1 };
      updated.splice(existingIdx, 1); // Remove from current position
      setFormData(prev => ({ ...prev, items: [updatedItem, ...updated] })); // Add to top
    } else {
      // Add new item to top
      setFormData(prev => ({
        ...prev,
        items: [{
          item: trimmed,
          quantity: 1
        }, ...prev.items]
      }));
    }
    // Reset search input
    setItemSearchInput('');
    setShowItemSuggestions(false);
  };

  // Handle item change for existing items
  const handleItemChange = (index, field, value) => {
    const newItems = [...formData.items];
    newItems[index][field] = value;
    setFormData(prev => ({ ...prev, items: newItems }));
  };

  // Remove item row
  const removeItem = (index) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  // Enhanced signature canvas functions with touch support
  const getCoordinates = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    // Support both mouse and touch events
    const clientX = e.clientX || (e.touches && e.touches[0]?.clientX);
    const clientY = e.clientY || (e.touches && e.touches[0]?.clientY);
    
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const startDrawing = (e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const { x, y } = getCoordinates(e);
    
    // Configure drawing style
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const { x, y } = getCoordinates(e);
    
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  };

  const stopDrawing = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
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
  
  // Initialize canvas with white background
  useEffect(() => {
    if (canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }, []);

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
          const fullMsg = setSuccess(`${successMsg}. Email notification sent to inventory officer.`);
          setSuccess(fullMsg);
          toast.success(successMsg);
          toast.info('Email notification sent to inventory officer');
        } else if (!emailConfigured) {
          const fullMsg =setSuccess(`${successMsg}. Warning: No inventory officer email configured. Please set it up in Settings.`);
          setSuccess(fullMsg);
          toast.success(successMsg);
          toast.warning('No inventory officer email configured');
        } else {
          setSuccess(successMsg);
          toast.success(successMsg);
        }
      } else {
        setSuccess(successMsg);
        toast.success(successMsg);
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

            {/* Items - Search and Select */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Requested Items *
              </label>
             {/* Total Items Counter */}
             {formData.items.length > 0 && (
               <div className="px-4 py-2 rounded-lg bg-green-50 border-2 border-green-500">
                 <span className="text-green-700 font-bold text-lg">
                   Total Items: {formData.items.reduce((sum, item) => sum + (parseInt(item.quantity) || 0), 0)}
                 </span>
               </div>
             )}
              
              {/* Warehouse selection reminder */}
              {!selectedWarehouse && (
                <div className="bg-yellow-50 text-yellow-700 border border-yellow-200 px-3 py-2 rounded-lg text-sm mb-3">
                  Please select a warehouse first to enable item selection.
                </div>
              )}

              {/* Item Search Input with Autocomplete */}
              <div className="relative mb-4">
                <label className="block text-xs text-gray-600 mb-1">Type to Search and Select Item</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={itemSearchInput}
                    onChange={e => {
                      setItemSearchInput(e.target.value);
                      setShowItemSuggestions(true);
                    }}
                    onFocus={() => setShowItemSuggestions(true)}
                    onBlur={() => {
                      // Delay to allow click on suggestion
                      setTimeout(() => setShowItemSuggestions(false), 200);
                    }}
                    disabled={!selectedWarehouse || loading}
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    placeholder="Type item name to search..."
                  />
                  {/* Bulk Select All Button */}
                  {itemSearchInput.trim() && suggestedItems.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const searchTerm = itemSearchInput.toLowerCase().trim();
                        // Collect all matching items first
                        const newItems = suggestedItems
                          .filter(name => name.toLowerCase().includes(searchTerm))
                          .map(name => ({
                            item: name,
                            quantity: 1
                          }));
                        
                        // Add all items at once to the top
                        setFormData(prev => ({
                          ...prev,
                          items: [...newItems, ...prev.items]
                        }));
                        
                        setItemSearchInput('');
                        setShowItemSuggestions(false);
                        setSuccess(`Added ${newItems.length} matching "${searchTerm}" items to requisition!`);
                        setTimeout(() => setSuccess(''), 3000);
                      }}
                      disabled={!selectedWarehouse || loading}
                      className="px-4 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 text-sm whitespace-nowrap"
                    >
                      Select All
                    </button>
                )}
              </div>   
                
                {/* Autocomplete Suggestions Dropdown */}
                {showItemSuggestions && suggestedItems.length > 0 && itemSearchInput.trim() && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {suggestedItems.slice(0, 10).map((name, idx) => (
                      <div
                        key={idx}
                        onClick={() => handleItemSelect(name)}
                        className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm border-b last:border-b-0"
                      >
                        <div className="font-medium">{name}</div>
                        <div className="text-xs text-gray-500">
                          ₦{Number(inventoryItems[name]?.price || 0).toLocaleString()}
                        </div>
                      </div>
                    ))}
                    {suggestedItems.length > 10 && (
                      <div className="px-3 py-2 text-xs text-gray-500 italic">
                        +{suggestedItems.length - 10} more items... Keep typing to narrow down
                      </div>
                    )}
                  </div>
                )}
                
                <div className="text-xs text-gray-500 mt-1">
                  Type to search, then click to add. Items are added at the top. Selecting an existing item increases its quantity. Selected items won't appear in the dropdown.
                </div>
              </div>

              {/* Selected Items List */}
              {formData.items.length > 0 && (
                <>
                  <div className="bg-gray-50 rounded-lg p-3 mb-2">
                    <div className="grid grid-cols-12 gap-2 items-center text-sm font-medium text-gray-700">
                      <div className="col-span-7">Item Name</div>
                      <div className="col-span-3">Quantity</div>
                      <div className="col-span-2">Actions</div>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    {formData.items.map((item, index) => (
                      <div key={index} className="grid grid-cols-12 gap-2 items-center p-3 bg-white border border-gray-200 rounded-lg">
                        <div className="col-span-7">
                          <div className="px-3 py-2 bg-gray-50 rounded text-sm font-medium">{item.item || '(empty)'}</div>
                        </div>
                        <div className="col-span-3">
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => handleItemChange(index, 'quantity', parseInt(e.target.value) || 1)}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                            required
                          />
                        </div>
                        <div className="col-span-2">
                          <button
                            type="button"
                            onClick={() => removeItem(index)}
                            className="w-full px-3 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 text-sm"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              
              {formData.items.length === 0 && (
                <div className="text-center py-8 text-gray-500 text-sm bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                  No items selected yet. Use the search box above to add items.
                </div>
              )}
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
                  width={600}
                  height={200}
                  className="border-2 border-gray-300 rounded-lg cursor-crosshair w-full bg-white shadow-inner"
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                  style={{ touchAction: 'none', maxWidth: '100%', height: 'auto' }}
                />
                <div className="flex items-center justify-between mt-2">
                  <span className="text-sm text-gray-500">
                    {hasSignature ? 'Signature captured' : 'Draw your signature above'}
                  </span>
                  <button
                    type="button"
                    onClick={clearSignature}
                    className="px-3 py-1 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors font-medium"
                  >
                    Clear Signature
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
