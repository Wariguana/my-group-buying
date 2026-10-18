import "server-only";
import { featureEnabled } from "@/lib/operations/config";
import { z } from "zod";
import { getDb } from "@/lib/db";
export interface NotificationAdapter { send(input:{to:string;text:string;retryKey:string}):Promise<void> }
export class LineAdapter implements NotificationAdapter {
 async send(input:{to:string;text:string;retryKey:string}) {
  const token=process.env.LINE_MESSAGING_ACCESS_TOKEN;
  if(!featureEnabled("LINE_PUSH")||!token||process.env.LINE_MESSAGING_ENABLED!=="true")throw new Error("LINE_NOT_CONFIGURED");
  const response=await fetch("https://api.line.me/v2/bot/message/push",{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json","X-Line-Retry-Key":input.retryKey},body:JSON.stringify({to:input.to,messages:[{type:"text",text:input.text}]}),signal:AbortSignal.timeout(10000)});
  if(response.ok||(response.status===409&&response.headers.get("x-line-accepted-request-id")))return;
  throw new Error(`LINE_HTTP_${response.status}`);
 }
}
// Outbox claims commit before network IO. Delivery identity stays stable on retries.
export async function runNotifications(adapter:NotificationAdapter=new LineAdapter(),limit=20) {
 const db=getDb();let processed=0;
 for(let i=0;i<Math.min(limit,100);i++){
  const event=await db.$transaction(async tx=>{
   const rows=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "CheckoutOutbox" WHERE audience IN ('ADMIN','CUSTOMER') AND status IN ('PENDING','RETRY','SENDING') AND "nextAttemptAt"<=now() AND ("leaseUntil" IS NULL OR "leaseUntil"<now()) ORDER BY "createdAt",id FOR UPDATE SKIP LOCKED LIMIT 1`;
   if(!rows.length)return null;
   return tx.checkoutOutbox.update({where:{id:rows[0].id},data:{status:"SENDING",attempts:{increment:1},leaseUntil:new Date(Date.now()+120000)},include:{checkout:{select:{customerAccountId:true}}}});
  });
  if(!event)break;processed++;
  try{
   if(event.attempts>8||Date.now()-event.createdAt.getTime()>23*3600000)throw new Error("RETRY_WINDOW_EXPIRED");
   const recipients=await db.lineRecipient.findMany({where:{enabled:true,...(event.audience==="CUSTOMER"?{customerAccountId:event.checkout.customerAccountId}:{admin:{isActive:true}})}});
   if(!recipients.length)throw new Error("RECIPIENT_NOT_VERIFIED");
   const payload=z.object({text:z.string().max(4000)}).parse(event.payload);
   for(const recipient of recipients){
    if(!await db.lineRecipient.findFirst({where:{id:recipient.id,enabled:true}}))throw new Error("RECIPIENT_NOT_VERIFIED");
    const delivery=await db.notificationDelivery.upsert({where:{outboxId_recipientId:{outboxId:event.id,recipientId:recipient.id}},create:{outboxId:event.id,recipientId:recipient.id},update:{}});
    if(delivery.status==="SENT")continue;
    if(recipient.providerId!==process.env.LINE_MESSAGING_PROVIDER_ID)throw new Error("PROVIDER_NOT_VERIFIED");
    await db.notificationDelivery.update({where:{id:delivery.id},data:{attempts:{increment:1}}});
    await db.checkoutOutbox.update({where:{id:event.id},data:{leaseUntil:new Date(Date.now()+120000)}});
    await adapter.send({to:recipient.messagingUserId,text:payload.text,retryKey:delivery.retryKey});
    await db.notificationDelivery.update({where:{id:delivery.id},data:{status:"SENT",deliveredAt:new Date()}});
   }
   await db.checkoutOutbox.updateMany({where:{id:event.id,attempts:event.attempts,status:"SENDING"},data:{status:"SENT",deliveredAt:new Date(),leaseUntil:null,lastError:null}});
  }catch(error){
   const code=error instanceof Error&&/^(LINE_NOT_CONFIGURED|LINE_HTTP_\d{3}|RECIPIENT_NOT_VERIFIED|PROVIDER_NOT_VERIFIED|RETRY_WINDOW_EXPIRED)$/.test(error.message)?error.message:"DELIVERY_FAILED";
   const terminal=event.attempts>=8||code==="RETRY_WINDOW_EXPIRED"||/^LINE_HTTP_4(?!29)/.test(code);
   await db.checkoutOutbox.updateMany({where:{id:event.id,attempts:event.attempts,status:"SENDING"},data:{status:terminal?"FAILED":code.includes("NOT_VERIFIED")?"BLOCKED":"RETRY",lastError:code,leaseUntil:null,nextAttemptAt:new Date(Date.now()+Math.min(3600000,30000*2**event.attempts))}});
  }
 }
 return processed;
}
