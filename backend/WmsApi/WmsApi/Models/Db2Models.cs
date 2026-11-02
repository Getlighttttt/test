namespace WmsApi.Models;

public class MovementLog
{
    public long Id { get; set; }
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    public string EventType { get; set; } = "";      // RECEIVE, STORE, TO_LINE, QUARANTINE, WRITE_OFF...
    public string PalletCode { get; set; } = "";
    public string ProductCode { get; set; } = "";
    public int Quantity { get; set; }
    public string? FromZone { get; set; }
    public string? ToZone { get; set; }
    public string? UserName { get; set; }
    public string? Details { get; set; }
}

// Actual production usage over a measured interval. A delivery TO_LINE is not consumption.
public class LineConsumptionLog
{
    public long Id { get; set; }
    public string ProductCode { get; set; } = "";
    public string LineName { get; set; } = "";
    public DateTime PeriodStart { get; set; }
    public DateTime PeriodEnd { get; set; }
    public decimal QuantityConsumed { get; set; }
    public string Unit { get; set; } = "";  // e.g., ks, m
    public string? Source { get; set; }      // e.g., production system, manual entry
    public DateTime RecordedAt { get; set; } = DateTime.UtcNow;
}

// ML predictions are historical observations, not the current alert status in DB1.
public class PredictionHistory
{
    public long Id { get; set; }
    public string ProductCode { get; set; } = "";
    public string LineName { get; set; } = "";
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    public double RiskPercent { get; set; }  // 0..100
    public int? HorizonMinutes { get; set; }
    public DateTime? PredictedShortageAt { get; set; }
    public string? ModelVersion { get; set; }
    public string? Details { get; set; }
}
