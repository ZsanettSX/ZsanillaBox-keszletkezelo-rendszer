'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { recalculate, setStockLevel } from '@/lib/inventory';
import {
  bool,
  int,
  nonNegativeNum,
  num,
  optInt,
  optStr,
  runAction,
  str,
  type ActionResult,
} from '@/lib/form';

function readMaterialFields(fd: FormData) {
  return {
    name: str(fd, 'name', 'Megnevezés'),
    unit: str(fd, 'unit', 'Mértékegység'),
    supplierName: optStr(fd, 'supplierName'),
    supplierUrl: optStr(fd, 'supplierUrl'),
    leadTimeDays: int(fd, 'leadTimeDays', 14, 'Átfutási idő'),
    safetyBuffer: nonNegativeNum(fd, 'safetyBuffer', 0, 'Biztonsági puffer'),
    reserveDays: optInt(fd, 'reserveDays', 'Tartaléknapok'),
    orderMultiple: nonNegativeNum(fd, 'orderMultiple', 0, 'Rendelési egység'),
    notes: optStr(fd, 'notes'),
    active: bool(fd, 'active'),
  };
}

export async function createMaterialAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const fields = readMaterialFields(fd);
    const created = await prisma.rawMaterial.create({
      data: { ...fields, currentStock: num(fd, 'currentStock', 0, 'Készlet') },
    });
    await recalculate([created.id]);
    revalidatePath('/alapanyagok');
    revalidatePath('/');
    return `„${created.name}” felvéve.`;
  });
}

export async function updateMaterialAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const id = str(fd, 'id');
    const updated = await prisma.rawMaterial.update({
      where: { id },
      data: readMaterialFields(fd),
    });
    await recalculate([id]);
    revalidatePath('/alapanyagok');
    revalidatePath(`/alapanyagok/${id}`);
    revalidatePath('/');
    return `„${updated.name}” mentve.`;
  });
}

/**
 * Leltározás: a készlet abszolút beállítása. A különbözet fogyásnaplóba kerül,
 * hogy a történet és a készlet ne csússzon szét.
 */
export async function setStockAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const id = str(fd, 'id');
    const newStock = num(fd, 'newStock', 0, 'Új készlet');
    await setStockLevel(id, newStock, optStr(fd, 'note') ?? undefined);
    revalidatePath('/alapanyagok');
    revalidatePath(`/alapanyagok/${id}`);
    revalidatePath('/');
    return 'Készlet frissítve.';
  });
}

export async function deleteMaterialAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const id = str(fd, 'id');
    const material = await prisma.rawMaterial.findUnique({
      where: { id },
      select: { name: true, _count: { select: { recipeItems: true, usageHistory: true } } },
    });
    if (!material) return 'Az alapanyag már nem létezik.';

    // Ha van hozzá recept vagy fogyástörténet, a törlés adatvesztés lenne —
    // ilyenkor inaktiválunk, így kikerül a listákból, de a történet megmarad.
    if (material._count.recipeItems > 0 || material._count.usageHistory > 0) {
      await prisma.rawMaterial.update({ where: { id }, data: { active: false } });
      revalidatePath('/alapanyagok');
      revalidatePath('/');
      return `„${material.name}” inaktiválva (recept vagy fogyástörténet tartozik hozzá, ezért nem töröltük).`;
    }

    await prisma.rawMaterial.delete({ where: { id } });
    revalidatePath('/alapanyagok');
    revalidatePath('/');
    // Az alapanyag oldala megszűnt, vissza a listára.
    redirect('/alapanyagok');
  });
}
