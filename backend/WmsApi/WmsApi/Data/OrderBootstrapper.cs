using WmsApi.Models;

namespace WmsApi.Data;

/// <summary>
/// Ensures the five demonstration supplier orders exist without changing existing orders.
/// Run after DbSeeder.Seed(db1), so initial material records are already present.
/// </summary>
public static class OrderBootstrapper
{
    public static void Seed(Db1Context db)
    {
        var orderTemplates = new Dictionary<string, (string Supplier, (string Code, int Quantity)[] Items)>
        {
            ["ORD-001"] = ("Supplier Ltd.", new[] { ("MAT-001", 100), ("MAT-002", 500) }),
            ["ORD-002"] = ("Metal Supplies s.r.o.", new[] { ("MAT-001", 200), ("MAT-003", 300) }),
            ["ORD-003"] = ("Industrial Components s.r.o.", new[] { ("MAT-002", 400), ("MAT-003", 200) }),
            ["ORD-004"] = ("Factory Parts s.r.o.", new[] { ("MAT-001", 150), ("MAT-002", 300), ("MAT-003", 100) }),
            ["ORD-005"] = ("Regional Materials s.r.o.", new[] { ("MAT-001", 250), ("MAT-002", 600) })
        };

        // Check which orders are already present before adding sample data.
        var existingNumbers = db.Orders.Select(o => o.OrderNumber).ToHashSet();
        var missingOrders = orderTemplates.Where(o => !existingNumbers.Contains(o.Key)).ToList();
        if (missingOrders.Count == 0)
            return;

        var productIds = db.Products.ToDictionary(p => p.Code, p => p.Id);
        foreach (var template in missingOrders)
        {
            var items = template.Value.Items.Select(item =>
            {
                if (!productIds.TryGetValue(item.Code, out var id))
                    throw new InvalidOperationException($"Missing seeded material: {item.Code}");

                return new OrderItem { ProductId = id, ExpectedQty = item.Quantity };
            }).ToList();

            db.Orders.Add(new Order
            {
                OrderNumber = template.Key,
                SupplierName = template.Value.Supplier,
                Status = "OPEN",
                Items = items
            });
        }

        db.SaveChanges();
    }
}
