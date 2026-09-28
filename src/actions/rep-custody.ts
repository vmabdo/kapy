"use server";

// Rep Custody feature has been removed.
// This file is kept as a stub to prevent import errors during the transition.
// All references to this file should be removed.

export async function transferToRep() {
  return { success: false, error: "ميزة عهدة المندوب تمت إزالتها" };
}

export async function returnFromRep() {
  return { success: false, error: "ميزة عهدة المندوب تمت إزالتها" };
}

export async function getRepCustodyInventory(_repId: string) {
  return [];
}
