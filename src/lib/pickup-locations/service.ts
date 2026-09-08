import "server-only";

import { getDb } from "@/lib/db";
import {
  createPickupLocationSchema,
  pickupLocationIdSchema,
  pickupLocationStatusMutationSchema,
  updatePickupLocationSchema,
} from "@/lib/pickup-locations/validation";

export type PickupLocationErrorCode = "INVALID_INPUT" | "NOT_FOUND" | "FAILED";

export type PickupLocationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: PickupLocationErrorCode };

export const pickupLocationSelect = {
  id: true,
  name: true,
  address: true,
  description: true,
  isActive: true,
} as const;

type PickupLocationDetail = {
  id: string;
  name: string;
  address: string;
  description: string | null;
  isActive: boolean;
};

export async function listPickupLocations(): Promise<PickupLocationResult<PickupLocationDetail[]>> {
  try {
    const pickupLocations = await getDb().pickupLocation.findMany({
      select: pickupLocationSelect,
      orderBy: [
        { isActive: "desc" },
        { name: "asc" },
        { id: "asc" },
      ],
    });
    return { ok: true, value: pickupLocations };
  } catch {
    return { ok: false, error: "FAILED" };
  }
}

export async function getPickupLocationById(id: unknown): Promise<PickupLocationResult<PickupLocationDetail>> {
  const parsedId = pickupLocationIdSchema.safeParse(id);
  if (!parsedId.success) return { ok: false, error: "NOT_FOUND" };

  try {
    const pickupLocation = await getDb().pickupLocation.findUnique({
      where: { id: parsedId.data },
      select: pickupLocationSelect,
    });
    return pickupLocation
      ? { ok: true, value: pickupLocation }
      : { ok: false, error: "NOT_FOUND" };
  } catch {
    return { ok: false, error: "FAILED" };
  }
}

export async function createPickupLocation(input: unknown): Promise<PickupLocationResult<PickupLocationDetail>> {
  const parsed = createPickupLocationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID_INPUT" };

  try {
    const pickupLocation = await getDb().pickupLocation.create({
      data: parsed.data,
      select: pickupLocationSelect,
    });
    return { ok: true, value: pickupLocation };
  } catch {
    return { ok: false, error: "FAILED" };
  }
}

export async function updatePickupLocation(
  id: unknown,
  input: unknown,
): Promise<PickupLocationResult<PickupLocationDetail>> {
  const parsedId = pickupLocationIdSchema.safeParse(id);
  const parsedInput = updatePickupLocationSchema.safeParse(input);
  if (!parsedId.success || !parsedInput.success) {
    return { ok: false, error: "INVALID_INPUT" };
  }

  try {
    const existing = await getDb().pickupLocation.findUnique({
      where: { id: parsedId.data },
      select: { id: true },
    });
    if (!existing) return { ok: false, error: "NOT_FOUND" };

    const pickupLocation = await getDb().pickupLocation.update({
      where: { id: parsedId.data },
      data: parsedInput.data,
      select: pickupLocationSelect,
    });
    return { ok: true, value: pickupLocation };
  } catch {
    return { ok: false, error: "FAILED" };
  }
}

export async function setPickupLocationActive(
  id: unknown,
  isActive: unknown,
): Promise<PickupLocationResult<{ id: string; isActive: boolean }>> {
  const parsed = pickupLocationStatusMutationSchema.safeParse({ id, isActive });
  if (!parsed.success) return { ok: false, error: "INVALID_INPUT" };

  try {
    const existing = await getDb().pickupLocation.findUnique({
      where: { id: parsed.data.id },
      select: { id: true },
    });
    if (!existing) return { ok: false, error: "NOT_FOUND" };

    const pickupLocation = await getDb().pickupLocation.update({
      where: { id: parsed.data.id },
      data: { isActive: parsed.data.isActive },
      select: { id: true, isActive: true },
    });
    return { ok: true, value: pickupLocation };
  } catch {
    return { ok: false, error: "FAILED" };
  }
}
