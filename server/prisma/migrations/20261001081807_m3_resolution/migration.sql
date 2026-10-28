-- AlterTable
ALTER TABLE "Order" ADD COLUMN "paymentRef" TEXT;

-- AlterTable
ALTER TABLE "ReturnItem" ADD COLUMN "aiConfidence" REAL;
ALTER TABLE "ReturnItem" ADD COLUMN "aiReason" TEXT;
ALTER TABLE "ReturnItem" ADD COLUMN "aiSource" TEXT;
ALTER TABLE "ReturnItem" ADD COLUMN "aiSummary" TEXT;

-- CreateTable
CREATE TABLE "Inspection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "returnItemId" TEXT NOT NULL,
    "checklist" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "disposition" TEXT NOT NULL,
    "notes" TEXT,
    "aiSuggestion" TEXT,
    "mismatch" BOOLEAN NOT NULL DEFAULT false,
    "inspectorId" TEXT,
    "inspectorName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Inspection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Inspection_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "ReturnRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Inspection_returnItemId_fkey" FOREIGN KEY ("returnItemId") REFERENCES "ReturnItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reference" TEXT,
    "gatewayMode" TEXT,
    "note" TEXT,
    "error" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" DATETIME,
    CONSTRAINT "Refund_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Refund_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "ReturnRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "returnItemId" TEXT,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "disposition" TEXT NOT NULL,
    "syncStatus" TEXT NOT NULL,
    "syncTarget" TEXT,
    "syncMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryMovement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InventoryMovement_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "ReturnRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ReturnRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "resolution" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'portal',
    "customerNote" TEXT,
    "valueMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "eligibility" TEXT,
    "flags" TEXT NOT NULL DEFAULT '[]',
    "requiresManager" BOOLEAN NOT NULL DEFAULT false,
    "escalatedAt" DATETIME,
    "decisionReason" TEXT,
    "decidedById" TEXT,
    "decidedAt" DATETIME,
    "riskScore" INTEGER,
    "riskLevel" TEXT,
    "riskFactors" TEXT NOT NULL DEFAULT '[]',
    "holdRefund" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReturnRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReturnRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReturnRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ReturnRequest" ("channel", "createdAt", "currency", "customerId", "customerNote", "decidedAt", "decidedById", "decisionReason", "eligibility", "escalatedAt", "flags", "id", "number", "orderId", "organizationId", "requiresManager", "resolution", "status", "updatedAt", "valueMinor") SELECT "channel", "createdAt", "currency", "customerId", "customerNote", "decidedAt", "decidedById", "decisionReason", "eligibility", "escalatedAt", "flags", "id", "number", "orderId", "organizationId", "requiresManager", "resolution", "status", "updatedAt", "valueMinor" FROM "ReturnRequest";
DROP TABLE "ReturnRequest";
ALTER TABLE "new_ReturnRequest" RENAME TO "ReturnRequest";
CREATE INDEX "ReturnRequest_organizationId_status_createdAt_idx" ON "ReturnRequest"("organizationId", "status", "createdAt");
CREATE UNIQUE INDEX "ReturnRequest_organizationId_number_key" ON "ReturnRequest"("organizationId", "number");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Inspection_returnItemId_key" ON "Inspection"("returnItemId");

-- CreateIndex
CREATE INDEX "Refund_organizationId_createdAt_idx" ON "Refund"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryMovement_organizationId_createdAt_idx" ON "InventoryMovement"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryMovement_organizationId_sku_idx" ON "InventoryMovement"("organizationId", "sku");
