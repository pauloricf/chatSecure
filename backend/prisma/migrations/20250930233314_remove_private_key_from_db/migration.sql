/*
  Warnings:

  - You are about to drop the column `private_key_pem` on the `certificates` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."certificates" DROP COLUMN "private_key_pem";
