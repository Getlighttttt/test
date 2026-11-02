using WmsApi.Models;

namespace WmsApi.Data;

public static class DbSeeder
{
    public static void Seed(Db1Context db)
    {
        if (db.Roles.Any()) return;

        var skladnik = new Role { Name = "Skladnik" };
        var dispecer = new Role { Name = "Dispecer" };
        db.Roles.AddRange(skladnik, dispecer);
        db.SaveChanges();

        db.Users.AddRange(
            new User { Username = "skladnik", PasswordHash = PasswordHelper.Hash("sklad123"), RoleId = skladnik.Id },
            new User { Username = "dispecer", PasswordHash = PasswordHelper.Hash("disp123"), RoleId = dispecer.Id }
        );

        var p1 = new Product { Code = "MAT-001", Name = "2 mm steel sheet", Unit = "ks" };
        var p2 = new Product { Code = "MAT-002", Name = "M8 bolts", Unit = "ks" };
        var p3 = new Product { Code = "MAT-003", Name = "Electric cable", Unit = "m" };
        db.Products.AddRange(p1, p2, p3);

        foreach (var code in new[] { "LOC-A1", "LOC-A2", "LOC-A3", "LOC-B1", "LOC-B2", "LOC-B3" })
            db.Locations.Add(new Location { Code = code, Zone = Zone.Storage, IsFree = true });

        db.Locations.Add(new Location { Code = "LOC-REC1", Zone = Zone.Receiving, IsFree = true });
        db.Locations.Add(new Location { Code = "LOC-QUAR1", Zone = Zone.Quarantine, IsFree = true });
        db.Locations.Add(new Location { Code = "LOC-LINE1", Zone = Zone.LineBuffer, IsFree = true });
        db.SaveChanges();

        var order = new Order
        {
            OrderNumber = "ORD-001",
            SupplierName = "Supplier Ltd.",
            Items = new List<OrderItem>
            {
                new() { ProductId = p1.Id, ExpectedQty = 100 },
                new() { ProductId = p2.Id, ExpectedQty = 500 }
            }
        };
        db.Orders.Add(order);
        db.SaveChanges();
    }
}