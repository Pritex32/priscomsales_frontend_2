import React, { useState, useEffect } from 'react';
import { fetchTableData } from '../services/api.js';
import * as XLSX from 'xlsx';

const FilterPage = () => {
  const [selectedTable, setSelectedTable] = useState('Sales');
  const [data, setData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterOption, setFilterOption] = useState('None');
  const [filterValue, setFilterValue] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [amount, setAmount] = useState(0);
  const [filterType, setFilterType] = useState('Equal To');
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [selectedMethod, setSelectedMethod] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('login_token');
    if (!token) {
      alert('Please log in to access this page.');
      return;
    }
    loadData();
  }, [selectedTable]);

  const loadData = async () => {
    setLoading(true);
    try {
      const tableType = selectedTable.toLowerCase();
      const fetchedData = await fetchTableData(tableType);
      setData(fetchedData);
      setFilteredData(fetchedData);
      if (tableType === 'payments') {
        const methods = [...new Set(fetchedData.map(item => item.payment_method).filter(Boolean))];
        setPaymentMethods(methods);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      alert('Failed to load data. Please check if backend is running.');
    } finally {
      setLoading(false);
    }
  };

  const applyFilter = () => {
    let filtered = [...data];
    const today = new Date().toISOString().split('T')[0];

    if (filterOption === 'None') {
      setFilteredData(filtered);
      return;
    }

    if (selectedTable === 'Sales') {
      if (filterOption === 'Customer Name' || filterOption === 'Employee Name' || filterOption === 'Customer Phone' || filterOption === 'Item Name') {
        const field = filterOption.toLowerCase().replace(' ', '_');
        filtered = filtered.filter(row => row[field]?.toLowerCase().includes(filterValue.toLowerCase()));
      } else if (filterOption === 'Sale Date Range') {
        if (startDate > endDate) {
          alert('Start date cannot be after end date');
          return;
        }
        filtered = filtered.filter(row => {
          const date = new Date(row.sale_date).toISOString().split('T')[0];
          return date >= startDate && date <= endDate;
        });
      }
    } else if (selectedTable === 'Restock') {
      if (filterOption === 'Item Name') {
        filtered = filtered.filter(row => row.item_name?.toLowerCase().includes(filterValue.toLowerCase()));
      } else if (filterOption === 'Restock Date Range') {
        if (startDate > endDate) {
          alert('Start date cannot be after end date');
          return;
        }
        filtered = filtered.filter(row => {
          const date = new Date(row.purchase_date).toISOString().split('T')[0];
          return date >= startDate && date <= endDate;
        });
      }
    } else if (selectedTable === 'Expenses') {
      if (filterOption === 'Vendor Name') {
        filtered = filtered.filter(row => row.vendor_name?.toLowerCase().includes(filterValue.toLowerCase()));
      } else if (filterOption === 'Expense Date Range') {
        if (startDate > endDate) {
          alert('Start date cannot be after end date');
          return;
        }
        filtered = filtered.filter(row => {
          const date = new Date(row.expense_date).toISOString().split('T')[0];
          return date >= startDate && date <= endDate;
        });
      }
    } else if (selectedTable === 'Payments') {
      if (filterOption === 'Payment Date Range') {
        if (startDate > endDate) {
          alert('Start date cannot be after end date');
          return;
        }
        filtered = filtered.filter(row => {
          const date = new Date(row.payment_date).toISOString().split('T')[0];
          return date >= startDate && date <= endDate;
        });
      } else if (filterOption === 'Amount') {
        if (filterType === 'Equal To') {
          filtered = filtered.filter(row => row.amount === amount);
        } else {
          filtered = filtered.filter(row => row.amount >= amount);
        }
      } else if (filterOption === 'Payment Method') {
        filtered = filtered.filter(row => row.payment_method === selectedMethod);
      }
    }

    setFilteredData(filtered);
  };

  const downloadExcel = (data, filename) => {
    if (data.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Filtered Data');
    XLSX.writeFile(wb, filename);
  };

  const downloadCSV = (data, filename) => {
    if (data.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(data);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const getFilterOptions = () => {
    const options = { Sales: ['None', 'Customer Name', 'Employee Name', 'Customer Phone', 'Item Name', 'Sale Date Range'],
                      Restock: ['None', 'Item Name', 'Restock Date Range'],
                      Expenses: ['None', 'Vendor Name', 'Expense Date Range'],
                      Payments: ['None', 'Payment Date Range', 'Amount', 'Payment Method'] };
    return options[selectedTable] || [];
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="loader"></div>
        <h5 className="text-center mt-4">Loading PriscomSales Filter...</h5>
      </div>
    );
  }

  const last10Data = filteredData.slice(-10).reverse();  // Last 10, in order

  const filename = `filtered_${selectedTable.toLowerCase()}.xlsx`;

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      {/* Title */}
      <div className="custom-title mb-8">
        📊 Filter Records
        <div className="sub-title">Sales | Restock | Expenses | Payments</div>
      </div>

      {/* Table Selection */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">Select Table</label>
        <select
          value={selectedTable}
          onChange={(e) => setSelectedTable(e.target.value)}
          className="block w-full md:w-64 p-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
        >
          <option value="Sales">Sales</option>
          <option value="Restock">Restock</option>
          <option value="Expenses">Expenses</option>
          <option value="Payments">Payments</option>
        </select>
      </div>

      {/* Dynamic Filters */}
      <div className="bg-white p-6 rounded-lg shadow-md mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">🔍 Filters</h3>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Select Filter</label>
          <select
            value={filterOption}
            onChange={(e) => {
              setFilterOption(e.target.value);
              setFilterValue('');
              setSelectedMethod('');
            }}
            className="block w-full md:w-64 p-2 border border-gray-300 rounded-md"
          >
            {getFilterOptions().map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        </div>

        {filterOption !== 'None' && (
          <>
            {['Customer Name', 'Employee Name', 'Customer Phone', 'Item Name', 'Vendor Name', 'Item Name'].includes(filterOption) && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Enter {filterOption}</label>
                <input
                  type="text"
                  value={filterValue}
                  onChange={(e) => setFilterValue(e.target.value)}
                  className="block w-full md:w-64 p-2 border border-gray-300 rounded-md"
                  placeholder={`Enter ${filterOption.toLowerCase()}`}
                />
              </div>
            )}

            {['Sale Date Range', 'Restock Date Range', 'Expense Date Range', 'Payment Date Range'].includes(filterOption) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="block w-full md:w-64 p-2 border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="block w-full md:w-64 p-2 border border-gray-300 rounded-md"
                  />
                </div>
              </div>
            )}

            {filterOption === 'Amount' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Enter Amount</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                  min="0"
                  step="0.01"
                  className="block w-full md:w-64 p-2 border border-gray-300 rounded-md"
                />
                <div className="mt-2">
                  <label className="inline-flex items-center">
                    <input
                      type="radio"
                      value="Equal To"
                      checked={filterType === 'Equal To'}
                      onChange={(e) => setFilterType(e.target.value)}
                      className="mr-2"
                    />
                    Equal To
                  </label>
                  <label className="inline-flex items-center ml-4">
                    <input
                      type="radio"
                      value="Greater Than or Equal To"
                      checked={filterType === 'Greater Than or Equal To'}
                      onChange={(e) => setFilterType(e.target.value)}
                      className="mr-2"
                    />
                    Greater Than or Equal To
                  </label>
                </div>
              </div>
            )}

            {filterOption === 'Payment Method' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Select Payment Method</label>
                <select
                  value={selectedMethod}
                  onChange={(e) => setSelectedMethod(e.target.value)}
                  className="block w-full md:w-64 p-2 border border-gray-300 rounded-md"
                >
                  <option value="">Select Method</option>
                  {paymentMethods.map(method => <option key={method} value={method}>{method}</option>)}
                </select>
              </div>
            )}

            <button
              onClick={applyFilter}
              className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded"
            >
              Apply Filter
            </button>
          </>
        )}
      </div>

      {/* Data Table */}
      {data.length === 0 ? (
        <div className="text-center text-yellow-600 bg-yellow-50 p-4 rounded">
          No data available for {selectedTable.toLowerCase()}.
        </div>
      ) : (
        <>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Filtered {selectedTable} Data (Last 10 Records)</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 bg-white shadow">
              <thead className="bg-gray-50">
                <tr>
                  {Object.keys(last10Data[0] || {}).map(key => (
                    <th key={key} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {last10Data.map((row, index) => (
                  <tr key={index}>
                    {Object.values(row).map((value, i) => (
                      <td key={i} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {value instanceof Date ? value.toLocaleDateString() : value}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Download Buttons */}
          <div className="mt-4 flex space-x-4">
            <button
              onClick={() => downloadExcel(filteredData, filename)}
              className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded"
              disabled={filteredData.length === 0}
            >
              ⬇ Download as Excel
            </button>
            <button
              onClick={() => downloadCSV(filteredData, filename.replace('.xlsx', '.csv'))}
              className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded"
              disabled={filteredData.length === 0}
            >
              ⬇ Download as CSV
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default FilterPage;