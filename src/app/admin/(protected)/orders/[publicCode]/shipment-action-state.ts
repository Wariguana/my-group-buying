export type AdminShipmentActionState =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "error"; message: string }>
  | Readonly<{ status: "success"; message: string }>;

export const initialAdminShipmentActionState: AdminShipmentActionState = { status: "idle" };
