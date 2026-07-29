'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import {
  bool,
  FormError,
  nonNegativeNum,
  optStr,
  runAction,
  str,
  type ActionResult,
} from '@/lib/form';

export async function createProductAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const created = await prisma.product.create({
      data: {
        name: str(fd, 'name', 'Terméknév'),
        shopifyProductId: optStr(fd, 'shopifyProductId'),
        sku: optStr(fd, 'sku'),
        active: true,
      },
    });
    revalidatePath('/termekek');
    return `„${created.name}” felvéve. Most add meg, mi kell hozzá.`;
  });
}

export async function updateProductAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const id = str(fd, 'id');
    await prisma.product.update({
      where: { id },
      data: {
        name: str(fd, 'name', 'Terméknév'),
        shopifyProductId: optStr(fd, 'shopifyProductId'),
        sku: optStr(fd, 'sku'),
        active: bool(fd, 'active'),
      },
    });
    revalidatePath('/termekek');
    revalidatePath(`/termekek/${id}`);
    return 'Termék mentve.';
  });
}

export async function deleteProductAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const id = str(fd, 'id');
    // A receptsorok onDelete: Cascade miatt együtt törlődnek; a fogyástörténet
    // alapanyaghoz kötött, ezért érintetlen marad.
    await prisma.product.delete({ where: { id } });
    revalidatePath('/termekek');
    // A termék oldala megszűnt, vissza a listára.
    redirect('/termekek');
  });
}

/** Receptsor hozzáadása vagy meglévő felülírása (ugyanaz az alapanyag kétszer nem szerepelhet). */
export async function upsertRecipeItemAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const productId = str(fd, 'productId');
    const rawMaterialId = str(fd, 'rawMaterialId', 'Alapanyag');
    const quantityPerUnit = nonNegativeNum(fd, 'quantityPerUnit', 0, 'Mennyiség');
    if (quantityPerUnit <= 0) {
      throw new FormError('A mennyiségnek nullánál nagyobbnak kell lennie.');
    }

    await prisma.recipeItem.upsert({
      where: { productId_rawMaterialId: { productId, rawMaterialId } },
      create: { productId, rawMaterialId, quantityPerUnit },
      update: { quantityPerUnit },
    });

    revalidatePath(`/termekek/${productId}`);
    revalidatePath('/termekek');
    return 'Recept frissítve.';
  });
}

export async function deleteRecipeItemAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const id = str(fd, 'id');
    const item = await prisma.recipeItem.delete({ where: { id }, select: { productId: true } });
    revalidatePath(`/termekek/${item.productId}`);
    revalidatePath('/termekek');
    return 'Receptsor törölve.';
  });
}
