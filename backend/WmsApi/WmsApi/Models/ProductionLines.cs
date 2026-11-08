namespace WmsApi.Models;

// L1 and L2 are the initial demonstration lines seeded at startup.
// Active-line validation and lookup are database-driven via Db1Context.ProductionLines.
public static class ProductionLines
{
    public static readonly string[] DefaultCodes = { "L1", "L2" };
}
