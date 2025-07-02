/*
  Warnings:

  - You are about to drop the column `artworkId` on the `Job` table. All the data in the column will be lost.
  - You are about to drop the column `availability` on the `Machine` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `Machine` table. All the data in the column will be lost.
  - You are about to drop the column `jobId` on the `PurchaseOrder` table. All the data in the column will be lost.
  - You are about to drop the column `firstName` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `lastName` on the `User` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[machineCode]` on the table `Machine` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `nrcJobNo` to the `ArtWork` table without a default value. This is not possible if the table is not empty.
  - Added the required column `jobNrcJobNo` to the `Corrugation` table without a default value. This is not possible if the table is not empty.
  - Added the required column `jobNrcJobNo` to the `DispatchProcess` table without a default value. This is not possible if the table is not empty.
  - Added the required column `jobNrcJobNo` to the `FluteLaminateBoardConversion` table without a default value. This is not possible if the table is not empty.
  - Added the required column `purchaseOrderId` to the `Job` table without a default value. This is not possible if the table is not empty.
  - Added the required column `capacity` to the `Machine` table without a default value. This is not possible if the table is not empty.
  - Added the required column `description` to the `Machine` table without a default value. This is not possible if the table is not empty.
  - Added the required column `machineCode` to the `Machine` table without a default value. This is not possible if the table is not empty.
  - Added the required column `machineType` to the `Machine` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type` to the `Machine` table without a default value. This is not possible if the table is not empty.
  - Added the required column `unit` to the `Machine` table without a default value. This is not possible if the table is not empty.
  - Added the required column `jobNrcJobNo` to the `PaperStore` table without a default value. This is not possible if the table is not empty.
  - Added the required column `jobNrcJobNo` to the `PrintingDetails` table without a default value. This is not possible if the table is not empty.
  - Added the required column `jobNrcJobNo` to the `Punching` table without a default value. This is not possible if the table is not empty.
  - Added the required column `jobNrcJobNo` to the `QualityDept` table without a default value. This is not possible if the table is not empty.
  - Added the required column `jobNrcJobNo` to the `SideFlapPasting` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('created', 'approved');

-- CreateEnum
CREATE TYPE "StepStatus" AS ENUM ('reject', 'accept', 'hold', 'in_progress');

-- CreateEnum
CREATE TYPE "MachineStatus" AS ENUM ('available', 'busy');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'printer';

-- DropForeignKey
ALTER TABLE "Job" DROP CONSTRAINT "Job_artworkId_fkey";

-- DropForeignKey
ALTER TABLE "PurchaseOrder" DROP CONSTRAINT "PurchaseOrder_jobId_fkey";

-- DropIndex
DROP INDEX "Job_artworkId_key";

-- AlterTable
ALTER TABLE "ArtWork" ADD COLUMN     "nrcJobNo" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Corrugation" ADD COLUMN     "jobNrcJobNo" TEXT NOT NULL,
ADD COLUMN     "status" "StepStatus" NOT NULL DEFAULT 'in_progress';

-- AlterTable
ALTER TABLE "DispatchProcess" ADD COLUMN     "jobNrcJobNo" TEXT NOT NULL,
ADD COLUMN     "status" "StepStatus" NOT NULL DEFAULT 'in_progress';

-- AlterTable
ALTER TABLE "FluteLaminateBoardConversion" ADD COLUMN     "jobNrcJobNo" TEXT NOT NULL,
ADD COLUMN     "status" "StepStatus" NOT NULL DEFAULT 'in_progress';

-- AlterTable
ALTER TABLE "Job" DROP COLUMN "artworkId",
ADD COLUMN     "purchaseOrderId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "Machine" DROP COLUMN "availability",
DROP COLUMN "name",
ADD COLUMN     "capacity" INTEGER NOT NULL,
ADD COLUMN     "description" TEXT NOT NULL,
ADD COLUMN     "machineCode" TEXT NOT NULL,
ADD COLUMN     "machineType" TEXT NOT NULL,
ADD COLUMN     "remarks" TEXT,
ADD COLUMN     "status" "MachineStatus" NOT NULL DEFAULT 'available',
ADD COLUMN     "type" TEXT NOT NULL,
ADD COLUMN     "unit" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "PaperStore" ADD COLUMN     "jobNrcJobNo" TEXT NOT NULL,
ADD COLUMN     "status" "StepStatus" NOT NULL DEFAULT 'in_progress';

-- AlterTable
ALTER TABLE "PrintingDetails" ADD COLUMN     "jobNrcJobNo" TEXT NOT NULL,
ADD COLUMN     "status" "StepStatus" NOT NULL DEFAULT 'in_progress';

-- AlterTable
ALTER TABLE "Punching" ADD COLUMN     "jobNrcJobNo" TEXT NOT NULL,
ADD COLUMN     "status" "StepStatus" NOT NULL DEFAULT 'in_progress';

-- AlterTable
ALTER TABLE "PurchaseOrder" DROP COLUMN "jobId",
ADD COLUMN     "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'created';

-- AlterTable
ALTER TABLE "QualityDept" ADD COLUMN     "jobNrcJobNo" TEXT NOT NULL,
ADD COLUMN     "status" "StepStatus" NOT NULL DEFAULT 'in_progress';

-- AlterTable
ALTER TABLE "SideFlapPasting" ADD COLUMN     "jobNrcJobNo" TEXT NOT NULL,
ADD COLUMN     "status" "StepStatus" NOT NULL DEFAULT 'in_progress';

-- AlterTable
ALTER TABLE "User" DROP COLUMN "firstName",
DROP COLUMN "lastName",
ADD COLUMN     "name" TEXT,
ADD COLUMN     "phoneNumber" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Machine_machineCode_key" ON "Machine"("machineCode");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtWork" ADD CONSTRAINT "ArtWork_nrcJobNo_fkey" FOREIGN KEY ("nrcJobNo") REFERENCES "Job"("nrcJobNo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaperStore" ADD CONSTRAINT "PaperStore_jobNrcJobNo_fkey" FOREIGN KEY ("jobNrcJobNo") REFERENCES "Job"("nrcJobNo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintingDetails" ADD CONSTRAINT "PrintingDetails_jobNrcJobNo_fkey" FOREIGN KEY ("jobNrcJobNo") REFERENCES "Job"("nrcJobNo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Corrugation" ADD CONSTRAINT "Corrugation_jobNrcJobNo_fkey" FOREIGN KEY ("jobNrcJobNo") REFERENCES "Job"("nrcJobNo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FluteLaminateBoardConversion" ADD CONSTRAINT "FluteLaminateBoardConversion_jobNrcJobNo_fkey" FOREIGN KEY ("jobNrcJobNo") REFERENCES "Job"("nrcJobNo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Punching" ADD CONSTRAINT "Punching_jobNrcJobNo_fkey" FOREIGN KEY ("jobNrcJobNo") REFERENCES "Job"("nrcJobNo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SideFlapPasting" ADD CONSTRAINT "SideFlapPasting_jobNrcJobNo_fkey" FOREIGN KEY ("jobNrcJobNo") REFERENCES "Job"("nrcJobNo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityDept" ADD CONSTRAINT "QualityDept_jobNrcJobNo_fkey" FOREIGN KEY ("jobNrcJobNo") REFERENCES "Job"("nrcJobNo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchProcess" ADD CONSTRAINT "DispatchProcess_jobNrcJobNo_fkey" FOREIGN KEY ("jobNrcJobNo") REFERENCES "Job"("nrcJobNo") ON DELETE RESTRICT ON UPDATE CASCADE;
