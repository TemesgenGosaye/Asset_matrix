-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- Extensions required by search indexes not represented in the Prisma schema
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "HouseOccupancyStatus" AS ENUM ('Vacant', 'Occupied', 'Maintenance');

-- CreateEnum
CREATE TYPE "HouseTerminationReason" AS ENUM ('TRANSFER', 'EMPLOYEE_LEAVE', 'RETIREMENT');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('male', 'female');

-- CreateEnum
CREATE TYPE "RentType" AS ENUM ('Shop', 'Grocery', 'Other');

-- CreateEnum
CREATE TYPE "RentInstallmentStatus" AS ENUM ('UNPAID', 'PAID', 'VOIDED');

-- CreateEnum
CREATE TYPE "RentPaymentMethod" AS ENUM ('Cash', 'BankTransfer', 'Other');

-- CreateEnum
CREATE TYPE "RentLeaseStatus" AS ENUM ('Active', 'Completed', 'Terminated');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "settings" JSONB,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(20),
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "organizationId" UUID NOT NULL,
    "parentId" UUID,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "permissions" TEXT[],
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "organizationId" UUID,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "grantedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedBy" UUID,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhooks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "url" VARCHAR(500) NOT NULL,
    "secret" VARCHAR(255),
    "events" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "retryAttempts" INTEGER NOT NULL DEFAULT 3,
    "organizationId" UUID,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "webhookId" UUID NOT NULL,
    "event" VARCHAR(100) NOT NULL,
    "payload" JSONB NOT NULL,
    "statusCode" INTEGER,
    "response" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "deliveredAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "error" TEXT,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scim_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "token" VARCHAR(255) NOT NULL,
    "organizationId" UUID NOT NULL,
    "description" VARCHAR(255),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID,

    CONSTRAINT "scim_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_reservations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "assetId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "startDate" TIMESTAMP(6) NOT NULL,
    "endDate" TIMESTAMP(6) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "approvedBy" UUID,
    "approvedAt" TIMESTAMP(6),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "asset_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_transfers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "assetId" UUID NOT NULL,
    "transferType" VARCHAR(20) NOT NULL,
    "fromUserId" UUID,
    "toUserId" UUID,
    "fromLocationId" UUID,
    "toLocationId" UUID,
    "fromOrgId" UUID,
    "toOrgId" UUID,
    "reason" TEXT,
    "transferredBy" UUID NOT NULL,
    "transferredAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entityType" VARCHAR(50) NOT NULL,
    "entityId" UUID NOT NULL,
    "requesterId" UUID NOT NULL,
    "approverId" UUID,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "resolvedAt" TIMESTAMP(6),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "trigger" VARCHAR(50) NOT NULL,
    "conditions" TEXT NOT NULL,
    "actions" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(6),
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "automation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_alerts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "consumableId" UUID NOT NULL,
    "minThreshold" INTEGER NOT NULL DEFAULT 10,
    "criticalThreshold" INTEGER NOT NULL DEFAULT 5,
    "emailNotify" BOOLEAN NOT NULL DEFAULT true,
    "webhookNotify" BOOLEAN NOT NULL DEFAULT false,
    "lastAlertSentAt" TIMESTAMP(6),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "stock_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "entityType" VARCHAR(50) NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "processedRows" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "errors" JSONB,
    "startedAt" TIMESTAMP(6),
    "completedAt" TIMESTAMP(6),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accessorieCategoryType" (
    "accessoriecategorytypeid" UUID NOT NULL DEFAULT gen_random_uuid(),
    "accessoriecategorytypename" VARCHAR NOT NULL,
    "organizationId" UUID,

    CONSTRAINT "accessorieCategoryType_pkey" PRIMARY KEY ("accessoriecategorytypeid")
);

-- CreateTable
CREATE TABLE "accessories" (
    "accessorieid" UUID NOT NULL DEFAULT gen_random_uuid(),
    "accessoriename" VARCHAR NOT NULL,
    "accessorietag" VARCHAR NOT NULL,
    "purchaseprice" DECIMAL(10,2),
    "purchasedate" DATE,
    "requestable" BOOLEAN,
    "manufacturerid" UUID NOT NULL,
    "statustypeid" UUID NOT NULL,
    "accessoriecategorytypeid" UUID NOT NULL,
    "locationid" UUID NOT NULL,
    "supplierid" UUID NOT NULL,
    "modelid" UUID NOT NULL,
    "organizationId" UUID,
    "creation_date" TIMESTAMP(6) NOT NULL,
    "change_date" TIMESTAMP(6),

    CONSTRAINT "accessories_pkey" PRIMARY KEY ("accessorieid")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "issuer" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "idToken" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset" (
    "assetid" UUID NOT NULL DEFAULT gen_random_uuid(),
    "assetname" VARCHAR NOT NULL,
    "assettag" VARCHAR NOT NULL,
    "serialnumber" VARCHAR NOT NULL,
    "modelid" UUID,
    "specs" TEXT,
    "notes" TEXT,
    "purchaseprice" DECIMAL(10,2),
    "purchasedate" DATE,
    "mobile" BOOLEAN,
    "requestable" BOOLEAN,
    "assetcategorytypeid" UUID,
    "statustypeid" UUID,
    "supplierid" UUID,
    "locationid" UUID,
    "manufacturerid" UUID,
    "organizationId" UUID,
    "creation_date" TIMESTAMP(6) NOT NULL,
    "change_date" TIMESTAMP(6),
    "expectedEndOfLife" DATE,
    "warrantyExpires" DATE,
    "warrantyMonths" INTEGER,
    "reviewsDate" DATE,
    "remark" TEXT,
    "departmentId" UUID,
    "departmentCode" VARCHAR(20),
    "externalId" VARCHAR(255),
    "externalSource" VARCHAR(30),

    CONSTRAINT "asset_pkey" PRIMARY KEY ("assetid")
);

-- CreateTable
CREATE TABLE "intune_sync_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID,
    "status" VARCHAR(20) NOT NULL,
    "devicesCreated" INTEGER NOT NULL DEFAULT 0,
    "devicesUpdated" INTEGER NOT NULL DEFAULT 0,
    "devicesSkipped" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "triggeredBy" VARCHAR(50),
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intune_sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "assetcategorytypeid" UUID,
    "manufacturerid" UUID,
    "modelid" UUID,
    "statustypeid" UUID,
    "locationid" UUID,
    "supplierid" UUID,
    "defaultSpecs" TEXT,
    "defaultNotes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "organizationId" UUID,
    "createdBy" UUID,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "asset_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assetCategoryType" (
    "assetcategorytypeid" UUID NOT NULL DEFAULT gen_random_uuid(),
    "assetcategorytypename" VARCHAR NOT NULL,
    "assetTypeCode" VARCHAR(50),
    "organizationId" UUID,

    CONSTRAINT "assetCategoryType_pkey" PRIMARY KEY ("assetcategorytypeid")
);

-- CreateTable
CREATE TABLE "asset_pid_sequences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "assetTypeCode" VARCHAR(50) NOT NULL,
    "departmentCode" VARCHAR(50) NOT NULL,
    "lastSequence" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "asset_pid_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_attachments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "assetId" UUID NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "originalName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "size" INTEGER NOT NULL,
    "path" VARCHAR(500) NOT NULL,
    "thumbnailPath" VARCHAR(500),
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "uploadedBy" UUID,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID,
    "action" VARCHAR(50) NOT NULL,
    "entity" VARCHAR(50) NOT NULL,
    "entityId" UUID,
    "details" TEXT,
    "ipAddress" VARCHAR(50),
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumable" (
    "consumableid" UUID NOT NULL DEFAULT gen_random_uuid(),
    "consumablename" VARCHAR NOT NULL,
    "consumablecategorytypeid" UUID NOT NULL,
    "manufacturerid" UUID NOT NULL,
    "supplierid" UUID NOT NULL,
    "purchaseprice" DECIMAL(10,2),
    "purchasedate" DATE,
    "organizationId" UUID,
    "creation_date" TIMESTAMP(6) NOT NULL,
    "change_date" TIMESTAMP(6),
    "minQuantity" INTEGER NOT NULL DEFAULT 0,
    "quantity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "consumable_pkey" PRIMARY KEY ("consumableid")
);

-- CreateTable
CREATE TABLE "consumableCategoryType" (
    "consumablecategorytypeid" UUID NOT NULL DEFAULT gen_random_uuid(),
    "consumablecategorytypename" VARCHAR NOT NULL,
    "organizationId" UUID,

    CONSTRAINT "consumableCategoryType_pkey" PRIMARY KEY ("consumablecategorytypeid")
);

-- CreateTable
CREATE TABLE "custom_field_definitions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "fieldType" VARCHAR(20) NOT NULL,
    "options" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "entityType" VARCHAR(50) NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "custom_field_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_field_values" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "fieldId" UUID NOT NULL,
    "entityId" UUID NOT NULL,
    "value" TEXT,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "custom_field_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "depreciation_settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "categoryId" UUID NOT NULL,
    "method" VARCHAR(30) NOT NULL,
    "usefulLifeYears" INTEGER NOT NULL DEFAULT 5,
    "salvagePercent" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "depreciation_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "subject" VARCHAR(255) NOT NULL,
    "body" TEXT NOT NULL,
    "variables" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "label_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "width" DECIMAL(5,2) NOT NULL,
    "height" DECIMAL(5,2) NOT NULL,
    "layout" TEXT NOT NULL,
    "includeQR" BOOLEAN NOT NULL DEFAULT true,
    "includeLogo" BOOLEAN NOT NULL DEFAULT false,
    "fields" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "label_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "licence" (
    "licenceid" UUID NOT NULL DEFAULT gen_random_uuid(),
    "licencekey" VARCHAR,
    "licenceduserid" UUID,
    "licensedtoemail" VARCHAR,
    "purchaseprice" DECIMAL(10,2),
    "purchasedate" DATE,
    "expirationdate" DATE,
    "notes" TEXT,
    "requestable" BOOLEAN,
    "licencecategorytypeid" UUID NOT NULL,
    "manufacturerid" UUID NOT NULL,
    "supplierid" UUID NOT NULL,
    "seatCount" INTEGER NOT NULL DEFAULT 1,
    "organizationId" UUID,
    "creation_date" TIMESTAMP(6) NOT NULL,
    "change_date" TIMESTAMP(6),

    CONSTRAINT "licence_pkey" PRIMARY KEY ("licenceid")
);

-- CreateTable
CREATE TABLE "licenceCategoryType" (
    "licencecategorytypeid" UUID NOT NULL DEFAULT gen_random_uuid(),
    "licencecategorytypename" VARCHAR NOT NULL,
    "organizationId" UUID,

    CONSTRAINT "licenceCategoryType_pkey" PRIMARY KEY ("licencecategorytypeid")
);

-- CreateTable
CREATE TABLE "location" (
    "locationid" UUID NOT NULL DEFAULT gen_random_uuid(),
    "locationname" VARCHAR,
    "street" VARCHAR,
    "housenumber" VARCHAR,
    "city" VARCHAR,
    "country" VARCHAR,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "creation_date" TIMESTAMP(6) NOT NULL,
    "change_date" TIMESTAMP(6),
    "parentId" UUID,
    "organizationId" UUID,

    CONSTRAINT "location_pkey" PRIMARY KEY ("locationid")
);

-- CreateTable
CREATE TABLE "maintenance_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "scheduleId" UUID NOT NULL,
    "completedBy" UUID,
    "completedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "actualCost" DECIMAL(10,2),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_schedules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "assetId" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "frequency" VARCHAR(20) NOT NULL,
    "nextDueDate" DATE NOT NULL,
    "lastCompletedAt" TIMESTAMP(6),
    "assignedTo" UUID,
    "estimatedCost" DECIMAL(10,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "maintenance_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manufacturer" (
    "manufacturerid" UUID NOT NULL DEFAULT gen_random_uuid(),
    "manufacturername" VARCHAR NOT NULL,
    "creation_date" TIMESTAMP(6) NOT NULL,
    "change_date" TIMESTAMP(6),
    "organizationId" UUID,

    CONSTRAINT "manufacturer_pkey" PRIMARY KEY ("manufacturerid")
);

-- CreateTable
CREATE TABLE "model" (
    "modelid" UUID NOT NULL DEFAULT gen_random_uuid(),
    "modelname" VARCHAR NOT NULL,
    "modelnumber" VARCHAR,
    "creation_date" TIMESTAMP(6) NOT NULL,
    "change_date" TIMESTAMP(6),
    "organizationId" UUID,

    CONSTRAINT "model_pkey" PRIMARY KEY ("modelid")
);

-- CreateTable
CREATE TABLE "app_notification" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "category" VARCHAR(30) NOT NULL DEFAULT 'system',
    "title" VARCHAR(255) NOT NULL,
    "body" TEXT NOT NULL,
    "icon" TEXT,
    "link" TEXT,
    "metadata" TEXT,
    "readAt" TIMESTAMP(6),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "emailAssignments" BOOLEAN NOT NULL DEFAULT true,
    "emailUnassignments" BOOLEAN NOT NULL DEFAULT true,
    "emailLicenseExpiry" BOOLEAN NOT NULL DEFAULT true,
    "emailMaintenanceDue" BOOLEAN NOT NULL DEFAULT true,
    "emailLowStock" BOOLEAN NOT NULL DEFAULT false,
    "licenseExpiryDays" INTEGER NOT NULL DEFAULT 30,
    "maintenanceReminderDays" INTEGER NOT NULL DEFAULT 7,
    "lowStockThreshold" INTEGER NOT NULL DEFAULT 10,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_queue" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID,
    "type" VARCHAR(50) NOT NULL,
    "recipient" VARCHAR(255) NOT NULL,
    "subject" VARCHAR(255) NOT NULL,
    "body" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "scheduledAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(6),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_filters" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "entity" VARCHAR(50) NOT NULL,
    "filters" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isGlobal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "saved_filters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "token" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" VARCHAR(45),
    "userAgent" VARCHAR(500),
    "deviceName" VARCHAR(100),
    "lastActive" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "statusType" (
    "statustypeid" UUID NOT NULL DEFAULT gen_random_uuid(),
    "statustypename" VARCHAR NOT NULL,
    "color" VARCHAR(7),
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "organizationId" UUID,

    CONSTRAINT "statusType_pkey" PRIMARY KEY ("statustypeid")
);

-- CreateTable
CREATE TABLE "status_transitions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "fromStatusId" UUID NOT NULL,
    "toStatusId" UUID NOT NULL,
    "requiredRole" VARCHAR(50),
    "notifyOnTransition" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "status_transitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier" (
    "supplierid" UUID NOT NULL DEFAULT gen_random_uuid(),
    "suppliername" VARCHAR NOT NULL,
    "lastname" VARCHAR,
    "firstname" VARCHAR,
    "salutation" VARCHAR,
    "email" VARCHAR,
    "phonenumber" VARCHAR,
    "website" VARCHAR(500),
    "creation_date" TIMESTAMP(6) NOT NULL,
    "change_date" TIMESTAMP(6),
    "organizationId" UUID,

    CONSTRAINT "supplier_pkey" PRIMARY KEY ("supplierid")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "settingKey" VARCHAR(100) NOT NULL,
    "settingValue" TEXT,
    "settingType" VARCHAR(20) NOT NULL,
    "category" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "isEncrypted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_comments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ticketId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "comment" TEXT NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'new',
    "priority" VARCHAR(20) NOT NULL DEFAULT 'medium',
    "createdBy" UUID NOT NULL,
    "assignedTo" UUID,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "userid" UUID NOT NULL DEFAULT gen_random_uuid(),
    "username" VARCHAR,
    "isadmin" BOOLEAN NOT NULL,
    "canrequest" BOOLEAN NOT NULL,
    "lastname" VARCHAR NOT NULL,
    "firstname" VARCHAR NOT NULL,
    "email" VARCHAR NOT NULL,
    "lan" VARCHAR,
    "password" VARCHAR,
    "organizationId" UUID,
    "departmentId" UUID,
    "creation_date" TIMESTAMP(6) NOT NULL,
    "change_date" TIMESTAMP(6),
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecret" VARCHAR(255),
    "mfaBackupCodes" TEXT[],
    "authProvider" VARCHAR(20) NOT NULL DEFAULT 'local',
    "externalId" VARCHAR(255),
    "ldapDN" TEXT,
    "lastSyncedAt" TIMESTAMP(6),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "accessExpiresAt" TIMESTAMP(6),
    "scimProviderId" VARCHAR(255),
    "scimLastSync" TIMESTAMP(6),
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "twoFactorEnabled" BOOLEAN,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_pkey" PRIMARY KEY ("userid")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "keyPrefix" VARCHAR(8) NOT NULL,
    "keyHash" VARCHAR(255) NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastUsedAt" TIMESTAMP(6),
    "expiresAt" TIMESTAMP(6),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_schedules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "organizationId" UUID,
    "reportType" VARCHAR(30) NOT NULL,
    "frequency" VARCHAR(10) NOT NULL,
    "format" VARCHAR(10) NOT NULL DEFAULT 'csv',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSentAt" TIMESTAMP(6),
    "nextRunAt" TIMESTAMP(6) NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "report_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "userAccessoires" (
    "useraccessoiresid" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userid" UUID NOT NULL,
    "accessorieid" UUID NOT NULL,
    "creation_date" TIMESTAMP(6) NOT NULL,
    "change_date" TIMESTAMP(6),

    CONSTRAINT "userAccessoires_pkey" PRIMARY KEY ("useraccessoiresid")
);

-- CreateTable
CREATE TABLE "userAssets" (
    "userassetsid" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userid" UUID NOT NULL,
    "assetid" UUID NOT NULL,
    "creation_date" TIMESTAMP(6) NOT NULL,
    "change_date" TIMESTAMP(6),

    CONSTRAINT "userAssets_pkey" PRIMARY KEY ("userassetsid")
);

-- CreateTable
CREATE TABLE "userHistory" (
    "historyid" UUID NOT NULL DEFAULT gen_random_uuid(),
    "referenceid" UUID,
    "referencetable" VARCHAR(20),
    "userid" UUID NOT NULL,
    "actionname" VARCHAR NOT NULL,
    "updatedate" DATE,
    "checkedout" DATE,
    "checkedin" DATE,
    "creation_date" TIMESTAMP(6) NOT NULL,
    "change_date" TIMESTAMP(6),

    CONSTRAINT "userHistory_pkey" PRIMARY KEY ("historyid")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "theme" VARCHAR(20) NOT NULL DEFAULT 'system',
    "locale" VARCHAR(10) NOT NULL DEFAULT 'en',
    "timezone" VARCHAR(50) NOT NULL DEFAULT 'UTC',
    "currency" VARCHAR(10) NOT NULL DEFAULT 'USD',
    "dateFormat" VARCHAR(20) NOT NULL DEFAULT 'MM/DD/YYYY',
    "numberFormat" VARCHAR(20) NOT NULL DEFAULT '1,234.56',
    "pageSize" INTEGER NOT NULL DEFAULT 20,
    "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
    "showRecommendedPopup" BOOLEAN NOT NULL DEFAULT true,
    "dashboardLayout" JSONB,
    "helpDismissed" JSONB,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "navigation_preferences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "organizationId" UUID,
    "hiddenKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "navigation_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumable_checkouts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "consumableId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "checkedOutAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consumable_checkouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "twoFactor" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "secret" TEXT NOT NULL,
    "backupCodes" TEXT NOT NULL,
    "userId" UUID NOT NULL,

    CONSTRAINT "twoFactor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_checkouts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "assetId" UUID NOT NULL,
    "checkedOutToType" VARCHAR(20) NOT NULL DEFAULT 'user',
    "checkedOutTo" UUID,
    "checkedOutToLocationId" UUID,
    "checkedOutToAssetId" UUID,
    "checkedOutBy" UUID NOT NULL,
    "checkoutDate" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedReturn" TIMESTAMP(6),
    "returnDate" TIMESTAMP(6),
    "notes" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'checked_out',
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "asset_checkouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_invitations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(255) NOT NULL,
    "organizationId" UUID NOT NULL,
    "roleId" UUID,
    "invitedBy" UUID NOT NULL,
    "token" VARCHAR(255) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(6) NOT NULL,
    "acceptedAt" TIMESTAMP(6),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "team_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "component_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "organizationId" UUID,

    CONSTRAINT "component_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "components" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "serialNumber" VARCHAR(255),
    "categoryId" UUID NOT NULL,
    "totalQuantity" INTEGER NOT NULL DEFAULT 0,
    "remainingQuantity" INTEGER NOT NULL DEFAULT 0,
    "purchasePrice" DECIMAL(10,2),
    "purchaseDate" DATE,
    "minQuantity" INTEGER NOT NULL DEFAULT 0,
    "manufacturerId" UUID,
    "supplierId" UUID,
    "locationId" UUID,
    "organizationId" UUID,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "component_checkouts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "componentId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "checkedOutBy" UUID NOT NULL,
    "checkedOutAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returnedAt" TIMESTAMP(6),
    "notes" TEXT,

    CONSTRAINT "component_checkouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "licence_seat_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "licenceId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "seatNumber" INTEGER NOT NULL,
    "assignedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" UUID,
    "unassignedAt" TIMESTAMP(6),
    "notes" TEXT,

    CONSTRAINT "licence_seat_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "organizationId" UUID,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "kits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kit_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kitId" UUID NOT NULL,
    "entityType" VARCHAR(30) NOT NULL,
    "entityId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,

    CONSTRAINT "kit_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_campaigns" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "startDate" TIMESTAMP(6),
    "dueDate" TIMESTAMP(6),
    "completedAt" TIMESTAMP(6),
    "organizationId" UUID,
    "createdBy" UUID NOT NULL,
    "scopeType" VARCHAR(20) NOT NULL DEFAULT 'all',
    "scopeId" UUID,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "audit_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_campaign_auditors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "campaignId" UUID NOT NULL,
    "userId" UUID NOT NULL,

    CONSTRAINT "audit_campaign_auditors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "campaignId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'unscanned',
    "auditedBy" UUID,
    "auditedAt" TIMESTAMP(6),
    "locationId" UUID,
    "notes" TEXT,

    CONSTRAINT "audit_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ldap_sync_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "status" VARCHAR(20) NOT NULL,
    "usersCreated" INTEGER NOT NULL DEFAULT 0,
    "usersUpdated" INTEGER NOT NULL DEFAULT 0,
    "usersDeactivated" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "triggeredBy" VARCHAR(50),
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ldap_sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_widgets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "widgetType" VARCHAR(50) NOT NULL,
    "position" INTEGER NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "dashboard_widgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entityType" VARCHAR(30) NOT NULL,
    "entityId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "startDate" DATE,
    "endDate" DATE,
    "notes" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "approvedBy" UUID,
    "approvedAt" TIMESTAMP(6),
    "returnedAt" TIMESTAMP(6),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "item_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "requesterId" UUID NOT NULL,
    "departmentId" UUID,
    "organizationId" UUID NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'draft',
    "priority" VARCHAR(20) NOT NULL DEFAULT 'medium',
    "estimatedTotal" DECIMAL(12,2),
    "approvedBy" UUID,
    "approvedAt" TIMESTAMP(6),
    "notes" TEXT,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "purchase_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_request_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "purchaseRequestId" UUID NOT NULL,
    "entityType" VARCHAR(30) NOT NULL DEFAULT 'other',
    "description" VARCHAR(500) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "estimatedUnitCost" DECIMAL(10,2),
    "supplierId" UUID,
    "receivedQuantity" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "purchase_request_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "purchaseRequestId" UUID,
    "poNumber" VARCHAR(50) NOT NULL,
    "supplierId" UUID,
    "organizationId" UUID NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'draft',
    "totalAmount" DECIMAL(12,2),
    "sentAt" TIMESTAMP(6),
    "expectedDeliveryDate" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "purchaseOrderId" UUID NOT NULL,
    "receivedBy" UUID NOT NULL,
    "receivedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "items" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "userid" UUID,
    "departmentId" UUID,
    "managerId" UUID,
    "emp_id" VARCHAR(50) NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "gender" "Gender",
    "job_grade" SMALLINT,
    "service_years" SMALLINT,
    "marital_status" TEXT,
    "disability" VARCHAR(100),
    "deletedAt" TIMESTAMP(6),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_profiles" (
    "employeeId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "nationalId" VARCHAR(64),
    "jobTitle" VARCHAR(100),
    "employmentType" VARCHAR(30) NOT NULL DEFAULT 'full_time',
    "employmentStatus" VARCHAR(30) NOT NULL DEFAULT 'active',
    "hireDate" DATE,
    "terminationDate" DATE,
    "familySize" SMALLINT,
    "phone" VARCHAR(25),
    "dateOfBirth" DATE,
    "address" VARCHAR(255),
    "city" VARCHAR(100),
    "state" VARCHAR(100),
    "country" VARCHAR(100),
    "postalCode" VARCHAR(20),
    "notes" VARCHAR(1000),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "employee_profiles_pkey" PRIMARY KEY ("employeeId")
);

-- CreateTable
CREATE TABLE "house_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "remarks" VARCHAR(1000) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'submitted',
    "submittedBy" UUID,
    "decidedAt" TIMESTAMP(6),
    "decidedBy" UUID,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "house_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "house_termination_receipts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "inspectionId" UUID NOT NULL,
    "allocationId" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "receiptNo" VARCHAR(40) NOT NULL,
    "damageSnapshot" JSONB NOT NULL,
    "totalDamageCost" DECIMAL(12,2) NOT NULL,
    "conditionNote" VARCHAR(1000),
    "completedAt" TIMESTAMP(6) NOT NULL,
    "printedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "printedBy" UUID,
    "printCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "house_termination_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "households" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "srNo" SERIAL NOT NULL,
    "hid" VARCHAR(50) NOT NULL,
    "houseType" VARCHAR(20) NOT NULL,
    "staffCategory" VARCHAR(10),
    "houseNumber" VARCHAR(50) NOT NULL,
    "rgType" VARCHAR(20) NOT NULL,
    "locationId" UUID,
    "locationName" VARCHAR(255),
    "status" VARCHAR(20) NOT NULL DEFAULT 'Active',
    "occupancyStatus" "HouseOccupancyStatus" NOT NULL DEFAULT 'Vacant',
    "bedCount" INTEGER NOT NULL DEFAULT 0,
    "chairsCount" INTEGER NOT NULL DEFAULT 0,
    "lockerCount" INTEGER NOT NULL DEFAULT 0,
    "tablesCount" INTEGER NOT NULL DEFAULT 0,
    "damageWindow" BOOLEAN NOT NULL DEFAULT false,
    "damageDoor" BOOLEAN NOT NULL DEFAULT false,
    "damageWaterPanel" BOOLEAN NOT NULL DEFAULT false,
    "damageRoof" BOOLEAN NOT NULL DEFAULT false,
    "damageWall" BOOLEAN NOT NULL DEFAULT false,
    "damageElectricity" BOOLEAN NOT NULL DEFAULT false,
    "damageNotes" VARCHAR(1000),
    "organizationId" UUID NOT NULL,
    "createdBy" UUID,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "households_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "house_allocations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "householdId" UUID,
    "status" VARCHAR(30) NOT NULL DEFAULT 'ready_for_allocation',
    "recommendedHouseId" UUID,
    "mcdScore" DOUBLE PRECISION,
    "priorityRank" INTEGER,
    "reason" VARCHAR(500),
    "decidedBy" UUID,
    "decidedAt" TIMESTAMP(6),
    "terminationReason" "HouseTerminationReason",
    "terminatedAt" TIMESTAMP(6),
    "terminatedBy" UUID,
    "effectiveDate" DATE,
    "transferHouseholdId" UUID,
    "previousHouseholdId" UUID,
    "movedAt" TIMESTAMP(6),
    "moveCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "house_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "house_inspections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "allocationId" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "inspectorId" UUID,
    "scheduledDate" DATE,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "reason" "HouseTerminationReason",
    "checklistWindow" BOOLEAN NOT NULL DEFAULT false,
    "checklistDoor" BOOLEAN NOT NULL DEFAULT false,
    "checklistWaterPanel" BOOLEAN NOT NULL DEFAULT false,
    "checklistRoof" BOOLEAN NOT NULL DEFAULT false,
    "checklistWall" BOOLEAN NOT NULL DEFAULT false,
    "checklistElectricity" BOOLEAN NOT NULL DEFAULT false,
    "checklistBedCount" INTEGER NOT NULL DEFAULT 0,
    "checklistChairsCount" INTEGER NOT NULL DEFAULT 0,
    "checklistLockerCount" INTEGER NOT NULL DEFAULT 0,
    "checklistTablesCount" INTEGER NOT NULL DEFAULT 0,
    "checklistInsideItemsOk" BOOLEAN NOT NULL DEFAULT true,
    "costWindow" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "costDoor" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "costWaterPanel" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "costRoof" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "costWall" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "costElectricity" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalDamageCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "conditionNote" VARCHAR(1000),
    "photoUrls" TEXT[],
    "photoCount" INTEGER NOT NULL DEFAULT 0,
    "resolvedTo" VARCHAR(20),
    "completedAt" TIMESTAMP(6),
    "completedBy" UUID,
    "createdBy" UUID,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "house_inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "general_assets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "srNo" SERIAL NOT NULL,
    "itemType" VARCHAR(100) NOT NULL,
    "pid" VARCHAR(50) NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "locationId" UUID,
    "locationName" VARCHAR(255),
    "condition" VARCHAR(50) NOT NULL,
    "brand" VARCHAR(100),
    "reviewsDate" DATE,
    "remark" VARCHAR(1000),
    "organizationId" UUID NOT NULL,
    "createdBy" UUID,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "general_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "engine_config_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "weights" JSONB NOT NULL,
    "eligibilityBands" JSONB NOT NULL,
    "recommendationRules" JSONB NOT NULL,
    "changeSummary" VARCHAR(1000),
    "createdBy" UUID,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,
    "publishedBy" UUID,
    "publishedAt" TIMESTAMP(6),
    "supersededById" UUID,

    CONSTRAINT "engine_config_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config_audit_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "versionId" UUID NOT NULL,
    "fieldPath" VARCHAR(200) NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "action" VARCHAR(30) NOT NULL,
    "changedBy" UUID,
    "changedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" VARCHAR(64),
    "changeSummary" VARCHAR(1000),

    CONSTRAINT "config_audit_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "house_inspection_archives" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "allocationId" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "inspectorId" UUID,
    "scheduledDate" DATE,
    "checklistWindow" BOOLEAN NOT NULL DEFAULT false,
    "checklistDoor" BOOLEAN NOT NULL DEFAULT false,
    "checklistWaterPanel" BOOLEAN NOT NULL DEFAULT false,
    "checklistRoof" BOOLEAN NOT NULL DEFAULT false,
    "checklistWall" BOOLEAN NOT NULL DEFAULT false,
    "checklistElectricity" BOOLEAN NOT NULL DEFAULT false,
    "costWindow" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "costDoor" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "costWaterPanel" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "costRoof" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "costWall" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "costElectricity" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalDamageCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "conditionNote" VARCHAR(1000),
    "photoUrls" TEXT[],
    "photoCount" INTEGER NOT NULL DEFAULT 0,
    "resolvedTo" VARCHAR(20),
    "completedAt" TIMESTAMP(6),
    "completedBy" UUID,
    "createdBy" UUID,
    "createdAt" TIMESTAMP(6) NOT NULL,
    "coldCompression" VARCHAR(20) NOT NULL DEFAULT 'none',
    "archivedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "house_inspection_archives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rent_renters" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "firstName" VARCHAR(50) NOT NULL,
    "lastName" VARCHAR(50) NOT NULL,
    "gender" "Gender" NOT NULL,
    "nationalId" VARCHAR(64) NOT NULL,
    "rentType" "RentType" NOT NULL,
    "rentTypeDetail" VARCHAR(200),
    "monthlyPrice" DECIMAL(12,2) NOT NULL,
    "startDate" DATE NOT NULL,
    "termMonths" SMALLINT NOT NULL,
    "endDate" DATE NOT NULL,
    "status" "RentLeaseStatus" NOT NULL DEFAULT 'Active',
    "terminatedAt" TIMESTAMP(6),
    "terminatedById" UUID,
    "terminationReason" VARCHAR(500),
    "archivedReason" VARCHAR(500),
    "createdById" UUID,
    "updatedById" UUID,
    "deletedAt" TIMESTAMP(6),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "rent_renters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rent_renter_phones" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "renterId" UUID NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "rent_renter_phones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rent_installments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "renterId" UUID NOT NULL,
    "monthNumber" SMALLINT NOT NULL,
    "dueDate" DATE NOT NULL,
    "amountDue" DECIMAL(12,2) NOT NULL,
    "status" "RentInstallmentStatus" NOT NULL DEFAULT 'UNPAID',
    "paidAt" DATE,
    "paidById" UUID,
    "receiptNumber" VARCHAR(40),
    "paymentMethod" "RentPaymentMethod",
    "referenceNumber" VARCHAR(100),
    "note" VARCHAR(500),
    "voidedAt" TIMESTAMP(6),
    "voidedById" UUID,
    "voidReason" VARCHAR(500),
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "rent_installments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rent_payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "renterId" UUID NOT NULL,
    "installmentId" UUID NOT NULL,
    "receiptNumber" VARCHAR(40) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paidOn" DATE NOT NULL,
    "method" "RentPaymentMethod" NOT NULL,
    "referenceNumber" VARCHAR(100),
    "note" VARCHAR(500),
    "voidedAt" TIMESTAMP(6),
    "voidedById" UUID,
    "voidReason" VARCHAR(500),
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "rent_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rent_receipt_sequences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "year" SMALLINT NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "rent_receipt_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "departments_organizationId_idx" ON "departments"("organizationId");

-- CreateIndex
CREATE INDEX "departments_parentId_idx" ON "departments"("parentId");

-- CreateIndex
CREATE INDEX "departments_code_idx" ON "departments"("code");

-- CreateIndex
CREATE INDEX "departments_isActive_idx" ON "departments"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "departments_code_organizationId_key" ON "departments"("code", "organizationId");

-- CreateIndex
CREATE INDEX "roles_organizationId_idx" ON "roles"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_organizationId_key" ON "roles"("name", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_userId_roleId_key" ON "user_roles"("userId", "roleId");

-- CreateIndex
CREATE INDEX "webhooks_organizationId_idx" ON "webhooks"("organizationId");

-- CreateIndex
CREATE INDEX "webhooks_isActive_idx" ON "webhooks"("isActive");

-- CreateIndex
CREATE INDEX "webhooks_organizationId_isActive_idx" ON "webhooks"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "webhook_deliveries_webhookId_idx" ON "webhook_deliveries"("webhookId");

-- CreateIndex
CREATE INDEX "webhook_deliveries_deliveredAt_idx" ON "webhook_deliveries"("deliveredAt");

-- CreateIndex
CREATE INDEX "scim_tokens_organizationId_idx" ON "scim_tokens"("organizationId");

-- CreateIndex
CREATE INDEX "asset_reservations_assetId_idx" ON "asset_reservations"("assetId");

-- CreateIndex
CREATE INDEX "asset_reservations_userId_idx" ON "asset_reservations"("userId");

-- CreateIndex
CREATE INDEX "asset_reservations_status_idx" ON "asset_reservations"("status");

-- CreateIndex
CREATE INDEX "asset_reservations_assetId_status_idx" ON "asset_reservations"("assetId", "status");

-- CreateIndex
CREATE INDEX "asset_transfers_assetId_idx" ON "asset_transfers"("assetId");

-- CreateIndex
CREATE INDEX "asset_transfers_transferredAt_idx" ON "asset_transfers"("transferredAt");

-- CreateIndex
CREATE INDEX "approval_requests_requesterId_idx" ON "approval_requests"("requesterId");

-- CreateIndex
CREATE INDEX "approval_requests_status_idx" ON "approval_requests"("status");

-- CreateIndex
CREATE INDEX "approval_requests_approverId_idx" ON "approval_requests"("approverId");

-- CreateIndex
CREATE INDEX "automation_rules_trigger_idx" ON "automation_rules"("trigger");

-- CreateIndex
CREATE INDEX "automation_rules_isActive_idx" ON "automation_rules"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "stock_alerts_consumableId_key" ON "stock_alerts"("consumableId");

-- CreateIndex
CREATE INDEX "import_jobs_userId_idx" ON "import_jobs"("userId");

-- CreateIndex
CREATE INDEX "accessorieCategoryType_organizationId_idx" ON "accessorieCategoryType"("organizationId");

-- CreateIndex
CREATE INDEX "accessories_organizationId_idx" ON "accessories"("organizationId");

-- CreateIndex
CREATE INDEX "accessories_manufacturerid_idx" ON "accessories"("manufacturerid");

-- CreateIndex
CREATE INDEX "accessories_statustypeid_idx" ON "accessories"("statustypeid");

-- CreateIndex
CREATE INDEX "accessories_accessoriecategorytypeid_idx" ON "accessories"("accessoriecategorytypeid");

-- CreateIndex
CREATE INDEX "accessories_locationid_idx" ON "accessories"("locationid");

-- CreateIndex
CREATE INDEX "accessories_supplierid_idx" ON "accessories"("supplierid");

-- CreateIndex
CREATE INDEX "accessories_modelid_idx" ON "accessories"("modelid");

-- CreateIndex
CREATE INDEX "accounts_userId_idx" ON "accounts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_providerId_accountId_key" ON "accounts"("providerId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "asset_assettag_key" ON "asset"("assettag");

-- CreateIndex
CREATE UNIQUE INDEX "asset_serialnumber_key" ON "asset"("serialnumber");

-- CreateIndex
CREATE INDEX "asset_assetname_idx" ON "asset"("assetname");

-- CreateIndex
CREATE INDEX "asset_statustypeid_idx" ON "asset"("statustypeid");

-- CreateIndex
CREATE INDEX "asset_assetcategorytypeid_idx" ON "asset"("assetcategorytypeid");

-- CreateIndex
CREATE INDEX "asset_locationid_idx" ON "asset"("locationid");

-- CreateIndex
CREATE INDEX "asset_organizationId_idx" ON "asset"("organizationId");

-- CreateIndex
CREATE INDEX "asset_creation_date_idx" ON "asset"("creation_date");

-- CreateIndex
CREATE INDEX "asset_modelid_idx" ON "asset"("modelid");

-- CreateIndex
CREATE INDEX "asset_supplierid_idx" ON "asset"("supplierid");

-- CreateIndex
CREATE INDEX "asset_manufacturerid_idx" ON "asset"("manufacturerid");

-- CreateIndex
CREATE INDEX "asset_departmentId_idx" ON "asset"("departmentId");

-- CreateIndex
CREATE INDEX "asset_organizationId_creation_date_idx" ON "asset"("organizationId", "creation_date");

-- CreateIndex
CREATE INDEX "asset_externalId_idx" ON "asset"("externalId");

-- CreateIndex
CREATE INDEX "asset_externalSource_idx" ON "asset"("externalSource");

-- CreateIndex
CREATE INDEX "intune_sync_logs_createdAt_idx" ON "intune_sync_logs"("createdAt");

-- CreateIndex
CREATE INDEX "asset_templates_organizationId_idx" ON "asset_templates"("organizationId");

-- CreateIndex
CREATE INDEX "assetCategoryType_organizationId_idx" ON "assetCategoryType"("organizationId");

-- CreateIndex
CREATE INDEX "assetCategoryType_assetTypeCode_idx" ON "assetCategoryType"("assetTypeCode");

-- CreateIndex
CREATE UNIQUE INDEX "asset_pid_sequences_assetTypeCode_departmentCode_key" ON "asset_pid_sequences"("assetTypeCode", "departmentCode");

-- CreateIndex
CREATE INDEX "asset_attachments_assetId_idx" ON "asset_attachments"("assetId");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entityId_idx" ON "audit_logs"("entity", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_userId_createdAt_idx" ON "audit_logs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "consumable_consumablename_idx" ON "consumable"("consumablename");

-- CreateIndex
CREATE INDEX "consumable_organizationId_idx" ON "consumable"("organizationId");

-- CreateIndex
CREATE INDEX "consumable_manufacturerid_idx" ON "consumable"("manufacturerid");

-- CreateIndex
CREATE INDEX "consumable_supplierid_idx" ON "consumable"("supplierid");

-- CreateIndex
CREATE INDEX "consumable_consumablecategorytypeid_idx" ON "consumable"("consumablecategorytypeid");

-- CreateIndex
CREATE INDEX "consumable_organizationId_consumablename_idx" ON "consumable"("organizationId", "consumablename");

-- CreateIndex
CREATE INDEX "consumableCategoryType_organizationId_idx" ON "consumableCategoryType"("organizationId");

-- CreateIndex
CREATE INDEX "custom_field_definitions_entityType_idx" ON "custom_field_definitions"("entityType");

-- CreateIndex
CREATE INDEX "custom_field_definitions_isActive_idx" ON "custom_field_definitions"("isActive");

-- CreateIndex
CREATE INDEX "custom_field_values_entityId_idx" ON "custom_field_values"("entityId");

-- CreateIndex
CREATE UNIQUE INDEX "custom_field_values_fieldId_entityId_key" ON "custom_field_values"("fieldId", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "depreciation_settings_categoryId_key" ON "depreciation_settings"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "email_templates_name_key" ON "email_templates"("name");

-- CreateIndex
CREATE UNIQUE INDEX "licence_licencekey_key" ON "licence"("licencekey");

-- CreateIndex
CREATE INDEX "licence_organizationId_idx" ON "licence"("organizationId");

-- CreateIndex
CREATE INDEX "licence_licenceduserid_idx" ON "licence"("licenceduserid");

-- CreateIndex
CREATE INDEX "licence_manufacturerid_idx" ON "licence"("manufacturerid");

-- CreateIndex
CREATE INDEX "licence_supplierid_idx" ON "licence"("supplierid");

-- CreateIndex
CREATE INDEX "licence_licencecategorytypeid_idx" ON "licence"("licencecategorytypeid");

-- CreateIndex
CREATE INDEX "licence_expirationdate_idx" ON "licence"("expirationdate");

-- CreateIndex
CREATE INDEX "licence_organizationId_expirationdate_idx" ON "licence"("organizationId", "expirationdate");

-- CreateIndex
CREATE INDEX "licenceCategoryType_organizationId_idx" ON "licenceCategoryType"("organizationId");

-- CreateIndex
CREATE INDEX "location_parentId_idx" ON "location"("parentId");

-- CreateIndex
CREATE INDEX "location_organizationId_idx" ON "location"("organizationId");

-- CreateIndex
CREATE INDEX "maintenance_logs_scheduleId_idx" ON "maintenance_logs"("scheduleId");

-- CreateIndex
CREATE INDEX "maintenance_logs_completedBy_idx" ON "maintenance_logs"("completedBy");

-- CreateIndex
CREATE INDEX "maintenance_schedules_nextDueDate_idx" ON "maintenance_schedules"("nextDueDate");

-- CreateIndex
CREATE INDEX "maintenance_schedules_assetId_idx" ON "maintenance_schedules"("assetId");

-- CreateIndex
CREATE INDEX "maintenance_schedules_assignedTo_idx" ON "maintenance_schedules"("assignedTo");

-- CreateIndex
CREATE INDEX "maintenance_schedules_isActive_idx" ON "maintenance_schedules"("isActive");

-- CreateIndex
CREATE INDEX "maintenance_schedules_isActive_nextDueDate_idx" ON "maintenance_schedules"("isActive", "nextDueDate");

-- CreateIndex
CREATE INDEX "manufacturer_organizationId_idx" ON "manufacturer"("organizationId");

-- CreateIndex
CREATE INDEX "model_organizationId_idx" ON "model"("organizationId");

-- CreateIndex
CREATE INDEX "app_notification_userId_readAt_idx" ON "app_notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "app_notification_userId_createdAt_idx" ON "app_notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "app_notification_userId_category_idx" ON "app_notification"("userId", "category");

-- CreateIndex
CREATE INDEX "app_notification_userId_type_idx" ON "app_notification"("userId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_userId_key" ON "notification_preferences"("userId");

-- CreateIndex
CREATE INDEX "notification_queue_userId_idx" ON "notification_queue"("userId");

-- CreateIndex
CREATE INDEX "notification_queue_status_idx" ON "notification_queue"("status");

-- CreateIndex
CREATE INDEX "notification_queue_status_scheduledAt_idx" ON "notification_queue"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "saved_filters_userId_idx" ON "saved_filters"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- CreateIndex
CREATE INDEX "statusType_organizationId_idx" ON "statusType"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "status_transitions_fromStatusId_toStatusId_key" ON "status_transitions"("fromStatusId", "toStatusId");

-- CreateIndex
CREATE INDEX "supplier_organizationId_idx" ON "supplier"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "system_settings_settingKey_key" ON "system_settings"("settingKey");

-- CreateIndex
CREATE INDEX "ticket_comments_ticketId_idx" ON "ticket_comments"("ticketId");

-- CreateIndex
CREATE INDEX "ticket_comments_userId_idx" ON "ticket_comments"("userId");

-- CreateIndex
CREATE INDEX "tickets_status_idx" ON "tickets"("status");

-- CreateIndex
CREATE INDEX "tickets_createdBy_idx" ON "tickets"("createdBy");

-- CreateIndex
CREATE INDEX "tickets_assignedTo_idx" ON "tickets"("assignedTo");

-- CreateIndex
CREATE INDEX "tickets_createdAt_idx" ON "tickets"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "user_username_key" ON "user"("username");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "user_firstname_lastname_idx" ON "user"("firstname", "lastname");

-- CreateIndex
CREATE INDEX "user_organizationId_idx" ON "user"("organizationId");

-- CreateIndex
CREATE INDEX "user_departmentId_idx" ON "user"("departmentId");

-- CreateIndex
CREATE INDEX "user_organizationId_lastname_firstname_idx" ON "user"("organizationId", "lastname", "firstname");

-- CreateIndex
CREATE INDEX "user_isActive_accessExpiresAt_idx" ON "user"("isActive", "accessExpiresAt");

-- CreateIndex
CREATE INDEX "api_keys_userId_idx" ON "api_keys"("userId");

-- CreateIndex
CREATE INDEX "api_keys_keyPrefix_idx" ON "api_keys"("keyPrefix");

-- CreateIndex
CREATE INDEX "api_keys_isActive_idx" ON "api_keys"("isActive");

-- CreateIndex
CREATE INDEX "report_schedules_userId_idx" ON "report_schedules"("userId");

-- CreateIndex
CREATE INDEX "report_schedules_organizationId_idx" ON "report_schedules"("organizationId");

-- CreateIndex
CREATE INDEX "report_schedules_isActive_nextRunAt_idx" ON "report_schedules"("isActive", "nextRunAt");

-- CreateIndex
CREATE INDEX "userAccessoires_userid_idx" ON "userAccessoires"("userid");

-- CreateIndex
CREATE INDEX "userAccessoires_accessorieid_idx" ON "userAccessoires"("accessorieid");

-- CreateIndex
CREATE INDEX "userAssets_userid_idx" ON "userAssets"("userid");

-- CreateIndex
CREATE INDEX "userAssets_assetid_idx" ON "userAssets"("assetid");

-- CreateIndex
CREATE INDEX "userHistory_userid_idx" ON "userHistory"("userid");

-- CreateIndex
CREATE INDEX "userHistory_referenceid_idx" ON "userHistory"("referenceid");

-- CreateIndex
CREATE INDEX "userHistory_creation_date_idx" ON "userHistory"("creation_date");

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_userId_key" ON "user_preferences"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "navigation_preferences_userId_key" ON "navigation_preferences"("userId");

-- CreateIndex
CREATE INDEX "navigation_preferences_organizationId_idx" ON "navigation_preferences"("organizationId");

-- CreateIndex
CREATE INDEX "consumable_checkouts_consumableId_idx" ON "consumable_checkouts"("consumableId");

-- CreateIndex
CREATE INDEX "consumable_checkouts_userId_idx" ON "consumable_checkouts"("userId");

-- CreateIndex
CREATE INDEX "asset_checkouts_assetId_idx" ON "asset_checkouts"("assetId");

-- CreateIndex
CREATE INDEX "asset_checkouts_checkedOutTo_idx" ON "asset_checkouts"("checkedOutTo");

-- CreateIndex
CREATE INDEX "asset_checkouts_checkedOutToLocationId_idx" ON "asset_checkouts"("checkedOutToLocationId");

-- CreateIndex
CREATE INDEX "asset_checkouts_checkedOutToAssetId_idx" ON "asset_checkouts"("checkedOutToAssetId");

-- CreateIndex
CREATE INDEX "asset_checkouts_status_idx" ON "asset_checkouts"("status");

-- CreateIndex
CREATE INDEX "asset_checkouts_assetId_status_idx" ON "asset_checkouts"("assetId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "team_invitations_token_key" ON "team_invitations"("token");

-- CreateIndex
CREATE INDEX "team_invitations_organizationId_idx" ON "team_invitations"("organizationId");

-- CreateIndex
CREATE INDEX "team_invitations_email_idx" ON "team_invitations"("email");

-- CreateIndex
CREATE INDEX "team_invitations_token_idx" ON "team_invitations"("token");

-- CreateIndex
CREATE INDEX "team_invitations_status_idx" ON "team_invitations"("status");

-- CreateIndex
CREATE INDEX "component_categories_organizationId_idx" ON "component_categories"("organizationId");

-- CreateIndex
CREATE INDEX "components_categoryId_idx" ON "components"("categoryId");

-- CreateIndex
CREATE INDEX "components_organizationId_idx" ON "components"("organizationId");

-- CreateIndex
CREATE INDEX "components_manufacturerId_idx" ON "components"("manufacturerId");

-- CreateIndex
CREATE INDEX "components_supplierId_idx" ON "components"("supplierId");

-- CreateIndex
CREATE INDEX "components_locationId_idx" ON "components"("locationId");

-- CreateIndex
CREATE INDEX "component_checkouts_componentId_idx" ON "component_checkouts"("componentId");

-- CreateIndex
CREATE INDEX "component_checkouts_assetId_idx" ON "component_checkouts"("assetId");

-- CreateIndex
CREATE INDEX "licence_seat_assignments_licenceId_idx" ON "licence_seat_assignments"("licenceId");

-- CreateIndex
CREATE INDEX "licence_seat_assignments_userId_idx" ON "licence_seat_assignments"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "licence_seat_assignments_licenceId_seatNumber_key" ON "licence_seat_assignments"("licenceId", "seatNumber");

-- CreateIndex
CREATE UNIQUE INDEX "licence_seat_assignments_licenceId_userId_key" ON "licence_seat_assignments"("licenceId", "userId");

-- CreateIndex
CREATE INDEX "kits_organizationId_idx" ON "kits"("organizationId");

-- CreateIndex
CREATE INDEX "kits_isActive_idx" ON "kits"("isActive");

-- CreateIndex
CREATE INDEX "kit_items_kitId_idx" ON "kit_items"("kitId");

-- CreateIndex
CREATE INDEX "audit_campaigns_organizationId_idx" ON "audit_campaigns"("organizationId");

-- CreateIndex
CREATE INDEX "audit_campaigns_status_idx" ON "audit_campaigns"("status");

-- CreateIndex
CREATE INDEX "audit_campaigns_createdBy_idx" ON "audit_campaigns"("createdBy");

-- CreateIndex
CREATE UNIQUE INDEX "audit_campaign_auditors_campaignId_userId_key" ON "audit_campaign_auditors"("campaignId", "userId");

-- CreateIndex
CREATE INDEX "audit_entries_campaignId_idx" ON "audit_entries"("campaignId");

-- CreateIndex
CREATE INDEX "audit_entries_assetId_idx" ON "audit_entries"("assetId");

-- CreateIndex
CREATE INDEX "audit_entries_status_idx" ON "audit_entries"("status");

-- CreateIndex
CREATE UNIQUE INDEX "audit_entries_campaignId_assetId_key" ON "audit_entries"("campaignId", "assetId");

-- CreateIndex
CREATE INDEX "ldap_sync_logs_createdAt_idx" ON "ldap_sync_logs"("createdAt");

-- CreateIndex
CREATE INDEX "dashboard_widgets_userId_idx" ON "dashboard_widgets"("userId");

-- CreateIndex
CREATE INDEX "dashboard_widgets_userId_position_idx" ON "dashboard_widgets"("userId", "position");

-- CreateIndex
CREATE INDEX "item_requests_userId_idx" ON "item_requests"("userId");

-- CreateIndex
CREATE INDEX "item_requests_status_idx" ON "item_requests"("status");

-- CreateIndex
CREATE INDEX "item_requests_entityType_entityId_idx" ON "item_requests"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "purchase_requests_organizationId_idx" ON "purchase_requests"("organizationId");

-- CreateIndex
CREATE INDEX "purchase_requests_status_idx" ON "purchase_requests"("status");

-- CreateIndex
CREATE INDEX "purchase_requests_requesterId_idx" ON "purchase_requests"("requesterId");

-- CreateIndex
CREATE INDEX "purchase_request_items_purchaseRequestId_idx" ON "purchase_request_items"("purchaseRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_poNumber_key" ON "purchase_orders"("poNumber");

-- CreateIndex
CREATE INDEX "purchase_orders_organizationId_idx" ON "purchase_orders"("organizationId");

-- CreateIndex
CREATE INDEX "purchase_orders_status_idx" ON "purchase_orders"("status");

-- CreateIndex
CREATE INDEX "purchase_orders_purchaseRequestId_idx" ON "purchase_orders"("purchaseRequestId");

-- CreateIndex
CREATE INDEX "goods_receipts_purchaseOrderId_idx" ON "goods_receipts"("purchaseOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_userid_key" ON "Employee"("userid");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_emp_id_key" ON "Employee"("emp_id");

-- CreateIndex
CREATE INDEX "Employee_organizationId_idx" ON "Employee"("organizationId");

-- CreateIndex
CREATE INDEX "Employee_organizationId_deletedAt_idx" ON "Employee"("organizationId", "deletedAt");

-- CreateIndex
CREATE INDEX "Employee_departmentId_idx" ON "Employee"("departmentId");

-- CreateIndex
CREATE INDEX "Employee_organizationId_departmentId_idx" ON "Employee"("organizationId", "departmentId");

-- CreateIndex
CREATE INDEX "Employee_managerId_idx" ON "Employee"("managerId");

-- CreateIndex
CREATE INDEX "Employee_organizationId_job_grade_idx" ON "Employee"("organizationId", "job_grade");

-- CreateIndex
CREATE INDEX "Employee_organizationId_service_years_idx" ON "Employee"("organizationId", "service_years");

-- CreateIndex
CREATE INDEX "Employee_organizationId_marital_status_idx" ON "Employee"("organizationId", "marital_status");

-- CreateIndex
CREATE INDEX "Employee_organizationId_last_name_first_name_idx" ON "Employee"("organizationId", "last_name", "first_name");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_organizationId_emp_id_key" ON "Employee"("organizationId", "emp_id");

-- CreateIndex
CREATE INDEX "employee_profiles_organizationId_idx" ON "employee_profiles"("organizationId");

-- CreateIndex
CREATE INDEX "employee_profiles_employmentStatus_idx" ON "employee_profiles"("employmentStatus");

-- CreateIndex
CREATE INDEX "employee_profiles_organizationId_employmentStatus_idx" ON "employee_profiles"("organizationId", "employmentStatus");

-- CreateIndex
CREATE UNIQUE INDEX "employee_profiles_organizationId_nationalId_key" ON "employee_profiles"("organizationId", "nationalId");

-- CreateIndex
CREATE INDEX "house_requests_organizationId_status_employeeId_idx" ON "house_requests"("organizationId", "status", "employeeId");

-- CreateIndex
CREATE INDEX "house_requests_employeeId_idx" ON "house_requests"("employeeId");

-- CreateIndex
CREATE INDEX "house_requests_organizationId_createdAt_idx" ON "house_requests"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "house_termination_receipts_inspectionId_key" ON "house_termination_receipts"("inspectionId");

-- CreateIndex
CREATE INDEX "house_termination_receipts_organizationId_idx" ON "house_termination_receipts"("organizationId");

-- CreateIndex
CREATE INDEX "house_termination_receipts_allocationId_idx" ON "house_termination_receipts"("allocationId");

-- CreateIndex
CREATE INDEX "house_termination_receipts_householdId_idx" ON "house_termination_receipts"("householdId");

-- CreateIndex
CREATE INDEX "house_termination_receipts_printedAt_idx" ON "house_termination_receipts"("printedAt");

-- CreateIndex
CREATE UNIQUE INDEX "households_srNo_key" ON "households"("srNo");

-- CreateIndex
CREATE INDEX "households_organizationId_idx" ON "households"("organizationId");

-- CreateIndex
CREATE INDEX "households_status_idx" ON "households"("status");

-- CreateIndex
CREATE INDEX "households_houseType_idx" ON "households"("houseType");

-- CreateIndex
CREATE INDEX "households_locationId_idx" ON "households"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "households_organizationId_hid_key" ON "households"("organizationId", "hid");

-- CreateIndex
CREATE UNIQUE INDEX "households_organizationId_houseNumber_key" ON "households"("organizationId", "houseNumber");

-- CreateIndex
CREATE INDEX "house_allocations_organizationId_employeeId_idx" ON "house_allocations"("organizationId", "employeeId");

-- CreateIndex
CREATE INDEX "house_allocations_organizationId_idx" ON "house_allocations"("organizationId");

-- CreateIndex
CREATE INDEX "house_allocations_employeeId_idx" ON "house_allocations"("employeeId");

-- CreateIndex
CREATE INDEX "house_allocations_householdId_idx" ON "house_allocations"("householdId");

-- CreateIndex
CREATE INDEX "house_allocations_status_idx" ON "house_allocations"("status");

-- CreateIndex
CREATE UNIQUE INDEX "house_inspections_allocationId_key" ON "house_inspections"("allocationId");

-- CreateIndex
CREATE INDEX "house_inspections_organizationId_idx" ON "house_inspections"("organizationId");

-- CreateIndex
CREATE INDEX "house_inspections_householdId_idx" ON "house_inspections"("householdId");

-- CreateIndex
CREATE INDEX "house_inspections_inspectorId_idx" ON "house_inspections"("inspectorId");

-- CreateIndex
CREATE INDEX "house_inspections_resolvedTo_idx" ON "house_inspections"("resolvedTo");

-- CreateIndex
CREATE INDEX "house_inspections_status_idx" ON "house_inspections"("status");

-- CreateIndex
CREATE UNIQUE INDEX "general_assets_srNo_key" ON "general_assets"("srNo");

-- CreateIndex
CREATE INDEX "general_assets_organizationId_idx" ON "general_assets"("organizationId");

-- CreateIndex
CREATE INDEX "general_assets_itemType_idx" ON "general_assets"("itemType");

-- CreateIndex
CREATE INDEX "general_assets_category_idx" ON "general_assets"("category");

-- CreateIndex
CREATE INDEX "general_assets_condition_idx" ON "general_assets"("condition");

-- CreateIndex
CREATE INDEX "general_assets_locationId_idx" ON "general_assets"("locationId");

-- CreateIndex
CREATE INDEX "general_assets_reviewsDate_idx" ON "general_assets"("reviewsDate");

-- CreateIndex
CREATE UNIQUE INDEX "general_assets_organizationId_pid_key" ON "general_assets"("organizationId", "pid");

-- CreateIndex
CREATE INDEX "engine_config_versions_organizationId_status_idx" ON "engine_config_versions"("organizationId", "status");

-- CreateIndex
CREATE INDEX "engine_config_versions_organizationId_createdAt_idx" ON "engine_config_versions"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "engine_config_versions_organizationId_versionNumber_key" ON "engine_config_versions"("organizationId", "versionNumber");

-- CreateIndex
CREATE INDEX "config_audit_entries_organizationId_versionId_idx" ON "config_audit_entries"("organizationId", "versionId");

-- CreateIndex
CREATE INDEX "config_audit_entries_organizationId_changedAt_idx" ON "config_audit_entries"("organizationId", "changedAt");

-- CreateIndex
CREATE INDEX "config_audit_entries_action_idx" ON "config_audit_entries"("action");

-- CreateIndex
CREATE INDEX "house_inspection_archives_organizationId_idx" ON "house_inspection_archives"("organizationId");

-- CreateIndex
CREATE INDEX "house_inspection_archives_householdId_idx" ON "house_inspection_archives"("householdId");

-- CreateIndex
CREATE INDEX "house_inspection_archives_archivedAt_idx" ON "house_inspection_archives"("archivedAt");

-- CreateIndex
CREATE INDEX "rent_renters_organizationId_deletedAt_idx" ON "rent_renters"("organizationId", "deletedAt");

-- CreateIndex
CREATE INDEX "rent_renters_organizationId_lastName_firstName_idx" ON "rent_renters"("organizationId", "lastName", "firstName");

-- CreateIndex
CREATE INDEX "rent_renters_organizationId_status_idx" ON "rent_renters"("organizationId", "status");

-- CreateIndex
CREATE INDEX "rent_renters_organizationId_rentType_idx" ON "rent_renters"("organizationId", "rentType");

-- CreateIndex
CREATE INDEX "rent_renters_organizationId_gender_idx" ON "rent_renters"("organizationId", "gender");

-- CreateIndex
CREATE INDEX "rent_renters_organizationId_startDate_idx" ON "rent_renters"("organizationId", "startDate");

-- CreateIndex
CREATE INDEX "rent_renters_organizationId_nationalId_idx" ON "rent_renters"("organizationId", "nationalId");

-- CreateIndex
CREATE INDEX "rent_renter_phones_organizationId_phone_idx" ON "rent_renter_phones"("organizationId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "rent_renter_phones_renterId_phone_key" ON "rent_renter_phones"("renterId", "phone");

-- CreateIndex
CREATE INDEX "rent_installments_organizationId_status_dueDate_idx" ON "rent_installments"("organizationId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "rent_installments_renterId_status_monthNumber_idx" ON "rent_installments"("renterId", "status", "monthNumber");

-- CreateIndex
CREATE INDEX "rent_installments_renterId_dueDate_idx" ON "rent_installments"("renterId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "rent_installments_renterId_monthNumber_key" ON "rent_installments"("renterId", "monthNumber");

-- CreateIndex
CREATE INDEX "rent_payments_renterId_paidOn_idx" ON "rent_payments"("renterId", "paidOn");

-- CreateIndex
CREATE INDEX "rent_payments_installmentId_idx" ON "rent_payments"("installmentId");

-- CreateIndex
CREATE INDEX "rent_payments_organizationId_voidedAt_paidOn_idx" ON "rent_payments"("organizationId", "voidedAt", "paidOn");

-- CreateIndex
CREATE UNIQUE INDEX "rent_payments_organizationId_receiptNumber_key" ON "rent_payments"("organizationId", "receiptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "rent_receipt_sequences_organizationId_year_key" ON "rent_receipt_sequences"("organizationId", "year");

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("userid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "webhooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scim_tokens" ADD CONSTRAINT "scim_tokens_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_reservations" ADD CONSTRAINT "asset_reservations_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "asset"("assetid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_reservations" ADD CONSTRAINT "asset_reservations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("userid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_transfers" ADD CONSTRAINT "asset_transfers_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "asset"("assetid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "user"("userid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "user"("userid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("userid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_alerts" ADD CONSTRAINT "stock_alerts_consumableId_fkey" FOREIGN KEY ("consumableId") REFERENCES "consumable"("consumableid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("userid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accessorieCategoryType" ADD CONSTRAINT "accessorieCategoryType_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accessories" ADD CONSTRAINT "fk_accessories_accessoriecategorytype_c_accessoriecategorytypei" FOREIGN KEY ("accessoriecategorytypeid") REFERENCES "accessorieCategoryType"("accessoriecategorytypeid") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "accessories" ADD CONSTRAINT "fk_accessories_location_c_locationid" FOREIGN KEY ("locationid") REFERENCES "location"("locationid") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "accessories" ADD CONSTRAINT "fk_accessories_manufacturer_c_manufacturerid" FOREIGN KEY ("manufacturerid") REFERENCES "manufacturer"("manufacturerid") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "accessories" ADD CONSTRAINT "fk_accessories_model_c_modelid" FOREIGN KEY ("modelid") REFERENCES "model"("modelid") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "accessories" ADD CONSTRAINT "accessories_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accessories" ADD CONSTRAINT "fk_accessories_statustype_c_statustypeid" FOREIGN KEY ("statustypeid") REFERENCES "statusType"("statustypeid") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "accessories" ADD CONSTRAINT "fk_accessories_supplier_c_supplierid" FOREIGN KEY ("supplierid") REFERENCES "supplier"("supplierid") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("userid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset" ADD CONSTRAINT "fk_asset_assetcategorytype_c_assetcategorytypeid" FOREIGN KEY ("assetcategorytypeid") REFERENCES "assetCategoryType"("assetcategorytypeid") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "asset" ADD CONSTRAINT "fk_asset_location_c_locationid" FOREIGN KEY ("locationid") REFERENCES "location"("locationid") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "asset" ADD CONSTRAINT "fk_asset_manufacturer_c_manufacturerid" FOREIGN KEY ("manufacturerid") REFERENCES "manufacturer"("manufacturerid") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "asset" ADD CONSTRAINT "fk_asset_model_c_modelid" FOREIGN KEY ("modelid") REFERENCES "model"("modelid") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "asset" ADD CONSTRAINT "asset_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset" ADD CONSTRAINT "fk_asset_statustype_c_statustypeid" FOREIGN KEY ("statustypeid") REFERENCES "statusType"("statustypeid") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "asset" ADD CONSTRAINT "fk_asset_supplier_c_supplierid" FOREIGN KEY ("supplierid") REFERENCES "supplier"("supplierid") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "asset" ADD CONSTRAINT "asset_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assetCategoryType" ADD CONSTRAINT "assetCategoryType_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_attachments" ADD CONSTRAINT "asset_attachments_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "asset"("assetid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_attachments" ADD CONSTRAINT "asset_attachments_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "user"("userid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("userid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumable" ADD CONSTRAINT "fk_consumable_consumablecategorytype_c_consumablecategorytypeid" FOREIGN KEY ("consumablecategorytypeid") REFERENCES "consumableCategoryType"("consumablecategorytypeid") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "consumable" ADD CONSTRAINT "fk_consumable_manufacturer_c_manufacturerid" FOREIGN KEY ("manufacturerid") REFERENCES "manufacturer"("manufacturerid") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "consumable" ADD CONSTRAINT "consumable_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumable" ADD CONSTRAINT "fk_consumable_supplier_c_supplierid" FOREIGN KEY ("supplierid") REFERENCES "supplier"("supplierid") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "consumableCategoryType" ADD CONSTRAINT "consumableCategoryType_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_field_values" ADD CONSTRAINT "custom_field_values_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "custom_field_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "depreciation_settings" ADD CONSTRAINT "depreciation_settings_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "assetCategoryType"("assetcategorytypeid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licence" ADD CONSTRAINT "fk_licence_licencecategorytype_c_licencecategorytypeid" FOREIGN KEY ("licencecategorytypeid") REFERENCES "licenceCategoryType"("licencecategorytypeid") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "licence" ADD CONSTRAINT "fk_licence_manufacturer_c_manufacturerid" FOREIGN KEY ("manufacturerid") REFERENCES "manufacturer"("manufacturerid") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "licence" ADD CONSTRAINT "licence_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licence" ADD CONSTRAINT "fk_licence_supplier_c_supplierid" FOREIGN KEY ("supplierid") REFERENCES "supplier"("supplierid") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "licence" ADD CONSTRAINT "fk_licence_user_c_licenceduser_userid" FOREIGN KEY ("licenceduserid") REFERENCES "user"("userid") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "licenceCategoryType" ADD CONSTRAINT "licenceCategoryType_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location" ADD CONSTRAINT "location_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location" ADD CONSTRAINT "location_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "location"("locationid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_logs" ADD CONSTRAINT "maintenance_logs_completedBy_fkey" FOREIGN KEY ("completedBy") REFERENCES "user"("userid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_logs" ADD CONSTRAINT "maintenance_logs_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "maintenance_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_schedules" ADD CONSTRAINT "maintenance_schedules_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "asset"("assetid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_schedules" ADD CONSTRAINT "maintenance_schedules_assignedTo_fkey" FOREIGN KEY ("assignedTo") REFERENCES "user"("userid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manufacturer" ADD CONSTRAINT "manufacturer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model" ADD CONSTRAINT "model_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_notification" ADD CONSTRAINT "app_notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("userid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("userid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_queue" ADD CONSTRAINT "notification_queue_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("userid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_filters" ADD CONSTRAINT "saved_filters_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("userid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("userid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "statusType" ADD CONSTRAINT "statusType_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_transitions" ADD CONSTRAINT "status_transitions_fromStatusId_fkey" FOREIGN KEY ("fromStatusId") REFERENCES "statusType"("statustypeid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_transitions" ADD CONSTRAINT "status_transitions_toStatusId_fkey" FOREIGN KEY ("toStatusId") REFERENCES "statusType"("statustypeid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_comments" ADD CONSTRAINT "ticket_comments_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_comments" ADD CONSTRAINT "ticket_comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("userid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assignedTo_fkey" FOREIGN KEY ("assignedTo") REFERENCES "user"("userid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("userid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("userid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_schedules" ADD CONSTRAINT "report_schedules_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("userid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "userAccessoires" ADD CONSTRAINT "fk_useraccessoires_accessories_c_accessorieid" FOREIGN KEY ("accessorieid") REFERENCES "accessories"("accessorieid") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "userAccessoires" ADD CONSTRAINT "fk_useraccessoires_user_c_userid" FOREIGN KEY ("userid") REFERENCES "user"("userid") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "userAssets" ADD CONSTRAINT "fk_userassets_asset_c_assetid" FOREIGN KEY ("assetid") REFERENCES "asset"("assetid") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "userAssets" ADD CONSTRAINT "fk_userassets_user_c_userid" FOREIGN KEY ("userid") REFERENCES "user"("userid") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "userHistory" ADD CONSTRAINT "fk_userhistory_user_c_userid" FOREIGN KEY ("userid") REFERENCES "user"("userid") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("userid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "navigation_preferences" ADD CONSTRAINT "navigation_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("userid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "navigation_preferences" ADD CONSTRAINT "navigation_preferences_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumable_checkouts" ADD CONSTRAINT "consumable_checkouts_consumableId_fkey" FOREIGN KEY ("consumableId") REFERENCES "consumable"("consumableid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumable_checkouts" ADD CONSTRAINT "consumable_checkouts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("userid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "twoFactor" ADD CONSTRAINT "twoFactor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("userid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_checkouts" ADD CONSTRAINT "asset_checkouts_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "asset"("assetid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_checkouts" ADD CONSTRAINT "asset_checkouts_checkedOutTo_fkey" FOREIGN KEY ("checkedOutTo") REFERENCES "user"("userid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_checkouts" ADD CONSTRAINT "asset_checkouts_checkedOutToLocationId_fkey" FOREIGN KEY ("checkedOutToLocationId") REFERENCES "location"("locationid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_checkouts" ADD CONSTRAINT "asset_checkouts_checkedOutToAssetId_fkey" FOREIGN KEY ("checkedOutToAssetId") REFERENCES "asset"("assetid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_checkouts" ADD CONSTRAINT "asset_checkouts_checkedOutBy_fkey" FOREIGN KEY ("checkedOutBy") REFERENCES "user"("userid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_invitedBy_fkey" FOREIGN KEY ("invitedBy") REFERENCES "user"("userid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "component_categories" ADD CONSTRAINT "component_categories_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "components" ADD CONSTRAINT "components_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "component_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "components" ADD CONSTRAINT "components_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "manufacturer"("manufacturerid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "components" ADD CONSTRAINT "components_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "supplier"("supplierid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "components" ADD CONSTRAINT "components_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "location"("locationid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "components" ADD CONSTRAINT "components_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "component_checkouts" ADD CONSTRAINT "component_checkouts_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "components"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "component_checkouts" ADD CONSTRAINT "component_checkouts_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "asset"("assetid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "component_checkouts" ADD CONSTRAINT "component_checkouts_checkedOutBy_fkey" FOREIGN KEY ("checkedOutBy") REFERENCES "user"("userid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licence_seat_assignments" ADD CONSTRAINT "licence_seat_assignments_licenceId_fkey" FOREIGN KEY ("licenceId") REFERENCES "licence"("licenceid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licence_seat_assignments" ADD CONSTRAINT "licence_seat_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("userid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licence_seat_assignments" ADD CONSTRAINT "licence_seat_assignments_assignedBy_fkey" FOREIGN KEY ("assignedBy") REFERENCES "user"("userid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kits" ADD CONSTRAINT "kits_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kit_items" ADD CONSTRAINT "kit_items_kitId_fkey" FOREIGN KEY ("kitId") REFERENCES "kits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_campaigns" ADD CONSTRAINT "audit_campaigns_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_campaigns" ADD CONSTRAINT "audit_campaigns_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("userid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_campaign_auditors" ADD CONSTRAINT "audit_campaign_auditors_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "audit_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_campaign_auditors" ADD CONSTRAINT "audit_campaign_auditors_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("userid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_entries" ADD CONSTRAINT "audit_entries_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "audit_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_entries" ADD CONSTRAINT "audit_entries_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "asset"("assetid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_entries" ADD CONSTRAINT "audit_entries_auditedBy_fkey" FOREIGN KEY ("auditedBy") REFERENCES "user"("userid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_entries" ADD CONSTRAINT "audit_entries_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "location"("locationid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_widgets" ADD CONSTRAINT "dashboard_widgets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("userid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_requests" ADD CONSTRAINT "item_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("userid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_requests" ADD CONSTRAINT "item_requests_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "user"("userid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "user"("userid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "user"("userid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_request_items" ADD CONSTRAINT "purchase_request_items_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES "purchase_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_request_items" ADD CONSTRAINT "purchase_request_items_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "supplier"("supplierid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES "purchase_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "supplier"("supplierid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_receivedBy_fkey" FOREIGN KEY ("receivedBy") REFERENCES "user"("userid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_userid_fkey" FOREIGN KEY ("userid") REFERENCES "user"("userid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_profiles" ADD CONSTRAINT "employee_profiles_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_profiles" ADD CONSTRAINT "employee_profiles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_requests" ADD CONSTRAINT "house_requests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_requests" ADD CONSTRAINT "house_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_termination_receipts" ADD CONSTRAINT "house_termination_receipts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_termination_receipts" ADD CONSTRAINT "house_termination_receipts_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "house_inspections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_termination_receipts" ADD CONSTRAINT "house_termination_receipts_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_termination_receipts" ADD CONSTRAINT "house_termination_receipts_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "house_allocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "households" ADD CONSTRAINT "households_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "households" ADD CONSTRAINT "households_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "location"("locationid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_allocations" ADD CONSTRAINT "house_allocations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_allocations" ADD CONSTRAINT "house_allocations_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_allocations" ADD CONSTRAINT "house_allocations_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_allocations" ADD CONSTRAINT "house_allocations_previousHouseholdId_fkey" FOREIGN KEY ("previousHouseholdId") REFERENCES "households"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_allocations" ADD CONSTRAINT "house_allocations_transferHouseholdId_fkey" FOREIGN KEY ("transferHouseholdId") REFERENCES "households"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_inspections" ADD CONSTRAINT "house_inspections_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_inspections" ADD CONSTRAINT "house_inspections_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "house_allocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_inspections" ADD CONSTRAINT "house_inspections_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "general_assets" ADD CONSTRAINT "general_assets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "general_assets" ADD CONSTRAINT "general_assets_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "location"("locationid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engine_config_versions" ADD CONSTRAINT "engine_config_versions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "config_audit_entries" ADD CONSTRAINT "config_audit_entries_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "engine_config_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "config_audit_entries" ADD CONSTRAINT "config_audit_entries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_inspection_archives" ADD CONSTRAINT "house_inspection_archives_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rent_renters" ADD CONSTRAINT "rent_renters_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rent_renter_phones" ADD CONSTRAINT "rent_renter_phones_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rent_renter_phones" ADD CONSTRAINT "rent_renter_phones_renterId_fkey" FOREIGN KEY ("renterId") REFERENCES "rent_renters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rent_installments" ADD CONSTRAINT "rent_installments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rent_installments" ADD CONSTRAINT "rent_installments_renterId_fkey" FOREIGN KEY ("renterId") REFERENCES "rent_renters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rent_payments" ADD CONSTRAINT "rent_payments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rent_payments" ADD CONSTRAINT "rent_payments_renterId_fkey" FOREIGN KEY ("renterId") REFERENCES "rent_renters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rent_payments" ADD CONSTRAINT "rent_payments_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "rent_installments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rent_receipt_sequences" ADD CONSTRAINT "rent_receipt_sequences_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Search indexes managed outside the Prisma schema (pg_trgm)
CREATE INDEX IF NOT EXISTS "Employee_firstname_trgm_idx" ON "Employee" USING gin ("first_name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Employee_lastname_trgm_idx" ON "Employee" USING gin ("last_name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Employee_employeeNumber_trgm_idx" ON "Employee" USING gin ("emp_id" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "employee_profiles_nationalId_trgm_idx" ON "employee_profiles" USING gin ("nationalId" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "rent_renters_firstName_trgm_idx" ON "rent_renters" USING gin ("firstName" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "rent_renters_lastName_trgm_idx" ON "rent_renters" USING gin ("lastName" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "rent_renters_nationalId_trgm_idx" ON "rent_renters" USING gin ("nationalId" gin_trgm_ops);
