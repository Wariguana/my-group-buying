"use client";

import { useCallback, useState } from "react";
import { ProductImagePlaceholder } from "@/components/ui/product-image-placeholder";

export function StorefrontCover({ url, title, fill = false, compact = false, alt = `${title}封面`, imageTestId }: { url: string | null; title: string; fill?: boolean; compact?: boolean; alt?: string; imageTestId?: string }) {
  const [state, setState] = useState<"loading" | "loaded" | "failed">("loading");
  // A cached image may finish before hydration attaches its load/error handlers.
  const imageRef = useCallback((image: HTMLImageElement | null) => {
    if (image?.complete) setState(image.naturalWidth > 0 ? "loaded" : "failed");
  }, []);
  return (
    <div className={`overflow-hidden bg-stone-100 ${fill ? "absolute inset-0" : "qbuy-storefront-cover relative aspect-square w-full sm:aspect-[4/3]"}`}>
      {url && state !== "failed" ? (
        <>
          {state === "loading" && <span className={compact ? "sr-only" : "absolute inset-0 flex items-center justify-center text-sm text-stone-600"}>圖片載入中</span>}
          {/* Native image events provide a fallback for unavailable uploaded images. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img ref={imageRef} data-testid={imageTestId} src={url} alt={alt} width={640} height={480} loading="lazy" decoding="async" draggable={false}
            onLoad={() => setState("loaded")} onError={() => setState("failed")}
            className={`absolute inset-0 h-full w-full object-contain ${state === "loaded" ? "opacity-100" : "opacity-0"}`} />
        </>
      ) : (
        <ProductImagePlaceholder compact={compact} failed={Boolean(url)} />
      )}
    </div>
  );
}
