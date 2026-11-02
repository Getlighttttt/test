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