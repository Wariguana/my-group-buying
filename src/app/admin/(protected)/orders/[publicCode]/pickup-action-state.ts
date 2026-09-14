export type AdminPickupOrderActionState =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "error"; message: string }>
  | Readonly<{ status: "success"; message: string }>;

export const initialAdminPickupOrderActionState: AdminPickupOrderActionState = { status: "idle" };
