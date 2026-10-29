import "server-only";
import { z } from "zod";
import { getDb } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
export const lifecycleInclude={orders:true,items:{include:{groupBuy:{select:{endAt:true}}}},fulfillmentGroups:{include:{adjustments:{orderBy:{createdAt:"desc" as const}}}},cancellations:{orderBy:{submittedAt:"asc" as const}},refunds:true,qbShipments:{include:{events:{orderBy:{createdAt:"asc" as const}}},orderBy:{createdAt:"asc" as const}},returns:true} as const;
export async function customerLifecycle(checkoutId:string,owner:string){return getDb().checkout.findFirst({where:{id:z.uuid().parse(checkoutId),customerAccountId:z.uuid().parse(owner)},include:lifecycleInclude});}
export const queues:Record<string,string>={all:"全部 QB 訂單",cancel:"待審取消／阻擋出貨",refund:"待退款",refundError:"退款異常",shipment:"待建立物流",shippingError:"出貨異常",returned:"退回待處理",overdue:"退回逾期 7 天",fee:"重寄待收運費",notifications:"通知失敗與重試"};
export function lifecycleQueueFilters(now = new Date()): Record<string, Prisma.CheckoutWhereInput> {
 return {cancel:{cancellations:{some:{status:{in:["PENDING","REVIEW_REQUIRED"]}}}},refund:{refunds:{some:{status:{in:["PENDING","PROCESSING"]}}}},refundError:{refunds:{some:{status:"ERROR"}}},shipment:{status:"FINALIZED",orders:{some:{status:"PAID"}},fulfillmentGroups:{some:{qbShipments:{none:{status:{notIn:["VOIDED","RETURNED"]}}}}}},shippingError:{qbShipments:{some:{status:{in:["RETURNED","VOIDED"]}}}},returned:{returns:{some:{status:{not:"RESENT"}}}},overdue:{returns:{some:{deadline:{lt:now},status:{not:"RESENT"}}}},fee:{returns:{some:{status:"AWAITING_FEE"}}},notifications:{outbox:{some:{audience:{not:"LEGACY"},status:{in:["FAILED","BLOCKED","RETRY"]}}}}};
}
export async function adminLifecycle(query:{q?:string;page?:string;queue?:string}) {
 const page=Math.max(1,Math.min(10000,Math.floor(Number(query.page)||1))),q=typeof query.q==="string"?query.q.slice(0,100):"",queue=typeof query.queue==="string"&&Object.hasOwn(queues,query.queue)?query.queue:"cancel";
 const filters = lifecycleQueueFilters();
 const where={AND:[filters[queue]??{},q?{OR:[{customerName:{contains:q,mode:"insensitive" as const}},{customerPhone:{contains:q}},{orders:{some:{orderNumber:{contains:q,mode:"insensitive" as const}}}}]}:{}]};
 const [rows,count]=await Promise.all([getDb().checkout.findMany({where,orderBy:[{createdAt:"asc"},{id:"asc"}],skip:(page-1)*20,take:20,include:{...lifecycleInclude,audits:{orderBy:{createdAt:"desc"},take:50},outbox:{orderBy:{createdAt:"desc"},take:50}}}),getDb().checkout.count({where})]);return {rows,count,page,q,queue};
}
