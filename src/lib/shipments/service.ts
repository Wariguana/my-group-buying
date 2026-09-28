import "server-only";

import { Prisma, type Shipment } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { ORDER_PUBLIC_CODE_PATTERN } from "@/lib/orders/public-code";
import { ShipmentError } from "@/lib/shipments/errors";
import { lockOrderByPublicCode, lockOrderForShipment, lockShipment } from "@/lib/shipments/locks";
import { retryShipmentTransaction, ShipmentClaimLostError } from "@/lib/shipments/retry";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const provider = "SEVEN_ELEVEN_MYSHIP" as const;
type TransactionClient = Prisma.TransactionClient;

function isTrackingUniqueConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return false;
  const meta = error.meta as Record<string, unknown> | undefined;
  const adapter = meta?.driverAdapterError as Record<string, unknown> | undefined;
  const cause = adapter?.cause as Record<string, unknown> | undefined;
  const constraint = cause?.constraint as Record<string, unknown> | undefined;
  return meta?.modelName === "Shipment" && cause?.kind === "UniqueConstraintViolation" &&
    constraint?.index === "Shipment_provider_trackingNumber_key";
}

function validSnapshot(value: string | null): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function invalidTransition(): never { throw new ShipmentError("INVALID_TRANSITION"); }

/** Admin boundary only; calling actions must requireAdmin before invoking this service. */
export async function createShipmentAsAdmin(orderPublicCode: unknown, trackingNumber: unknown): Promise<Shipment> {
  if (typeof orderPublicCode !== "string" || !ORDER_PUBLIC_CODE_PATTERN.test(orderPublicCode) ||
      typeof trackingNumber !== "string") throw new ShipmentError("INVALID_SHIPMENT_INPUT");
  const tracking = trackingNumber.trim();
  if (tracking.length < 1 || tracking.length > 128) throw new ShipmentError("INVALID_SHIPMENT_INPUT");

  return retryShipmentTransaction(() => getDb().$transaction(async (tx) => {
    if (!await lockOrderByPublicCode(tx, orderPublicCode)) throw new ShipmentError("ACCESS_DENIED");
    const order = await tx.order.findUnique({
      where: { publicCode: orderPublicCode },
      select: {
        id: true, shipmentRequired: true, fulfillmentMethod: true, status: true,
        cancelledAt: true, pickedUpAt: true, customerName: true, customerPhone: true,
        sevenElevenStoreId: true, sevenElevenStoreName: true, sevenElevenStoreAddress: true,
        groupBuy: { select: { endAt: true } },
      },
    });
    if (!order) throw new ShipmentError("ACCESS_DENIED");
    if (!order.shipmentRequired || order.fulfillmentMethod !== "SEVEN_ELEVEN" ||
        order.status !== "PLACED" || order.cancelledAt !== null || order.pickedUpAt !== null ||
        new Date() < order.groupBuy.endAt) throw new ShipmentError("ORDER_NOT_ELIGIBLE");
    const snapshots = {
      recipientName: order.customerName,
      recipientPhone: order.customerPhone,
      sevenElevenStoreId: order.sevenElevenStoreId,
      sevenElevenStoreName: order.sevenElevenStoreName,
      sevenElevenStoreAddress: order.sevenElevenStoreAddress,
    };
    if (!validSnapshot(snapshots.recipientName) || !validSnapshot(snapshots.recipientPhone) ||
        !validSnapshot(snapshots.sevenElevenStoreId) || !validSnapshot(snapshots.sevenElevenStoreName) ||
        !validSnapshot(snapshots.sevenElevenStoreAddress)) throw new ShipmentError("ORDER_NOT_ELIGIBLE");

    const active = await tx.shipment.findFirst({
      where: { orderId: order.id, returnedAt: null, voidedAt: null },
    });
    if (active) {
      if (active.provider === provider && active.trackingNumber === tracking &&
          Object.entries(snapshots).every(([key, value]) => active[key as keyof typeof snapshots] === value)) {
        return active;
      }
      throw new ShipmentError("ACTIVE_SHIPMENT_EXISTS");
    }
    const existing = await tx.shipment.findUnique({
      where: { provider_trackingNumber: { provider, trackingNumber: tracking } },
      select: { id: true },
    });
    if (existing) throw new ShipmentError("TRACKING_NUMBER_IN_USE");
    try {
      return await tx.shipment.create({ data: { orderId: order.id, provider, trackingNumber: tracking,
        recipientName: snapshots.recipientName, recipientPhone: snapshots.recipientPhone,
        sevenElevenStoreId: snapshots.sevenElevenStoreId,
        sevenElevenStoreName: snapshots.sevenElevenStoreName,
        sevenElevenStoreAddress: snapshots.sevenElevenStoreAddress } });
    } catch (error) {
      if (isTrackingUniqueConflict(error)) {
        throw new ShipmentError("TRACKING_NUMBER_IN_USE");
      }
      throw error;
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
}

type Transition = "shippedAt" | "arrivedAt" | "returnedAt" | "voidedAt";

async function transitionShipment(shipmentId: unknown, field: Transition): Promise<Shipment> {
  if (typeof shipmentId !== "string" || !UUID_PATTERN.test(shipmentId)) {
    throw new ShipmentError("INVALID_SHIPMENT_INPUT");
  }
  return retryShipmentTransaction(() => getDb().$transaction(async (tx: TransactionClient) => {
    if (!await lockOrderForShipment(tx, shipmentId)) throw new ShipmentError("ACCESS_DENIED");
    if (!await lockShipment(tx, shipmentId)) throw new ShipmentError("ACCESS_DENIED");
    const shipment = await tx.shipment.findUnique({
      where: { id: shipmentId },
      include: { order: { select: { shipmentRequired: true, fulfillmentMethod: true,
        status: true, pickedUpAt: true, cancelledAt: true } } },
    });
    if (!shipment) throw new ShipmentError("ACCESS_DENIED");
    const order = shipment.order;
    if (!order.shipmentRequired || order.fulfillmentMethod !== "SEVEN_ELEVEN" ||
        order.status !== "PLACED" || order.cancelledAt !== null) invalidTransition();
    if (field === "returnedAt" && shipment.returnedAt !== null && order.pickedUpAt === null) return shipment;
    if (field === "voidedAt" && shipment.voidedAt !== null && order.pickedUpAt === null) return shipment;
    if (order.pickedUpAt !== null || shipment.returnedAt !== null || shipment.voidedAt !== null) invalidTransition();
    if (field === "shippedAt") {
      if (shipment.shippedAt !== null) return shipment;
      if (shipment.arrivedAt !== null) invalidTransition();
    } else if (field === "arrivedAt") {
      if (shipment.shippedAt === null) invalidTransition();
      if (shipment.arrivedAt !== null) return shipment;
    } else if (field === "returnedAt") {
      if (shipment.shippedAt === null) invalidTransition();
    } else if (shipment.shippedAt !== null || shipment.arrivedAt !== null) invalidTransition();

    const now = new Date();
    const claimed = await tx.shipment.updateMany({
      where: { id: shipmentId, [field]: null, returnedAt: null, voidedAt: null,
        ...(field === "shippedAt" || field === "voidedAt" ? { shippedAt: null } : { shippedAt: { not: null } }),
        ...(field === "arrivedAt" ? {} : field === "shippedAt" || field === "voidedAt" ? { arrivedAt: null } : {}),
      },
      data: { [field]: now },
    });
    if (claimed.count !== 1) throw new ShipmentClaimLostError();
    const updated = await tx.shipment.findUnique({ where: { id: shipmentId } });
    if (!updated) throw new ShipmentClaimLostError();
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
}

/** Admin boundaries must call requireAdmin before these server-only methods. */
export const markShipmentShippedAsAdmin = (shipmentId: unknown) => transitionShipment(shipmentId, "shippedAt");
export const markShipmentArrivedAsAdmin = (shipmentId: unknown) => transitionShipment(shipmentId, "arrivedAt");
export const markShipmentReturnedAsAdmin = (shipmentId: unknown) => transitionShipment(shipmentId, "returnedAt");
export const voidShipmentAsAdmin = (shipmentId: unknown) => transitionShipment(shipmentId, "voidedAt");
