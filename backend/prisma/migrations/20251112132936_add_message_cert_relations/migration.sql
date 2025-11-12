/*
  Warnings:

  - You are about to drop the column `certificate_id` on the `messages` table. All the data in the column will be lost.
  - Added the required column `hash_algorithm` to the `messages` table without a default value. This is not possible if the table is not empty.
  - Added the required column `signature_algorithm` to the `messages` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."messages" DROP CONSTRAINT "messages_certificate_id_fkey";

-- AlterTable
ALTER TABLE "public"."messages" DROP COLUMN "certificate_id",
ADD COLUMN     "hash_algorithm" TEXT NOT NULL,
ADD COLUMN     "receiver_certificate_id" TEXT,
ADD COLUMN     "sender_certificate_id" TEXT,
ADD COLUMN     "signature_algorithm" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "messages_is_encrypted_is_read_idx" ON "public"."messages"("is_encrypted", "is_read");

-- AddForeignKey
ALTER TABLE "public"."messages" ADD CONSTRAINT "messages_sender_certificate_id_fkey" FOREIGN KEY ("sender_certificate_id") REFERENCES "public"."certificates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."messages" ADD CONSTRAINT "messages_receiver_certificate_id_fkey" FOREIGN KEY ("receiver_certificate_id") REFERENCES "public"."certificates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
