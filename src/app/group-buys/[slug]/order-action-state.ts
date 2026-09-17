export type PublicOrderActionState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | {
      status: "success";
      publicCode: string;
      orderNumber: string;
      totalAmount: number;
      managementCode: string;
    };

export const initialPublicOrderActionState: PublicOrderActionState = {
  status: "idle",
};
