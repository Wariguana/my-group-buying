"use client";
import { labels } from "@/lib/qbuy/domain";
import { useState } from "react";
import { useRouter } from "next/navigation";
export type Field={name:string;label:string;type?:string;options?:readonly string[];required?:boolean;value?:string|number};
export function QbuyForm({operation,base,fields,label,confirm=false}:{operation:string;base:Record<string,unknown>;fields:Field[];label:string;confirm?:boolean}) {
 const [busy,setBusy]=useState(false),[message,setMessage]=useState("");const [requestId]=useState(()=>crypto.randomUUID());const router=useRouter();
 return <form className="my-3 space-y-2 rounded border p-3" onSubmit={async e=>{
  e.preventDefault();if(confirm&&!window.confirm("已核對操作對象、金額及證據，確認執行？"))return;
  const form=new FormData(e.currentTarget),data:Record<string,unknown>={...base};
  if(["cancel","refund","shipment","event","receive","inspect"].includes(operation))data.requestId=requestId;
  if(confirm)data.confirmed=true;
  for(const f of fields){const v=form.get(f.name);if(!f.required&&v===""&&f.type!=="checkbox")continue;data[f.name]=f.type==="number"?Number(v):f.type==="checkbox"?v==="on":v;}
  setBusy(true);setMessage("");
  try{const response=await fetch("/api/qbuy",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({operation,data})});const r=await response.json();if(!response.ok)throw new Error(r.error);setMessage("操作已完成。");router.refresh();}catch(error){setMessage(error instanceof Error?error.message:"操作失敗");}finally{setBusy(false);}
 }}><fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">{fields.map(f=><label key={f.name}>{f.label}{f.options?<select name={f.name} defaultValue={f.value} className="block w-full rounded border p-2">{f.options.map(v=><option key={v} value={v}>{labels[v]??v}</option>)}</select>:<input name={f.name} type={f.type??"text"} required={f.required??f.type!=="checkbox"} defaultValue={f.value} className="block w-full rounded border p-2"/>}</label>)}<button className="rounded bg-stone-900 p-2 text-white disabled:opacity-50">{busy?"處理中…":label}</button></fieldset><p role="status">{message}</p></form>;
}
