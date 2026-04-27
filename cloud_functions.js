const functions = require("firebase-functions");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const { FieldValue } = admin.firestore;

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
    auditLogs: "garageSystem_audit_logs",
    counters: "garageSystem_counters"
  },
  allowedEntities: new Set(["account", "product", "vehicle", "worker", "liability"]),
  systemAccounts: {
    inventory: {
      id: "garage-inventory-asset",
      name: "Garage Inventory Asset",
      type: "Asset"
    },
    maintenanceExpense: {
      id: "garage-maintenance-expense",
      name: "Garage Vehicle Maintenance Expense",
      type: "Expense"
    },
    scrapInventory: {
      id: "garage-scrap-asset",
      name: "Garage Scrap Inventory",
      type: "Asset"
    },
    accountsPayable: {
      id: "garage-accounts-payable",
      name: "Garage Accounts Payable",
      type: "Liability"
    }
  }
};

function requireAuth(context) {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "يجب تسجيل الدخول أولاً.");
  }
}

function requireManagerOrAdmin(context) {
  requireAuth(context);
  if (!context.auth.token.admin && !context.auth.token.manager) {
    throw new functions.https.HttpsError("permission-denied", "هذه العملية تتطلب صلاحية مدير.");
  }
}

function asNumber(value, fieldName) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new functions.https.HttpsError("invalid-argument", `الحقل ${fieldName} غير صالح.`);
  }
  return number;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function getYear() {
  return new Date().getFullYear();
}

function buildPrefix(prefix, withYear = false) {
  return withYear ? `${prefix}-${getYear()}` : prefix;
}

async function nextCode(transaction, key, prefix, withYear = false) {
  const counterRef = db.collection(garageSystem.collections.counters).doc(key);
  const snapshot = await transaction.get(counterRef);
  const nextValue = (snapshot.exists ? snapshot.data().value || 0 : 0) + 1;

  transaction.set(
    counterRef,
    {
      value: nextValue,
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  return `${buildPrefix(prefix, withYear)}-${String(nextValue).padStart(3, "0")}`;
}

function entityConfig(entity) {
  const config = {
    account: { collection: garageSystem.collections.accounts, idField: "accountId", prefix: "ACC", year: false },
    product: { collection: garageSystem.collections.products, idField: "productId", prefix: "CAT", year: false },
    vehicle: { collection: garageSystem.collections.vehicles, idField: "vehicleId", prefix: "VEH", year: false },
    worker: { collection: garageSystem.collections.workers, idField: "workerId", prefix: "WRK", year: false },
    liability: { collection: garageSystem.collections.liabilities, idField: "liabilityId", prefix: "LIA", year: true }
  };
  return config[entity];
}

async function ensureSystemAccounts(transaction) {
  Object.values(garageSystem.systemAccounts).forEach((account) => {
    const ref = db.collection(garageSystem.collections.accounts).doc(account.id);
    transaction.set(
      ref,
      {
        accountId: account.id,
        code: account.id.toUpperCase(),
        name: account.name,
        type: account.type,
        isSystem: true,
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  });
}

function buildJournalLines(type, cost) {
  const accounts = garageSystem.systemAccounts;
  if (type === "IN") {
    return {
      debit: { accountId: accounts.inventory.id, amount: cost },
      credit: { accountId: accounts.accountsPayable.id, amount: cost }
    };
  }

  if (type === "RETURN") {
    return {
      debit: { accountId: accounts.inventory.id, amount: cost },
      credit: { accountId: accounts.maintenanceExpense.id, amount: cost }
    };
  }

  return {
    debit: { accountId: accounts.maintenanceExpense.id, amount: cost },
    credit: { accountId: accounts.inventory.id, amount: cost }
  };
}

function buildScrapJournal(cost) {
  return {
    debit: { accountId: garageSystem.systemAccounts.scrapInventory.id, amount: cost },
    credit: { accountId: garageSystem.systemAccounts.maintenanceExpense.id, amount: cost }
  };
}

function assertStockChangeAllowed(type, currentStock, quantity) {
  if (type === "OUT" && currentStock < quantity) {
    throw new functions.https.HttpsError("failed-precondition", "لا يمكن صرف كمية أكبر من الرصيد المتاح.");
  }
}

function nextStock(type, currentStock, quantity) {
  if (type === "IN" || type === "RETURN") return currentStock + quantity;
  if (type === "OUT") return currentStock - quantity;
  return currentStock;
}

async function createAuditLogInTransaction(transaction, action, userId, before, after) {
  const auditRef = db.collection(garageSystem.collections.auditLogs).doc();
  transaction.set(auditRef, {
    action,
    userId,
    before: before || null,
    after: after || null,
    timestamp: FieldValue.serverTimestamp()
  });
}

exports.garageSystemCreateMasterRecord = functions.https.onCall(async (payload, context) => {
  requireManagerOrAdmin(context);

  const entity = normalizeText(payload?.entity);
  const data = payload?.data || {};
  if (!garageSystem.allowedEntities.has(entity)) {
    throw new functions.https.HttpsError("invalid-argument", "نوع السجل غير مدعوم.");
  }

  const config = entityConfig(entity);
  await db.runTransaction(async (transaction) => {
    await ensureSystemAccounts(transaction);
    const ref = db.collection(config.collection).doc();
    const code = await nextCode(transaction, `${entity}-${getYear()}`, config.prefix, config.year);

    const baseRecord = {
      code,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: context.auth.uid
    };

    if (entity === "product") {
      if (!normalizeText(data.name) || !normalizeText(data.categoryId)) {
        throw new functions.https.HttpsError("invalid-argument", "بيانات الصنف غير مكتملة.");
      }
      transaction.set(ref, {
        ...baseRecord,
        [config.idField]: ref.id,
        name: normalizeText(data.name),
        code,
        categoryId: normalizeText(data.categoryId),
        currentStock: asNumber(data.currentStock ?? 0, "currentStock"),
        minStock: asNumber(data.minStock, "minStock"),
        unitPrice: asNumber(data.unitPrice, "unitPrice"),
        isScrap: Boolean(data.isScrap)
      });
    } else if (entity === "vehicle") {
      transaction.set(ref, {
        ...baseRecord,
        [config.idField]: ref.id,
        plate: normalizeText(data.plate),
        model: normalizeText(data.model),
        customerName: normalizeText(data.customerName)
      });
    } else if (entity === "worker") {
      transaction.set(ref, {
        ...baseRecord,
        [config.idField]: ref.id,
        name: normalizeText(data.name),
        type: normalizeText(data.type)
      });
    } else if (entity === "account") {
      transaction.set(ref, {
        ...baseRecord,
        [config.idField]: ref.id,
        name: normalizeText(data.name),
        type: normalizeText(data.type)
      });
    } else if (entity === "liability") {
      const amount = asNumber(data.amount, "amount");
      transaction.set(ref, {
        ...baseRecord,
        [config.idField]: ref.id,
        type: normalizeText(data.type),
        userId: context.auth.uid,
        amount,
        remaining: amount,
        status: "OPEN"
      });
    }

    await createAuditLogInTransaction(transaction, `garageSystem.${entity}.create`, context.auth.uid, null, {
      entity,
      recordId: ref.id,
      code
    });
  });

  return { success: true };
});

exports.garageSystemCreateWorkOrder = functions.https.onCall(async (payload, context) => {
  requireManagerOrAdmin(context);
  const data = payload?.data || {};

  await db.runTransaction(async (transaction) => {
    const vehicleId = normalizeText(data.vehicleId);
    const description = normalizeText(data.description);
    const status = normalizeText(data.status || "OPEN");
    if (!vehicleId || !description) {
      throw new functions.https.HttpsError("invalid-argument", "بيانات أمر الصيانة غير مكتملة.");
    }

    const vehicleRef = db.collection(garageSystem.collections.vehicles).doc(vehicleId);
    const vehicleSnap = await transaction.get(vehicleRef);
    if (!vehicleSnap.exists) {
      throw new functions.https.HttpsError("not-found", "المركبة غير موجودة.");
    }

    const workOrderRef = db.collection(garageSystem.collections.workOrders).doc();
    const code = await nextCode(transaction, `work-order-${getYear()}`, "WO", true);

    transaction.set(workOrderRef, {
      workOrderId: workOrderRef.id,
      code,
      vehicleId,
      date: FieldValue.serverTimestamp(),
      description,
      status,
      totalCost: 0,
      laborCost: 0,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: context.auth.uid
    });

    await createAuditLogInTransaction(transaction, "garageSystem.workOrder.create", context.auth.uid, null, {
      workOrderId: workOrderRef.id,
      code,
      vehicleId
    });
  });

  return { success: true };
});

exports.garageSystemUpdateWorkOrderStatus = functions.https.onCall(async (payload, context) => {
  requireManagerOrAdmin(context);
  const workOrderId = normalizeText(payload?.workOrderId);
  const status = normalizeText(payload?.status).toUpperCase();

  if (!workOrderId || !["OPEN", "IN_PROGRESS", "CLOSED"].includes(status)) {
    throw new functions.https.HttpsError("invalid-argument", "بيانات الحالة غير صالحة.");
  }

  await db.runTransaction(async (transaction) => {
    const workOrderRef = db.collection(garageSystem.collections.workOrders).doc(workOrderId);
    const snapshot = await transaction.get(workOrderRef);
    if (!snapshot.exists) {
      throw new functions.https.HttpsError("not-found", "أمر الصيانة غير موجود.");
    }

    const before = snapshot.data();
    transaction.update(workOrderRef, {
      status,
      updatedAt: FieldValue.serverTimestamp(),
      closedAt: status === "CLOSED" ? FieldValue.serverTimestamp() : null
    });

    await createAuditLogInTransaction(transaction, "garageSystem.workOrder.status", context.auth.uid, before, {
      workOrderId,
      status
    });
  });

  return { success: true };
});

exports.garageSystemProcessStockMovement = functions.https.onCall(async (payload, context) => {
  requireManagerOrAdmin(context);

  const data = payload?.data || {};
  const type = normalizeText(data.type).toUpperCase();
  if (!["IN", "OUT", "RETURN"].includes(type)) {
    throw new functions.https.HttpsError("invalid-argument", "نوع الحركة غير صالح.");
  }

  await db.runTransaction(async (transaction) => {
    await ensureSystemAccounts(transaction);

    const productId = normalizeText(data.productId);
    const quantity = asNumber(data.quantity, "quantity");
    const cost = asNumber(data.cost, "cost");
    const vehicleId = normalizeText(data.vehicleId);
    const workerId = normalizeText(data.workerId);
    const workOrderId = normalizeText(data.workOrderId);
    const liabilityId = normalizeText(data.liabilityId);
    const description = normalizeText(data.description);
    const scrap = data.scrap || null;

    if (!productId || quantity <= 0 || cost < 0) {
      throw new functions.https.HttpsError("invalid-argument", "بيانات الحركة غير مكتملة.");
    }

    if (type === "OUT" && !workOrderId) {
      throw new functions.https.HttpsError("failed-precondition", "الصرف يجب أن يرتبط بأمر صيانة.");
    }

    const productRef = db.collection(garageSystem.collections.products).doc(productId);
    const productSnap = await transaction.get(productRef);
    if (!productSnap.exists) {
      throw new functions.https.HttpsError("not-found", "الصنف غير موجود.");
    }

    const product = productSnap.data();
    const currentStock = asNumber(product.currentStock || 0, "currentStock");
    assertStockChangeAllowed(type, currentStock, quantity);
    const updatedStock = nextStock(type, currentStock, quantity);
    transaction.update(productRef, {
      currentStock: updatedStock,
      updatedAt: FieldValue.serverTimestamp()
    });

    let workOrderBefore = null;
    if (workOrderId) {
      const workOrderRef = db.collection(garageSystem.collections.workOrders).doc(workOrderId);
      const workOrderSnap = await transaction.get(workOrderRef);
      if (!workOrderSnap.exists) {
        throw new functions.https.HttpsError("not-found", "أمر الصيانة غير موجود.");
      }
      workOrderBefore = workOrderSnap.data();
      const totalCostDelta = type === "RETURN" ? -cost : cost;
      transaction.update(workOrderRef, {
        totalCost: asNumber(workOrderBefore.totalCost || 0, "totalCost") + totalCostDelta,
        updatedAt: FieldValue.serverTimestamp()
      });
    }

    let liabilityBefore = null;
    if (liabilityId) {
      const liabilityRef = db.collection(garageSystem.collections.liabilities).doc(liabilityId);
      const liabilitySnap = await transaction.get(liabilityRef);
      if (!liabilitySnap.exists) {
        throw new functions.https.HttpsError("not-found", "العهدة غير موجودة.");
      }
      liabilityBefore = liabilitySnap.data();
      const remainingBefore = asNumber(liabilityBefore.remaining || 0, "remaining");
      const nextRemaining = type === "RETURN" ? remainingBefore + cost : remainingBefore - cost;
      if (nextRemaining < 0) {
        throw new functions.https.HttpsError("failed-precondition", "رصيد العهدة لا يسمح بهذه الحركة.");
      }
      transaction.update(liabilityRef, {
        remaining: nextRemaining,
        status: nextRemaining === 0 ? "READY_TO_SETTLE" : "OPEN",
        updatedAt: FieldValue.serverTimestamp()
      });
    }

    const movementRef = db.collection(garageSystem.collections.stockMovements).doc();
    const movementCode = await nextCode(transaction, `movement-${getYear()}`, "MOV", true);
    transaction.set(movementRef, {
      movementId: movementRef.id,
      code: movementCode,
      productId,
      type,
      quantity,
      cost,
      vehicleId: vehicleId || null,
      workerId: workerId || null,
      workOrderId: workOrderId || null,
      liabilityId: liabilityId || null,
      description,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: context.auth.uid
    });

    const journalRef = db.collection(garageSystem.collections.journalEntries).doc();
    const journalCode = await nextCode(transaction, `journal-${getYear()}`, "JRN", true);
    const journalLines = buildJournalLines(type, cost);
    transaction.set(journalRef, {
      entryId: journalRef.id,
      code: journalCode,
      date: FieldValue.serverTimestamp(),
      description: description || `garageSystem ${type} ${movementCode}`,
      debit: journalLines.debit,
      credit: journalLines.credit,
      linkedDocId: movementRef.id,
      movementType: type,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: context.auth.uid
    });

    if (scrap) {
      const scrapProductId = normalizeText(scrap.productId);
      const scrapQuantity = asNumber(scrap.quantity, "scrap.quantity");
      const scrapCost = asNumber(scrap.cost, "scrap.cost");
      const scrapProductRef = db.collection(garageSystem.collections.products).doc(scrapProductId);
      const scrapProductSnap = await transaction.get(scrapProductRef);
      if (!scrapProductSnap.exists) {
        throw new functions.https.HttpsError("not-found", "صنف الخردة غير موجود.");
      }

      const scrapProduct = scrapProductSnap.data();
      transaction.update(scrapProductRef, {
        currentStock: asNumber(scrapProduct.currentStock || 0, "scrapCurrentStock") + scrapQuantity,
        updatedAt: FieldValue.serverTimestamp()
      });

      const scrapMovementRef = db.collection(garageSystem.collections.stockMovements).doc();
      const scrapMovementCode = await nextCode(transaction, `movement-${getYear()}`, "MOV", true);
      transaction.set(scrapMovementRef, {
        movementId: scrapMovementRef.id,
        code: scrapMovementCode,
        productId: scrapProductId,
        type: "SCRAP",
        quantity: scrapQuantity,
        cost: scrapCost,
        vehicleId: vehicleId || null,
        workOrderId: workOrderId || null,
        linkedDocId: movementRef.id,
        description: "Auto scrap linked to replacement movement",
        createdAt: FieldValue.serverTimestamp(),
        createdBy: context.auth.uid
      });

      const scrapJournalRef = db.collection(garageSystem.collections.journalEntries).doc();
      const scrapJournalCode = await nextCode(transaction, `journal-${getYear()}`, "JRN", true);
      const scrapJournal = buildScrapJournal(scrapCost);
      transaction.set(scrapJournalRef, {
        entryId: scrapJournalRef.id,
        code: scrapJournalCode,
        date: FieldValue.serverTimestamp(),
        description: `Scrap registered for ${movementCode}`,
        debit: scrapJournal.debit,
        credit: scrapJournal.credit,
        linkedDocId: scrapMovementRef.id,
        movementType: "SCRAP",
        createdAt: FieldValue.serverTimestamp(),
        createdBy: context.auth.uid
      });
    }

    await createAuditLogInTransaction(
      transaction,
      "garageSystem.stockMovement.process",
      context.auth.uid,
      {
        productId,
        currentStock,
        liability: liabilityBefore ? liabilityBefore.remaining : null,
        workOrderTotalCost: workOrderBefore ? workOrderBefore.totalCost : null
      },
      {
        movementId: movementRef.id,
        updatedStock,
        type,
        cost
      }
    );
  });

  return { success: true };
});

exports.garageSystemSettleLiability = functions.https.onCall(async (payload, context) => {
  requireManagerOrAdmin(context);
  const liabilityId = normalizeText(payload?.liabilityId);
  const description = normalizeText(payload?.description);

  if (!liabilityId) {
    throw new functions.https.HttpsError("invalid-argument", "يجب تحديد العهدة.");
  }

  const movementsSnapshot = await db
    .collection(garageSystem.collections.stockMovements)
    .where("liabilityId", "==", liabilityId)
    .get();

  const workOrderIds = Array.from(
    new Set(
      movementsSnapshot.docs
        .map((docSnapshot) => docSnapshot.data().workOrderId)
        .filter(Boolean)
    )
  );

  if (workOrderIds.length) {
    const workOrders = await Promise.all(
      workOrderIds.map((id) => db.collection(garageSystem.collections.workOrders).doc(id).get())
    );
    const openOrders = workOrders.filter((snapshot) => snapshot.exists && snapshot.data().status !== "CLOSED");
    if (openOrders.length) {
      throw new functions.https.HttpsError("failed-precondition", "لا يمكن تسوية العهدة قبل إغلاق جميع أوامر الصيانة المرتبطة.");
    }
  }

  await db.runTransaction(async (transaction) => {
    const liabilityRef = db.collection(garageSystem.collections.liabilities).doc(liabilityId);
    const liabilitySnap = await transaction.get(liabilityRef);
    if (!liabilitySnap.exists) {
      throw new functions.https.HttpsError("not-found", "العهدة غير موجودة.");
    }

    const liability = liabilitySnap.data();
    if (asNumber(liability.remaining || 0, "remaining") !== 0) {
      throw new functions.https.HttpsError("failed-precondition", "لا يمكن تصفية العهدة قبل وصول المتبقي إلى صفر.");
    }

    transaction.update(liabilityRef, {
      status: "SETTLED",
      settlementDescription: description,
      settledAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });

    await createAuditLogInTransaction(transaction, "garageSystem.liability.settle", context.auth.uid, liability, {
      liabilityId,
      status: "SETTLED",
      description
    });
  });

  return { success: true };
});

const accountingCollections = {
  items: "Items",
  workOrders: "GarageWorkOrders",
  movements: "GarageMovements",
  custody: "GarageCustody",
  journalEntries: "journal_entries",
  inventoryAdjustments: "GarageInventoryAdjustments",
  scrap: "GarageScrap"
};

const accountingAccounts = {
  inventoryAsset: "inventory_asset",
  maintenanceExpense: "maintenance_expense",
  scrapLossExpense: "scrap_loss_expense",
  inventoryLossExpense: "inventory_loss_expense",
  inventoryGainRevenue: "inventory_gain_revenue"
};

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildTopLevelJournalEntry({
  type,
  description,
  amount,
  debitAccountId,
  creditAccountId,
  sourceCollection,
  sourceId,
  metadata = {}
}) {
  return {
    type,
    description,
    amount,
    date: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
    debit: {
      accountId: debitAccountId,
      amount
    },
    credit: {
      accountId: creditAccountId,
      amount
    },
    linkedDocId: sourceId,
    sourceCollection,
    metadata
  };
}

function custodyLiabilityAccount(officerName) {
  const normalized = String(officerName || "unknown")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_\u0600-\u06FF]/g, "");

  return `custody_${normalized || "unknown"}`;
}

exports.onStockMovementCreate = functions.firestore
  .document("GarageMovements/{movementId}")
  .onCreate(async (snapshot, context) => {
    const movementRef = snapshot.ref;

    await db.runTransaction(async (transaction) => {
      const movementSnap = await transaction.get(movementRef);
      if (!movementSnap.exists) return;

      const movement = movementSnap.data() || {};
      if (movement.processedAt || movement.status === "FAILED") {
        return;
      }

      const itemId = normalizeText(movement.itemId);
      const movementType = normalizeText(movement.movementType || movement.type || "OUT").toUpperCase();
      const quantity = toNumber(movement.quantity, 0);
      const cost = toNumber(movement.cost, 0);

      if (!itemId || quantity <= 0) {
        transaction.update(movementRef, {
          status: "FAILED",
          errorMessage: "Invalid movement payload",
          processedAt: FieldValue.serverTimestamp()
        });
        return;
      }

      const itemRef = db.collection(accountingCollections.items).doc(itemId);
      const itemSnap = await transaction.get(itemRef);
      if (!itemSnap.exists) {
        transaction.update(movementRef, {
          status: "FAILED",
          errorMessage: "Item not found",
          processedAt: FieldValue.serverTimestamp()
        });
        return;
      }

      const item = itemSnap.data() || {};
      const currentQty = toNumber(item.quantity, 0);
      const unitPrice = toNumber(item.unitPrice, 0);
      const resolvedCost = cost > 0 ? cost : unitPrice * quantity;
      let nextQty = currentQty;

      if (movementType === "OUT") {
        if (quantity > currentQty) {
          transaction.update(movementRef, {
            status: "FAILED",
            errorMessage: `Insufficient stock. Available: ${currentQty}`,
            processedAt: FieldValue.serverTimestamp()
          });
          return;
        }
        nextQty = currentQty - quantity;
      } else if (movementType === "IN" || movementType === "RETURN") {
        nextQty = currentQty + quantity;
      }

      transaction.update(itemRef, {
        quantity: nextQty,
        updatedAt: FieldValue.serverTimestamp()
      });

      let journalEntryId = null;
      if (resolvedCost > 0) {
        const journalRef = db.collection(accountingCollections.journalEntries).doc();
        journalEntryId = journalRef.id;

        let debitAccountId = accountingAccounts.inventoryAsset;
        let creditAccountId = accountingAccounts.maintenanceExpense;

        if (movementType === "OUT") {
          debitAccountId = accountingAccounts.maintenanceExpense;
          creditAccountId = movement.custodyOfficer
            ? custodyLiabilityAccount(movement.custodyOfficer)
            : accountingAccounts.inventoryAsset;
        } else if (movementType === "IN") {
          debitAccountId = accountingAccounts.inventoryAsset;
          creditAccountId = movement.custodyOfficer
            ? custodyLiabilityAccount(movement.custodyOfficer)
            : accountingAccounts.maintenanceExpense;
        } else if (movementType === "RETURN") {
          debitAccountId = accountingAccounts.inventoryAsset;
          creditAccountId = accountingAccounts.maintenanceExpense;
        }

        transaction.set(journalRef, buildTopLevelJournalEntry({
          type: movementType,
          description: movement.notes || `${movementType} - ${item.name || itemId}`,
          amount: resolvedCost,
          debitAccountId,
          creditAccountId,
          sourceCollection: accountingCollections.movements,
          sourceId: movementRef.id,
          metadata: {
            itemId,
            itemName: item.name || "",
            quantity,
            assetId: movement.assetId || "",
            workOrderId: movement.workOrderId || "",
            custodyOfficer: movement.custodyOfficer || ""
          }
        }));
      }

      if (movement.workOrderId) {
        const workOrderRef = db.collection(accountingCollections.workOrders).doc(movement.workOrderId);
        const workOrderSnap = await transaction.get(workOrderRef);
        if (workOrderSnap.exists) {
          const workOrder = workOrderSnap.data() || {};
          transaction.update(workOrderRef, {
            totalCost: toNumber(workOrder.totalCost, 0) + resolvedCost,
            updatedAt: FieldValue.serverTimestamp()
          });
        }
      }

      if (movement.custodyOfficer && movementType === "OUT" && resolvedCost > 0) {
        const custodyRef = db.collection(accountingCollections.custody).doc();
        transaction.set(custodyRef, {
          date: movement.date || new Date().toISOString().split("T")[0],
          custodyOfficer: normalizeText(movement.custodyOfficer),
          description: `صرف قطع غيار - ${item.name || ""}`.trim(),
          custodyIn: 0,
          clearanceOut: resolvedCost,
          notes: movement.notes || "",
          linkedMovementId: movementRef.id,
          updatedAt: FieldValue.serverTimestamp(),
          createdAt: FieldValue.serverTimestamp()
        });
      }

      let scrapId = null;
      if (movement.isReplacement && normalizeText(movement.replacementOldPart)) {
        const scrapRef = db.collection(accountingCollections.scrap).doc();
        scrapId = scrapRef.id;
        transaction.set(scrapRef, {
          movementId: movementRef.id,
          itemId,
          oldPartName: normalizeText(movement.replacementOldPart),
          scrapValue: toNumber(movement.scrapValue, 0),
          assetId: movement.assetId || "",
          workOrderId: movement.workOrderId || "",
          status: "PENDING",
          autoCreated: true,
          date: movement.date || new Date().toISOString().split("T")[0],
          createdBy: movement.createdBy || "system",
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        });
      }

      transaction.update(movementRef, {
        status: "PROCESSED",
        processedAt: FieldValue.serverTimestamp(),
        processedCost: resolvedCost,
        journalEntryId,
        scrapId
      });
    });
  });

exports.onScrapCreate = functions.firestore
  .document("GarageScrap/{scrapId}")
  .onCreate(async (snapshot, context) => {
    const scrapRef = snapshot.ref;

    await db.runTransaction(async (transaction) => {
      const scrapSnap = await transaction.get(scrapRef);
      if (!scrapSnap.exists) return;

      const scrap = scrapSnap.data() || {};
      if (scrap.processedAt || scrap.status === "FAILED") {
        return;
      }

      const scrapValue = toNumber(scrap.scrapValue, 0);
      let journalEntryId = null;

      if (scrapValue > 0) {
        const journalRef = db.collection(accountingCollections.journalEntries).doc();
        journalEntryId = journalRef.id;
        transaction.set(journalRef, buildTopLevelJournalEntry({
          type: "SCRAP",
          description: `خردة / خسارة - ${scrap.oldPartName || ""}`.trim(),
          amount: scrapValue,
          debitAccountId: accountingAccounts.scrapLossExpense,
          creditAccountId: accountingAccounts.inventoryAsset,
          sourceCollection: accountingCollections.scrap,
          sourceId: scrapRef.id,
          metadata: {
            movementId: scrap.movementId || "",
            assetId: scrap.assetId || "",
            workOrderId: scrap.workOrderId || ""
          }
        }));
      }

      transaction.update(scrapRef, {
        status: "PROCESSED",
        processedAt: FieldValue.serverTimestamp(),
        journalEntryId
      });
    });
  });

exports.onInventoryAdjustment = functions.firestore
  .document("GarageInventoryAdjustments/{adjustmentId}")
  .onCreate(async (snapshot, context) => {
    const adjustmentRef = snapshot.ref;

    await db.runTransaction(async (transaction) => {
      const adjustmentSnap = await transaction.get(adjustmentRef);
      if (!adjustmentSnap.exists) return;

      const adjustment = adjustmentSnap.data() || {};
      if (adjustment.processedAt || adjustment.status === "FAILED") {
        return;
      }

      const itemId = normalizeText(adjustment.itemId);
      const actualQuantity = toNumber(adjustment.actualQuantity, 0);
      if (!itemId) {
        transaction.update(adjustmentRef, {
          status: "FAILED",
          errorMessage: "Missing itemId",
          processedAt: FieldValue.serverTimestamp()
        });
        return;
      }

      const itemRef = db.collection(accountingCollections.items).doc(itemId);
      const itemSnap = await transaction.get(itemRef);
      if (!itemSnap.exists) {
        transaction.update(adjustmentRef, {
          status: "FAILED",
          errorMessage: "Item not found",
          processedAt: FieldValue.serverTimestamp()
        });
        return;
      }

      const item = itemSnap.data() || {};
      const systemQuantity = toNumber(item.quantity, 0);
      const difference = actualQuantity - systemQuantity;
      const unitPrice = toNumber(item.unitPrice, toNumber(adjustment.unitPrice, 0));
      const amount = Math.abs(difference) * unitPrice;
      let journalEntryId = null;

      transaction.update(itemRef, {
        quantity: actualQuantity,
        updatedAt: FieldValue.serverTimestamp()
      });

      if (difference !== 0 && amount > 0) {
        const journalRef = db.collection(accountingCollections.journalEntries).doc();
        journalEntryId = journalRef.id;
        const isShortage = difference < 0;
        transaction.set(journalRef, buildTopLevelJournalEntry({
          type: "ADJUSTMENT",
          description: adjustment.notes || `تسوية جرد - ${item.name || itemId}`,
          amount,
          debitAccountId: isShortage ? accountingAccounts.inventoryLossExpense : accountingAccounts.inventoryAsset,
          creditAccountId: isShortage ? accountingAccounts.inventoryAsset : accountingAccounts.inventoryGainRevenue,
          sourceCollection: accountingCollections.inventoryAdjustments,
          sourceId: adjustmentRef.id,
          metadata: {
            itemId,
            itemName: item.name || "",
            systemQuantity,
            actualQuantity,
            difference
          }
        }));
      }

      transaction.update(adjustmentRef, {
        status: "PROCESSED",
        processedAt: FieldValue.serverTimestamp(),
        journalEntryId,
        resolvedSystemQuantity: systemQuantity,
        resolvedDifference: difference,
        resolvedAmount: amount
      });
    });
  });
