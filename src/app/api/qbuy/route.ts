import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { getSameRequestOrigin } from "@/lib/http/request-origin";
import { getCurrentAdmin } from "@/lib/auth/current-admin";
import { getCurrentCustomerAccount } from "@/lib/customer-auth/current-customer";
import * as api from "@/lib/qbuy/service";
import { getDb } from "@/lib/db";
import { evidence } from "@/lib/qbuy/domain";
export async function POST(request:NextRequest) {
 if(!getSameRequestOrigin(request))return NextResponse.json({error:"無效來源。"},{status:403});
 try{
  const reader=request.body?.getReader();if(!reader)throw new Error();const chunks:Uint8Array[]=[];let size=0;
  while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>20000){await reader.cancel();return NextResponse.json({error:"請求過大"},{status:413});}chunks.push(r.value);}
  const {operation,data}=z.object({operation:z.string(),data:z.unknown()}).strict().parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  if(["cancel","withdraw"].includes(operation)){
   const owner=await getCurrentCustomerAccount();if(!owner)return NextResponse.json({error:"請先登入"},{status:401});
   if(operation==="cancel")await api.submitCancellation(owner.id,data);
   else await api.withdrawCancellation(owner.id,z.object({id:z.uuid()}).strict().parse(data).id);
  } else {
   const admin=await getCurrentAdmin();if(!admin)return NextResponse.json({error:"需要管理員權限"},{status:403});
   switch(operation){
    case "review":{const d=z.object({id:z.uuid(),approve:z.boolean(),note:evidence,confirmed:z.literal(true)}).strict().parse(data);await api.reviewCancellation(admin.id,d.id,d.approve,d.note);break;}
    case "refund":await api.processRefund(admin.id,data);break;
    case "shipment":await api.createShipment(admin.id,data);break;
    case "event":await api.shipmentEvent(admin.id,data);break;
    case "receive":{const d=z.object({shipmentId:z.uuid(),requestId:z.uuid(),evidence,confirmed:z.literal(true)}).strict().parse(data);const {shipmentId,...rest}=d;await api.receiveReturn(admin.id,shipmentId,rest);break;}
    case "inspect":await api.inspectReturn(admin.id,data);break;
    case "fee":{const d=z.object({returnId:z.uuid(),amount:z.number().int().positive(),reference:z.string(),note:evidence,confirmed:z.literal(true)}).strict().parse(data);await api.payResendFee(admin.id,d.returnId,d.amount,d.reference,d.note);break;}
    case "retry":{const d=z.object({id:z.uuid(),confirmed:z.literal(true)}).strict().parse(data);await getDb().$transaction(async tx=>{
     const rows=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "CheckoutOutbox" WHERE id=${d.id}::uuid FOR UPDATE`;if(!rows.length)throw new Error();
     const event=await tx.checkoutOutbox.findUniqueOrThrow({where:{id:d.id}});
     if(!["BLOCKED","RETRY"].includes(event.status)||event.attempts>=8||Date.now()-event.createdAt.getTime()>23*3600000)throw new api.QbuyError("已超過安全重試期限或次數，請人工查核，避免重複通知。");
     await tx.checkoutOutbox.update({where:{id:event.id},data:{status:"PENDING",nextAttemptAt:new Date()}});
     await tx.checkoutAudit.create({data:{checkoutId:event.checkoutId,actorId:admin.id,event:"NOTIFICATION_RETRY",detail:{id:event.id}}});
    });break;}
    case "recipient-disable": {const d=z.object({id:z.uuid(),evidence,confirmed:z.literal(true)}).strict().parse(data);await getDb().lineRecipient.updateMany({where:{id:d.id,enabled:true},data:{enabled:false,disabledAt:new Date(),disabledById:admin.id,disabledReason:d.evidence}});break;}
    case "recipient":{const d=z.object({customerAccountId:z.uuid().optional(),adminId:z.uuid().optional(),messagingUserId:z.string().regex(/^U[0-9a-f]{32}$/),providerId:z.string().min(1).max(100),evidence,confirmed:z.literal(true)}).strict().refine(d=>Boolean(d.customerAccountId)!==Boolean(d.adminId)).parse(data);
     if(d.providerId!==process.env.LINE_MESSAGING_PROVIDER_ID)throw new api.QbuyError("Messaging API provider 尚未設定或不符。");
     if(d.customerAccountId){const c=await getDb().customerAccount.findUniqueOrThrow({where:{id:d.customerAccountId}});if(c.lineUserId!==d.messagingUserId||process.env.LINE_LOGIN_PROVIDER_ID!==d.providerId)throw new api.QbuyError("LINE Login 與 Messaging provider／身分不符。");}
     await getDb().lineRecipient.create({data:{customerAccountId:d.customerAccountId,adminId:d.adminId,messagingUserId:d.messagingUserId,providerId:d.providerId,evidence:d.evidence,verifiedById:admin.id,consentAt:new Date(),verifiedAt:new Date(),enabled:true}});break;}
    default:return NextResponse.json({error:"無效操作"},{status:400});
   }
  }
  return NextResponse.json({ok:true});
 }catch(error){return NextResponse.json({error:error instanceof api.QbuyError?error.message:error instanceof ZodError?"欄位格式無效，請確認必填及勾選確認。":"操作未完成，請重新整理確認狀態。"},{status:400});}
}
