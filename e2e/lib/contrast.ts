import type { Page } from "@playwright/test";

// Narrow assistance for flat-colour rendered text; not a WCAG conformance claim.
export async function textContrastIssues(page: Page) {
  return page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1;
    const painter = canvas.getContext("2d", { willReadFrequently: true })!;
    const cache = new Map<string, number[]>();
    const rgba = (color: string) => {
      if (!cache.has(color)) { painter.clearRect(0, 0, 1, 1); painter.fillStyle = color; painter.fillRect(0, 0, 1, 1); cache.set(color, [...painter.getImageData(0, 0, 1, 1).data]); }
      return cache.get(color)!;
    };
    const over = (foreground: number[], background: number[]) => foreground.slice(0, 3).map((channel, index) => channel * foreground[3] / 255 + background[index] * (1 - foreground[3] / 255));
    const luminance = (color: number[]) => color.slice(0, 3).map(channel => { const s = channel / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
    const walker = document.createTreeWalker(document.querySelector("main")!, NodeFilter.SHOW_TEXT);
    const issues: { text: string; ratio: number; required: number; color: string; background: number[] }[] = [];
    let text: Node | null;
    while ((text = walker.nextNode())) {
      const element = text.parentElement;
      if (!text.textContent?.trim() || !element || element.closest('[aria-hidden="true"],button:disabled,fieldset:disabled,option,script,style') || !element.getClientRects().length) continue;
      const style = getComputedStyle(element);
      if (style.visibility !== "visible" || style.display === "none") continue;
      const ancestors: Element[] = []; let ancestor: Element | null = element;
      while (ancestor) { ancestors.unshift(ancestor); ancestor = ancestor.parentElement; }
      // Images, gradients and opacity require manual contextual assessment.
      if (ancestors.some(node => { const s = getComputedStyle(node); return s.backgroundImage !== "none" || Number(s.opacity) !== 1; })) continue;
      let background = [255, 255, 255];
      for (const node of ancestors) background = over(rgba(getComputedStyle(node).backgroundColor), background);
      const foreground = over(rgba(style.color), background);
      const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
      const ratio = (values[0] + 0.05) / (values[1] + 0.05);
      const size = parseFloat(style.fontSize);
      const required = size >= 24 || (size >= 18.6667 && Number(style.fontWeight) >= 700) ? 3 : 4.5;
      if (ratio < required) issues.push({ text: text.textContent.trim().slice(0, 100), ratio: Math.round(ratio * 100) / 100, required, color: style.color, background });
    }
    for (const element of document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("main input[placeholder],main textarea[placeholder]")) {
      if (element.value || element.disabled || element.closest("fieldset:disabled") || !element.getClientRects().length) continue;
      const style = getComputedStyle(element, "::placeholder");
      const ancestors: Element[] = []; let ancestor: Element | null = element;
      while (ancestor) { ancestors.unshift(ancestor); ancestor = ancestor.parentElement; }
      if (ancestors.some(node => { const s = getComputedStyle(node); return s.backgroundImage !== "none" || Number(s.opacity) !== 1; })) continue;
      let background = [255, 255, 255];
      for (const node of ancestors) background = over(rgba(getComputedStyle(node).backgroundColor), background);
      const color = [...rgba(style.color)]; color[3] *= Number(style.opacity);
      const values = [luminance(over(color, background)), luminance(background)].sort((a, b) => b - a);
      const ratio = (values[0] + 0.05) / (values[1] + 0.05);
      if (ratio < 4.5) issues.push({ text: `placeholder: ${element.placeholder}`, ratio: Math.round(ratio * 100) / 100, required: 4.5, color: style.color, background });
    }
    return issues;
  });
}
