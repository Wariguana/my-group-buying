"use client";

import { useActionState, useId, type FormEvent } from "react";
import { buttonStyles, fieldStyles } from "@/components/ui/primitives";
import type { AdminShipmentAction } from "@/lib/orders/admin-service";
import { initialAdminShipmentActionState, type AdminShipmentActionState } from "./shipment-action-state";
import {
  submitAdminCreateShipmentAction, submitAdminShipShipmentAction, submitAdminArriveShipmentAction,
  submitAdminReturnShipmentAction, submitAdminVoidShipmentAction,
} from "./shipment-actions";

type FormStateProps = Readonly<{
  state: AdminShipmentActionState;
  pending: boolean;
  formAction: (formData: FormData) => void;
}>;

function Feedback({ state }: Readonly<{ state: AdminShipmentActionState }>) {
  if (state.status === "idle") return null;
  return <p role={state.status === "error" ? "alert" : "status"} className={`rounded-lg p-3 text-sm ${state.status === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-900"}`}>{state.message}</p>;
}

export function AdminCreateShipmentFormView({ publicCode, state, pending, formAction }: FormStateProps & Readonly<{ publicCode: string }>) {
  const inputId = useId();
  if (state.status === "success") return <Feedback state={state} />;
  return (
    <form action={formAction} aria-busy={pending} onSubmit={(event) => { if (pending) event.preventDefault(); }} className="space-y-4">
      <input type="hidden" name="publicCode" value={publicCode} />
      <fieldset disabled={pending} className="min-w-0 space-y-4 disabled:opacity-60">
        <p className="text-sm text-slate-600">請先在 7-ELEVEN MyShip／交貨便建立取貨付款寄件，再將物流編號登錄於此。本系統不會建立外部寄件或透過 MyShip API 驗證編號。</p>
        <div><label htmlFor={inputId} className="text-sm font-semibold">物流編號</label><input id={inputId} name="trackingNumber" type="text" required maxLength={128} className={`${fieldStyles} mt-2`} /></div>
        <Feedback state={state} />
        <button type="submit" disabled={pending} className={`${buttonStyles.primary} w-full`}>{pending ? "登錄中…" : "登錄物流紀錄"}</button>
      </fieldset>
    </form>
  );
}

export function AdminCreateShipmentForm({ publicCode }: Readonly<{ publicCode: string }>) {
  const [state, formAction, pending] = useActionState(submitAdminCreateShipmentAction, initialAdminShipmentActionState);
  return <AdminCreateShipmentFormView publicCode={publicCode} state={state} pending={pending} formAction={formAction} />;
}

const transitions = {
  SHIP: { action: submitAdminShipShipmentAction, label: "標記已寄出", confirmation: "請確認包裹已實際交寄，確定要標記已寄出嗎？" },
  ARRIVE: { action: submitAdminArriveShipmentAction, label: "標記已到店", confirmation: "請確認已核實包裹實際到店，確定要標記已到店嗎？" },
  RETURN: { action: submitAdminReturnShipmentAction, label: "標記已退回", confirmation: "確認包裹已退回？此操作只記錄退回，不會自動回補訂單庫存。" },
  VOID: { action: submitAdminVoidShipmentAction, label: "作廢物流", confirmation: "請先在外部 MyShip 作廢物流。本系統不會代為作廢。確認外部作廢已完成，要記錄作廢嗎？" },
} as const;

export function AdminShipmentTransitionFormView({ shipmentId, operation, state, pending, formAction }: FormStateProps & Readonly<{ shipmentId: string; operation: AdminShipmentAction }>) {
  const transition = transitions[operation];
  if (state.status === "success") return <Feedback state={state} />;
  function confirmTransition(event: FormEvent<HTMLFormElement>) {
    if (pending || !window.confirm(transition.confirmation)) event.preventDefault();
  }
  return (
    <form action={formAction} onSubmit={confirmTransition} aria-busy={pending} className="space-y-3">
      <input type="hidden" name="shipmentId" value={shipmentId} />
      <fieldset disabled={pending} className="min-w-0 space-y-3 disabled:opacity-60">
        {(operation === "VOID" || operation === "RETURN") && <p className="text-sm text-amber-900">{transition.confirmation}</p>}
        <Feedback state={state} />
        <button type="submit" disabled={pending} className={`${operation === "VOID" || operation === "RETURN" ? buttonStyles.danger : buttonStyles.primary} w-full`}>{pending ? "物流處理中…" : transition.label}</button>
      </fieldset>
    </form>
  );
}

export function AdminShipmentTransitionForm({ shipmentId, operation }: Readonly<{ shipmentId: string; operation: AdminShipmentAction }>) {
  const [state, formAction, pending] = useActionState(transitions[operation].action, initialAdminShipmentActionState);
  return <AdminShipmentTransitionFormView shipmentId={shipmentId} operation={operation} state={state} pending={pending} formAction={formAction} />;
}
