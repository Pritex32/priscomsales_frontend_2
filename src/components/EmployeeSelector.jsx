import React from 'react';

const EmployeeSelector = ({ employees, selectedEmployee, onEmployeeSelect }) => {
  const handleChange = (e) => {
    const employeeId = parseInt(e.target.value);
    if (!employeeId) {
      onEmployeeSelect(null);
      return;
    }
    const employee = employees.find(emp => emp.employee_id === employeeId);
    onEmployeeSelect(employee);
  };

  return (
    <div>
      <label htmlFor="employee-select" className="block text-sm font-medium text-gray-700 mb-2">
        Select Employee
      </label>
      <select
        id="employee-select"
        value={selectedEmployee?.employee_id || ''}
        onChange={handleChange}
        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      >
        <option value="">-- Choose an employee --</option>
        {employees.map(employee => (
          <option key={employee.employee_id} value={employee.employee_id}>
            {employee.name} ({employee.email})
          </option>
        ))}
      </select>
      {selectedEmployee && (
        <p className="mt-2 text-sm text-gray-600">
          Managing access for: <span className="font-semibold">{selectedEmployee.name}</span>
        </p>
      )}
    </div>
  );
};

export default EmployeeSelector;
