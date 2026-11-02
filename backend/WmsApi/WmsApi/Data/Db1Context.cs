using Microsoft.EntityFrameworkCore;
using WmsApi.Models;

namespace WmsApi.Data;

public class Db1Context : DbContext
{
    public Db1Context(DbContextOptions<Db1Context> options) : base(options) { }

    public DbSet<Role> Roles => Set<Role>();
    public DbSet<User> Users => Set<User>();
    public DbSet<Product> Products => Set<Product>();
    public DbSet<Location> Locations => Set<Location>();
    public DbSet<Order> Orders => Set<Order>();
    public DbSet<OrderItem> OrderItems => Set<OrderItem>();
    public DbSet<Receipt> Receipts => Set<Receipt>();
    public DbSet<Pallet> Pallets => Set<Pallet>();
    public DbSet<DamageRecord> DamageRecords => Set<DamageRecord>();
    public DbSet<ReplenishmentRequest> ReplenishmentRequests => Set<ReplenishmentRequest>();
    public DbSet<QuarantineCase> QuarantineCases => Set<QuarantineCase>();
    public DbSet<Alert> Alerts => Set<Alert>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<User>().HasIndex(x => x.Username).IsUnique();
        b.Entity<Product>().HasIndex(x => x.Code).IsUnique();
        b.Entity<Location>().HasIndex(x => x.Code).IsUnique();
        b.Entity<Pallet>().HasIndex(x => x.Code).IsUnique();
        b.Entity<Order>().HasIndex(x => x.OrderNumber).IsUnique();
    }
}
