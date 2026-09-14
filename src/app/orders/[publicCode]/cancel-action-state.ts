export type CancelOrderActionState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; message: string };

export const initialCancelOrderActionState: CancelOrderActionState = {
  status: "idle",
};
