// Display only: keep the original SKU identity and historical snapshots unchanged.
export function specificationLabel(value: string) {
  return /^DEFAULT-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value) ? "預設規格" : value;
}
