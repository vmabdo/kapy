/**
 * Prisma Seed Script
 * Run with: npm run db:seed
 *
 * Seeds the database with:
 * 1. Default SUPER_ADMIN user
 * 2. Egyptian governorates
 * 3. Main warehouse (HQ — Sohag)
 * 4. Default app settings
 * 5. Default treasury
 */

import { PrismaClient, UserRole, WarehouseType } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const GOVERNORATES = [
  { name: "سوهاج", nameEn: "Sohag", code: "SOH" },
  { name: "القاهرة", nameEn: "Cairo", code: "CAI" },
  { name: "الجيزة", nameEn: "Giza", code: "GIZ" },
  { name: "الإسكندرية", nameEn: "Alexandria", code: "ALX" },
  { name: "أسيوط", nameEn: "Asyut", code: "ASY" },
  { name: "قنا", nameEn: "Qena", code: "QNA" },
  { name: "الأقصر", nameEn: "Luxor", code: "LXR" },
  { name: "أسوان", nameEn: "Aswan", code: "ASW" },
  { name: "المنيا", nameEn: "Minya", code: "MIN" },
  { name: "بني سويف", nameEn: "Beni Suef", code: "BNS" },
  { name: "الفيوم", nameEn: "Faiyum", code: "FAY" },
  { name: "البحيرة", nameEn: "Beheira", code: "BHR" },
  { name: "الدقهلية", nameEn: "Dakahlia", code: "DAK" },
  { name: "الشرقية", nameEn: "Sharqia", code: "SHR" },
  { name: "الغربية", nameEn: "Gharbia", code: "GHA" },
  { name: "المنوفية", nameEn: "Monufia", code: "MON" },
  { name: "القليوبية", nameEn: "Qalyubia", code: "QAL" },
  { name: "الإسماعيلية", nameEn: "Ismailia", code: "ISM" },
  { name: "بورسعيد", nameEn: "Port Said", code: "PSD" },
  { name: "السويس", nameEn: "Suez", code: "SUZ" },
  { name: "دمياط", nameEn: "Damietta", code: "DAM" },
  { name: "كفر الشيخ", nameEn: "Kafr El Sheikh", code: "KFS" },
  { name: "مطروح", nameEn: "Matrouh", code: "MAT" },
  { name: "شمال سيناء", nameEn: "North Sinai", code: "NSI" },
  { name: "جنوب سيناء", nameEn: "South Sinai", code: "SSI" },
  { name: "البحر الأحمر", nameEn: "Red Sea", code: "RSE" },
  { name: "الوادي الجديد", nameEn: "New Valley", code: "NVA" },
];

async function main() {
  console.log("🌱 Starting seed...");

  // ── 1. Upsert governorates ──────────────────────────────────
  console.log("📍 Seeding governorates...");
  for (const gov of GOVERNORATES) {
    await prisma.governorate.upsert({
      where: { code: gov.code },
      update: {},
      create: gov,
    });
  }

  // ── 2. Create super admin user ──────────────────────────────
  console.log("👤 Creating super admin user...");
  const passwordHash = await bcrypt.hash("admin123456", 12);

  const adminUser = await prisma.user.upsert({
    where: { email: "admin@kapypharma.com" },
    update: {},
    create: {
      email: "admin@kapypharma.com",
      name: "مدير النظام",
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      isActive: true,
    },
  });
  console.log(`   ✅ Admin user: ${adminUser.email}`);

  // ── 3. Create main warehouse in Sohag ──────────────────────
  console.log("🏭 Creating main warehouse...");
  const sohag = await prisma.governorate.findUnique({ where: { code: "SOH" } });
  if (sohag) {
    await prisma.warehouse.upsert({
      where: { id: "main-warehouse-sohag" },
      update: {},
      create: {
        id: "main-warehouse-sohag",
        name: "المخزن الرئيسي — سوهاج",
        type: WarehouseType.MAIN,
        address: "سوهاج، صعيد مصر",
        governorateId: sohag.id,
        isActive: true,
      },
    });
    console.log("   ✅ Main warehouse created");
  }

  // ── 4. App settings ────────────────────────────────────────
  console.log("⚙️  Creating app settings...");
  const existingSettings = await prisma.appSettings.findFirst();
  if (!existingSettings) {
    await prisma.appSettings.create({
      data: {
        defaultCreditDays: 30,
        lowStockThreshold: 10,
        companyName: "Kapy Pharma",
        companyPhone: "",
        companyAddress: "سوهاج، مصر",
      },
    });
    console.log("   ✅ App settings created");
  }

  // ── 5. Default treasury ────────────────────────────────────
  console.log("💰 Creating default treasury...");
  const existingTreasury = await prisma.treasury.findFirst();
  if (!existingTreasury) {
    await prisma.treasury.create({
      data: {
        name: "الخزينة الرئيسية",
        currentBalance: 0,
        currency: "EGP",
      },
    });
    console.log("   ✅ Treasury created");
  }

  console.log("\n✅ Seed completed successfully!");
  console.log("─────────────────────────────────────────");
  console.log("📧 Admin login: admin@kapypharma.com");
  console.log("🔑 Password:    admin123456");
  console.log("⚠️  Change the admin password immediately after first login!");
  console.log("─────────────────────────────────────────");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
