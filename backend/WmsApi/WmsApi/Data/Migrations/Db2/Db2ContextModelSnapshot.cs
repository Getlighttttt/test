using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using WmsApi.Data;

#nullable disable

namespace WmsApi.Data.Migrations.Db2;

[DbContext(typeof(Db2Context))]
public partial class Db2ContextModelSnapshot : ModelSnapshot
{
    protected override void BuildModel(ModelBuilder modelBuilder)
    {
        modelBuilder
            .HasAnnotation("ProductVersion", "8.0.11")
            .HasAnnotation("Relational:MaxIdentifierLength", 63);

        modelBuilder.UseIdentityByDefaultColumns();

        modelBuilder.Entity("WmsApi.Models.MovementLog", b =>
        {
            b.Property<long>("Id").ValueGeneratedOnAdd().HasColumnType("bigint");
            b.Property<string>("EventType").IsRequired().HasColumnType("text");
            b.Property<string>("PalletCode").IsRequired().HasColumnType("text");
            b.Property<string>("ProductCode").IsRequired().HasColumnType("text");
            b.Property<int>("Quantity").HasColumnType("integer");
            b.Property<DateTime>("Timestamp").HasColumnType("timestamp with time zone");
            b.Property<string>("Details").HasColumnType("text");
            b.Property<string>("FromZone").HasColumnType("text");
            b.Property<string>("ToZone").HasColumnType("text");
            b.Property<string>("UserName").HasColumnType("text");
            b.HasKey("Id");
            b.HasIndex("ProductCode", "Timestamp");
            b.ToTable("MovementLogs");
        });

        modelBuilder.Entity("WmsApi.Models.LineConsumptionLog", b =>
        {
            b.Property<long>("Id").ValueGeneratedOnAdd().HasColumnType("bigint");
            b.Property<string>("ProductCode").IsRequired().HasColumnType("text");
            b.Property<string>("LineName").IsRequired().HasColumnType("text");
            b.Property<DateTime>("PeriodStart").HasColumnType("timestamp with time zone");
            b.Property<DateTime>("PeriodEnd").HasColumnType("timestamp with time zone");
            b.Property<decimal>("QuantityConsumed").HasPrecision(18, 3).HasColumnType("numeric(18,3)");
            b.Property<string>("Unit").IsRequired().HasColumnType("text");
            b.Property<string>("Source").HasColumnType("text");
            b.Property<DateTime>("RecordedAt").HasColumnType("timestamp with time zone");
            b.HasKey("Id");
            b.HasIndex("ProductCode", "LineName", "PeriodEnd");
            b.ToTable("LineConsumptionLogs", t =>
            {
                t.HasCheckConstraint("CK_LineConsumptionLogs_NonNegative", "\"QuantityConsumed\" >= 0");
                t.HasCheckConstraint("CK_LineConsumptionLogs_ValidPeriod", "\"PeriodEnd\" > \"PeriodStart\"");
            });
        });

        modelBuilder.Entity("WmsApi.Models.PredictionHistory", b =>
        {
            b.Property<long>("Id").ValueGeneratedOnAdd().HasColumnType("bigint");
            b.Property<string>("ProductCode").IsRequired().HasColumnType("text");
            b.Property<string>("LineName").IsRequired().HasColumnType("text");
            b.Property<DateTime>("Timestamp").HasColumnType("timestamp with time zone");
            b.Property<double>("RiskPercent").HasColumnType("double precision");
            b.Property<int?>("HorizonMinutes").HasColumnType("integer");
            b.Property<DateTime?>("PredictedShortageAt").HasColumnType("timestamp with time zone");
            b.Property<string>("ModelVersion").HasColumnType("text");
            b.Property<string>("Details").HasColumnType("text");
            b.HasKey("Id");
            b.HasIndex("ProductCode", "LineName", "Timestamp");
            b.ToTable("PredictionHistories", t =>
                t.HasCheckConstraint("CK_PredictionHistories_RiskPercent", "\"RiskPercent\" >= 0 AND \"RiskPercent\" <= 100"));
        });
    }
}
