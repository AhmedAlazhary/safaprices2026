# Garage Management System - User Guide

## Overview

Simple and efficient garage management system with Firebase integration. The system maintains simplicity while providing powerful accounting and inventory management features.

## System Structure

### Current Tabs
- **Inventory (Inventory)** - Store items management
- **Spare Parts** - Spare parts inventory
- **Vehicles** - Vehicles in garage
- **Custody** - Staff custody items
- **Expenses** - Garage expenses
- **Suppliers** - Supplier management and balance tracking
- **Maintenance** - Internal and external maintenance records
- **Settings** - Master data configuration

## Getting Started

### 1. Access the System
1. Go to the dashboard
2. Click on "Garage and Inventory" button
3. System will open with Firebase authentication

### 2. Initial Setup
1. **Add Items**: Go to Settings tab and add inventory items
2. **Add Suppliers**: Go to Suppliers tab and add your suppliers
3. **Set Up Inventory**: Add initial inventory quantities

## Core Operations

### Inventory Management

#### Adding Items
1. Go to **Settings** tab
2. Click **Add Item**
3. Enter:
   - Item name
   - Unit (piece, liter, kg, etc.)
   - Price
4. Click **Save**

#### Updating Inventory
1. Go to **Inventory** or **Spare Parts** tab
2. Find the item
3. Update quantity directly in the table
4. System automatically calculates balance

#### Important Rules
- **No negative quantities**: System prevents inventory from going below zero
- **Real-time updates**: All changes are saved immediately to Firebase
- **Audit trail**: All operations are logged

### Supplier Management

#### Adding a Supplier
1. Go to **Suppliers** tab
2. Click **Add Supplier**
3. Enter supplier name
4. System creates supplier with zero balance

#### Supplier Balance Calculation
```
Balance = Total Purchases - Total Payments
```

#### Recording Purchases
1. Find supplier in the list
2. Click **Purchase** button
3. Enter purchase amount
4. System:
   - Updates supplier balance (increases)
   - Logs the operation
   - Updates inventory (if items specified)

#### Recording Payments
1. Find supplier in the list
2. Click **Payment** button
3. Enter payment amount
4. System:
   - Updates supplier balance (decreases)
   - Logs the operation

### Maintenance Management

#### Internal Maintenance
1. Go to **Maintenance** tab
2. Click **Add Internal Maintenance**
3. Enter:
   - Job ID
   - Car number
   - Technician name
   - Labor cost
4. System:
   - Records as internal maintenance
   - Adds to expenses as labor cost
   - Links to job if specified

#### External Maintenance
1. Go to **Maintenance** tab
2. Click **Add External Maintenance**
3. Enter:
   - Job ID
   - Car number
   - Service provider name
   - Service cost
4. System:
   - Records as external maintenance
   - Adds to expenses as service cost
   - Links to job if specified

#### Updating Maintenance Status
1. Find maintenance record
2. Click **Edit** button
3. Enter new status:
   - `pending` - Waiting to start
   - `in_progress` - Currently working
   - `completed` - Finished
   - `cancelled` - Cancelled

### Vehicle Management

#### Adding Vehicles
1. Go to **Vehicles** tab
2. Click **Add Vehicle**
3. Enter vehicle details
4. System saves to Firebase

#### Vehicle Operations
- View all vehicles in garage
- Track vehicle status
- Link vehicles to maintenance jobs

### Expense Management

#### Recording Expenses
1. Go to **Expenses** tab
2. Click **Add Expense**
3. Enter:
   - Amount
   - Description
   - Category
4. System logs and saves

#### Automatic Expenses
- Internal maintenance costs are added automatically
- External maintenance costs are added automatically

## Accounting Logic

### Key Principles

#### 1. Purchase Operation
```
Effect:
- Inventory: Increases (+)
- Supplier Balance: Increases (+)
```

#### 2. Payment Operation
```
Effect:
- Supplier Balance: Decreases (-)
- Cash/Bank: Decreases (-)
```

#### 3. Inventory Issue
```
Effect:
- Inventory: Decreases (-)
- Job Cost: Increases (+)
```

#### 4. Internal Maintenance
```
Effect:
- Expenses: Increases (+) [Labor Cost]
- Job Cost: Increases (+)
```

#### 5. External Maintenance
```
Effect:
- Expenses: Increases (+) [Service Cost]
- Supplier Balance: May increase if on credit
```

### Balance Calculations

#### Supplier Balance
```
Balance = (Sum of all purchases) - (Sum of all payments)
```

#### Inventory Balance
```
Value = Quantity × Unit Price
```

#### Total Garage Value
```
Total = (Inventory Value) + (Spare Parts Value) - (Expenses)
```

## Data Validation

### System Rules
1. **No Negative Inventory**: Prevents issuing more than available
2. **Required Fields**: Ensures all required data is entered
3. **Valid Numbers**: Only allows positive numbers for quantities and amounts
4. **Audit Trail**: All operations are logged with user and timestamp

### Error Prevention
- System validates all inputs before saving
- Prevents duplicate operations
- Shows clear error messages
- Requires confirmation for delete operations

## Real-time Features

### Automatic Updates
- All changes are saved immediately to Firebase
- No need to refresh the page
- Multiple users see updates in real-time
- Automatic balance calculations

### Offline Support
- System works offline with Firebase persistence
- Changes sync when connection is restored
- No data loss during network issues

## Security and Access

### User Roles
- **Admin**: Full system access
- **Manager**: Can manage suppliers, inventory, and view reports
- **Mechanic**: Can create jobs, issue parts, and record maintenance
- **Viewer**: Read-only access

### Data Protection
- All operations are logged
- Firebase security rules prevent unauthorized access
- Role-based access control
- Audit trail for compliance

## Troubleshooting

### Common Issues

#### "Insufficient inventory quantity"
- Check available quantity in inventory
- Issue less than or equal to available quantity
- Add more inventory if needed

#### "Error saving data"
- Check internet connection
- Try refreshing the page
- Contact administrator if issue persists

#### "Balance calculations incorrect"
- Check all purchases and payments
- Verify supplier transactions
- System automatically recalculates balances

#### "Can't access system"
- Check if you're logged in
- Verify your user role
- Contact administrator for access

### Performance Tips
- Keep browser updated
- Use stable internet connection
- Close unnecessary tabs
- Clear browser cache if slow

## Best Practices

### Data Entry
1. **Consistent Naming**: Use consistent names for suppliers and items
2. **Regular Updates**: Update inventory immediately after changes
3. **Complete Records**: Fill all required fields
4. **Regular Reviews**: Check supplier balances regularly

### Maintenance Tracking
1. **Link to Jobs**: Always link maintenance to job IDs
2. **Status Updates**: Update maintenance status promptly
3. **Cost Recording**: Record all costs accurately
4. **Documentation**: Keep supporting documents

### Supplier Management
1. **Regular Reconciliation**: Check supplier balances monthly
2. **Payment Tracking**: Record all payments promptly
3. **Purchase Documentation**: Keep purchase records
4. **Communication**: Maintain good supplier relationships

## Reports and Analytics

### Available Reports
- **Supplier Balances**: View all supplier balances
- **Inventory Status**: Current inventory levels
- **Maintenance Records**: All maintenance operations
- **Expense Summary**: Total expenses by category

### Export Data
- Export to CSV for analysis
- Print reports for documentation
- Share data with accounting team

## Mobile Usage

### Responsive Design
- System works on tablets and phones
- Touch-friendly interface
- Optimized for mobile browsers

### Mobile Tips
- Use landscape mode for better viewing
- Ensure stable internet connection
- Use mobile keyboard for number input

## Integration

### Firebase Integration
- Real-time database
- Automatic backups
- Cloud synchronization
- Security rules

### Future Enhancements
- Barcode scanning
- Mobile app
- Advanced reporting
- API integration

## Support

### Getting Help
1. Check this user guide first
2. Contact system administrator
3. Review operation logs for issues
4. Check Firebase console for system status

### Training Resources
- On-screen help text
- Tooltips for complex operations
- Error messages with guidance
- Step-by-step wizards

## System Requirements

### Browser Support
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

### Internet Requirements
- Stable internet connection
- Minimum 1 Mbps speed
- JavaScript enabled
- Cookies enabled

## Data Backup and Recovery

### Automatic Backups
- Firebase automatic backups
- Daily data snapshots
- Point-in-time recovery
- Export functionality

### Manual Backup
- Export data to CSV
- Print important reports
- Save supplier statements
- Document maintenance records

---

## Quick Reference

### Keyboard Shortcuts
- `Ctrl + S`: Save current operation
- `Ctrl + N`: New record (where applicable)
- `Enter`: Confirm action
- `Escape`: Cancel operation

### Common Formulas
- **Supplier Balance**: Purchases - Payments
- **Inventory Value**: Quantity × Price
- **Total Cost**: Labor Cost + Parts Cost
- **Profit**: Revenue - Cost

### Status Codes
- `pending`: Waiting to start
- `in_progress`: Currently working
- `completed`: Finished
- `cancelled`: Cancelled

### Color Codes
- **Green**: Positive balance, completed status
- **Red**: Negative balance, critical issues
- **Yellow**: Warning status, low inventory
- **Blue**: Information, normal status

---

*This guide covers all essential features of the Garage Management System. For specific questions or issues, contact your system administrator.*
