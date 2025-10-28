import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Save,
  Receipt,
  User,
  Building,
  Calendar,
  DollarSign,
  CreditCard,
  FileText,
  AlertCircle,
  CheckCircle,
  Camera,
  Upload,
  X
} from 'lucide-react';
import { expensesApi } from '../services/expensesApi';

const ExpensesForm = ({ expense, onBack, onSave }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form data
  const [formData, setFormData] = useState({
    vendor_name: '',
    total_amount: '',
    expense_date: new Date().toISOString().split('T')[0],
    payment_status: 'paid',
    payment_method: 'cash',
    due_date: '',
    invoice_number: '',
    notes: '',
    amount_paid: '',
    employee_id: null,
    employee_name: ''
  });

  // File upload states
  const [invoiceFile, setInvoiceFile] = useState(null);
  const [invoiceFileUrl, setInvoiceFileUrl] = useState('');
  const [uploadMode, setUploadMode] = useState('file'); // 'file' | 'camera'
  
  // Camera states
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [capturedImage, setCapturedImage] = useState(null);

  // Get user info
  const username = localStorage.getItem('username') || '';
  const role = localStorage.getItem('role')?.toLowerCase() || 'user';

  // Initialize form with existing expense data
  useEffect(() => {
    if (expense) {
      setFormData({
        vendor_name: expense.vendor_name || '',
        total_amount: expense.total_amount || '',
        expense_date: expense.expense_date || new Date().toISOString().split('T')[0],
        payment_status: expense.payment_status || 'paid',
        payment_method: expense.payment_method || 'cash',
        due_date: expense.due_date || '',
        invoice_number: expense.invoice_number || '',
        notes: expense.notes || '',
        amount_paid: expense.amount_paid || '',
        employee_id: expense.employee_id,
        employee_name: expense.employee_name || username
      });
      setInvoiceFileUrl(expense.invoice_file_url || '');
    } else {
      // Initialize for new expense
      setFormData(prev => ({
        ...prev,
        employee_name: username
      }));
    }
  }, [expense, username]);

  // Handle form field changes
  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Auto-calculate amount_paid based on payment_status
    if (field === 'payment_status') {
      if (value === 'paid') {
        setFormData(prev => ({ ...prev, amount_paid: prev.total_amount }));
      } else if (value === 'credit') {
        setFormData(prev => ({ ...prev, amount_paid: '' }));
      }
    }
  };

  // Handle file upload
  const handleFileUpload = async (file) => {
    if (!file) return;

    // Clear previous errors and success messages
    setError('');
    setSuccess('');

    // Check file size (limit to 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB in bytes
    if (file.size > maxSize) {
      setError('File size must be less than 10MB');
      return;
    }

    // Check if file with similar name already exists
    const fileName = file.name.toLowerCase();
    if (invoiceFileUrl && invoiceFileUrl.includes(fileName.split('.')[0])) {
      const confirmUpload = window.confirm(
        `A file with similar name may already exist. Do you want to upload this file anyway?`
      );
      if (!confirmUpload) {
        return;
      }
    }

    const formDataObj = new FormData();
    formDataObj.append('invoice_file', file);
    formDataObj.append('desired_name', `expense_${Date.now()}`);

    try {
      setLoading(true);
      const response = await expensesApi.uploadInvoice(formDataObj);
      setInvoiceFileUrl(response.data.invoice_file_url);
      setSuccess('Invoice file uploaded successfully');
    } catch (err) {
      console.error('Upload error:', err);
      let errorMessage = 'Failed to upload invoice file';
      
      if (err.response?.data?.detail) {
        if (err.response.data.detail === 'Not authenticated') {
          errorMessage = 'Authentication required. Please login again.';
          // Clear token and redirect to login after a short delay
          setTimeout(() => {
            localStorage.removeItem('login_token');
            localStorage.removeItem('role');
            window.location.href = '/login';
          }, 2000);
        } else {
          errorMessage = err.response.data.detail;
        }
      } else if (err.response?.data?.message) {
        errorMessage = err.response.data.message;
      } else if (err.message) {
        errorMessage = `Upload failed: ${err.message}`;
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Camera functions
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: 1920, height: 1080 }
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCameraActive(true);
      }
    } catch (err) {
      setError('Failed to access camera. Please check permissions.');
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  const capturePhoto = async () => {
    if (!videoRef.current) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    
    canvas.toBlob(async (blob) => {
      if (blob) {
        try {
          const reader = new FileReader();
          reader.onload = async () => {
            try {
              setLoading(true);
              const base64Data = reader.result;
              const response = await expensesApi.uploadInvoiceBase64({
                data_base64: base64Data,
                filename: `expense_camera_${Date.now()}.jpg`,
                content_type: 'image/jpeg'
              });
              
              setInvoiceFileUrl(response.data.invoice_file_url);
              setCapturedImage(base64Data);
              stopCamera();
              setSuccess('Invoice captured and uploaded successfully');
            } catch (err) {
              console.error('Camera upload error:', err);
              let errorMessage = 'Failed to upload captured image';
              
              if (err.response?.data?.detail) {
                if (err.response.data.detail === 'Not authenticated') {
                  errorMessage = 'Authentication required. Please login again.';
                  setTimeout(() => {
                    localStorage.removeItem('login_token');
                    localStorage.removeItem('role');
                    window.location.href = '/login';
                  }, 2000);
                } else {
                  errorMessage = err.response.data.detail;
                }
              } else if (err.response?.data?.message) {
                errorMessage = err.response.data.message;
              } else if (err.message) {
                errorMessage = `Camera upload failed: ${err.message}`;
              }
              
              setError(errorMessage);
            } finally {
              setLoading(false);
            }
          };
          reader.readAsDataURL(blob);
        } catch (err) {
          setError('Failed to process captured image');
        }
      }
    }, 'image/jpeg', 0.9);
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    // Validation
    if (!formData.vendor_name.trim()) {
      setError('Vendor name is required');
      setLoading(false);
      return;
    }

    if (!formData.total_amount || parseFloat(formData.total_amount) <= 0) {
      setError('Please enter a valid total amount');
      setLoading(false);
      return;
    }

    if (formData.payment_status === 'partial' && (!formData.amount_paid || parseFloat(formData.amount_paid) <= 0)) {
      setError('Please enter the partial payment amount');
      setLoading(false);
      return;
    }

    if (formData.payment_status === 'partial' && parseFloat(formData.amount_paid) >= parseFloat(formData.total_amount)) {
      setError('Partial payment amount must be less than total amount');
      setLoading(false);
      return;
    }

    try {
      const payload = {
        vendor_name: formData.vendor_name.trim(),
        total_amount: parseFloat(formData.total_amount),
        expense_date: formData.expense_date,
        payment_status: formData.payment_status,
        payment_method: formData.payment_method,
        due_date: formData.due_date || null,
        invoice_number: formData.invoice_number.trim() || null,
        notes: formData.notes.trim() || null,
        amount_paid: formData.payment_status === 'partial' ? parseFloat(formData.amount_paid) : null,
        invoice_file_url: invoiceFileUrl || null,
        employee_id: formData.employee_id,
        employee_name: formData.employee_name || username
      };

      let response;
      if (expense) {
        // Update existing expense
        const formDataObj = new FormData();
        Object.entries(payload).forEach(([key, value]) => {
          if (value !== null && value !== undefined) {
            formDataObj.append(key, value);
          }
        });
        
        if (invoiceFile) {
          formDataObj.append('invoice_file', invoiceFile);
        }
        
        response = await expensesApi.updateExpense(expense.expense_id, formDataObj);
      } else {
        // Create new expense
        response = await expensesApi.createExpenseJson(payload);
      }

      setSuccess(response.data?.message || (expense ? 'Expense updated successfully' : 'Expense created successfully'));
      
      if (onSave) {
        setTimeout(() => onSave(response.data), 1500);
      }
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to save expense');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                <Receipt className="w-6 h-6 text-green-600" />
                {expense ? 'Edit Expense' : 'New Expense'}
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                {expense ? `Update expense #${expense.expense_id}` : 'Record a new business expense'}
              </p>
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
                  <Building className="w-4 h-4 inline mr-1" />
                  Vendor Name *
                </label>
                <input
                  type="text"
                  value={formData.vendor_name}
                  onChange={(e) => handleChange('vendor_name', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  placeholder="Enter vendor name"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <DollarSign className="w-4 h-4 inline mr-1" />
                  Total Amount (₦) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.total_amount}
                  onChange={(e) => handleChange('total_amount', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  placeholder="0.00"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Calendar className="w-4 h-4 inline mr-1" />
                  Expense Date *
                </label>
                <input
                  type="date"
                  value={formData.expense_date}
                  onChange={(e) => handleChange('expense_date', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <User className="w-4 h-4 inline mr-1" />
                  Employee
                </label>
                <input
                  type="text"
                  value={formData.employee_name}
                  onChange={(e) => handleChange('employee_name', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  placeholder="Employee name"
                />
              </div>
            </div>

            {/* Payment Information */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Payment Status *
                </label>
                <select
                  value={formData.payment_status}
                  onChange={(e) => handleChange('payment_status', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  required
                >
                  <option value="paid">Paid</option>
                  <option value="credit">Credit</option>
                  <option value="partial">Partial</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <CreditCard className="w-4 h-4 inline mr-1" />
                  Payment Method *
                </label>
                <select
                  value={formData.payment_method}
                  onChange={(e) => handleChange('payment_method', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  required
                >
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="transfer">Transfer</option>
                </select>
              </div>

              {formData.payment_status === 'partial' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Amount Paid (₦) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.amount_paid}
                    onChange={(e) => handleChange('amount_paid', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    placeholder="0.00"
                    required
                  />
                </div>
              )}

              {(formData.payment_status === 'credit' || formData.payment_status === 'partial') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={formData.due_date}
                    onChange={(e) => handleChange('due_date', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  />
                </div>
              )}
            </div>

            {/* Invoice Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Invoice Number
                </label>
                <input
                  type="text"
                  value={formData.invoice_number}
                  onChange={(e) => handleChange('invoice_number', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  placeholder="Enter invoice number"
                />
              </div>
            </div>

            {/* Invoice File Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <FileText className="w-4 h-4 inline mr-1" />
                Invoice File
              </label>
              
              {/* Upload Mode Selection */}
              <div className="flex items-center gap-4 mb-4">
                <label className="inline-flex items-center">
                  <input
                    type="radio"
                    value="file"
                    checked={uploadMode === 'file'}
                    onChange={(e) => setUploadMode(e.target.value)}
                    className="form-radio text-green-600"
                  />
                  <span className="ml-2 text-sm">Upload File</span>
                </label>
                <label className="inline-flex items-center">
                  <input
                    type="radio"
                    value="camera"
                    checked={uploadMode === 'camera'}
                    onChange={(e) => setUploadMode(e.target.value)}
                    className="form-radio text-green-600"
                  />
                  <span className="ml-2 text-sm">Take Photo</span>
                </label>
              </div>

              {uploadMode === 'file' && (
                <div>
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setInvoiceFile(file);
                        handleFileUpload(file);
                      }
                    }}
                    disabled={loading}
                    className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-green-500 focus:border-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  {loading && (
                    <div className="mt-2 flex items-center gap-2 text-sm text-gray-600">
                      <div className="w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin"></div>
                      Uploading file...
                    </div>
                  )}
                </div>
              )}

              {uploadMode === 'camera' && (
                <div className="space-y-4">
                  {!cameraActive && !capturedImage && (
                    <button
                      type="button"
                      onClick={startCamera}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                    >
                      <Camera className="w-4 h-4" />
                      Start Camera
                    </button>
                  )}

                  {cameraActive && (
                    <div className="space-y-4">
                      <div className="relative">
                        <video
                          ref={videoRef}
                          autoPlay
                          playsInline
                          className="w-full max-w-md rounded-lg border"
                          style={{ maxHeight: '300px' }}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={capturePhoto}
                          className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                        >
                          <Camera className="w-4 h-4" />
                          Capture
                        </button>
                        <button
                          type="button"
                          onClick={stopCamera}
                          className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
                        >
                          <X className="w-4 h-4" />
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {capturedImage && (
                    <div className="space-y-2">
                      <p className="text-sm text-green-600 font-medium">✓ Image captured successfully</p>
                      <img src={capturedImage} alt="Captured invoice" className="max-w-xs rounded-lg border" />
                      <button
                        type="button"
                        onClick={() => {
                          setCapturedImage(null);
                          setInvoiceFileUrl('');
                        }}
                        className="text-sm text-gray-600 hover:text-gray-800"
                      >
                        Retake Photo
                      </button>
                    </div>
                  )}

                  <canvas ref={canvasRef} style={{ display: 'none' }} />
                </div>
              )}

              {invoiceFileUrl && (
                <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm text-green-700 flex items-center gap-1">
                    <CheckCircle className="w-4 h-4" />
                    Invoice file uploaded successfully
                  </p>
                  <a
                    href={invoiceFileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-green-600 hover:text-green-800 underline"
                  >
                    View uploaded file
                  </a>
                </div>
              )}
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notes
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => handleChange('notes', e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-green-500 focus:border-green-500"
                placeholder="Additional notes about this expense..."
              />
            </div>

            {/* Submit Buttons */}
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
                className="flex items-center gap-2 px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    {expense ? 'Update Expense' : 'Create Expense'}
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

export default ExpensesForm;