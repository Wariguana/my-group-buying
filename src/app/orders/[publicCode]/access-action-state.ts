export type OrderAccessActionState =
  | { status: "idle" }
  | { status: "error"; message: string };

export const initialOrderAccessActionState: OrderAccessActionState = {
  status: "idle",
};
