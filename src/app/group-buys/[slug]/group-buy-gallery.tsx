"use client";

/* Legacy external URLs require plain img elements; remote next/image allowlists cannot safely enumerate them. */
/* eslint-disable @next/next/no-img-element */

import { useRef, useState } from "react";

type GalleryImage = { id: string; imageUrl: string; sortOrder: number };

export function GroupBuyGallery({ title, images = [] }: { title: string; images?: GalleryImage[] }) {
  const [selected, setSelected] = useState(0);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const current = images[selected] ?? images[0];

  function previous() { setSelected((index) => (index - 1 + images.length) % images.length); }
  function next() { setSelected((index) => (index + 1) % images.length); }

  if (!current) {
    return <div data-testid="group-buy-gallery-placeholder" aria-hidden="true" className="flex aspect-[4/3] w-full items-center justify-center bg-amber-50 text-4xl font-bold text-amber-900/25 lg:h-[clamp(420px,46vw,500px)] lg:aspect-auto">好鄰</div>;
  }

  return (
    <section
      aria-label={`${title}商品圖片`}
      tabIndex={0}
      onKeyDown={(event) => {
        if (images.length < 2) return;
        if (event.key === "ArrowLeft") { event.preventDefault(); previous(); }
        if (event.key === "ArrowRight") { event.preventDefault(); next(); }
      }}
      onPointerDown={(event) => { pointerStart.current = { x: event.clientX, y: event.clientY }; }}
      onPointerUp={(event) => {
        const start = pointerStart.current;
        pointerStart.current = null;
        if (!start || images.length < 2) return;
        const deltaX = event.clientX - start.x;
        const deltaY = event.clientY - start.y;
        if (Math.abs(deltaX) < 50 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.25) return;
        if (deltaX < 0) next(); else previous();
      }}
      className="outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-600"
    >
      <div className={`relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden bg-stone-100 lg:aspect-auto ${images.length > 1 ? "lg:h-[clamp(330px,38vw,410px)]" : "lg:h-[clamp(420px,46vw,500px)]"}`}>
        <img data-testid="group-buy-gallery-image" src={current.imageUrl} alt={`${title} 圖片 ${selected + 1}`} className="h-full w-full select-none object-contain" draggable={false} />
        {images.length > 1 && <>
          <button type="button" aria-label="上一張圖片" onClick={previous} className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90 px-3 py-2 text-xl shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700">‹</button>
          <button type="button" aria-label="下一張圖片" onClick={next} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90 px-3 py-2 text-xl shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700">›</button>
          <span aria-live="polite" className="absolute bottom-3 right-3 rounded-full bg-stone-950/75 px-3 py-1 text-sm font-semibold text-white">{selected + 1} / {images.length}</span>
        </>}
      </div>
      {images.length > 1 && <div className="flex max-w-full gap-2 overflow-x-auto border-t border-stone-200 bg-white p-3" aria-label="圖片縮圖">
        {images.map((image, index) => <button key={image.id} type="button" aria-label={`顯示${title}圖片 ${index + 1}`} aria-current={index === selected ? "true" : undefined} onClick={() => setSelected(index)} className={`h-16 w-20 shrink-0 overflow-hidden rounded-md border-2 bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 ${index === selected ? "border-amber-700" : "border-transparent"}`}><img src={image.imageUrl} alt="" className="h-full w-full object-contain" /></button>)}
      </div>}
    </section>
  );
}
