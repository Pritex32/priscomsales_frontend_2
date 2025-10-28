import React, { useState } from 'react';
import {
  ArrowLeft,
  Save,
  DollarSign,
  CreditCard,
  Calendar,
  FileText,
  AlertCircle,
  CheckCircle,
  Receipt
} from 'lucide-react';
import { expensesApi } from '../services/expensesApi';

const PaymentForm = ({ expense, onBack, onSave }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form data
  const [formData, setFormData] = useState({
    amount: '',
    payment_method: 'cash',
    notes: '',
    payment_date: new Date().toISOString().split('T')[0]
  });

  // Calculate remaining balance
  const remainingBalance = expense ? (expense.amount_balance || 0) : 0;
  const totalAmount = expense ? (expense.total_amount || 0) : 0;
  const alreadyPaid = expense ? (expense.amount_paid || 0) : 0;

  // Handle form field changes
  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    // Validation
    const paymentAmount = parseFloat(formData.amount);
    if (!paymentAmount || paymentAmount <= 0) {
      setError('Please enter a valid payment amount');
      setLoading(false);
      return;
    }

    if (paymentAmount > remainingBalance) {
      setError(`Payment amount cannot exceed remaining balance of ₦${remainingBalance.toLocaleString()}`);
      setLoading(false);
      return;
    }

    try {
      const payload = {
        expense_id: expense.expense_id,
        amount: paymentAmount,
        payment_method: formData.payment_method,
        notes: formData.notes.trim() || null,
        payment_date: formData.payment_date
      };

      const response = await expensesApi.addPayment(payload);
      
      setSuccess(response.data?.msg || 'Payment recorded successfully');
      
      if (onSave) {
        setTimeout(() => onSave(response.data), 1500);
      }
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to record payment');
    } finally {
      setLoading(false);
    }
  };

  if (!expense) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Expense Not Found</h2>
          <p className="text-gray-600 mb-4">The expense you're trying to add a payment to could not be found.</p>
          <button
            onClick={onBack}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
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
                <DollarSign className="w-6 h-6 text-green-600" />
                Add Payment
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Record a payment for expense #{expense.expense_id}
              </p>
            </div>
          </div>
        </div>

        {/* Expense Summary */}
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Vendor:</span>
              <div className="font-medium text-gray-900">{expense.vendor_name}</div>
            </div>
            <div>
              <span className="text-gray-500">Total Amount:</span>
              <div className="font-medium text-gray-900">₦{totalAmount.toLocaleString()}</div>
            </div>
            <div>
              <span className="text-gray-500">Already Paid:</span>
              <div className="font-medium text-gray-900">₦{alreadyPaid.toLocaleString()}</div>
            </div>
          </div>
          
          <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-center gap-2 text-yellow-800">
              <Receipt className="w-4 h-4" />
              <span className="font-medium">Remaining Balance</span>
            </div>
            <div className="text-lg font-bold text-yellow-900 mt-1">
              ₦{remainingBalance.toLocaleString()}
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
            {/* Payment Amount */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <DollarSign className="w-4 h-4 inline mr-1" />
                Payment Amount (₦) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                max={remainingBalance}
                value={formData.amount}
                onChange={(e) => handleChange('amount', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-green-500 focus:border-green-500"
                placeholder="0.00"
                required
              />
              <p className="mt-1 text-sm text-gray-500">
                Maximum amount: ₦{remainingBalance.toLocaleString()}
              </p>
            </div>

            {/* Payment Method */}
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

            {/* Payment Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Calendar className="w-4 h-4 inline mr-1" />
                Payment Date *
              </label>
              <input
                type="date"
                value={formData.payment_date}
                onChange={(e) => handleChange('payment_date', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-green-500 focus:border-green-500"
                required
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <FileText className="w-4 h-4 inline mr-1" />
                Notes (Optional)
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => handleChange('notes', e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-green-500 focus:border-green-500"
                placeholder="Any additional notes about this payment..."
              />
            </div>

            {/* Quick Amount Buttons */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Quick Amount Selection
              </label>
              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => handleChange('amount', remainingBalance.toString())}
                  className="px-3 py-1 text-sm bg-green-100 hover:bg-green-200 text-green-800 rounded-lg transition-colors"
                >
                  Pay Full Balance (₦{remainingBalance.toLocaleString()})
                </button>
                <button
                  type="button"
                  onClick={() => handleChange('amount', (remainingBalance / 2).toFixed(2))}
                  className="px-3 py-1 text-sm bg-blue-100 hover:bg-blue-200 text-blue-800 rounded-lg transition-colors"
                >
                  Pay Half (₦{(remainingBalance / 2).toLocaleString()})
                </button>
                <button
                  type="button"
                  onClick={() => handleChange('amount', (remainingBalance / 4).toFixed(2))}
                  className="px-3 py-1 text-sm bg-purple-100 hover:bg-purple-200 text-purple-800 rounded-lg transition-colors"
                >
                  Pay Quarter (₦{(remainingBalance / 4).toLocaleString()})
                </button>
              </div>
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
                    Recording...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Record Payment
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

export default PaymentForm;