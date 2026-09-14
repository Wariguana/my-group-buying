export type AdminPaymentOrderActionState =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "error"; message: string }>
  | Readonly<{ status: "success"; message: string }>;

export const initialAdminPaymentOrderActionState: AdminPaymentOrderActionState = { status: "idle" };
