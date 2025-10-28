# B2B Stock Movement UI - Integration Guide

## Overview
Modern React UI for the B2B Enhanced Stock Movement system with three transfer types:
- Warehouse to Warehouse Transfer
- Customer Sale
- Stockout (Write-off)

## Features

### ✨ Modern Design
- **Tab-based Interface** - Easy switching between transfer types
- **Color-coded System** - Blue for transfers, Green for sales, Red for write-offs
- **Responsive Layout** - Works on desktop, tablet, and mobile
- **Real-time Validation** - Instant feedback on form inputs
- **Toast Notifications** - Success/error messages using react-toastify

### 📊 Dashboard Stats
- Live counter for warehouse transfers
- Live counter for customer sales
- Live counter for write-offs
- Updates automatically after each transaction

### 🔍 Filters & Export
- Filter by transfer type
- Filter by warehouse
- Date range filtering (start/end date)
- CSV export functionality

### ✅ Validation
- Prevents negative stock
- Ensures source ≠ destination for warehouse transfers
- Requires minimum 5 characters for stockout notes
- Real-time stock display in dropdown
- Form-specific required fields

## Integration Steps

### 1. **Add Route to App.js**

```javascript
import B2BStockMovement from './components/B2BStockMovement';

// Inside your Routes
<Route path="/b2b-movement" element={<B2BStockMovement />} />
```

### 2. **Add Navigation Menu Item**

Add a menu item in your sidebar/navigation:

```jsx
<Link to="/b2b-movement">
  <ArrowRightLeft className="w-5 h-5" />
  <span>Stock Movement</span>
</Link>
```

### 3. **Verify Dependencies**

All required packages are already in your `package.json`:
- ✅ `react` - ^18.2.0
- ✅ `axios` - ^1.6.0
- ✅ `lucide-react` - ^0.545.0
- ✅ `react-toastify` - ^11.0.5
- ✅ `tailwindcss` - ^3.3.0

### 4. **Ensure Toast Container in App.js**

Make sure `ToastContainer` is rendered at the root level:

```javascript
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

function App() {
  return (
    <>
      <Routes>
        {/* Your routes */}
      </Routes>
      <ToastContainer 
        position="top-right"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
      />
    </>
  );
}
```

## API Endpoints Used

The component connects to the following endpoints:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/b2b/warehouses` | GET | Get accessible warehouses |
| `/b2b/inventory/{warehouse}` | GET | Get items in warehouse |
| `/b2b/transfer/warehouse` | POST | Warehouse transfer |
| `/b2b/transfer/customer` | POST | Customer sale |
| `/b2b/transfer/stockout` | POST | Stockout/write-off |
| `/b2b/movements` | GET | Get movement history |
| `/b2b/movements/export` | GET | Export CSV |

## Component Structure

```
B2BStockMovement.jsx
├── Header Section
├── Stats Cards (3 cards)
├── Tab Navigation (3 tabs)
│   ├── Warehouse Transfer Form
│   ├── Customer Sale Form
│   └── Stockout Form
└── Movement History
    ├── Filters (Type, Warehouse, Date Range)
    └── Table with movements
```

## Form Fields

### Warehouse Transfer
- Source Warehouse * (dropdown)
- Destination Warehouse * (dropdown, auto-filters out source)
- Item * (dropdown with stock count)
- Quantity * (number)
- Issued By * (text)
- Received By * (text)
- Movement Date * (date)
- Notes (textarea, optional)

### Customer Sale
- Source Warehouse * (dropdown)
- Item * (dropdown with stock count)
- Quantity * (number)
- Issued By * (text)
- Customer Name (text, optional)
- Sale Date * (date)
- Notes (textarea, optional)

### Stockout
- Warehouse * (dropdown)
- Item * (dropdown with stock count)
- Quantity * (number)
- Authorized By * (text)
- Write-off Date * (date)
- Reason * (textarea, minimum 5 chars) **REQUIRED**

## Styling

The component uses:
- **Tailwind CSS** for utility-first styling
- **Lucide React** for modern icons
- **Custom color schemes**:
  - Blue (#3B82F6) for warehouse transfers
  - Green (#10B981) for customer sales
  - Red (#EF4444) for stockouts
- **Rounded corners** and **subtle shadows**
- **Hover effects** for better UX

## Best Practices

1. **Always show stock levels** - Dropdown displays current stock
2. **Color consistency** - Each transfer type has its own color
3. **Clear error messages** - Descriptive toast notifications
4. **Auto-refresh** - Movements reload after each action
5. **Responsive design** - Mobile-friendly layout
6. **Accessibility** - Proper labels and ARIA attributes

## Keyboard Shortcuts (Future Enhancement)

Consider adding:
- `Ctrl+1` - Switch to Warehouse Transfer
- `Ctrl+2` - Switch to Customer Sale
- `Ctrl+3` - Switch to Stockout
- `Ctrl+E` - Export CSV
- `Ctrl+S` - Submit form

## Testing Checklist

- [ ] Warehouse transfer creates records in both warehouses
- [ ] Customer sale only reduces source warehouse
- [ ] Stockout requires notes (minimum 5 chars)
- [ ] Can't transfer to same warehouse
- [ ] Stock validation prevents overselling
- [ ] Filters work correctly
- [ ] CSV export downloads properly
- [ ] Toast notifications appear
- [ ] Responsive on mobile devices
- [ ] Icons render properly
- [ ] Date pickers work
- [ ] Dropdowns populate correctly

## Troubleshooting

### Icons not showing
```bash
npm install lucide-react
```

### Toast not showing
```bash
npm install react-toastify
```

### Styling issues
Make sure Tailwind is configured in `tailwind.config.js` and CSS is imported in `index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

### API 401 errors
Check that JWT token is being sent correctly in `api.js` interceptor.

## Screenshots Description

### Dashboard View
- Three stat cards at top showing counts
- Tab navigation with color-coded icons
- Active form displayed based on selected tab

### Warehouse Transfer
- Two warehouse dropdowns (source filters out of destination)
- Item dropdown shows current stock levels
- Issued By and Received By fields
- Optional notes field

### Customer Sale
- Single warehouse dropdown
- Customer name field (optional)
- Simpler form without destination

### Stockout
- Red warning banner about notes requirement
- "Authorized By" instead of "Issued By"
- Required notes field with character counter

### Movement History
- Filter bar with 4 filters
- Export CSV button
- Color-coded badges for transfer types
- Status indicators (completed/pending)
- Responsive table layout

## Support

For issues or questions:
1. Check the backend logs at `backend/routes/b2b_enhanced.py`
2. Verify API is running on `http://localhost:8000`
3. Check browser console for errors
4. Ensure all dependencies are installed

---

**Version:** 1.0.0  
**Last Updated:** 2025-10-24  
**Component:** `B2BStockMovement.jsx`
