export type AdminCancelOrderActionState =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "error"; message: string }>
  | Readonly<{ status: "success"; message: string }>;

export const initialAdminCancelOrderActionState: AdminCancelOrderActionState = { status: "idle" };
