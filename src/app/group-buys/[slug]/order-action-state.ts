export type PublicOrderActionState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; publicCode: string; totalAmount: number };

export const initialPublicOrderActionState: PublicOrderActionState = {
  status: "idle",
};
