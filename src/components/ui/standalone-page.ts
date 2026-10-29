import { createHash } from "node:crypto";

// Route-handler HTML does not load the App Router stylesheet. Keep this small
// fallback aligned with the same primary-button contract and CSP hash it.
export const standalonePrimaryClassName = "qbuy-button qbuy-button-primary";
export const standalonePageStyles = `
*{box-sizing:border-box}body{margin:0;background:#fafaf9;color:#0f172a;font-family:"Geist","Noto Sans TC","Microsoft JhengHei",Arial,sans-serif;font-size:16px;line-height:1.5}
main{width:calc(100% - 40px);max-width:640px;margin:40px auto;padding:24px;background:white;border:1px solid #e2e8f0;border-radius:12px;overflow-wrap:anywhere}
h1{margin:0 0 16px;font-size:24px;font-weight:700;line-height:1.3}p{margin:0 0 16px}
.qbuy-button{display:inline-flex;min-height:44px;min-width:44px;max-width:100%;align-items:center;justify-content:center;gap:6px;border:1px solid transparent;border-radius:8px;padding:10px 16px;font-family:inherit;font-size:14px;font-weight:600;line-height:20px;text-align:center;overflow-wrap:anywhere;cursor:pointer;transition:background-color .15s}
.qbuy-button-primary{background:#92400e;color:white;box-shadow:0 1px 2px #0000000d}.qbuy-button-primary:hover:not(:disabled){background:#78350f}.qbuy-button-primary:active:not(:disabled){background:#652d0e}
.qbuy-button:focus-visible{outline:2px solid #92400e;outline-offset:3px}.qbuy-button:disabled{opacity:.5;cursor:not-allowed}
@media(min-width:640px){h1{font-size:30px}}@media(prefers-reduced-motion:reduce){*{transition:none!important}}
`;
export const standalonePageStyleHash = createHash("sha256").update(standalonePageStyles).digest("base64");
