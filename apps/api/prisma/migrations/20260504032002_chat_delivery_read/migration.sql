-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "customerChatReadAt" TIMESTAMP(3),
ADD COLUMN     "providerChatReadAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "deliveredAt" TIMESTAMP(3);

