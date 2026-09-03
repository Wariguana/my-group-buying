# Business Rules

- Product and GroupBuy are separate.
- A Product can be included in multiple GroupBuys.
- GroupBuyItem is the association entity between Product and GroupBuy.
- `Product.defaultPrice` is the default selling price.
- `Product.cost` is the current default cost.
- `GroupBuyItem.salePrice` is the actual selling price for that group buy.
- `GroupBuyItem.cost` is the cost snapshot for that group buy.
- Draft group buys must not appear on the public frontend.
- Publishing a group buy requires at least one product and one pickup location.
- The server must validate group-buy publishing.
- Clients may not decide authoritative prices or business status.
