-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('building', 'troop', 'general', 'monster', 'resource', 'chest');

-- CreateTable
CREATE TABLE "GameEntity" (
    "id" TEXT NOT NULL,
    "type" "EntityType" NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "GameEntity_type_idx" ON "GameEntity"("type");

-- CreateIndex
CREATE UNIQUE INDEX "GameEntity_type_key_key" ON "GameEntity"("type", "key");
