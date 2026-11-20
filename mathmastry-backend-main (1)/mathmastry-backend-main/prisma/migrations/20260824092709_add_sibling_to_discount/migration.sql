-- AlterTable
ALTER TABLE "DiscountRequest" ADD COLUMN     "siblingStudentId" INTEGER;

-- AddForeignKey
ALTER TABLE "DiscountRequest" ADD CONSTRAINT "DiscountRequest_siblingStudentId_fkey" FOREIGN KEY ("siblingStudentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;
