import {beforeEach,expect,test,vi} from "vitest";
import {NextRequest} from "next/server";
const mocks=vi.hoisted(()=>({admin:vi.fn(),customer:vi.fn(),submit:vi.fn(),ship:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/auth/current-admin",()=>({getCurrentAdmin:mocks.admin}));
vi.mock("@/lib/customer-auth/current-customer",()=>({getCurrentCustomerAccount:mocks.customer}));
vi.mock("@/lib/qbuy/service",()=>({QbuyError:class extends Error{},submitCancellation:mocks.submit,createShipment:mocks.ship}));
import {POST} from "@/app/api/qbuy/route";
function request(body:unknown,origin="http://localhost"){return new NextRequest("http://localhost/api/qbuy",{method:"POST",headers:{host:"localhost",origin},body:typeof body==="string"?body:JSON.stringify(body)});}
beforeEach(()=>{vi.resetAllMocks();mocks.admin.mockResolvedValue(null);mocks.customer.mockResolvedValue(null);});
test("forged origin rejected before authorization",async()=>{expect((await POST(request({},"https://evil.invalid"))).status).toBe(403);expect(mocks.admin).not.toHaveBeenCalled();});
test("actual body length bounded",async()=>{expect((await POST(request("a".repeat(20001)))).status).toBe(413);});
test("customer cancellation needs login",async()=>{expect((await POST(request({operation:"cancel",data:{}}))).status).toBe(401);expect(mocks.submit).not.toHaveBeenCalled();});
test.each(["review","refund","shipment","event","receive","inspect","fee","retry","recipient"])("%s requires admin",async operation=>{mocks.customer.mockResolvedValue({id:"customer"});expect((await POST(request({operation,data:{}}))).status).toBe(403);expect(mocks.ship).not.toHaveBeenCalled();});
