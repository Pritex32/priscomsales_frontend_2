import React, { useState } from 'react';
import ExpensesList from '../components/ExpensesList';
import ExpensesForm from '../components/ExpensesForm';
import PaymentForm from '../components/PaymentForm';

const Expenses = () => {
  const [currentView, setCurrentView] = useState('list');
  const [selectedExpense, setSelectedExpense] = useState(null);

  const handleCreateNew = () => {
    setSelectedExpense(null);
    setCurrentView('form');
  };

  const handleEdit = (expense) => {
    setSelectedExpense(expense);
    setCurrentView('form');
  };

  const handleAddPayment = (expense) => {
    setSelectedExpense(expense);
    setCurrentView('payment');
  };

  const handleBack = () => {
    setSelectedExpense(null);
    setCurrentView('list');
  };

  const handleSave = () => {
    setCurrentView('list');
    setSelectedExpense(null);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {currentView === 'list' ? (
          <ExpensesList 
            onCreateNew={handleCreateNew}
            onEdit={handleEdit}
            onAddPayment={handleAddPayment}
          />
        ) : currentView === 'form' ? (
          <ExpensesForm
            expense={selectedExpense}
            onBack={handleBack}
            onSave={handleSave}
          />
        ) : (
          <PaymentForm
            expense={selectedExpense}
            onBack={handleBack}
            onSave={handleSave}
          />
        )}
      </div>
    </div>
  );
};

export default Expenses;