// Safety net for storefront collections: the API already filters by stock,
// but never render a product that is out of stock.
export function isInStock(product) {
  if (!product) return false;
  if (product.stock !== undefined && product.stock !== null) return Number(product.stock) > 0;
  return product.stock_state !== "Out of Stock";
}

export function inStockOnly(products) {
  return Array.isArray(products) ? products.filter(isInStock) : [];
}
