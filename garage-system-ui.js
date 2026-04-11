/**
 * Garage System UI Module
 * User interface components for the garage management system
 * 
 * Features:
 * - Tab-based navigation
 * - Real-time data display
 * - Form validation
 * - Image upload
 * - Notification system
 * - Responsive design
 */

class GarageSystemUI {
  constructor(garageSystem) {
    this.garageSystem = garageSystem;
    this.currentTab = 'dashboard';
    this.modals = new Map();
    this.forms = new Map();
    this.tables = new Map();
    this.charts = new Map();
    
    this.initializeUI();
  }

  // Initialize UI components
  initializeUI() {
    this.setupNavigation();
    this.setupModals();
    this.setupForms();
    this.setupTables();
    this.setupCharts();
    this.setupEventHandlers();
    this.requestNotificationPermission();
  }

  // Setup navigation
  setupNavigation() {
    const navButtons = document.querySelectorAll('.nav-button');
    navButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        const tab = e.target.dataset.tab;
        this.switchTab(tab);
      });
    });
  }

  // Switch between tabs
  switchTab(tabName) {
    // Update navigation
    document.querySelectorAll('.nav-button').forEach(btn => {
      btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    // Update content
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('active');
    });
    document.getElementById(`tab-${tabName}`).classList.add('active');

    this.currentTab = tabName;
    this.loadTabData(tabName);
  }

  // Load data for current tab
  async loadTabData(tabName) {
    switch (tabName) {
      case 'dashboard':
        await this.loadDashboard();
        break;
      case 'vehicles':
        await this.loadVehicles();
        break;
      case 'staff':
        await this.loadStaff();
        break;
      case 'inventory':
        await this.loadInventory();
        break;
      case 'operations':
        await this.loadOperations();
        break;
      case 'maintenance':
        await this.loadMaintenanceOrders();
        break;
      case 'reports':
        await this.loadReports();
        break;
      case 'settings':
        await this.loadSettings();
        break;
    }
  }

  // Load dashboard data
  async loadDashboard() {
    const vehicles = this.garageSystem.cache.get('vehicles') || [];
    const inventory = this.garageSystem.cache.get('inventory') || [];
    const operations = this.garageSystem.cache.get('operations') || [];
    const maintenanceOrders = this.garageSystem.cache.get('maintenanceOrders') || [];

    // Update summary cards
    this.updateSummaryCard('totalVehicles', vehicles.length);
    this.updateSummaryCard('activeVehicles', vehicles.filter(v => v.status === 'active').length);
    this.updateSummaryCard('totalInventory', inventory.length);
    this.updateSummaryCard('lowStock', inventory.filter(i => i.availableQty <= i.reorderLevel).length);
    this.updateSummaryCard('pendingOrders', maintenanceOrders.filter(o => o.status === 'pending').length);
    this.updateSummaryCard('activeOrders', maintenanceOrders.filter(o => o.status === 'in_progress').length);

    // Update charts
    this.updateDashboardCharts();
    
    // Update activity feed
    this.updateActivityFeed();
  }

  // Load vehicles table
  async loadVehicles() {
    const vehicles = this.garageSystem.cache.get('vehicles') || [];
    const table = this.tables.get('vehicles');
    
    if (table) {
      table.clear();
      vehicles.forEach(vehicle => {
        table.addRow({
          id: vehicle.id,
          plateNumber: vehicle.plateNumber,
          make: vehicle.make,
          model: vehicle.model,
          year: vehicle.year,
          odometer: vehicle.odometer,
          status: vehicle.status,
          assignedDriver: vehicle.assignedDriver,
          lastMaintenance: vehicle.lastMaintenanceDate,
          nextMaintenance: vehicle.nextMaintenanceDate,
          actions: this.createVehicleActions(vehicle)
        });
      });
    }
  }

  // Load staff table
  async loadStaff() {
    const staff = this.garageSystem.cache.get('staff') || [];
    const table = this.tables.get('staff');
    
    if (table) {
      table.clear();
      staff.forEach(member => {
        table.addRow({
          id: member.id,
          name: member.name,
          email: member.email,
          role: member.role,
          specialization: member.specialization,
          phone: member.phone,
          status: member.status,
          hireDate: member.hireDate,
          actions: this.createStaffActions(member)
        });
      });
    }
  }

  // Load inventory table
  async loadInventory() {
    const inventory = this.garageSystem.cache.get('inventory') || [];
    const table = this.tables.get('inventory');
    
    if (table) {
      table.clear();
      inventory.forEach(item => {
        const stockStatus = this.getStockStatus(item.availableQty, item.reorderLevel);
        table.addRow({
          id: item.id,
          name: item.name,
          sku: item.sku,
          category: item.category,
          type: item.type,
          unit: item.unit,
          purchasePrice: item.purchasePrice,
          salePrice: item.salePrice,
          availableQty: item.availableQty,
          reorderLevel: item.reorderLevel,
          location: item.location,
          status: stockStatus,
          actions: this.createInventoryActions(item)
        });
      });
    }
  }

  // Load operations table
  async loadOperations() {
    const operations = this.garageSystem.cache.get('operations') || [];
    const table = this.tables.get('operations');
    
    if (table) {
      table.clear();
      operations.forEach(operation => {
        table.addRow({
          id: operation.id,
          type: operation.type,
          itemName: operation.itemName,
          quantity: operation.quantity,
          unitPrice: operation.unitPrice,
          totalPrice: operation.totalPrice,
          fromLocation: operation.fromLocation,
          toLocation: operation.toLocation,
          performedBy: operation.performedBy,
          status: operation.status,
          createdAt: operation.createdAt,
          actions: this.createOperationActions(operation)
        });
      });
    }
  }

  // Load maintenance orders table
  async loadMaintenanceOrders() {
    const orders = this.garageSystem.cache.get('maintenanceOrders') || [];
    const table = this.tables.get('maintenance');
    
    if (table) {
      table.clear();
      orders.forEach(order => {
        table.addRow({
          id: order.id,
          orderNumber: order.orderNumber,
          vehicleInfo: `${order.vehicleInfo.plateNumber} - ${order.vehicleInfo.make} ${order.vehicleInfo.model}`,
          mechanicInfo: order.mechanicInfo.name,
          type: order.type,
          priority: order.priority,
          status: order.status,
          estimatedCost: order.estimatedCost,
          actualCost: order.actualCost,
          createdAt: order.createdAt,
          actions: this.createMaintenanceActions(order)
        });
      });
    }
  }

  // Setup modals
  setupModals() {
    // Vehicle modal
    this.modals.set('vehicle', new Modal('vehicleModal'));
    
    // Staff modal
    this.modals.set('staff', new Modal('staffModal'));
    
    // Inventory modal
    this.modals.set('inventory', new Modal('inventoryModal'));
    
    // Operation modal
    this.modals.set('operation', new Modal('operationModal'));
    
    // Maintenance order modal
    this.modals.set('maintenance', new Modal('maintenanceModal'));
    
    // Image upload modal
    this.modals.set('imageUpload', new Modal('imageUploadModal'));
  }

  // Setup forms
  setupForms() {
    // Vehicle form
    const vehicleForm = document.getElementById('vehicleForm');
    if (vehicleForm) {
      this.forms.set('vehicle', new FormValidator(vehicleForm, {
        plateNumber: 'required',
        make: 'required',
        model: 'required',
        year: 'required|number',
        odometer: 'required|number'
      }));
    }

    // Staff form
    const staffForm = document.getElementById('staffForm');
    if (staffForm) {
      this.forms.set('staff', new FormValidator(staffForm, {
        name: 'required',
        email: 'required|email',
        role: 'required',
        phone: 'required'
      }));
    }

    // Inventory form
    const inventoryForm = document.getElementById('inventoryForm');
    if (inventoryForm) {
      this.forms.set('inventory', new FormValidator(inventoryForm, {
        name: 'required',
        sku: 'required',
        category: 'required',
        unit: 'required',
        purchasePrice: 'required|number',
        salePrice: 'required|number',
        availableQty: 'required|number',
        reorderLevel: 'required|number'
      }));
    }

    // Operation form
    const operationForm = document.getElementById('operationForm');
    if (operationForm) {
      this.forms.set('operation', new FormValidator(operationForm, {
        type: 'required',
        itemId: 'required',
        quantity: 'required|number',
        unitPrice: 'required|number'
      }));
    }

    // Maintenance order form
    const maintenanceForm = document.getElementById('maintenanceForm');
    if (maintenanceForm) {
      this.forms.set('maintenance', new FormValidator(maintenanceForm, {
        vehicleId: 'required',
        assignedMechanic: 'required',
        type: 'required',
        priority: 'required',
        estimatedCost: 'required|number'
      }));
    }
  }

  // Setup tables
  setupTables() {
    // Vehicles table
    const vehiclesTable = document.getElementById('vehiclesTable');
    if (vehiclesTable) {
      this.tables.set('vehicles', new DataTable(vehiclesTable, {
        columns: [
          { title: 'ID', data: 'id', visible: false },
          { title: 'Plate Number', data: 'plateNumber' },
          { title: 'Make', data: 'make' },
          { title: 'Model', data: 'model' },
          { title: 'Year', data: 'year' },
          { title: 'Odometer', data: 'odometer', render: this.formatNumber },
          { title: 'Status', data: 'status', render: this.renderStatus },
          { title: 'Driver', data: 'assignedDriver', render: this.renderDriver },
          { title: 'Last Maintenance', data: 'lastMaintenance', render: this.formatDate },
          { title: 'Next Maintenance', data: 'nextMaintenance', render: this.formatDate },
          { title: 'Actions', data: 'actions', orderable: false }
        ]
      }));
    }

    // Staff table
    const staffTable = document.getElementById('staffTable');
    if (staffTable) {
      this.tables.set('staff', new DataTable(staffTable, {
        columns: [
          { title: 'ID', data: 'id', visible: false },
          { title: 'Name', data: 'name' },
          { title: 'Email', data: 'email' },
          { title: 'Role', data: 'role', render: this.renderRole },
          { title: 'Specialization', data: 'specialization' },
          { title: 'Phone', data: 'phone' },
          { title: 'Status', data: 'status', render: this.renderStatus },
          { title: 'Hire Date', data: 'hireDate', render: this.formatDate },
          { title: 'Actions', data: 'actions', orderable: false }
        ]
      }));
    }

    // Inventory table
    const inventoryTable = document.getElementById('inventoryTable');
    if (inventoryTable) {
      this.tables.set('inventory', new DataTable(inventoryTable, {
        columns: [
          { title: 'ID', data: 'id', visible: false },
          { title: 'Name', data: 'name' },
          { title: 'SKU', data: 'sku' },
          { title: 'Category', data: 'category' },
          { title: 'Type', data: 'type', render: this.renderType },
          { title: 'Unit', data: 'unit' },
          { title: 'Purchase Price', data: 'purchasePrice', render: this.formatCurrency },
          { title: 'Sale Price', data: 'salePrice', render: this.formatCurrency },
          { title: 'Available Qty', data: 'availableQty', render: this.formatNumber },
          { title: 'Reorder Level', data: 'reorderLevel', render: this.formatNumber },
          { title: 'Location', data: 'location' },
          { title: 'Status', data: 'status', render: this.renderStockStatus },
          { title: 'Actions', data: 'actions', orderable: false }
        ]
      }));
    }

    // Operations table
    const operationsTable = document.getElementById('operationsTable');
    if (operationsTable) {
      this.tables.set('operations', new DataTable(operationsTable, {
        columns: [
          { title: 'ID', data: 'id', visible: false },
          { title: 'Type', data: 'type', render: this.renderOperationType },
          { title: 'Item', data: 'itemName' },
          { title: 'Quantity', data: 'quantity', render: this.formatNumber },
          { title: 'Unit Price', data: 'unitPrice', render: this.formatCurrency },
          { title: 'Total Price', data: 'totalPrice', render: this.formatCurrency },
          { title: 'From', data: 'fromLocation' },
          { title: 'To', data: 'toLocation' },
          { title: 'Performed By', data: 'performedBy', render: this.renderUser },
          { title: 'Status', data: 'status', render: this.renderStatus },
          { title: 'Created', data: 'createdAt', render: this.formatDateTime },
          { title: 'Actions', data: 'actions', orderable: false }
        ]
      }));
    }

    // Maintenance orders table
    const maintenanceTable = document.getElementById('maintenanceTable');
    if (maintenanceTable) {
      this.tables.set('maintenance', new DataTable(maintenanceTable, {
        columns: [
          { title: 'ID', data: 'id', visible: false },
          { title: 'Order Number', data: 'orderNumber' },
          { title: 'Vehicle', data: 'vehicleInfo' },
          { title: 'Mechanic', data: 'mechanicInfo' },
          { title: 'Type', data: 'type', render: this.renderMaintenanceType },
          { title: 'Priority', data: 'priority', render: this.renderPriority },
          { title: 'Status', data: 'status', render: this.renderStatus },
          { title: 'Est. Cost', data: 'estimatedCost', render: this.formatCurrency },
          { title: 'Actual Cost', data: 'actualCost', render: this.formatCurrency },
          { title: 'Created', data: 'createdAt', render: this.formatDateTime },
          { title: 'Actions', data: 'actions', orderable: false }
        ]
      }));
    }
  }

  // Setup charts
  setupCharts() {
    // Inventory status chart
    const inventoryChart = document.getElementById('inventoryChart');
    if (inventoryChart) {
      this.charts.set('inventory', new Chart(inventoryChart, {
        type: 'doughnut',
        options: {
          responsive: true,
          maintainAspectRatio: false
        }
      }));
    }

    // Operations chart
    const operationsChart = document.getElementById('operationsChart');
    if (operationsChart) {
      this.charts.set('operations', new Chart(operationsChart, {
        type: 'bar',
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              beginAtZero: true
            }
          }
        }
      }));
    }

    // Maintenance chart
    const maintenanceChart = document.getElementById('maintenanceChart');
    if (maintenanceChart) {
      this.charts.set('maintenance', new Chart(maintenanceChart, {
        type: 'line',
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              beginAtZero: true
            }
          }
        }
      }));
    }
  }

  // Update dashboard charts
  updateDashboardCharts() {
    const inventory = this.garageSystem.cache.get('inventory') || [];
    const operations = this.garageSystem.cache.get('operations') || [];
    const maintenanceOrders = this.garageSystem.cache.get('maintenanceOrders') || [];

    // Update inventory chart
    const inventoryChart = this.charts.get('inventory');
    if (inventoryChart) {
      const categories = {};
      inventory.forEach(item => {
        categories[item.category] = (categories[item.category] || 0) + 1;
      });
      
      inventoryChart.data = {
        labels: Object.keys(categories),
        datasets: [{
          data: Object.values(categories),
          backgroundColor: [
            '#FF6384',
            '#36A2EB',
            '#FFCE56',
            '#4BC0C0',
            '#9966FF'
          ]
        }]
      };
      inventoryChart.update();
    }

    // Update operations chart
    const operationsChart = this.charts.get('operations');
    if (operationsChart) {
      const last7Days = [];
      const issueData = [];
      const receiveData = [];
      
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        last7Days.push(dateStr);
        
        const dayOperations = operations.filter(op => 
          op.createdAt && op.createdAt.toDate && 
          op.createdAt.toDate().toISOString().split('T')[0] === dateStr
        );
        
        issueData.push(dayOperations.filter(op => op.type === 'issue').length);
        receiveData.push(dayOperations.filter(op => op.type === 'receive').length);
      }
      
      operationsChart.data = {
        labels: last7Days,
        datasets: [
          {
            label: 'Issues',
            data: issueData,
            backgroundColor: '#FF6384'
          },
          {
            label: 'Receives',
            data: receiveData,
            backgroundColor: '#36A2EB'
          }
        ]
      };
      operationsChart.update();
    }

    // Update maintenance chart
    const maintenanceChart = this.charts.get('maintenance');
    if (maintenanceChart) {
      const last30Days = [];
      const orderData = [];
      
      for (let i = 29; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        last30Days.push(dateStr);
        
        const dayOrders = maintenanceOrders.filter(order => 
          order.createdAt && order.createdAt.toDate && 
          order.createdAt.toDate().toISOString().split('T')[0] === dateStr
        );
        
        orderData.push(dayOrders.length);
      }
      
      maintenanceChart.data = {
        labels: last30Days,
        datasets: [{
          label: 'Maintenance Orders',
          data: orderData,
          borderColor: '#4BC0C0',
          backgroundColor: 'rgba(75, 192, 192, 0.2)',
          tension: 0.4
        }]
      };
      maintenanceChart.update();
    }
  }

  // Update activity feed
  updateActivityFeed() {
    const operations = this.garageSystem.cache.get('operations') || [];
    const maintenanceOrders = this.garageSystem.cache.get('maintenanceOrders') || [];
    
    const activities = [
      ...operations.slice(0, 5).map(op => ({
        type: 'operation',
        icon: this.getOperationIcon(op.type),
        title: `${op.type}: ${op.itemName}`,
        description: `${op.quantity} units from ${op.fromLocation} to ${op.toLocation}`,
        time: this.formatTimeAgo(op.createdAt),
        user: op.performedBy
      })),
      ...maintenanceOrders.slice(0, 5).map(order => ({
        type: 'maintenance',
        icon: 'fa-wrench',
        title: `Order: ${order.orderNumber}`,
        description: `${order.vehicleInfo.plateNumber} - ${order.mechanicInfo.name}`,
        time: this.formatTimeAgo(order.createdAt),
        user: order.createdBy
      }))
    ].sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 10);

    const feedContainer = document.getElementById('activityFeed');
    if (feedContainer) {
      feedContainer.innerHTML = activities.map(activity => `
        <div class="activity-item">
          <div class="activity-icon">
            <i class="fas ${activity.icon}"></i>
          </div>
          <div class="activity-content">
            <div class="activity-title">${activity.title}</div>
            <div class="activity-description">${activity.description}</div>
            <div class="activity-meta">
              <span class="activity-time">${activity.time}</span>
              <span class="activity-user">${activity.user}</span>
            </div>
          </div>
        </div>
      `).join('');
    }
  }

  // Create vehicle actions
  createVehicleActions(vehicle) {
    return `
      <button class="btn btn-sm btn-primary" onclick="garageUI.editVehicle('${vehicle.id}')">
        <i class="fas fa-edit"></i>
      </button>
      <button class="btn btn-sm btn-info" onclick="garageUI.viewVehicle('${vehicle.id}')">
        <i class="fas fa-eye"></i>
      </button>
      <button class="btn btn-sm btn-success" onclick="garageUI.createMaintenanceOrder('${vehicle.id}')">
        <i class="fas fa-wrench"></i>
      </button>
    `;
  }

  // Create staff actions
  createStaffActions(staff) {
    return `
      <button class="btn btn-sm btn-primary" onclick="garageUI.editStaff('${staff.id}')">
        <i class="fas fa-edit"></i>
      </button>
      <button class="btn btn-sm btn-info" onclick="garageUI.viewStaff('${staff.id}')">
        <i class="fas fa-eye"></i>
      </button>
    `;
  }

  // Create inventory actions
  createInventoryActions(item) {
    return `
      <button class="btn btn-sm btn-primary" onclick="garageUI.editInventory('${item.id}')">
        <i class="fas fa-edit"></i>
      </button>
      <button class="btn btn-sm btn-warning" onclick="garageUI.issueInventory('${item.id}')">
        <i class="fas fa-minus"></i>
      </button>
      <button class="btn btn-sm btn-success" onclick="garageUI.receiveInventory('${item.id}')">
        <i class="fas fa-plus"></i>
      </button>
    `;
  }

  // Create operation actions
  createOperationActions(operation) {
    return `
      <button class="btn btn-sm btn-info" onclick="garageUI.viewOperation('${operation.id}')">
        <i class="fas fa-eye"></i>
      </button>
      <button class="btn btn-sm btn-warning" onclick="garageUI.printOperation('${operation.id}')">
        <i class="fas fa-print"></i>
      </button>
    `;
  }

  // Create maintenance actions
  createMaintenanceActions(order) {
    return `
      <button class="btn btn-sm btn-primary" onclick="garageUI.editMaintenance('${order.id}')">
        <i class="fas fa-edit"></i>
      </button>
      <button class="btn btn-sm btn-info" onclick="garageUI.viewMaintenance('${order.id}')">
        <i class="fas fa-eye"></i>
      </button>
      <button class="btn btn-sm btn-success" onclick="garageUI.completeMaintenance('${order.id}')">
        <i class="fas fa-check"></i>
      </button>
    `;
  }

  // Render functions
  renderStatus(data) {
    const statusColors = {
      active: 'success',
      inactive: 'secondary',
      pending: 'warning',
      in_progress: 'info',
      completed: 'success',
      cancelled: 'danger'
    };
    const color = statusColors[data] || 'secondary';
    return `<span class="badge badge-${color}">${data}</span>`;
  }

  renderRole(data) {
    const roleIcons = {
      admin: 'fa-user-shield',
      manager: 'fa-user-tie',
      mechanic: 'fa-wrench',
      driver: 'fa-car'
    };
    const icon = roleIcons[data] || 'fa-user';
    return `<i class="fas ${icon}"></i> ${data}`;
  }

  renderType(data) {
    const typeColors = {
      new: 'success',
      used: 'warning',
      scrap: 'danger'
    };
    const color = typeColors[data] || 'secondary';
    return `<span class="badge badge-${color}">${data}</span>`;
  }

  renderStockStatus(data) {
    const statusColors = {
      normal: 'success',
      low: 'warning',
      critical: 'danger'
    };
    const color = statusColors[data] || 'secondary';
    return `<span class="badge badge-${color}">${data}</span>`;
  }

  renderOperationType(data) {
    const typeIcons = {
      issue: 'fa-minus-circle',
      receive: 'fa-plus-circle',
      return: 'fa-undo',
      transfer: 'fa-exchange-alt'
    };
    const icon = typeIcons[data] || 'fa-circle';
    return `<i class="fas ${icon}"></i> ${data}`;
  }

  renderMaintenanceType(data) {
    const typeIcons = {
      scheduled: 'fa-calendar',
      emergency: 'fa-exclamation-triangle',
      repair: 'fa-wrench'
    };
    const icon = typeIcons[data] || 'fa-tools';
    return `<i class="fas ${icon}"></i> ${data}`;
  }

  renderPriority(data) {
    const priorityColors = {
      low: 'success',
      normal: 'info',
      high: 'warning',
      urgent: 'danger'
    };
    const color = priorityColors[data] || 'secondary';
    return `<span class="badge badge-${color}">${data}</span>`;
  }

  renderDriver(data) {
    const staff = this.garageSystem.cache.get('staff') || [];
    const driver = staff.find(s => s.id === data);
    return driver ? driver.name : 'Unassigned';
  }

  renderUser(data) {
    const staff = this.garageSystem.cache.get('staff') || [];
    const user = staff.find(s => s.id === data);
    return user ? user.name : data;
  }

  // Format functions
  formatNumber(data) {
    return new Intl.NumberFormat().format(data);
  }

  formatCurrency(data) {
    return new Intl.NumberFormat('ar-EG', {
      style: 'currency',
      currency: 'EGP'
    }).format(data);
  }

  formatDate(data) {
    if (!data) return '-';
    return new Date(data.toDate ? data.toDate() : data).toLocaleDateString('ar-EG');
  }

  formatDateTime(data) {
    if (!data) return '-';
    return new Date(data.toDate ? data.toDate() : data).toLocaleString('ar-EG');
  }

  formatTimeAgo(data) {
    if (!data) return '-';
    const now = new Date();
    const then = new Date(data.toDate ? data.toDate() : data);
    const diff = now - then;
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (days > 0) return `${days} days ago`;
    if (hours > 0) return `${hours} hours ago`;
    if (minutes > 0) return `${minutes} minutes ago`;
    return 'Just now';
  }

  // Get stock status
  getStockStatus(quantity, reorderLevel) {
    if (quantity <= 0) return 'critical';
    if (quantity <= reorderLevel) return 'low';
    return 'normal';
  }

  // Get operation icon
  getOperationIcon(type) {
    const icons = {
      issue: 'fa-minus-circle',
      receive: 'fa-plus-circle',
      return: 'fa-undo',
      transfer: 'fa-exchange-alt'
    };
    return icons[type] || 'fa-circle';
  }

  // Update summary card
  updateSummaryCard(id, value) {
    const card = document.getElementById(id);
    if (card) {
      card.textContent = value;
    }
  }

  // Request notification permission
  async requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  }

  // Setup event handlers
  setupEventHandlers() {
    // Handle form submissions
    document.querySelectorAll('form').forEach(form => {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleFormSubmit(form.id);
      });
    });

    // Handle image uploads
    document.querySelectorAll('input[type="file"]').forEach(input => {
      input.addEventListener('change', (e) => {
        this.handleImageUpload(e);
      });
    });

    // Handle search
    document.querySelectorAll('.search-input').forEach(input => {
      input.addEventListener('input', (e) => {
        this.handleSearch(e.target.value, e.target.dataset.table);
      });
    });

    // Handle export
    document.querySelectorAll('.export-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.handleExport(e.target.dataset.type);
      });
    });
  }

  // Handle form submission
  async handleFormSubmit(formId) {
    const form = this.forms.get(formId);
    if (!form) return;

    try {
      const formData = form.getFormData();
      
      switch (formId) {
        case 'vehicleForm':
          await this.saveVehicle(formData);
          break;
        case 'staffForm':
          await this.saveStaff(formData);
          break;
        case 'inventoryForm':
          await this.saveInventory(formData);
          break;
        case 'operationForm':
          await this.saveOperation(formData);
          break;
        case 'maintenanceForm':
          await this.saveMaintenance(formData);
          break;
      }

      this.showNotification('Success', 'Data saved successfully', 'success');
      this.modals.get(formId.replace('Form', 'Modal')).hide();
      
    } catch (error) {
      console.error('Form submission error:', error);
      this.showNotification('Error', error.message, 'error');
    }
  }

  // Handle image upload
  async handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const imageUrl = await this.garageSystem.uploadDocument(
        file,
        `images/${Date.now()}_${file.name}`,
        { type: 'image' }
      );

      // Update preview
      const preview = event.target.closest('.form-group').querySelector('.image-preview');
      if (preview) {
        preview.src = imageUrl;
        preview.style.display = 'block';
      }

    } catch (error) {
      console.error('Image upload error:', error);
      this.showNotification('Error', 'Failed to upload image', 'error');
    }
  }

  // Handle search
  handleSearch(query, tableId) {
    const table = this.tables.get(tableId);
    if (table) {
      table.search(query);
    }
  }

  // Handle export
  async handleExport(type) {
    try {
      const data = await this.getExportData(type);
      const csv = this.convertToCSV(data);
      this.downloadCSV(csv, `${type}_export_${Date.now()}.csv`);
      
      this.showNotification('Success', 'Data exported successfully', 'success');
    } catch (error) {
      console.error('Export error:', error);
      this.showNotification('Error', 'Failed to export data', 'error');
    }
  }

  // Show notification
  showNotification(title, message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `alert alert-${type} alert-dismissible fade show`;
    notification.innerHTML = `
      <strong>${title}</strong> ${message}
      <button type="button" class="close" data-dismiss="alert">
        <span>&times;</span>
      </button>
    `;

    const container = document.getElementById('notifications');
    if (container) {
      container.appendChild(notification);
      
      setTimeout(() => {
        notification.remove();
      }, 5000);
    }
  }

  // Export helper methods
  async getExportData(type) {
    switch (type) {
      case 'vehicles':
        return this.garageSystem.cache.get('vehicles') || [];
      case 'staff':
        return this.garageSystem.cache.get('staff') || [];
      case 'inventory':
        return this.garageSystem.cache.get('inventory') || [];
      case 'operations':
        return this.garageSystem.cache.get('operations') || [];
      case 'maintenance':
        return this.garageSystem.cache.get('maintenanceOrders') || [];
      default:
        return [];
    }
  }

  convertToCSV(data) {
    if (data.length === 0) return '';

    const headers = Object.keys(data[0]);
    const csvHeaders = headers.join(',');
    const csvRows = data.map(row => 
      headers.map(header => `"${row[header] || ''}"`).join(',')
    );

    return [csvHeaders, ...csvRows].join('\n');
  }

  downloadCSV(csv, filename) {
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  }
}

// Export for use in other modules
window.GarageSystemUI = GarageSystemUI;

// Initialize UI when garage system is ready
document.addEventListener('DOMContentLoaded', () => {
  if (window.garageSystem) {
    window.garageUI = new GarageSystemUI(window.garageSystem);
  }
});
