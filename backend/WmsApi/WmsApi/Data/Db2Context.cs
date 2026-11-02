using Microsoft.EntityFrameworkCore;
using WmsApi.Models;

namespace WmsApi.Data;

public class Db2Context : DbContext
{
    public Db2Context(DbContextOptions<Db2Context> options) : base(options) { }

    public DbSet<MovementLog> MovementLogs => Set<MovementLog>();
    public DbSet<LineConsumptionLog> LineConsumptionLogs => Set<LineConsumptionLog>();
    public DbSet<PredictionHistory> PredictionHistories => Set<PredictionHistory>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<MovementLog>()
            .HasIndex(x => new { x.ProductCode, x.Timestamp });

        b.Entity<LineConsumptionLog>()
            .Property(x => x.QuantityConsumed).HasPrecision(18, 3);
        b.Entity<LineConsumptionLog>()
            .HasIndex(x => new { x.ProductCode, x.LineName, x.PeriodEnd });
        b.Entity<LineConsumptionLog>().ToTable(t =>
        {
            t.HasCheckConstraint("CK_LineConsumptionLogs_NonNegative", "\"QuantityConsumed\" >= 0");
            t.HasCheckConstraint("CK_LineConsumptionLogs_ValidPeriod", "\"PeriodEnd\" > \"PeriodStart\"");
        });

        b.Entity<PredictionHistory>()
            .HasIndex(x => new { x.ProductCode, x.LineName, x.Timestamp });
        b.Entity<PredictionHistory>().ToTable(t =>
            t.HasCheckConstraint("CK_PredictionHistories_RiskPercent", "\"RiskPercent\" >= 0 AND \"RiskPercent\" <= 100"));
    }
}
