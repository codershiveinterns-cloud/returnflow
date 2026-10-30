-- CreateTable
CREATE TABLE "ContactMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "company" TEXT,
    "topic" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "ip" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "ContactMessage_createdAt_idx" ON "ContactMessage"("createdAt");
