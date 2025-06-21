-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'planner', 'production_head', 'dispatch_executive', 'qc_manager');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('inactive', 'active', 'hold');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLogin" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" SERIAL NOT NULL,
    "nrcJobNo" TEXT NOT NULL,
    "styleItemSKU" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "fluteType" TEXT,
    "status" "JobStatus" NOT NULL DEFAULT 'active',
    "latestRate" DOUBLE PRECISION,
    "preRate" DOUBLE PRECISION,
    "length" DOUBLE PRECISION,
    "width" DOUBLE PRECISION,
    "height" DOUBLE PRECISION,
    "boxDimensions" TEXT,
    "diePunchCode" DOUBLE PRECISION,
    "boardCategory" TEXT,
    "noOfColor" TEXT,
    "processColors" TEXT,
    "specialColor1" TEXT,
    "specialColor2" TEXT,
    "specialColor3" TEXT,
    "specialColor4" TEXT,
    "overPrintFinishing" TEXT,
    "topFaceGSM" TEXT,
    "flutingGSM" TEXT,
    "bottomLinerGSM" TEXT,
    "decalBoardX" TEXT,
    "lengthBoardY" TEXT,
    "boardSize" TEXT,
    "noUps" INTEGER,
    "artworkReceivedDate" TIMESTAMP(3),
    "artworkApprovedDate" TIMESTAMP(3),
    "shadeCardApprovalDate" TIMESTAMP(3),
    "srNo" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "artworkId" INTEGER,
    "userId" TEXT,
    "machineId" TEXT,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Machine" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "availability" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Machine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reel" (
    "id" SERIAL NOT NULL,
    "reelNo" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "quality" TEXT NOT NULL,
    "gsm" TEXT NOT NULL,
    "specification" TEXT NOT NULL,
    "openingStock" DOUBLE PRECISION NOT NULL,
    "closingStock" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawMaterialInward" (
    "id" SERIAL NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "noReelReceived" INTEGER NOT NULL,
    "receiptDate" TIMESTAMP(3) NOT NULL,
    "reelId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RawMaterialInward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawMaterialOutward" (
    "id" SERIAL NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "issuedQty" DOUBLE PRECISION NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "jobName" TEXT NOT NULL,
    "qtySheet" INTEGER NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "reelId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RawMaterialOutward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArtWork" (
    "id" SERIAL NOT NULL,
    "jobCode" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "plateJobCode" TEXT NOT NULL,
    "style" TEXT NOT NULL,
    "productRange" TEXT NOT NULL,
    "productCategory" TEXT NOT NULL,
    "boxType" TEXT NOT NULL,
    "length" DOUBLE PRECISION NOT NULL,
    "width" DOUBLE PRECISION NOT NULL,
    "height" DOUBLE PRECISION NOT NULL,
    "processColor1" TEXT,
    "processColor2" TEXT,
    "processColor3" TEXT,
    "processColor4" TEXT,
    "finishing" TEXT,
    "artworkReceived" TIMESTAMP(3),
    "sentForApprovalDate" TIMESTAMP(3),
    "approvedDate" TIMESTAMP(3),
    "plateOutputMachine1" TEXT,
    "plateOutputMachine2" TEXT,
    "bottomPanelColorCode" TEXT,
    "artworkLayoutChange" BOOLEAN NOT NULL,
    "dimensionChange" BOOLEAN NOT NULL,
    "jobSpecification" TEXT,
    "remarks" TEXT,
    "shadeCardToBeClosed" BOOLEAN NOT NULL,
    "dieReference" TEXT,
    "noOfUps" INTEGER,
    "boardSizeKeylineCm" TEXT,
    "dieSupplied" BOOLEAN NOT NULL,
    "typeOfBoard" TEXT,
    "typeOfPunchAndDieGripper" TEXT,
    "imagesUpload" TEXT,
    "approvalDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArtWork_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrintingApproval" (
    "id" SERIAL NOT NULL,
    "size" TEXT NOT NULL,
    "gsm" TEXT NOT NULL,
    "sheets" INTEGER NOT NULL,
    "mill" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "quality" TEXT NOT NULL,
    "machine5Color" BOOLEAN NOT NULL,
    "machine6Color" BOOLEAN NOT NULL,
    "machine8Color" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrintingApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" SERIAL NOT NULL,
    "boardSize" TEXT,
    "customer" TEXT NOT NULL,
    "deliveryDate" TIMESTAMP(3),
    "dieCode" DOUBLE PRECISION,
    "dispatchDate" TIMESTAMP(3),
    "dispatchQuantity" INTEGER,
    "fluteType" TEXT,
    "jockeyMonth" TEXT,
    "noOfUps" INTEGER,
    "nrcDeliveryDate" TIMESTAMP(3),
    "noOfSheets" INTEGER,
    "poDate" TIMESTAMP(3),
    "poNumber" TEXT,
    "pendingQuantity" INTEGER,
    "pendingValidity" DOUBLE PRECISION,
    "plant" TEXT,
    "shadeCardApprovalDate" TIMESTAMP(3),
    "srNo" DOUBLE PRECISION,
    "style" TEXT,
    "totalPOQuantity" INTEGER,
    "unit" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "jobId" INTEGER,
    "userId" TEXT,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaperStore" (
    "id" SERIAL NOT NULL,
    "sheetSize" TEXT,
    "required" INTEGER,
    "available" INTEGER,
    "issuedDate" TIMESTAMP(3),
    "mill" TEXT,
    "extraMargin" TEXT,
    "gsm" TEXT,
    "quality" TEXT,

    CONSTRAINT "PaperStore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionPlanning" (
    "id" SERIAL NOT NULL,
    "corrugationId" INTEGER,
    "dieCuttingId" INTEGER,
    "dispatchId" INTEGER,
    "fluteLaminateBoardConvId" INTEGER,
    "printingDetailsId" INTEGER,
    "punchingId" INTEGER,
    "qualityDeptId" INTEGER,
    "sideFlapPastingId" INTEGER,
    "paperStoreId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionPlanning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrintingDetails" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3),
    "shift" TEXT,
    "oprName" TEXT,
    "noOfColours" INTEGER,
    "inksUsed" TEXT,
    "postPrintingFinishingOkQty" INTEGER,
    "wastage" INTEGER,
    "coatingType" TEXT,
    "separateSheets" INTEGER,
    "extraSheets" INTEGER,
    "machine" TEXT,

    CONSTRAINT "PrintingDetails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Corrugation" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3),
    "shift" TEXT,
    "oprName" TEXT,
    "machineNo" TEXT,
    "noOfSheets" INTEGER,
    "size" TEXT,
    "gsm1" TEXT,
    "gsm2" TEXT,
    "flute" TEXT,
    "remarks" TEXT,
    "qcCheckSignBy" TEXT,

    CONSTRAINT "Corrugation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FluteLaminateBoardConversion" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3),
    "shift" TEXT,
    "operatorName" TEXT,
    "film" TEXT,
    "okQty" INTEGER,
    "qcCheckSignBy" TEXT,
    "adhesive" TEXT,
    "wastage" INTEGER,

    CONSTRAINT "FluteLaminateBoardConversion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Punching" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3),
    "shift" TEXT,
    "operatorName" TEXT,
    "okQty" INTEGER,
    "machine" TEXT,
    "qcCheckSignBy" TEXT,
    "die" TEXT,
    "wastage" INTEGER,
    "remarks" TEXT,

    CONSTRAINT "Punching_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SideFlapPasting" (
    "id" SERIAL NOT NULL,
    "machineNo" TEXT,
    "date" TIMESTAMP(3),
    "shift" TEXT,
    "operatorName" TEXT,
    "adhesive" TEXT,
    "quantity" INTEGER,
    "wastage" INTEGER,
    "qcCheckSignBy" TEXT,
    "remarks" TEXT,

    CONSTRAINT "SideFlapPasting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualityDept" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3),
    "shift" TEXT,
    "operatorName" TEXT,
    "checkedBy" TEXT,
    "rejectedQty" INTEGER,
    "passQty" INTEGER,
    "reasonForRejection" TEXT,
    "remarks" TEXT,
    "qcCheckSignBy" TEXT,

    CONSTRAINT "QualityDept_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DispatchProcess" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3),
    "shift" TEXT,
    "operatorName" TEXT,
    "noOfBoxes" INTEGER,
    "dispatchNo" TEXT,
    "dispatchDate" TIMESTAMP(3),
    "remarks" TEXT,
    "balanceQty" INTEGER,
    "qcCheckSignBy" TEXT,

    CONSTRAINT "DispatchProcess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DieCutting" (
    "id" SERIAL NOT NULL,
    "details" TEXT,

    CONSTRAINT "DieCutting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Job_nrcJobNo_key" ON "Job"("nrcJobNo");

-- CreateIndex
CREATE UNIQUE INDEX "Job_artworkId_key" ON "Job"("artworkId");

-- CreateIndex
CREATE UNIQUE INDEX "Reel_reelNo_key" ON "Reel"("reelNo");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_artworkId_fkey" FOREIGN KEY ("artworkId") REFERENCES "ArtWork"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawMaterialInward" ADD CONSTRAINT "RawMaterialInward_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "Reel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawMaterialOutward" ADD CONSTRAINT "RawMaterialOutward_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "Reel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionPlanning" ADD CONSTRAINT "ProductionPlanning_corrugationId_fkey" FOREIGN KEY ("corrugationId") REFERENCES "Corrugation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionPlanning" ADD CONSTRAINT "ProductionPlanning_dieCuttingId_fkey" FOREIGN KEY ("dieCuttingId") REFERENCES "DieCutting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionPlanning" ADD CONSTRAINT "ProductionPlanning_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "DispatchProcess"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionPlanning" ADD CONSTRAINT "ProductionPlanning_fluteLaminateBoardConvId_fkey" FOREIGN KEY ("fluteLaminateBoardConvId") REFERENCES "FluteLaminateBoardConversion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionPlanning" ADD CONSTRAINT "ProductionPlanning_printingDetailsId_fkey" FOREIGN KEY ("printingDetailsId") REFERENCES "PrintingDetails"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionPlanning" ADD CONSTRAINT "ProductionPlanning_punchingId_fkey" FOREIGN KEY ("punchingId") REFERENCES "Punching"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionPlanning" ADD CONSTRAINT "ProductionPlanning_qualityDeptId_fkey" FOREIGN KEY ("qualityDeptId") REFERENCES "QualityDept"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionPlanning" ADD CONSTRAINT "ProductionPlanning_sideFlapPastingId_fkey" FOREIGN KEY ("sideFlapPastingId") REFERENCES "SideFlapPasting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionPlanning" ADD CONSTRAINT "ProductionPlanning_paperStoreId_fkey" FOREIGN KEY ("paperStoreId") REFERENCES "PaperStore"("id") ON DELETE SET NULL ON UPDATE CASCADE;
