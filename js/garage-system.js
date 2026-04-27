import {
  auth,
  db,
  onAuthStateChanged,
  collection,
  getDocs
} from "../firebase-config.js";
import { getUserRole, logout } from "./auth-guard-module.js";
import {
  getFunctions,
  httpsCallable
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-functions.js";

const garageSystem = {
  collections: {
    accounts: "garageSystem_accounts",
    products: "garageSystem_products",
    vehicles: "garageSystem_vehicles",
    workers: "garageSystem_workers",
    liabilities: "garageSystem_liabilities",
    stockMovements: "garageSystem_stock_movements",
    journalEntries: "garageSystem_journal_entries",
    workOrders: "garageSystem_work_orders",
    auditLogs: "garageSystem_audit_logs"
  },
  state: {
    user: null,
    role: "viewer",
    accounts: [],
    products: [],
    vehicles: [],
    workers: [],
    liabilities: [],
    stockMovements: [],
    journalEntries: [],
    workOrders: []
  }
};

const functions = getFunctions();
const createMasterRecord = httpsCallable(functions, "garageSystemCreateMasterRecord");
const createWorkOrder = httpsCallable(functions, "garageSystemCreateWorkOrder");
const processStockMovement = httpsCallable(functions, "garageSystemProcessStockMovement");
const settleLiability = httpsCallable(functions, "garageSystemSettleLiability");
const updateWorkOrderStatus = httpsCallable(functions, "garageSystemUpdateWorkOrderStatus");

const els = {
  tabs: Array.from(document.querySelectorAll(".garage-tab")),
  panels: Array.from(document.querySelectorAll(".garage-panel")),
  alert: document.getElementById("garageAlert"),
  sectionTitle: document.getElementById("garageSectionTitle"),
  metrics: document.getElementById("garageMetrics"),
  lowStockList: document.getElementById("garageLowStockList"),
  recentWorkOrders: document.getElementById("garageRecentWorkOrders"),
  productsTable: document.getElementById("garageProductsTable"),
  vehiclesTable: document.getElementById("garageVehiclesTable"),
  workOrdersTable: document.getElementById("garageWorkOrdersTable"),
  movementsTable: document.getElementById("garageMovementsTable"),
  liabilitiesTable: document.getElementById("garageLiabilitiesTable"),
  reportPreview: document.getElementById("garageReportPreview"),
  refreshBtn: document.getElementById("garageRefreshBtn"),
  logoutBtn: document.getElementById("garageLogoutBtn"),
  userName: document.getElementById("garageUserName"),
  userRole: document.getElementById("garageUserRole"),
  forms: {
    product: document.getElementById("garageProductForm"),
    vehicle: document.getElementById("garageVehicleForm"),
    worker: document.getElementById("garageWorkerForm"),
    account: document.getElementById("garageAccountForm"),
    workOrder: document.getElementById("garageWorkOrderForm"),
    workOrderStatus: document.getElementById("garageWorkOrderStatusForm"),
    movement: document.getElementById("garageMovementForm"),
    scrap: document.getElementById("garageScrapForm"),
    liability: document.getElementById("garageLiabilityForm"),
    settlement: document.getElementById("garageSettlementForm")
  }
};

const selectMap = {
  vehicles: [
    "garageWorkOrderVehicle",
    "garageMovementVehicle",
    "garageScrapVehicle",
    "garageProfitVehicle"
  ],
  workers: ["garageMovementWorker"],
  workOrders: ["garageMovementWorkOrder", "garageScrapWorkOrder"],
  products: ["garageMovementProduct", "garageScrapNewProduct", "garageScrapOldProduct"],
  liabilities: [
    "garageMovementLiability",
    "garageSettlementLiability",
    "garageLiabilityReportSelect"
  ]
};

function showAlert(message, type = "info") {
  els.alert.hidden = false;
  els.alert.textContent = message;
  els.alert.style.background = type === "error" ? "#f7e2e2" : "#fff1cd";
  els.alert.style.borderColor = type === "error" ? "#c56a6a" : "#e2c165";
}

function clearAlert() {
  els.alert.hidden = true;
  els.alert.textContent = "";
}

function setActiveTab(tabName) {
  els.tabs.forEach((tab) => {
    const active = tab.dataset.tab === tabName;
    tab.classList.toggle("is-active", active);
  });
  els.panels.forEach((panel) => {
    const active = panel.dataset.panel === tabName;
    panel.classList.toggle("is-active", active);
  });

  const titles = {
    overview: "لوحة المتابعة",
    masters: "البيانات الأساسية",
    workorders: "أوامر الصيانة",
    movements: "حركات المخزون",
    liabilities: "العهد والتسوية",
    reports: "التقارير"
  };
  els.sectionTitle.textContent = titles[tabName] || "نظام SAFATRANS";
}

function currency(value) {
  return new Intl.NumberFormat("ar-EG", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatDate(value) {
  if (!value) return "-";
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("ar-EG");
}

function getNameById(list, id, key = "name") {
  return list.find((item) => item.id === id)?.[key] || "-";
}

async function fetchCollection(key) {
  const snapshot = await getDocs(collection(db, garageSystem.collections[key]));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

async function loadState() {
  const [accounts, products, vehicles, workers, liabilities, stockMovements, journalEntries, workOrders] =
    await Promise.all([
      fetchCollection("accounts"),
      fetchCollection("products"),
      fetchCollection("vehicles"),
      fetchCollection("workers"),
      fetchCollection("liabilities"),
      fetchCollection("stockMovements"),
      fetchCollection("journalEntries"),
      fetchCollection("workOrders")
    ]);

  garageSystem.state.accounts = accounts;
  garageSystem.state.products = products;
  garageSystem.state.vehicles = vehicles;
  garageSystem.state.workers = workers;
  garageSystem.state.liabilities = liabilities;
  garageSystem.state.stockMovements = stockMovements.sort(sortByCreatedAt);
  garageSystem.state.journalEntries = journalEntries.sort(sortByCreatedAt);
  garageSystem.state.workOrders = workOrders.sort(sortByCreatedAt);
}

function sortByCreatedAt(left, right) {
  const a = left.createdAt?.seconds || 0;
  const b = right.createdAt?.seconds || 0;
  return b - a;
}

function renderMetrics() {
  const products = garageSystem.state.products;
  const workOrders = garageSystem.state.workOrders;
  const liabilities = garageSystem.state.liabilities;
  const lowStockCount = products.filter((item) => Number(item.currentStock || 0) <= Number(item.minStock || 0)).length;
  const openWorkOrders = workOrders.filter((item) => item.status !== "CLOSED").length;
  const activeLiabilities = liabilities.filter((item) => item.status !== "SETTLED").length;
  const inventoryValue = products.reduce(
    (sum, item) => sum + Number(item.currentStock || 0) * Number(item.unitPrice || 0),
    0
  );

  els.metrics.innerHTML = [
    { label: "الأصناف", value: products.length },
    { label: "تنبيهات مخزون", value: lowStockCount },
    { label: "أوامر مفتوحة", value: openWorkOrders },
    { label: "عهد نشطة", value: activeLiabilities },
    { label: "قيمة المخزون", value: currency(inventoryValue) }
  ]
    .map(
      (metric) => `
        <div class="metric-card">
          <span>${metric.label}</span>
          <strong>${escapeHtml(metric.value)}</strong>
        </div>
      `
    )
    .join("");
}

function renderOverviewLists() {
  const lowStockItems = garageSystem.state.products.filter(
    (item) => Number(item.currentStock || 0) <= Number(item.minStock || 0)
  );
  els.lowStockList.innerHTML =
    lowStockItems.length === 0
      ? '<div class="list-item">لا توجد أصناف أقل من الحد الأدنى حالياً.</div>'
      : lowStockItems
          .map(
            (item) => `
              <div class="list-item">
                <strong>${escapeHtml(item.name)}</strong>
                <div>الرصيد: ${escapeHtml(item.currentStock || 0)} | الحد الأدنى: ${escapeHtml(item.minStock || 0)}</div>
              </div>
            `
          )
          .join("");

  const recentOrders = garageSystem.state.workOrders.slice(0, 5);
  els.recentWorkOrders.innerHTML =
    recentOrders.length === 0
      ? '<div class="list-item">لا توجد أوامر صيانة مسجلة بعد.</div>'
      : recentOrders
          .map(
            (order) => `
              <div class="list-item">
                <strong>${escapeHtml(order.code || order.id)}</strong>
                <div>${escapeHtml(getNameById(garageSystem.state.vehicles, order.vehicleId, "plate"))}</div>
                <div>${escapeHtml(order.description || "-")}</div>
              </div>
            `
          )
          .join("");
}

function renderTables() {
  els.productsTable.innerHTML = garageSystem.state.products
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.code || item.id)}</td>
          <td>${escapeHtml(item.name)}</td>
          <td>${escapeHtml(item.currentStock || 0)}</td>
          <td>${currency(item.unitPrice)}</td>
        </tr>
      `
    )
    .join("");

  els.vehiclesTable.innerHTML = garageSystem.state.vehicles
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.plate)}</td>
          <td>${escapeHtml(item.model)}</td>
          <td>${escapeHtml(item.customerName)}</td>
        </tr>
      `
    )
    .join("");

  els.workOrdersTable.innerHTML = garageSystem.state.workOrders
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.code || item.id)}</td>
          <td>${escapeHtml(getNameById(garageSystem.state.vehicles, item.vehicleId, "plate"))}</td>
          <td><span class="status-pill status-${String(item.status || "").toLowerCase()}">${escapeHtml(item.status)}</span></td>
          <td>${currency(item.totalCost)}</td>
        </tr>
      `
    )
    .join("");

  els.movementsTable.innerHTML = garageSystem.state.stockMovements
    .slice(0, 12)
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.code || item.id)}</td>
          <td>${escapeHtml(item.type)}</td>
          <td>${escapeHtml(getNameById(garageSystem.state.products, item.productId))}</td>
          <td>${escapeHtml(item.quantity)}</td>
          <td>${currency(item.cost)}</td>
          <td>${escapeHtml(getNameById(garageSystem.state.vehicles, item.vehicleId, "plate"))}</td>
        </tr>
      `
    )
    .join("");

  els.liabilitiesTable.innerHTML = garageSystem.state.liabilities
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.code || item.id)}</td>
          <td>${escapeHtml(item.type)}</td>
          <td>${currency(item.amount)}</td>
          <td>${currency(item.remaining)}</td>
          <td><span class="status-pill status-${String(item.status || "").toLowerCase()}">${escapeHtml(item.status)}</span></td>
        </tr>
      `
    )
    .join("");
}

function buildOptions(list, labelBuilder, includeBlank = false, blankLabel = "اختر") {
  const options = includeBlank ? [`<option value="">${blankLabel}</option>`] : [];
  list.forEach((item) => {
    options.push(`<option value="${escapeHtml(item.id)}">${escapeHtml(labelBuilder(item))}</option>`);
  });
  return options.join("");
}

function syncSelects() {
  const products = garageSystem.state.products;
  const vehicles = garageSystem.state.vehicles;
  const workers = garageSystem.state.workers;
  const workOrders = garageSystem.state.workOrders;
  const liabilities = garageSystem.state.liabilities.filter((item) => item.status !== "SETTLED");

  selectMap.products.forEach((id) => {
    document.getElementById(id).innerHTML = buildOptions(products, (item) => `${item.name} - ${item.code || item.id}`, true);
  });
  selectMap.vehicles.forEach((id) => {
    document.getElementById(id).innerHTML = buildOptions(vehicles, (item) => `${item.plate} - ${item.model}`, true);
  });
  selectMap.workOrders.forEach((id) => {
    document.getElementById(id).innerHTML = buildOptions(workOrders, (item) => `${item.code || item.id} - ${item.status}`, true);
  });
  document.getElementById("garageStatusWorkOrder").innerHTML = buildOptions(
    workOrders,
    (item) => `${item.code || item.id} - ${item.status}`,
    true
  );
  selectMap.workers.forEach((id) => {
    document.getElementById(id).innerHTML = buildOptions(workers, (item) => `${item.name} - ${item.type}`, true);
  });
  selectMap.liabilities.forEach((id) => {
    document.getElementById(id).innerHTML = buildOptions(liabilities, (item) => `${item.code || item.id} - ${currency(item.remaining)}`, true);
  });
}

function renderAll() {
  renderMetrics();
  renderOverviewLists();
  renderTables();
  syncSelects();
}

function formToObject(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  Object.keys(data).forEach((key) => {
    if (data[key] === "") {
      delete data[key];
    }
  });
  return data;
}

async function handleMasterForm(entity, form, transformer) {
  const raw = formToObject(form);
  const payload = transformer(raw);
  await createMasterRecord({ entity, data: payload });
  form.reset();
}

async function refreshView(successMessage = "") {
  await loadState();
  renderAll();
  if (successMessage) showAlert(successMessage);
}

function buildVehicleProfitabilityReport(vehicleId) {
  const vehicle = garageSystem.state.vehicles.find((item) => item.id === vehicleId);
  const linkedMovements = garageSystem.state.stockMovements.filter((item) => item.vehicleId === vehicleId);
  const linkedOrders = garageSystem.state.workOrders.filter((item) => item.vehicleId === vehicleId);
  const partsCost = linkedMovements
    .filter((item) => item.type === "OUT")
    .reduce((sum, item) => sum + Number(item.cost || 0), 0);
  const liabilityCost = linkedMovements
    .filter((item) => item.liabilityId)
    .reduce((sum, item) => sum + Number(item.cost || 0), 0);
  const laborCost = linkedOrders.reduce((sum, item) => sum + Number(item.laborCost || 0), 0);
  const totalCost = partsCost + laborCost;

  return `
    <h2>تقرير ربحية السيارة</h2>
    <p><strong>المركبة:</strong> ${escapeHtml(vehicle?.plate || "-")} - ${escapeHtml(vehicle?.model || "-")}</p>
    <p><strong>العميل:</strong> ${escapeHtml(vehicle?.customerName || "-")}</p>
    <hr>
    <p>تكلفة قطع الغيار: ${currency(partsCost)}</p>
    <p>تكلفة العمالة: ${currency(laborCost)}</p>
    <p>تكاليف مرتبطة بعهدة: ${currency(liabilityCost)}</p>
    <p><strong>إجمالي تكلفة الصيانة:</strong> ${currency(totalCost)}</p>
    <h3>أوامر الصيانة</h3>
    <ul>${linkedOrders.map((item) => `<li>${escapeHtml(item.code || item.id)} - ${escapeHtml(item.description || "-")} - ${currency(item.totalCost)}</li>`).join("") || "<li>لا توجد أوامر</li>"}</ul>
  `;
}

function buildLiabilityReport(liabilityId) {
  const liability = garageSystem.state.liabilities.find((item) => item.id === liabilityId);
  const linkedMovements = garageSystem.state.stockMovements.filter((item) => item.liabilityId === liabilityId);

  return `
    <h2>كشف حساب العهدة</h2>
    <p><strong>المرجع:</strong> ${escapeHtml(liability?.code || liability?.id || "-")}</p>
    <p><strong>النوع:</strong> ${escapeHtml(liability?.type || "-")}</p>
    <p><strong>القيمة الأصلية:</strong> ${currency(liability?.amount)}</p>
    <p><strong>المتبقي:</strong> ${currency(liability?.remaining)}</p>
    <p><strong>الحالة:</strong> ${escapeHtml(liability?.status || "-")}</p>
    <hr>
    <h3>الحركات المرتبطة</h3>
    <ul>${linkedMovements.map((item) => `<li>${escapeHtml(item.code || item.id)} - ${escapeHtml(item.type)} - ${currency(item.cost)} - ${formatDate(item.createdAt)}</li>`).join("") || "<li>لا توجد حركات</li>"}</ul>
  `;
}

function buildInventoryAuditReport() {
  const rows = garageSystem.state.products
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.code || item.id)}</td>
          <td>${escapeHtml(item.name)}</td>
          <td>${escapeHtml(item.currentStock || 0)}</td>
          <td>${escapeHtml(item.minStock || 0)}</td>
          <td>${currency(item.unitPrice)}</td>
          <td>${currency(Number(item.currentStock || 0) * Number(item.unitPrice || 0))}</td>
        </tr>
      `
    )
    .join("");

  return `
    <h2>تقرير الجرد الدوري</h2>
    <p>تاريخ الإصدار: ${formatDate(new Date())}</p>
    <table style="width:100%; border-collapse: collapse;">
      <thead>
        <tr>
          <th style="text-align:right; border-bottom:1px solid #ccc;">الكود</th>
          <th style="text-align:right; border-bottom:1px solid #ccc;">الصنف</th>
          <th style="text-align:right; border-bottom:1px solid #ccc;">الرصيد</th>
          <th style="text-align:right; border-bottom:1px solid #ccc;">الحد الأدنى</th>
          <th style="text-align:right; border-bottom:1px solid #ccc;">سعر الوحدة</th>
          <th style="text-align:right; border-bottom:1px solid #ccc;">القيمة</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function printReport(title, bodyHtml) {
  els.reportPreview.innerHTML = bodyHtml;
  const printWindow = window.open("", "_blank", "width=1000,height=800");
  if (!printWindow) {
    showAlert("تعذر فتح نافذة الطباعة. تأكد من السماح بالنوافذ المنبثقة.", "error");
    return;
  }

  printWindow.document.write(`
    <html dir="rtl" lang="ar">
      <head>
        <title>${escapeHtml(title)}</title>
        <style>
          body { font-family: "Segoe UI", Tahoma, sans-serif; padding: 32px; color: #1c2731; }
          h2, h3 { color: #733114; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; }
          th, td { border-bottom: 1px solid #ddd; padding: 10px; text-align: right; }
          ul { line-height: 1.8; }
        </style>
      </head>
      <body>${bodyHtml}</body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

async function initAuth() {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = "index.html";
      return;
    }

    garageSystem.state.user = user;
    garageSystem.state.role = await getUserRole(user);
    els.userName.textContent = user.displayName || user.email || "مستخدم";
    els.userRole.textContent = garageSystem.state.role;

    await refreshView();
  });
}

function bindEvents() {
  els.tabs.forEach((tab) => {
    tab.addEventListener("click", () => setActiveTab(tab.dataset.tab));
  });

  els.refreshBtn.addEventListener("click", async () => {
    clearAlert();
    await refreshView("تم تحديث البيانات بنجاح.");
  });
  els.logoutBtn.addEventListener("click", () => logout());

  els.forms.product.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearAlert();
    try {
      await handleMasterForm("product", event.currentTarget, (raw) => ({
        name: raw.name,
        categoryId: raw.categoryId,
        minStock: Number(raw.minStock),
        unitPrice: Number(raw.unitPrice),
        currentStock: 0,
        isScrap: Boolean(raw.isScrap)
      }));
      await refreshView("تم حفظ الصنف بنجاح.");
    } catch (error) {
      showAlert(error.message || "تعذر حفظ الصنف.", "error");
    }
  });

  els.forms.vehicle.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearAlert();
    try {
      await handleMasterForm("vehicle", event.currentTarget, (raw) => raw);
      await refreshView("تم حفظ المركبة بنجاح.");
    } catch (error) {
      showAlert(error.message || "تعذر حفظ المركبة.", "error");
    }
  });

  els.forms.worker.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearAlert();
    try {
      await handleMasterForm("worker", event.currentTarget, (raw) => raw);
      await refreshView("تم حفظ العامل بنجاح.");
    } catch (error) {
      showAlert(error.message || "تعذر حفظ العامل.", "error");
    }
  });

  els.forms.account.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearAlert();
    try {
      await handleMasterForm("account", event.currentTarget, (raw) => raw);
      await refreshView("تم حفظ الحساب بنجاح.");
    } catch (error) {
      showAlert(error.message || "تعذر حفظ الحساب.", "error");
    }
  });

  els.forms.workOrder.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearAlert();
    try {
      const raw = formToObject(event.currentTarget);
      await createWorkOrder({
        data: {
          vehicleId: raw.vehicleId,
          description: raw.description,
          status: raw.status
        }
      });
      event.currentTarget.reset();
      await refreshView("تم إنشاء أمر الصيانة.");
    } catch (error) {
      showAlert(error.message || "تعذر إنشاء أمر الصيانة.", "error");
    }
  });

  els.forms.workOrderStatus.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearAlert();
    try {
      const raw = formToObject(event.currentTarget);
      await updateWorkOrderStatus({
        workOrderId: raw.workOrderId,
        status: raw.status
      });
      event.currentTarget.reset();
      await refreshView("تم تحديث حالة أمر الصيانة.");
    } catch (error) {
      showAlert(error.message || "تعذر تحديث حالة أمر الصيانة.", "error");
    }
  });

  els.forms.movement.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearAlert();
    try {
      const raw = formToObject(event.currentTarget);
      await processStockMovement({
        data: {
          type: raw.type,
          productId: raw.productId,
          quantity: Number(raw.quantity),
          cost: Number(raw.cost),
          vehicleId: raw.vehicleId || null,
          workerId: raw.workerId || null,
          workOrderId: raw.workOrderId || null,
          liabilityId: raw.liabilityId || null,
          description: raw.description || ""
        }
      });
      event.currentTarget.reset();
      await refreshView("تم تنفيذ الحركة مع القيد المحاسبي المرتبط.");
    } catch (error) {
      showAlert(error.message || "تعذر تنفيذ الحركة.", "error");
    }
  });

  els.forms.scrap.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearAlert();
    try {
      const raw = formToObject(event.currentTarget);
      await processStockMovement({
        data: {
          type: "OUT",
          productId: raw.newProductId,
          quantity: Number(raw.quantity),
          cost: Number(raw.newPartCost),
          vehicleId: raw.vehicleId,
          workOrderId: raw.workOrderId,
          description: "صرف قطعة جديدة مع تسجيل خردة آلي",
          scrap: {
            productId: raw.scrapProductId,
            quantity: Number(raw.quantity),
            cost: Number(raw.scrapValue)
          }
        }
      });
      event.currentTarget.reset();
      await refreshView("تم تسجيل الاستبدال والخردة بنجاح.");
    } catch (error) {
      showAlert(error.message || "تعذر تسجيل الخردة.", "error");
    }
  });

  els.forms.liability.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearAlert();
    try {
      await handleMasterForm("liability", event.currentTarget, (raw) => ({
        type: raw.type,
        amount: Number(raw.amount)
      }));
      await refreshView("تم فتح العهدة بنجاح.");
    } catch (error) {
      showAlert(error.message || "تعذر فتح العهدة.", "error");
    }
  });

  els.forms.settlement.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearAlert();
    try {
      const raw = formToObject(event.currentTarget);
      await settleLiability({
        liabilityId: raw.liabilityId,
        description: raw.description
      });
      event.currentTarget.reset();
      await refreshView("تمت تسوية العهدة بنجاح.");
    } catch (error) {
      showAlert(error.message || "تعذر تسوية العهدة.", "error");
    }
  });

  document.getElementById("garageProfitReportBtn").addEventListener("click", () => {
    const vehicleId = document.getElementById("garageProfitVehicle").value;
    printReport("Truck Profitability Report", buildVehicleProfitabilityReport(vehicleId));
  });

  document.getElementById("garageLiabilityReportBtn").addEventListener("click", () => {
    const liabilityId = document.getElementById("garageLiabilityReportSelect").value;
    printReport("Liability Settlement Report", buildLiabilityReport(liabilityId));
  });

  document.getElementById("garageInventoryReportBtn").addEventListener("click", () => {
    printReport("Inventory Audit Report", buildInventoryAuditReport());
  });
}

window.garageSystem = garageSystem;

bindEvents();
initAuth();
