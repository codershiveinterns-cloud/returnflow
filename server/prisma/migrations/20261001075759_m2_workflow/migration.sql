-- CreateTable
CREATE TABLE "AutomationRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "match" TEXT NOT NULL DEFAULT 'all',
    "conditions" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actionNote" TEXT,
    "matchCount" INTEGER NOT NULL DEFAULT 0,
    "lastMatchedAt" DATETIME,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AutomationRule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "courier" TEXT NOT NULL,
    "awb" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "scheduledFor" DATETIME,
    "pickupWindow" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Shipment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Shipment_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "ReturnRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShipmentCheckpoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shipmentId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "location" TEXT,
    "note" TEXT,
    "source" TEXT NOT NULL,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShipmentCheckpoint_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "returnId" TEXT,
    "channel" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" DATETIME,
    CONSTRAINT "Notification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Notification_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "ReturnRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Organization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "brandColor" TEXT NOT NULL DEFAULT '#1f2a37',
    "logoKey" TEXT,
    "supportEmail" TEXT,
    "portalHeadline" TEXT,
    "returnWindowDays" INTEGER NOT NULL DEFAULT 30,
    "nonReturnableCategories" TEXT NOT NULL DEFAULT '[]',
    "autoApproveMaxMinor" INTEGER NOT NULL DEFAULT 500000,
    "maxReturnsPer90Days" INTEGER NOT NULL DEFAULT 3,
    "requirePhotoForDamage" BOOLEAN NOT NULL DEFAULT true,
    "webhookSecretEnc" TEXT NOT NULL,
    "nextReturnNumber" INTEGER NOT NULL DEFAULT 1001,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Organization" ("brandColor", "createdAt", "currency", "id", "logoKey", "name", "nextReturnNumber", "portalHeadline", "returnWindowDays", "slug", "supportEmail", "updatedAt", "webhookSecretEnc") SELECT "brandColor", "createdAt", "currency", "id", "logoKey", "name", "nextReturnNumber", "portalHeadline", "returnWindowDays", "slug", "supportEmail", "updatedAt", "webhookSecretEnc" FROM "Organization";
DROP TABLE "Organization";
ALTER TABLE "new_Organization" RENAME TO "Organization";
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReturnRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReturnRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReturnRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ReturnRequest" ("channel", "createdAt", "currency", "customerId", "customerNote", "id", "number", "orderId", "organizationId", "resolution", "status", "updatedAt", "valueMinor") SELECT "channel", "createdAt", "currency", "customerId", "customerNote", "id", "number", "orderId", "organizationId", "resolution", "status", "updatedAt", "valueMinor" FROM "ReturnRequest";
DROP TABLE "ReturnRequest";
ALTER TABLE "new_ReturnRequest" RENAME TO "ReturnRequest";
CREATE INDEX "ReturnRequest_organizationId_status_createdAt_idx" ON "ReturnRequest"("organizationId", "status", "createdAt");
CREATE UNIQUE INDEX "ReturnRequest_organizationId_number_key" ON "ReturnRequest"("organizationId", "number");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "AutomationRule_organizationId_priority_idx" ON "AutomationRule"("organizationId", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_returnId_key" ON "Shipment"("returnId");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_organizationId_awb_key" ON "Shipment"("organizationId", "awb");

-- CreateIndex
CREATE INDEX "ShipmentCheckpoint_shipmentId_at_idx" ON "ShipmentCheckpoint"("shipmentId", "at");

-- CreateIndex
CREATE INDEX "Notification_organizationId_createdAt_idx" ON "Notification"("organizationId", "createdAt");
