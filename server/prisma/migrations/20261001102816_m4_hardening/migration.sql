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
    "messagingHookUrl" TEXT,
    "messagingHookSecretEnc" TEXT,
    "messagingChannels" TEXT NOT NULL DEFAULT '[]',
    "webhookSecretEnc" TEXT NOT NULL,
    "nextReturnNumber" INTEGER NOT NULL DEFAULT 1001,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Organization" ("autoApproveMaxMinor", "brandColor", "createdAt", "currency", "id", "logoKey", "maxReturnsPer90Days", "name", "nextReturnNumber", "nonReturnableCategories", "portalHeadline", "requirePhotoForDamage", "returnWindowDays", "slug", "supportEmail", "updatedAt", "webhookSecretEnc") SELECT "autoApproveMaxMinor", "brandColor", "createdAt", "currency", "id", "logoKey", "maxReturnsPer90Days", "name", "nextReturnNumber", "nonReturnableCategories", "portalHeadline", "requirePhotoForDamage", "returnWindowDays", "slug", "supportEmail", "updatedAt", "webhookSecretEnc" FROM "Organization";
DROP TABLE "Organization";
ALTER TABLE "new_Organization" RENAME TO "Organization";
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("createdAt", "email", "id", "lastLoginAt", "name", "passwordHash", "updatedAt") SELECT "createdAt", "email", "id", "lastLoginAt", "name", "passwordHash", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Order_organizationId_customerId_idx" ON "Order"("organizationId", "customerId");

-- CreateIndex
CREATE INDEX "Refund_returnId_idx" ON "Refund"("returnId");

-- CreateIndex
CREATE INDEX "ReturnItem_returnId_idx" ON "ReturnItem"("returnId");

-- CreateIndex
CREATE INDEX "ReturnRequest_organizationId_customerId_createdAt_idx" ON "ReturnRequest"("organizationId", "customerId", "createdAt");

-- CreateIndex
CREATE INDEX "ReturnRequest_organizationId_createdAt_idx" ON "ReturnRequest"("organizationId", "createdAt");
