const usd = new Intl.NumberFormat("en-US", { currency: "USD", style: "currency" });

export function formatUsd(value: number | string | null | undefined) {
  return usd.format(Number(value ?? 0));
}
