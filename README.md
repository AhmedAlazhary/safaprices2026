# Garage Management System

Enterprise-grade garage management system built with Firebase and modern web technologies.

## Features

### Core Functionality
- **Vehicle Management**: Track 8 vehicles with maintenance schedules
- **Staff Management**: Manage drivers, mechanics, and administrative staff
- **Inventory Control**: Real-time inventory tracking with low-stock alerts
- **Operations Tracking**: Complete audit trail of all inventory movements
- **Maintenance Orders**: Comprehensive work order management
- **Smart Notifications**: Automated alerts for critical events

### Technical Features
- **Firebase Transactions**: ACID-compliant database operations
- **Audit Trail**: Complete logging of all system activities
- **Cloud Storage**: Document and image management
- **Offline Support**: Works without internet connection
- **Role-based Security**: Granular access control
- **Real-time Updates**: Live data synchronization
- **Mobile Responsive**: Works on all devices

## Architecture

### Database Schema
```
Collections:
- vehicles (8 vehicles)
- staff (drivers, mechanics, admin)
- inventory (new/scrap/oil/parts)
- operations (issue/receive/return/transfer)
- maintenance_orders (work orders)
- audit_trail (immutable logs)
- notifications (user alerts)
- settings (system configuration)
```

### Security Model
- **Admin**: Full system access
- **Manager**: Can manage inventory, staff, and reports
- **Mechanic**: Can create work orders and issue parts
- **Driver**: Read-only access to assigned vehicles

### Data Integrity
- All critical operations use Firebase Transactions
- Atomic operations prevent data corruption
- Audit trail logs all changes
- Automatic backups and recovery

## Installation

### Prerequisites
- Node.js 16+
- Firebase CLI
- Google Cloud account

### Setup
1. Clone the repository
2. Install dependencies: `npm install`
3. Configure Firebase: `firebase login`
4. Deploy security rules: `firebase deploy --only firestore:rules`
5. Deploy functions: `firebase deploy --only functions`
6. Deploy hosting: `firebase deploy --only hosting`

### Configuration
Create `firebase.json` with your project settings:
```json
{
  "firestore": {
    "rules": "firestore-security-rules.rules"
  },
  "functions": {
    "source": "cloud-functions.js"
  },
  "hosting": {
    "public": "public",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"]
  }
}
```

## Usage

### Basic Operations
1. **Add Vehicle**: Navigate to Vehicles tab, click "Add Vehicle"
2. **Issue Parts**: Go to Inventory, select item, click "Issue"
3. **Create Work Order**: Navigate to Maintenance, click "Create Order"
4. **Track Operations**: View real-time updates in Operations tab

### Advanced Features
- **Low Stock Alerts**: Automatic notifications when items need reordering
- **Maintenance Reminders**: Scheduled alerts based on odometer readings
- **Daily Reports**: Automated daily summaries sent to managers
- **Audit Trail**: Complete history of all system changes

## API Reference

### Core Classes

#### GarageSystem
Main system controller with Firebase integration
```javascript
const garage = new GarageSystem();
await garage.initialize();
```

#### GarageSystemUI
User interface components and interactions
```javascript
const ui = new GarageSystemUI(garage);
ui.switchTab('vehicles');
```

### Key Methods

#### Inventory Operations
```javascript
// Issue inventory items
await garage.issueInventory(itemId, quantity, vehicleId, notes);

// Receive inventory items
await garage.receiveInventory(itemId, quantity, purchasePrice, supplierId, notes);
```

#### Maintenance Orders
```javascript
// Create maintenance order
await garage.createMaintenanceOrder(orderData);

// Complete maintenance order
await garage.completeMaintenanceOrder(orderId, completionData);
```

#### Document Upload
```javascript
// Upload document to Cloud Storage
const url = await garage.uploadDocument(file, path, metadata);
```

## Security

### Firestore Rules
Comprehensive security rules implemented in `firestore-security-rules.rules`:
- Role-based access control
- Data validation
- Rate limiting
- Geographic restrictions

### Authentication
- Firebase Auth integration
- Custom claims for roles
- Session management
- Password policies

### Data Protection
- All sensitive data encrypted in transit
- Audit trail for compliance
- Regular automated backups
- Data retention policies

## Monitoring and Analytics

### Performance Metrics
- Operation execution time
- Database query performance
- User activity patterns
- System health indicators

### Error Tracking
- Comprehensive error logging
- Stack trace collection
- User context preservation
- Automated alerting

### Business Intelligence
- Inventory turnover rates
- Maintenance cost analysis
- Staff productivity metrics
- Revenue and expense tracking

## Development

### Code Structure
```
garage-system-core.js     # Core business logic
garage-system-ui.js       # User interface components
cloud-functions.js        # Firebase Cloud Functions
firestore-security-rules.rules  # Security rules
garage-system-schema.md   # Database documentation
```

### Testing
```bash
# Run unit tests
npm test

# Run integration tests
npm run test:integration

# Run end-to-end tests
npm run test:e2e
```

### Code Quality
```bash
# Lint code
npm run lint

# Format code
npm run format

# Type checking
npm run type-check
```

## Deployment

### Environments
- **Development**: `garage-dev.firebaseapp.com`
- **Staging**: `garage-staging.firebaseapp.com`
- **Production**: `garage-prod.firebaseapp.com`

### CI/CD Pipeline
```yaml
# GitHub Actions workflow
name: Deploy Garage System
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Deploy to Firebase
        run: firebase deploy --project=${{ secrets.FIREBASE_PROJECT }}
```

## Backup and Recovery

### Automated Backups
- Daily database backups
- Weekly full system backups
- Monthly archive creation
- 30-day retention policy

### Recovery Procedures
1. Access Firebase Console
2. Navigate to Firestore Database
3. Use "Import Data" with backup file
4. Verify data integrity
5. Update system version if needed

## Troubleshooting

### Common Issues
- **Offline Sync**: Check network connection and clear cache
- **Permission Errors**: Verify user roles in Firebase Auth
- **Transaction Failures**: Check for concurrent operations
- **Slow Performance**: Review database indexes

### Debug Mode
Enable debug logging:
```javascript
localStorage.setItem('garage_debug', 'true');
```

## Support

### Documentation
- [API Reference](./docs/api.md)
- [Database Schema](./docs/schema.md)
- [Security Guide](./docs/security.md)
- [Deployment Guide](./docs/deployment.md)

### Contact
- Technical Support: support@garage-system.com
- Business Inquiries: business@garage-system.com
- Security Issues: security@garage-system.com

## Contributing

### Development Workflow
1. Fork the repository
2. Create feature branch
3. Make changes with tests
4. Submit pull request
5. Code review and merge

### Commit Standards
```
feat: add new feature
fix: fix bug
docs: update documentation
style: code formatting
refactor: code refactoring
test: add tests
chore: maintenance tasks
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Changelog

### Version 2.0.0
- Complete system rewrite with Firebase integration
- Added audit trail and security features
- Implemented offline support
- Added smart notifications
- Enhanced mobile responsiveness

### Version 1.0.0
- Initial release
- Basic garage management functionality
- Simple inventory tracking
- Manual work order system

## Roadmap

### Upcoming Features
- **AI Integration**: Predictive maintenance scheduling
- **Mobile App**: Native iOS and Android applications
- **Advanced Analytics**: Custom dashboard builder
- **Multi-location**: Support for multiple garage locations
- **API Integration**: Third-party system connections

### Technology Updates
- **Firebase v10**: Upgrade to latest Firebase SDK
- **PWA Support**: Progressive Web App features
- **WebAssembly**: Performance-critical operations
- **GraphQL**: Alternative API interface

---

**Built with Firebase, JavaScript, and modern web technologies.**
