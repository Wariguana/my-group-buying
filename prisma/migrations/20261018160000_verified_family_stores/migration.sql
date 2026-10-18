-- CreateTable
CREATE TABLE "VerifiedPickupStore" (
    "id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "address" VARCHAR(300) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "verificationEvidence" VARCHAR(500) NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "VerifiedPickupStore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VerifiedPickupStore_code_key" ON "VerifiedPickupStore"("code");
