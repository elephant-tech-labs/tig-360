export function clean(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}
