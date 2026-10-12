import { useEffect, useState } from "react";
import type { Product } from "./api";
let cached: Promise<Product> | undefined;
let resolvedProduct: Product | null = null;
export function useProduct() {
  const [product, setProduct] = useState<Product | null>(resolvedProduct);
  useEffect(() => {
    if (!window.wanxBuilder) return;
    cached ??= window.wanxBuilder.call<Product>("product").then((value) => {
      resolvedProduct = value;
      return value;
    });
    void cached.then(setProduct);
  }, []);
  return product;
}
