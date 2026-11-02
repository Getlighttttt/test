namespace WmsApi.Models;

// Valid production lines for replenishment and dispatcher inventory views.
// Kept in one place so the backend endpoints cannot disagree.
public static class ProductionLines
{
    public static readonly string[] Codes = { "L1", "L2" };

    public static string? Normalize(string? lineName)
    {
        var code = lineName?.Trim().ToUpperInvariant();
        return code is "L1" or "L2" ? code : null;
    }
}
